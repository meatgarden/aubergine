import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Validator } from '@seriousme/openapi-schema-validator';
import {
  Capabilities,
  CreatedToken,
  DEFAULT_SETTINGS,
  GRANTABLE_SCOPES,
  IDEMPOTENCY_HEADER,
  ROUTES,
  ROUTE_IDS,
  accessOfRoute,
  newId,
  openApiDocument,
  openApiPath,
  publicPaths,
  scopeFor,
  type OpenApiDocument,
  type OpenApiOperation,
  type RouteId,
  type RouteSpec,
  type Scope,
} from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const SOCKET = testSocketName('api-description');
const runtime = new TmuxRuntime({ socket: SOCKET });

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;

async function serverWith(options: { version?: string; validateResponses?: boolean } = {}): Promise<FastifyInstance> {
  const store = new JsonStore(await mkdtemp(path.join(dir, 'data-')));
  const state = new StateHub(await store.load(), store);
  const built = await buildServer({ hub: state, sessions: new Sessions(state, runtime), runtime, settings: async () => DEFAULT_SETTINGS, token: ownerToken, devOrigin: null, webDist: path.join(dir, 'no-web'), ...options });
  await built.listen({ host: '127.0.0.1', port: 0 });
  if (!hub) hub = state;
  return built;
}

beforeAll(async () => {
  await runtime.killServer();
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-description-'));
  ownerToken = await loadOrCreateToken(dir);
  app = await serverWith({ version: '1.2.3' });
  port = (app.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await hub.flush();
  await app.close();
  await destroyTmuxServer(runtime, SOCKET);
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const asOwner = (method: string, url: string, body?: unknown) =>
  app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, cookie: `${cookieName(port)}=${ownerToken}` }, ...(body === undefined ? {} : { payload: body as object }) });
