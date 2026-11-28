import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AubergineError, OPERATIONS, createClient, type Client } from '@aubergine/client';
import { DEFAULT_SETTINGS, ROUTES, ROUTE_IDS, openApiDocument, openApiPath, type OpenApiDocument, type Scope } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitClient, tsType } from './describe/emit-client';
import { emitDocs, exampleOf } from './describe/emit-docs';
import { generatedFiles } from './describe/generated-files';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOCKET = testSocketName('api-client');
const runtime = new TmuxRuntime({ socket: SOCKET });

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let baseUrl: string;
/** The owner, as the command line is: the access token as the browser's cookie, with the server's own origin. */
let owner: Client;

beforeAll(async () => {
  await runtime.killServer();
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-client-'));
  ownerToken = await loadOrCreateToken(dir);
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  app = await buildServer({ hub, sessions: new Sessions(hub, runtime), runtime, settings: async () => DEFAULT_SETTINGS, token: ownerToken, devOrigin: null, webDist: path.join(dir, 'no-web'), version: '4.5.6' });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = (app.server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  owner = createClient({ baseUrl, headers: { cookie: `${cookieName(port)}=${ownerToken}`, origin: baseUrl } });
});

afterAll(async () => {
  await hub.flush();
  await app.close();
  await destroyTmuxServer(runtime, SOCKET);
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

async function clientWith(scopes: Scope[], name = scopes.join('+')): Promise<{ client: Client; id: string }> {
  const created = await owner.createToken({ body: { name, scopes } });
  return { client: createClient({ baseUrl, token: created.secret }), id: created.token.id };
}

/** The error a call fails with; fails the test if the call succeeds. */
async function failure(call: Promise<unknown>): Promise<AubergineError> {
  try {
    await call;
  } catch (error) {
    expect(error).toBeInstanceOf(AubergineError);
    return error as AubergineError;
  }
  throw new Error('The call was expected to fail');
}

describe('what is generated and kept in the repository', () => {
  it('is up to date: the client and the reference are what the declarations give now', async () => {
    const files = generatedFiles();
    expect(Object.keys(files).sort()).toEqual(['client/src/generated.ts', 'docs/api.md', 'docs/config.schema.json', 'docs/element.md', 'docs/for-agents.md', 'docs/hooks.md', 'docs/project-file.md', 'docs/settings.md', 'docs/templates.md', 'docs/theme.schema.json', 'shared/src/theme-colors.generated.ts', 'shared/src/token-names.generated.ts']);
    for (const [file, text] of Object.entries(files)) {
      const committed = await readFile(path.join(repoRoot, file), 'utf8');
      // If this fails: a declaration, a schema or the guide for agents changed. Run `pnpm generate` and commit the result.
      expect(committed === text, `${file} is out of date. Run: pnpm generate`).toBe(true);
    }
  });

  it('would be out of date after any change to a route or a schema', async () => {
    const committed = { client: await readFile(path.join(repoRoot, 'client/src/generated.ts'), 'utf8'), docs: await readFile(path.join(repoRoot, 'docs/api.md'), 'utf8') };
    const changes: [string, (document: OpenApiDocument) => void][] = [
      ['a field added to a body', (d) => void ((d.paths['/v1/canvases']!.post!.requestBody!.content['application/json'].schema.properties as Record<string, unknown>).icon = { type: 'string' })],
      ['a field added to an answer', (d) => void ((d.components.schemas.Error!.properties as Record<string, unknown>).hint = { type: 'string' })],
      ['a query parameter added', (d) => void d.paths['/v1/sessions']!.get!.parameters.push({ name: 'tag', in: 'query', required: false, schema: { type: 'string' } })],
      ['a route added', (d) => void (d.paths['/v1/workflows'] = { get: { ...d.paths['/v1/canvases']!.get!, operationId: 'listWorkflows' as never } })],
      ['a route removed', (d) => void delete d.paths['/v1/sessions/{sessionId}/park']],
      ['a scope changed', (d) => void (d.paths['/v1/canvases']!.get!['x-aubergine-access'] = { scope: 'notes:write', fieldScopes: {}, who: 'token' })],
      ['a field made required', (d) => void ((d.paths['/v1/canvases']!.post!.requestBody!.content['application/json'].schema.required as string[]).push('color'))],
    ];
    for (const [what, change] of changes) {
      const document = openApiDocument({ version: '0' });
      change(document);
      expect(emitClient(document) === committed.client, `the client after ${what}`).toBe(false);
      // A parameter or a scope shows in the reference too; every change shows in at least the client.
      if (!['a field added to an answer'].includes(what)) expect(emitDocs(document) === committed.docs, `the reference after ${what}`).toBe(false);
    }
    // And with no change at all, nothing differs.
    expect(emitClient(openApiDocument({ version: '0' }))).toBe(committed.client);
    expect(emitDocs(openApiDocument({ version: '0' }))).toBe(committed.docs);
  });

  it('does not change with the version of the server', () => {
    expect(emitClient(openApiDocument({ version: '1.0.0' }))).toBe(emitClient(openApiDocument({ version: '9.9.9' })));
    expect(emitDocs(openApiDocument({ version: '1.0.0' }))).toBe(emitDocs(openApiDocument({ version: '9.9.9' })));
  });

  it('gives the client a method for every route the server has, and no other', () => {
    const served = publicRoutesOf(app).map((route) => `${route.method} ${openApiPath(route.url)}`).sort();
    const inClient = Object.values(OPERATIONS).map((operation) => `${operation.method} ${operation.path}`).sort();
    expect(inClient).toEqual(served);
    expect(Object.keys(OPERATIONS).sort()).toEqual([...ROUTE_IDS].sort());
    for (const id of ROUTE_IDS) expect(typeof (owner as unknown as Record<string, unknown>)[id], id).toBe('function');
    expect(Object.keys(owner.each).sort()).toEqual(ROUTE_IDS.filter((id) => 'paged' in ROUTES[id] && ROUTES[id].paged).sort());
  });

  it('has a reference generated from the description the running server serves, with a section for every route', async () => {
    const served = (await owner.getDescription()) as unknown as OpenApiDocument;
    expect(served.info.version).toBe('4.5.6');
    const reference = await readFile(path.join(repoRoot, 'docs/api.md'), 'utf8');
    expect(emitDocs(served)).toBe(reference);
    for (const route of publicRoutesOf(app)) {
      expect(reference, `${route.method} ${route.url}`).toContain(`\`${route.method} ${openApiPath(route.url)}\`: `);
    }
    for (const id of ROUTE_IDS) expect(reference).toContain(`### ${id}\n`);
    // Every route a token may call has an example with curl; the browser-only ones have none.
    expect(reference.match(/^curl/gm)?.length).toBe(ROUTE_IDS.filter((id) => !['tokens.manage', 'activity.read', 'drafts.review', 'repository.review', 'repository.write', 'sessions.protect', 'describe.manage', 'shelf.manage', 'library.manage', 'runs.approve', 'environments.manage', 'queue.manage', 'rules.manage', 'schedules.manage', 'desktop.open', 'settings.write', 'projects.manage', 'sharing.manage', 'themes.manage', 'stylesheet.read', 'plugins.manage'].includes(ROUTES[id].action ?? '')).length);
  });
});

describe('turning schemas into types and examples', () => {
  it('writes the kinds of type the API uses', () => {
    expect(tsType({ type: 'string' })).toBe('string');
    expect(tsType({ type: ['string', 'null'] })).toBe('string | null');
    expect(tsType({ type: 'string', enum: ['a', 'b'] })).toBe('"a" | "b"');
    expect(tsType({ const: 'v1' })).toBe('"v1"');
    expect(tsType({ type: 'array', items: { type: ['integer', 'null'] } })).toBe('(number | null)[]');
    expect(tsType({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe('string | null');
    expect(tsType({ type: 'object', properties: { a: { type: 'string' }, 'b-c': { type: 'number', description: 'How many' } }, required: ['a'] })).toBe('{\n  a: string;\n  /** How many */\n  "b-c"?: number;\n}');
    expect(tsType({ type: 'object', additionalProperties: { type: 'string' } })).toBe('{\n  [key: string]: string;\n}');
    expect(tsType({ type: 'object', properties: { type: { type: 'string' } }, required: ['type'], additionalProperties: {} })).toBe('{\n  type: string;\n  [key: string]: unknown;\n}');
    expect(tsType({ $ref: '#/components/schemas/Error' })).toBe('ErrorBody');
    expect(tsType({})).toBe('unknown');
    expect(tsType(undefined)).toBe('unknown');
  });

  it('makes an example with what is required, and something when nothing is', () => {
    expect(exampleOf({ type: 'object', properties: { name: { type: 'string' }, color: { type: 'string', enum: ['none', 'red'] } }, required: ['name'] })).toEqual({ name: 'example' });
    expect(exampleOf({ type: 'object', properties: { canvasId: { type: 'string', format: 'uuid' }, position: { type: 'object' } }, required: ['canvasId'] })).toEqual({ canvasId: '<canvasId>' });
    expect(exampleOf({ type: 'object', properties: { name: { type: 'string' }, tags: { type: 'array' } } })).toEqual({ name: 'example' });
    expect(exampleOf({ type: 'array', items: { type: 'string', enum: ['read', 'x'] } }, 'scopes')).toEqual(['read']);
    expect(exampleOf({ type: 'integer', minimum: 1 })).toBe(1);
  });
});

describe('the client against a real server', () => {
  it('creates a canvas, starts sessions, pages through them, and moves one, with a token', async () => {
    const { client } = await clientWith(['read', 'canvases:write', 'sessions:write']);

    const who = await client.getCapabilities();
    expect(who.version).toBe('4.5.6');
    expect(who.caller).toMatchObject({ kind: 'token', scopes: ['read', 'canvases:write', 'sessions:write'] });

    const canvas = await client.createCanvas({ body: { name: 'Client test', color: 'blue' }, idempotencyKey: 'client-test-1' });
    expect(canvas).toMatchObject({ name: 'Client test', color: 'blue', nodes: [], frames: [], counts: { sessions: 0 } });
    // The same key again: the same canvas, not a second one.
    expect((await client.createCanvas({ body: { name: 'Client test', color: 'blue' }, idempotencyKey: 'client-test-1' })).id).toBe(canvas.id);
    expect((await client.listCanvases()).items.map((c) => c.name)).toEqual(['Main', 'Client test']);

    const started = [];
    for (const name of ['one', 'two', 'three', 'four', 'five']) started.push(await client.startSession({ canvasId: canvas.id, body: { name, tags: ['client'] } }));
    expect(started.map((s) => s.canvasId)).toEqual(Array(5).fill(canvas.id));

    // One page at a time by hand...
    const first = await client.listCanvasSessions({ canvasId: canvas.id, query: { limit: 2 } });
    expect(first.items.map((s) => s.name)).toEqual(['one', 'two']);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await client.listCanvasSessions({ canvasId: canvas.id, query: { limit: 2, cursor: first.nextCursor! } });
    expect(second.items.map((s) => s.name)).toEqual(['three', 'four']);

    // ...and every item across the pages, fetched as they are asked for.
    let requests = 0;
    const counting = createClient({
      baseUrl,
      headers: (owner as unknown as { headers?: never }).headers ?? {},
      token: (await owner.createToken({ body: { name: 'counter', scopes: ['read'] } })).secret,
      fetch: (input, init) => {
        requests += 1;
        return fetch(input, init);
      },
    });
    const names: string[] = [];
    for await (const session of counting.each.listSessions({ query: { limit: 2, state: 'open' } })) names.push(session.name);
    expect(names).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(requests).toBe(3);
    // Stopping early stops fetching.
    requests = 0;
    for await (const session of counting.each.listSessions({ query: { limit: 2 } })) {
      if (session.name === 'two') break;
    }
    expect(requests).toBe(1);

    const main = (await client.listCanvases()).items[0]!;
    const moved = await client.moveSession({ sessionId: started[4]!.session.id, body: { canvasId: main.id } });
    expect(moved.canvasId).toBe(main.id);
    expect((await client.getCanvas({ canvasId: canvas.id })).nodes).toHaveLength(4);
    expect((await client.updateSession({ sessionId: started[0]!.session.id, body: { name: 'renamed' } })).name).toBe('renamed');
    expect(await client.endSession({ sessionId: started[3]!.session.id })).toBeUndefined();
    expect(await client.closeCanvas({ canvasId: canvas.id, query: { sessions: 'move', to: main.id } })).toBeUndefined();
    expect((await client.listCanvases()).items.map((c) => c.name)).toEqual(['Main']);
  }, 60_000);

  it('turns every refusal into one typed error', async () => {
    const reader = await clientWith(['read'], 'error reader');

    const forbidden = await failure(reader.client.createCanvas({ body: { name: 'Not allowed' } }));
    expect(forbidden).toMatchObject({ name: 'AubergineError', status: 403, code: 'forbidden', message: 'These credentials may not do that', retryAfterSeconds: null });
    expect(forbidden).toBeInstanceOf(Error);

    expect(await failure(reader.client.getCanvas({ canvasId: '01900000-0000-7000-8000-0000000000aa' }))).toMatchObject({ status: 404, code: 'not_found' });
    expect(await failure(reader.client.getCanvas({ canvasId: 'not-an-id' }))).toMatchObject({ status: 400, code: 'bad_request' });
    expect(await failure(reader.client.getCanvas({ canvasId: '' }))).toMatchObject({ status: 0, code: 'bad_request', message: 'canvasId is needed' });
    expect(await failure(reader.client.listTokens())).toMatchObject({ status: 403, code: 'forbidden' });
    expect(await failure(createClient({ baseUrl, token: 'aubt_wrong' }).listCanvases())).toMatchObject({ status: 401, code: 'unauthorized' });
    expect(await failure(createClient({ baseUrl }).listCanvases())).toMatchObject({ status: 401, code: 'unauthorized' });

    await owner.revokeToken({ tokenId: reader.id });
    expect(await failure(reader.client.listCanvases())).toMatchObject({ status: 401, code: 'unauthorized', message: 'This token has been revoked' });

    // Nothing listening: still the one kind of error.
    const nowhere = await failure(createClient({ baseUrl: 'http://127.0.0.1:1', token: 'aubt_x' }).listCanvases());
    expect(nowhere).toMatchObject({ status: 0, code: 'network' });
    expect(nowhere.message).toContain('could not be reached at http://127.0.0.1:1');
  });

  it('reads the limit and the oddities of an answer without a server at all', async () => {
    const answer = (status: number, body: string, headers: Record<string, string> = {}) => createClient({ baseUrl: 'http://example.invalid', token: 't', fetch: async () => new Response(body, { status, headers }) });
    expect(await failure(answer(429, '{"error":{"code":"rate_limited","message":"Too many calls"}}', { 'retry-after': '7' }).listCanvases())).toMatchObject({ status: 429, code: 'rate_limited', retryAfterSeconds: 7 });
    expect(await failure(answer(413, '{"error":{"code":"too_large","message":"Too big"}}').createCanvas({ body: { name: 'x' } }))).toMatchObject({ status: 413, code: 'too_large' });
    // Not the server's error shape, and not JSON at all.
    expect(await failure(answer(502, '<html>Bad gateway</html>').listCanvases())).toMatchObject({ status: 502, code: 'unexpected', message: 'The server answered HTTP 502' });
    expect(await failure(answer(200, 'not json').listCanvases())).toMatchObject({ status: 200, code: 'unexpected' });
  });

  it('sends a token as a bearer credential, or uses the page\'s cookie, and never both', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const recording: typeof fetch = async (input, init) => {
      seen.push({ url: String(input), init: init ?? {} });
      return new Response('{"items":[],"nextCursor":null}', { status: 200 });
    };
    await createClient({ baseUrl: 'http://127.0.0.1:4600/', token: 'aubt_secret', fetch: recording }).listSessions({ query: { state: 'parked', limit: 5 } });
    expect(seen[0]?.url).toBe('http://127.0.0.1:4600/v1/sessions?state=parked&limit=5');
    expect(seen[0]?.init.headers).toMatchObject({ authorization: 'Bearer aubt_secret', accept: 'application/json' });
    expect(seen[0]?.init).not.toHaveProperty('credentials');

    // In a page served by the server: no address, no token, the cookie.
    await createClient({ useCookie: true, fetch: recording }).createCanvas({ body: { name: 'x' }, idempotencyKey: 'k1' });
    expect(seen[1]?.url).toBe('/v1/canvases');
    expect(seen[1]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin', body: '{"name":"x"}' });
    expect(seen[1]?.init.headers).toMatchObject({ 'content-type': 'application/json', 'idempotency-key': 'k1' });
    expect(seen[1]?.init.headers).not.toHaveProperty('authorization');

    // Given both, the token decides, as it does on the server.
    await createClient({ useCookie: true, token: 'aubt_secret', fetch: recording }).listCanvases();
    expect(seen[2]?.init).not.toHaveProperty('credentials');
    // A key is only sent where the route takes one.
    await createClient({ token: 't', fetch: recording }).listCanvases({ idempotencyKey: 'ignored' });
    expect(seen[3]?.init.headers).not.toHaveProperty('idempotency-key');
  });

  it('follows the stream of changes', async () => {
    const { client } = await clientWith(['read', 'canvases:write'], 'stream');
    const stop = new AbortController();
    const seen: string[] = [];
    const reading = (async () => {
      try {
        for await (const event of client.streamEvents({ signal: stop.signal })) {
          seen.push(event.type);
          if (seen.length === 2) break;
        }
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') throw error;
      }
    })();
    // Give the stream a moment to open, then cause two changes.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const made = await client.createCanvas({ body: { name: 'Streamed' } });
    await client.updateCanvas({ canvasId: made.id, body: { name: 'Streamed again' } });
    await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, 5000))]);
    stop.abort();
    expect(seen).toEqual(['canvas.created', 'canvas.updated']);
    await client.closeCanvas({ canvasId: made.id });
  }, 20_000);

  it('does what only the owner may, with the cookie: tokens and their activity', async () => {
    const created = await owner.createToken({ body: { name: 'by the client', scopes: ['read'], expiresInDays: 3 } });
    expect(created.secret).toMatch(/^aubt_/);
    expect(created.token.expiresAt).toEqual(expect.any(String));
    await createClient({ baseUrl, token: created.secret }).listCanvases();
    const tokens = [];
    for await (const token of owner.each.listTokens({ query: { limit: 2 } })) tokens.push(token.name);
    expect(tokens).toContain('by the client');
    const activity = await owner.listActivity({ query: { tokenId: created.token.id } });
    expect(activity.items.map((e) => `${e.method} ${e.route} ${e.outcome}`)).toEqual(['GET /v1/canvases ok']);
    expect((await owner.revokeToken({ tokenId: created.token.id })).revokedAt).toEqual(expect.any(String));
  });
});