const withBearer = (secret: string, method: string, url: string, body?: unknown) =>
  app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${secret}` }, ...(body === undefined ? {} : { payload: body as object }) });

async function tokenWith(scopes: Scope[]): Promise<string> {
  const created = await asOwner('POST', publicPaths.tokens, { name: scopes.join('+'), scopes });
  return CreatedToken.parse(created.json()).secret;
}

const filled = (url: string): string => url.replace(/:[A-Za-z]+/g, () => newId());
const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

/** Every operation of a document, with its path and method. */
function operationsOf(document: OpenApiDocument): { path: string; method: string; operation: OpenApiOperation }[] {
  return Object.entries(document.paths).flatMap(([path, item]) => METHODS.flatMap((method) => (item[method] ? [{ path, method: method.toUpperCase(), operation: item[method] }] : [])));
}

describe('the description of the API', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const document = openApiDocument({ version: '1.2.3' });
    expect(document.openapi).toBe('3.1.0');
    const result = await new Validator().validate(JSON.parse(JSON.stringify(document)) as Record<string, unknown>);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
    // A broken document is noticed, so the check above means something.
    const broken = JSON.parse(JSON.stringify(document)) as { paths: Record<string, { get: { responses: unknown } }> };
    broken.paths['/v1']!.get.responses = 'nothing';
    expect((await new Validator().validate(broken)).valid).toBe(false);
  });

  it('is served by the server, to any caller and without any scope, and is what the declarations give', async () => {
    const served = await asOwner('GET', publicPaths.description);
    expect(served.statusCode).toBe(200);
    expect(served.json()).toEqual(JSON.parse(JSON.stringify(openApiDocument({ version: '1.2.3' }))));

    const notesOnly = await tokenWith(['notes:write']);
    expect((await withBearer(notesOnly, 'GET', publicPaths.description)).statusCode).toBe(200);
    const { session } = { session: { id: newId() } };
    expect((await withBearer(sessionToken(ownerToken, session.id), 'GET', publicPaths.description)).statusCode).toBe(200);
    const nobody = await app.inject({ method: 'GET', url: publicPaths.description, headers: { host: `127.0.0.1:${port}` } });
    expect(nobody.statusCode).toBe(401);

    // The answer to "what can you do" says where it is.
    const capabilities = Capabilities.parse((await withBearer(notesOnly, 'GET', publicPaths.root)).json());
    expect(capabilities.description).toBe('/v1/openapi.json');
    expect(capabilities.features).toContain('openapi');
  });

  it('has exactly the routes the server has: none missing, none extra', () => {
    const served = publicRoutesOf(app).map((route) => `${route.method} ${openApiPath(route.url)}`).sort();
    const described = operationsOf(openApiDocument({ version: 'x' })).map((o) => `${o.method} ${o.path}`).sort();
    expect(described).toEqual(served);
    expect(served.length).toBe(ROUTE_IDS.length);
    expect(new Set(operationsOf(openApiDocument({ version: 'x' })).map((o) => o.operation.operationId)).size).toBe(ROUTE_IDS.length);
  });

  it('names for each route the scope that authorize really asks for', async () => {
    const one: Record<string, string> = {};
    for (const scope of GRANTABLE_SCOPES) one[scope] = await tokenWith([scope]);
    const allBut = async (scope: Scope): Promise<string> => tokenWith(GRANTABLE_SCOPES.filter((s) => s !== scope));
    const others: Record<string, string> = {};
    for (const scope of GRANTABLE_SCOPES) others[scope] = await allBut(scope);
    const everything = await tokenWith([...GRANTABLE_SCOPES]);

    for (const { path, method, operation } of operationsOf(openApiDocument({ version: 'x' }))) {
      const spec: RouteSpec = ROUTES[operation.operationId];
      const access = operation['x-aubergine-access'];
      const name = `${method} ${path}`;
      // What the description says is what the table says.
      expect(access.scope, name).toBe(spec.action === null ? null : scopeFor(spec.action));
      expect(access, name).toEqual(accessOfRoute(spec));
      if (spec.stream) continue; // It does not end; its scope is exercised with the other token tests.

      const call = (secret: string) => withBearer(secret, method, filled(spec.path), method === 'GET' || method === 'DELETE' ? undefined : {});
      if (access.who === 'any') {
        expect((await call(one['notes:write']!)).statusCode, name).toBe(200);
      } else if (access.scope === null) {
        // No scope opens it: not even all of them together.
        expect((await call(everything)).statusCode, name).toBe(403);
        expect(operation.security.some((way) => 'apiToken' in way), name).toBe(false);
      } else {
        // The scope it names is enough, and without it everything else is not.
        expect((await call(one[access.scope]!)).statusCode, `${name} with ${access.scope}`).not.toBe(403);
        expect((await call(others[access.scope]!)).statusCode, `${name} without ${access.scope}`).toBe(403);
        expect(operation.security, name).toContainEqual({ apiToken: [access.scope] });
        expect(operation.description, name).toContain(`\`${access.scope}\``);
      }
    }
  });

  it('describes a field that needs a scope of its own, and that is how the server behaves', async () => {
    const document = openApiDocument({ version: 'x' });
    const operation = document.paths['/v1/sessions/{sessionId}']!.patch!;
    expect(operation['x-aubergine-access']).toEqual({ scope: 'sessions:write', fieldScopes: { note: 'notes:write' }, who: 'token' });
    expect(operation.description).toContain('Sending `note` needs `notes:write`');
    const sessionsOnly = await tokenWith(['sessions:write']);
    const notesOnly = await tokenWith(['notes:write']);
    const url = publicPaths.session(newId());
    expect((await withBearer(sessionsOnly, 'PATCH', url, { note: 'x' })).statusCode).toBe(403);
    expect((await withBearer(sessionsOnly, 'PATCH', url, { name: 'x' })).statusCode).toBe(404);
    expect((await withBearer(notesOnly, 'PATCH', url, { note: 'x' })).statusCode).toBe(404);
    expect((await withBearer(notesOnly, 'PATCH', url, { name: 'x', note: 'x' })).statusCode).toBe(403);
    expect((await withBearer(notesOnly, 'PATCH', url, {})).statusCode).toBe(403);
  });

  it('covers the shapes every route shares: errors, paging, safe retries, the ways to sign in, the stream', () => {
    const document = openApiDocument({ version: 'x' });
    const operations = operationsOf(document);

    // One error shape, with its codes.
    const error = document.components.schemas.Error as { properties: { error: { properties: { code: { enum: string[] } } } } };
    expect(error.properties.error.properties.code.enum).toEqual(['bad_request', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'runtime_unavailable', 'too_large', 'rate_limited', 'internal']);
    expect(Object.keys(document.components.responses).sort()).toEqual(['BadRequest', 'Conflict', 'Forbidden', 'NotFound', 'RateLimited', 'TooLarge', 'Unauthorized', 'Unavailable']);
    expect(document.components.responses.RateLimited?.headers).toHaveProperty('Retry-After');
    for (const { path, method, operation } of operations) {
      for (const status of ['400', '401', '413', '429']) expect(operation.responses, `${method} ${path}`).toHaveProperty(status);
      for (const response of Object.values(operation.responses)) {
        if ('$ref' in response) expect(document.components.responses, response.$ref).toHaveProperty(response.$ref.split('/').at(-1)!);
      }
    }

    // Lists take a limit and a cursor, and answer with items and a cursor.
    const paged = operations.filter((o) => o.operation['x-aubergine-paged']);
    expect(paged.map((o) => o.operation.operationId).sort()).toEqual(ROUTE_IDS.filter((id) => (ROUTES[id] as RouteSpec).paged).sort());
    expect(paged.length).toBeGreaterThanOrEqual(5);
    for (const { operation } of paged) {
      const names = operation.parameters.filter((p) => p.in === 'query').map((p) => p.name);
      expect(names, operation.operationId).toEqual(expect.arrayContaining(['limit', 'cursor']));
      const body = Object.values(operation.responses).flatMap((r) => ('content' in r && r.content ? [r.content['application/json']?.schema] : []))[0] as { properties: Record<string, unknown>; required: string[] };
      expect(Object.keys(body.properties), operation.operationId).toEqual(['items', 'nextCursor']);
    }

    // Creates that can be retried safely say so.
    const retriable = operations.filter((o) => o.operation.parameters.some((p) => p.in === 'header' && p.name === IDEMPOTENCY_HEADER));
    expect(retriable.map((o) => o.operation.operationId).sort()).toEqual(['createCanvas', 'createFrame', 'startSession']);

    // The ways to sign in.
    expect(document.components.securitySchemes.apiToken).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(document.components.securitySchemes.apiToken?.description).toContain('aubt_');
    expect(Object.keys(document.components.securitySchemes).sort()).toEqual(['apiToken', 'browserCookie', 'sessionToken']);

    // The stream, as far as it can be described.
    const stream = document.paths['/v1/events']!.get!;
    expect(stream['x-aubergine-stream']).toBe(true);
    expect(stream.responses['200']).toMatchObject({ content: { 'text/event-stream': { schema: { type: 'object', required: ['type'] } } } });

    // Path parameters are all there, and all required.
    for (const { path, method, operation } of operations) {
      const inPath = [...path.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]);
      expect(operation.parameters.filter((p) => p.in === 'path').map((p) => p.name), `${method} ${path}`).toEqual(inPath);
      expect(operation.parameters.filter((p) => p.in === 'path').every((p) => p.required)).toBe(true);
    }
    // Bodies and answers are described, not left open.
    for (const id of ROUTE_IDS) {
      const spec: RouteSpec = ROUTES[id];
      const operation = document.paths[openApiPath(spec.path)]![spec.method.toLowerCase() as 'get']!;
      expect(operation.requestBody !== undefined, id).toBe(spec.body !== undefined);
      if (spec.body) expect(operation.requestBody?.required, id).toBe(!spec.bodyOptional);
      expect(operation.summary.length, id).toBeGreaterThan(5);
    }
  });

  it('says nothing that changes from one run to the next', () => {
    expect(JSON.stringify(openApiDocument({ version: 'x' }))).toBe(JSON.stringify(openApiDocument({ version: 'x' })));
  });
});

describe('an answer that is not what its route declares', () => {
  it('fails loudly where answers are checked, and only there', async () => {
    // A server that reports a version that is not text: the answer to GET /v1 no longer fits its declaration.
    const wrong = { version: 42 as unknown as string };
    const checked = await serverWith({ ...wrong, validateResponses: true });
    const unchecked = await serverWith({ ...wrong, validateResponses: false });
    const ask = (server: FastifyInstance) => {
      const at = (server.server.address() as AddressInfo).port;
      return server.inject({ method: 'GET', url: publicPaths.root, headers: { host: `127.0.0.1:${at}`, origin: `http://127.0.0.1:${at}`, cookie: `${cookieName(at)}=${ownerToken}` } });
    };
    const original = console.error;
    const printed: string[] = [];
    console.error = (...args: unknown[]) => void printed.push(args.map(String).join(' '));
    try {
      expect((await ask(checked)).statusCode).toBe(500);
      expect((await ask(unchecked)).statusCode).toBe(200);
    } finally {
      console.error = original;
      await checked.close();
      await unchecked.close();
    }
    expect(printed.join('\n')).toContain('GET /v1 answered with something its declaration does not allow: version');
  });

  it('is checked in every route test: the server built by the tests has the check on', async () => {
    // No option given, as in the other test files: under the test runner the default is to check.
    const byDefault = await serverWith({ version: 7 as unknown as string });
    const at = (byDefault.server.address() as AddressInfo).port;
    const original = console.error;
    console.error = () => {};
    try {
      const answer = await byDefault.inject({ method: 'GET', url: publicPaths.root, headers: { host: `127.0.0.1:${at}`, cookie: `${cookieName(at)}=${ownerToken}` } });
      expect(answer.statusCode).toBe(500);
    } finally {
      console.error = original;
      await byDefault.close();
    }
  });

  it('every declared route has a handler, and every handler a declaration', () => {
    const declared = ROUTE_IDS.map((id: RouteId) => `${ROUTES[id].method} ${ROUTES[id].path}`).sort();
    expect(publicRoutesOf(app).map((r) => `${r.method} ${r.url}`).sort()).toEqual(declared);
  });
});
