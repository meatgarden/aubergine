import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  ActivityList,
  CanvasDetail,
  Capabilities,
  CreatedToken,
  GRANTABLE_SCOPES,
  PlacedSession,
  SessionList,
  TOKEN_PREFIX,
  TokenList,
  newId,
  placeOfSession,
  publicPaths,
  paths,
  type ActivityEntry,
  type Scope,
} from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_FILE, FileActivityLog } from './activity';
import { sessionToken } from './auth';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const SOCKET = testSocketName('api-tokens');
const runtime = new TmuxRuntime({ socket: SOCKET });

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let origin: string;
/** What the server printed while it ran, to search for secrets. */
let printed: string[] = [];

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(dir, (message) => printed.push(message));
  await settings.reload();
  sessions = new Sessions(hub, runtime, {});
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: path.join(dir, 'no-web-build'),
    activity: new FileActivityLog(dir, settings.value.api.activityLogMaxBytes),
    version: '9.8.7',
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}

async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}

beforeAll(async () => {
  await runtime.killServer();
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-api-tokens-'));
  ownerToken = await loadOrCreateToken(dir);
  printed = [];
  await start();
});

afterEach(async () => {
  await stop();
  await runtime.killServer();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

afterAll(async () => {
  await destroyTmuxServer(runtime, SOCKET);
});

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  headers: Record<string, string | string[] | undefined>;
}

/** A call the way a program makes it: a bearer token, no cookie, no Origin. */
async function call(secret: string, method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer> {
  const response = await app.inject({
    method: method as 'GET',
    url,
    headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${secret}`, ...headers },
    ...(body === undefined ? {} : { payload: body as object }),
  });
  return { status: response.statusCode, body: response.body ? safeJson(response.body) : null, headers: response.headers as Answer['headers'] };
}

/** A call the way the page makes it: the cookie and the page's own Origin. */
async function asOwner(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer> {
  const response = await app.inject({
    method: method as 'GET',
    url,
    // What a browser adds to every request a page makes: these calls are the page's.
    headers: { host: `127.0.0.1:${port}`, origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin', ...headers },
    ...(body === undefined ? {} : { payload: body as object }),
  });
  return { status: response.statusCode, body: response.body ? safeJson(response.body) : null, headers: response.headers as Answer['headers'] };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function makeToken(name: string, scopes: Scope[], extra: Record<string, unknown> = {}): Promise<{ id: string; secret: string }> {
  // Review of workflow changes is switched off here, so that these tests are about scopes alone; the switch has tests of its own.
  const created = await asOwner('POST', publicPaths.tokens, { name, scopes, reviewWorkflowChanges: false, reach: { kind: 'all' }, ...extra });
  expect(created.status).toBe(201);
  const { token, secret } = CreatedToken.parse(created.body);
  return { id: token.id, secret };
}

async function activityOf(tokenId?: string): Promise<ActivityEntry[]> {
  const answer = await asOwner('GET', `${publicPaths.activity}?limit=500${tokenId ? `&tokenId=${tokenId}` : ''}`);
  expect(answer.status).toBe(200);
  // Newest first; oldest first reads better in a test.
  return ActivityList.parse(answer.body).items.reverse();
}

const mainCanvas = (): string => hub.state.canvases[0]!.id;

/** A route with made-up IDs in place of its placeholders. */
const filled = (url: string): string => url.replace(/:[A-Za-z]+/g, () => newId());

const FORBIDDEN = { error: { code: 'forbidden', message: expect.any(String) } };

describe('creating and using a token', () => {
  it('shows the secret once, and stores only a hash', async () => {
    const created = await asOwner('POST', publicPaths.tokens, { name: 'build bot', scopes: ['sessions:write', 'read'], somethingFromTheFuture: true });
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const { token, secret } = CreatedToken.parse(created.body);
    expect(secret).toMatch(/^aubt_[A-Za-z0-9_-]{43}$/);
    expect(token).toMatchObject({ name: 'build bot', scopes: ['read', 'sessions:write'], lastUsedAt: null, expiresAt: null, revokedAt: null });
    expect(created.body.token).not.toHaveProperty('hash');

    // Listing never shows it again, nor the hash.
    const listed = await asOwner('GET', publicPaths.tokens);
    const list = TokenList.parse(listed.body);
    expect(list.items.map((t) => t.name)).toEqual(['build bot']);
    expect(JSON.stringify(listed.body)).not.toContain(secret);
    expect(listed.body.items[0]).not.toHaveProperty('hash');

    // The state the page loads has the token without its hash.
    const state = await asOwner('GET', paths.state);
    expect(state.body.state.tokens).toEqual([expect.objectContaining({ name: 'build bot', hash: '' })]);

    expect((await call(secret, 'GET', publicPaths.canvases)).status).toBe(200);
  });

  it('refuses a bad name, no scopes, an unknown or reserved scope, and two kinds of expiry at once', async () => {
    const bad = async (body: unknown): Promise<number> => (await asOwner('POST', publicPaths.tokens, body)).status;
    expect(await bad({ name: '  ', scopes: ['read'] })).toBe(400);
    expect(await bad({ name: 'x', scopes: [] })).toBe(400);
    expect(await bad({ name: 'x' })).toBe(400);
    expect(await bad({ name: 'x', scopes: ['everything'] })).toBe(400);
    // Known, but not to be had yet.
    for (const reserved of ['terminal:read', 'terminal:input']) expect(await bad({ name: 'x', scopes: [reserved] }), reserved).toBe(400);
    expect(await bad({ name: 'x', scopes: ['read'], expiresAt: '2030-01-01T00:00:00.000Z', expiresInDays: 3 })).toBe(400);
    expect(await bad({ name: 'x', scopes: ['read'], expiresInDays: 0 })).toBe(400);
    expect(hub.state.tokens).toEqual([]);
  });

  it('says what the server can do, and who is asking, to any caller and without any scope', async () => {
    const notes = await makeToken('notes only', ['notes:write'], { expiresInDays: 7 });
    const mine = await call(notes.secret, 'GET', publicPaths.root);
    expect(mine.status).toBe(200);
    const capabilities = Capabilities.parse(mine.body);
    expect(capabilities).toMatchObject({ name: 'aubergine', version: '9.8.7', api: 'v1' });
    expect(capabilities.features).toEqual(expect.arrayContaining(['canvases', 'sessions', 'events', 'tokens']));
    expect(capabilities.scopes.map((s) => [s.name, s.grantable])).toEqual([
      ['read', true],
      ['canvases:write', true],
      ['sessions:write', true],
      ['notes:write', true],
      ['workflows:write', true],
      ['runs:write', true],
      ['terminal:read', true],
      ['terminal:input', true],
      ['messages:read', true],
      ['messages:write', true],
    ]);
    expect(capabilities.caller).toMatchObject({ kind: 'token', id: notes.id, name: 'notes only', scopes: ['notes:write'] });
    expect(capabilities.caller.kind === 'token' && capabilities.caller.expiresAt).toBeTruthy();
    expect(JSON.stringify(mine.body)).not.toContain(notes.secret);

    expect(Capabilities.parse((await asOwner('GET', publicPaths.root)).body).caller).toEqual({ kind: 'user' });
    const { session } = await sessions.create({});
    const asSession = await call(sessionToken(ownerToken, session.id), 'GET', publicPaths.root);
    expect(Capabilities.parse(asSession.body).caller).toEqual({ kind: 'session', sessionId: session.id });

    // Nobody at all gets nothing.
    const nobody = await app.inject({ method: 'GET', url: publicPaths.root, headers: { host: `127.0.0.1:${port}` } });
    expect(nobody.statusCode).toBe(401);
  });
});

describe('a token that should not work', () => {
  it('fails on the very next call once revoked', async () => {
    const { id, secret } = await makeToken('short-lived', ['read']);
    expect((await call(secret, 'GET', publicPaths.canvases)).status).toBe(200);

    const revoked = await asOwner('DELETE', publicPaths.token(id));
    expect(revoked.status).toBe(200);
    expect(revoked.body.revokedAt).toEqual(expect.any(String));

    const after = await call(secret, 'GET', publicPaths.canvases);
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ error: { code: 'unauthorized', message: 'This token has been revoked' } });
    // Not even what needs no scope.
    expect((await call(secret, 'GET', publicPaths.root)).status).toBe(401);
    // It stays listed, marked revoked; revoking again is not an error.
    expect(TokenList.parse((await asOwner('GET', publicPaths.tokens)).body).items[0]?.revokedAt).not.toBeNull();
    expect((await asOwner('DELETE', publicPaths.token(id))).status).toBe(200);
    expect((await asOwner('DELETE', publicPaths.token(newId()))).status).toBe(404);

    const log = await activityOf(id);
    expect(log.map((e) => [e.outcome, e.status])).toEqual([
      ['ok', 200],
      ['refused', 401],
      ['refused', 401],
    ]);
  });

  it('fails once it has expired', async () => {
    const soon = new Date(Date.now() + 400).toISOString();
    const { secret } = await makeToken('expiring', ['read'], { expiresAt: soon });
    expect((await call(secret, 'GET', publicPaths.canvases)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await call(secret, 'GET', publicPaths.canvases);
    expect(after.status).toBe(401);
    expect(after.body.error.message).toBe('This token has expired');
  });

  it('is refused when it is one character off, has the wrong prefix, or is not a token at all', async () => {
    const { secret } = await makeToken('real', ['read']);
    const flip = (text: string, at: number): string => text.slice(0, at) + (text[at] === 'A' ? 'B' : 'A') + text.slice(at + 1);
    const wrong = [
      flip(secret, secret.length - 1),
      flip(secret, 12),
      secret.slice(0, -1),
      `${secret}A`,
      secret.replace(TOKEN_PREFIX, 'aubx_'),
      secret.slice(TOKEN_PREFIX.length),
      hub.state.tokens[0]!.hash,
      ownerToken,
      'nonsense',
    ];
    for (const attempt of wrong) {
      const answer = await call(attempt, 'GET', publicPaths.canvases);
      expect(answer.status, attempt.slice(0, 12)).toBe(401);
      expect(answer.body.error.code).toBe('unauthorized');
    }
    // Other ways of sending it do not count either.
    const basic = await app.inject({ method: 'GET', url: publicPaths.canvases, headers: { host: `127.0.0.1:${port}`, authorization: `Basic ${Buffer.from(`x:${secret}`).toString('base64')}` } });
    expect(basic.statusCode).toBe(401);
    const inQuery = await app.inject({ method: 'GET', url: `${publicPaths.canvases}?token=${secret}`, headers: { host: `127.0.0.1:${port}` } });
    expect(inQuery.statusCode).toBe(401);
    // None of that was recorded against the real token.
    expect(await activityOf()).toEqual([]);
  });

  it('with a bearer token, a cookie sent along does not make it the browser', async () => {
    const reader = await makeToken('reader', ['read']);
    const withCookie = { cookie: `${cookieName(port)}=${ownerToken}`, origin };
    // A read token with the owner's cookie beside it is still only a read token...
    expect((await call(reader.secret, 'POST', publicPaths.canvases, { name: 'Sneaky' }, withCookie)).status).toBe(403);
    expect((await call(reader.secret, 'GET', publicPaths.tokens, undefined, withCookie)).status).toBe(403);
    // ...and a wrong token with the owner's cookie beside it is refused, not let in as the owner.
    expect((await call('aubt_wrong', 'GET', publicPaths.canvases, undefined, withCookie)).status).toBe(401);
    expect((await call('aubt_wrong', 'POST', publicPaths.tokens, { name: 'x', scopes: ['read'] }, withCookie)).status).toBe(401);
    expect(hub.state.canvases).toHaveLength(1);
    expect(hub.state.tokens).toHaveLength(1);
  });

  it('still needs the right Host, and is only ever local', async () => {
    const { secret } = await makeToken('reader', ['read']);
    const elsewhere = await app.inject({ method: 'GET', url: publicPaths.canvases, headers: { host: 'evil.example', authorization: `Bearer ${secret}` } });
    expect(elsewhere.statusCode).toBe(403);
    expect(elsewhere.json()).toEqual({ error: { code: 'forbidden', message: 'Host not allowed' } });
    const foreignOrigin = await app.inject({ method: 'GET', url: publicPaths.canvases, headers: { host: `127.0.0.1:${port}`, origin: 'https://evil.example', authorization: `Bearer ${secret}` } });
    expect(foreignOrigin.statusCode).toBe(403);
    expect((app.server.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});

describe('every route has a rule', () => {
  /** The routes only a session may use, for itself. */
  const SESSION_ONLY = [
    'PUT /v1/sessions/:sessionId/attention',
    'PUT /v1/sessions/:sessionId/recap',
    'PUT /v1/sessions/:sessionId/agent',
    'GET /v1/sessions/:sessionId/brief',
    'GET /v1/sessions/:sessionId/drafts',
    'POST /v1/sessions/:sessionId/drafts',
    // A session's own inbox, and what it sends: no token may take a session's messages or speak as it.
    'POST /v1/sessions/:sessionId/inbox',
    'POST /v1/sessions/:sessionId/messages/:messageId/reply',
    'POST /v1/sessions/:sessionId/tell',
  ];
  /** The routes no token may use, whatever its scopes. */
  const NEVER = [
    'GET /v1/tokens',
    'POST /v1/tokens',
    'DELETE /v1/tokens/:tokenId',
    'GET /v1/activity',
    // Reading a draft and deciding about it is the owner's alone.
    'POST /v1/drafts/:draftId/accept',
    'POST /v1/drafts/:draftId/return',
    'DELETE /v1/drafts/:draftId',
    'POST /v1/draft-requests',
    'GET /v1/draft-records',
    // Accepting a repository workflow, and writing into a repository.
    'POST /v1/repository-workflows/accept',
    'POST /v1/repository-workflows/save',
    // Closing a session to programs, or opening it again.
    'PUT /v1/sessions/:sessionId/protection',
    'PUT /v1/sessions/:sessionId/takes-messages',
    // Retiring a shelf element, bringing it back, and taking a newer version into a workflow are the owner's.
    'POST /v1/elements/:elementId/retire',
    'POST /v1/elements/:elementId/restore',
    'POST /v1/workflows/:workflowId/elements/:elementId/shelf-update',
    // The library: sources, refreshing (the one thing that fetches), accepting an install and removing one are the owner's.
    'POST /v1/library/sources',
    'DELETE /v1/library/sources/:sourceId',
    'POST /v1/library/sources/:sourceId/refresh',
    'GET /v1/library/requests',
    'GET /v1/library/requests/:requestId',
    'POST /v1/library/requests/:requestId/accept',
    'DELETE /v1/library/requests/:requestId',
    'DELETE /v1/library/installed/:installedId',
  ];

  it('has the routes the plan lists, under /v1', () => {
    const have = publicRoutesOf(app).map((r) => `${r.method} ${r.url}`);
    for (const wanted of [
      'GET /v1',
      'GET /v1/canvases',
      'POST /v1/canvases',
      'GET /v1/canvases/:canvasId',
      'PATCH /v1/canvases/:canvasId',
      'DELETE /v1/canvases/:canvasId',
      'GET /v1/canvases/:canvasId/sessions',
      'POST /v1/canvases/:canvasId/sessions',
      'POST /v1/sessions/:sessionId/move',
      'GET /v1/sessions',
      'GET /v1/sessions/:sessionId',
      'PATCH /v1/sessions/:sessionId',
      'DELETE /v1/sessions/:sessionId',
      'POST /v1/sessions/:sessionId/park',
      'POST /v1/sessions/:sessionId/restore',
      'PATCH /v1/canvases/:canvasId/nodes/:nodeId',
      'POST /v1/canvases/:canvasId/frames',
      'PATCH /v1/canvases/:canvasId/frames/:frameId',
      'DELETE /v1/canvases/:canvasId/frames/:frameId',
      'POST /v1/canvases/:canvasId/show',
      'POST /v1/sessions/:sessionId/show',
      'GET /v1/events',
      'POST /v1/sessions/:sessionId/notes',
    ]) {
      expect(have, wanted).toContain(wanted);
    }
    expect(new Set(have).size).toBe(have.length);
  });

  it('refuses a read token on every route that changes something', async () => {
    const reader = await makeToken('reader', ['read']);
    const writes = publicRoutesOf(app).filter((r) => r.method !== 'GET');
    expect(writes.length).toBeGreaterThan(15);
    for (const route of writes) {
      const answer = await call(reader.secret, route.method, filled(route.url), route.method === 'DELETE' ? undefined : {});
      expect(answer.status, `${route.method} ${route.url}`).toBe(403);
      expect(answer.body, `${route.method} ${route.url}`).toEqual(FORBIDDEN);
    }
    // Nothing was changed along the way.
    expect(hub.state.canvases).toHaveLength(1);
    expect(hub.state.sessions).toEqual([]);
    expect(hub.state.tokens).toHaveLength(1);
    // And every one of those refusals is on record.
    const log = await activityOf(reader.id);
    expect(log).toHaveLength(writes.length);
    expect(log.every((e) => e.outcome === 'denied' && e.status === 403 && e.action !== '')).toBe(true);
  });

  it('refuses a token without the read scope on every route that reads, but for the one that says what the server can do', async () => {
    const writer = await makeToken('writer', ['notes:write']);
    const reads = publicRoutesOf(app).filter((r) => r.method === 'GET');
    expect(reads.length).toBeGreaterThan(7);
    for (const route of reads) {
      const answer = await call(writer.secret, 'GET', filled(route.url));
      // The two that need no scope: what the server can do, and the description of the API.
      expect(answer.status, `GET ${route.url}`).toBe(route.url === '/v1' || route.url === '/v1/openapi.json' ? 200 : 403);
    }
  });

  it('refuses a token holding every scope exactly the routes no token may use, and the ones that are a session\'s own', async () => {
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES]);
    const refused: string[] = [];
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') continue; // A stream that does not end; it has its own test.
      const answer = await call(everything.secret, route.method, filled(route.url), route.method === 'GET' || route.method === 'DELETE' ? undefined : {});
      expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
      expect(answer.status, `${route.method} ${route.url}`).not.toBe(401);
      if (answer.status === 403) refused.push(`${route.method} ${route.url}`);
    }
    expect(refused.sort()).toEqual([...NEVER, ...SESSION_ONLY].sort());
    expect(hub.state.tokens).toHaveLength(1);
  });

  it('keeps tokens out of the routes that are the browser\'s alone, under /api too', async () => {
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES]);
    for (const [method, url] of [
      ['GET', paths.state],
      ['GET', paths.outside],
      ['POST', paths.outsideAdd],
      ['POST', paths.outsideMove],
      ['POST', paths.sessions],
    ] as const) {
      const answer = await call(everything.secret, method, url, method === 'GET' ? undefined : {}, { origin });
      expect(answer.status, `${method} ${url}`).toBe(401);
    }
    expect(hub.state.sessions).toEqual([]);
  });

  it('gives a session token what it reports about itself and the run it is on, and nothing else', async () => {
    const { session } = await sessions.create({});
    const other = await sessions.create({});
    const secret = sessionToken(ownerToken, session.id);
    const allowed: string[] = [];
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') {
        expect((await call(secret, 'GET', route.url)).status).toBe(403);
        continue;
      }
      const url = route.url.replace(':sessionId', session.id).replace(/:[A-Za-z]+/g, () => newId());
      const answer = await call(secret, route.method, url, route.method === 'GET' || route.method === 'DELETE' ? undefined : {});
      if (answer.status !== 403) allowed.push(`${route.method} ${route.url}`);
      // The same route for another session is always refused.
      if (route.url.includes(':sessionId')) {
        const elsewhere = route.url.replace(':sessionId', other.session.id).replace(/:[A-Za-z]+/g, () => newId());
        expect((await call(secret, route.method, elsewhere, route.method === 'GET' || route.method === 'DELETE' ? undefined : {})).status, `${route.method} ${route.url} for another session`).toBe(403);
      }
    }
    expect(allowed.sort()).toEqual([
      'GET /v1',
      'GET /v1/openapi.json',
      'GET /v1/sessions/:sessionId/brief',
      'GET /v1/sessions/:sessionId/drafts',
      'GET /v1/sessions/:sessionId/repository-workflows',
      'GET /v1/sessions/:sessionId/run',
      'POST /v1/sessions/:sessionId/drafts',
      // Messages: its own inbox, an answer, and a message of its own. Exactly these three.
      'POST /v1/sessions/:sessionId/inbox',
      'POST /v1/sessions/:sessionId/messages/:messageId/reply',
      'POST /v1/sessions/:sessionId/notes',
      'POST /v1/sessions/:sessionId/run/report',
      'POST /v1/sessions/:sessionId/tell',
      'PUT /v1/sessions/:sessionId/agent',
      'PUT /v1/sessions/:sessionId/attention',
      'PUT /v1/sessions/:sessionId/recap',
    ]);
    // Session tokens are not recorded in the activity log: it is the record of API tokens.
    expect(await activityOf()).toEqual([]);
  });
});

describe('the browser on the new routes', () => {
  it('is refused from another origin, cookie or not, and needs an Origin to change anything', async () => {
    const cookie = `${cookieName(port)}=${ownerToken}`;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') continue;
      const url = filled(route.url);
      const body = route.method === 'GET' || route.method === 'DELETE' ? {} : { payload: {} };
      const foreign = await app.inject({ method: route.method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin: 'https://evil.example', cookie }, ...body });
      expect(foreign.statusCode, `${route.method} ${route.url} from another origin`).toBe(403);
      expect(foreign.json().error.message).toBe('Origin not allowed');

      const rebound = await app.inject({ method: route.method as 'GET', url, headers: { host: 'evil.example', origin: 'http://evil.example', cookie }, ...body });
      expect(rebound.statusCode, `${route.method} ${route.url} under another host`).toBe(403);

      if (route.method !== 'GET') {
        const noOrigin = await app.inject({ method: route.method as 'GET', url, headers: { host: `127.0.0.1:${port}`, cookie }, ...body });
        expect(noOrigin.statusCode, `${route.method} ${route.url} without an Origin`).toBe(403);
        expect(noOrigin.json().error.message).toBe('Origin header required');
      }
      const noCookie = await app.inject({ method: route.method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin }, ...body });
      expect(noCookie.statusCode, `${route.method} ${route.url} without the cookie`).toBe(401);
    }
    expect(hub.state.tokens).toEqual([]);
    expect(hub.state.canvases).toHaveLength(1);
  });
});

describe('a script with a token', () => {
  it('creates a canvas, starts three sessions on it and moves one; a read token is refused; the log shows each call', async () => {
    const builder = await makeToken('build bot', ['sessions:write', 'canvases:write']);
    const reader = await makeToken('reader', ['read']);

    // The script.
    const made = await call(builder.secret, 'POST', publicPaths.canvases, { name: 'Builds', color: 'green' }, { 'idempotency-key': 'builds-1' });
    expect(made.status).toBe(201);
    const canvas = CanvasDetail.parse(made.body);
    // A retry of the same request does not make a second canvas.
    const again = await call(builder.secret, 'POST', publicPaths.canvases, { name: 'Builds', color: 'green' }, { 'idempotency-key': 'builds-1' });
    expect(again.body.id).toBe(canvas.id);
    expect(hub.state.canvases).toHaveLength(2);

    const started: PlacedSession[] = [];
    for (const name of ['unit', 'lint', 'package']) {
      const answer = await call(builder.secret, 'POST', publicPaths.canvasSessions(canvas.id), { name, tags: ['ci'], cwd: os.tmpdir() });
      expect(answer.status, name).toBe(201);
      started.push(PlacedSession.parse(answer.body));
    }
    expect(started.map((s) => s.canvasId)).toEqual([canvas.id, canvas.id, canvas.id]);

    const moved = await call(builder.secret, 'POST', publicPaths.moveSession(started[2]!.session.id), { canvasId: mainCanvas() });
    expect(moved.status).toBe(200);
    expect(PlacedSession.parse(moved.body).canvasId).toBe(mainCanvas());
    expect(placeOfSession(hub.state, started[2]!.session.id)?.canvas.id).toBe(mainCanvas());
    expect(hub.state.canvases.find((c) => c.id === canvas.id)?.layout.nodes).toHaveLength(2);

    // A token without `read` cannot look, even at what it made.
    expect((await call(builder.secret, 'GET', publicPaths.canvas(canvas.id))).status).toBe(403);

    // The read token sees all of it and can change none of it.
    const seen = await call(reader.secret, 'GET', publicPaths.canvasSessions(canvas.id));
    expect(SessionList.parse(seen.body).items.map((s) => s.name).sort()).toEqual(['lint', 'unit']);
    expect(SessionList.parse((await call(reader.secret, 'GET', `${publicPaths.sessions}?state=open`)).body).items).toHaveLength(3);
    expect((await call(reader.secret, 'GET', publicPaths.session(started[0]!.session.id))).body.tags).toEqual(['ci']);
    for (const [method, url, body] of [
      ['POST', publicPaths.canvases, { name: 'Mine' }],
      ['POST', publicPaths.canvasSessions(canvas.id), { name: 'mine' }],
      ['POST', publicPaths.moveSession(started[0]!.session.id), { canvasId: mainCanvas() }],
      ['DELETE', publicPaths.session(started[0]!.session.id), undefined],
      ['PATCH', publicPaths.canvas(canvas.id), { name: 'Renamed' }],
    ] as const) {
      expect((await call(reader.secret, method, url, body)).body, `${method} ${url}`).toEqual(FORBIDDEN);
    }
    expect(hub.state.sessions).toHaveLength(3);
    expect(hub.state.canvases.map((c) => c.name)).toEqual(['Main', 'Builds']);

    // The activity log: one line per call, in order, with who, what and how it ended.
    const byBuilder = await activityOf(builder.id);
    expect(byBuilder.map((e) => `${e.method} ${e.route} ${e.action} ${e.outcome}`)).toEqual([
      'POST /v1/canvases canvases.write ok',
      'POST /v1/canvases canvases.write ok',
      'POST /v1/canvases/:canvasId/sessions sessions.write ok',
      'POST /v1/canvases/:canvasId/sessions sessions.write ok',
      'POST /v1/canvases/:canvasId/sessions sessions.write ok',
      'POST /v1/sessions/:sessionId/move sessions.write ok',
      'GET /v1/canvases/:canvasId canvases.read denied',
    ]);
    expect(byBuilder.every((e) => e.tokenName === 'build bot')).toBe(true);
    expect(byBuilder[2]?.resource).toEqual({ canvasId: canvas.id });
    expect(byBuilder[5]?.resource).toEqual({ sessionId: started[2]!.session.id });
    const byReader = await activityOf(reader.id);
    expect(byReader.map((e) => e.outcome)).toEqual(['ok', 'ok', 'ok', 'denied', 'denied', 'denied', 'denied', 'denied']);
    expect((await activityOf()).length).toBe(byBuilder.length + byReader.length);

    // Last used is on the token; the owner's own calls are not in the log.
    const tokens = TokenList.parse((await asOwner('GET', publicPaths.tokens)).body).items;
    expect(tokens.every((t) => t.lastUsedAt !== null)).toBe(true);
  }, 60_000);

  it('can do the rest of what its scopes allow: notes, park and restore, layout, show, end', async () => {
    const all = await makeToken('all', [...GRANTABLE_SCOPES]);
    const sessionsOnly = await makeToken('sessions only', ['sessions:write']);
    const started = PlacedSession.parse((await call(all.secret, 'POST', publicPaths.canvasSessions(mainCanvas()), { name: 'worker' })).body);
    const id = started.session.id;

    // Notes need notes:write, also when sent along with a rename.
    expect((await call(sessionsOnly.secret, 'PATCH', publicPaths.session(id), { note: 'x' })).status).toBe(403);
    expect((await call(sessionsOnly.secret, 'PATCH', publicPaths.session(id), { name: 'renamed', note: 'x' })).status).toBe(403);
    expect((await call(sessionsOnly.secret, 'POST', publicPaths.sessionNotes(id), { text: 'x' })).status).toBe(403);
    expect((await call(sessionsOnly.secret, 'PATCH', publicPaths.session(id), { name: 'renamed' })).body.name).toBe('renamed');
    expect((await call(all.secret, 'PATCH', publicPaths.session(id), { note: '# plan' })).body.note).toBe('# plan');
    const entry = await call(all.secret, 'POST', publicPaths.sessionNotes(id), { text: 'step one done' });
    expect(entry.status).toBe(201);
    // Written by a program, so it is not signed as the owner.
    expect(entry.body.entry).toMatchObject({ author: 'agent', text: 'step one done' });

    expect((await call(all.secret, 'POST', publicPaths.parkSession(id))).body.state).toBe('parked');
    const restored = await call(all.secret, 'POST', publicPaths.restoreSession(id), { canvasId: mainCanvas() });
    expect(PlacedSession.parse(restored.body)).toMatchObject({ canvasId: mainCanvas(), session: { state: 'open' } });

    const node = PlacedSession.parse(restored.body).node;
    const nudged = await call(all.secret, 'PATCH', publicPaths.canvasNode(mainCanvas(), node.id), { x: 400, y: 300 });
    expect(nudged.body).toMatchObject({ x: 400, y: 300, width: node.width });
    expect((await call(sessionsOnly.secret, 'PATCH', publicPaths.canvasNode(mainCanvas(), node.id), { x: 1 })).status).toBe(403);

    // With no browser open there is nobody to show it to; that is an answer, not an error.
    expect((await call(all.secret, 'POST', publicPaths.showSession(id))).body).toEqual({ shown: 0 });
    expect((await call(all.secret, 'POST', publicPaths.showCanvas(mainCanvas()))).body).toEqual({ shown: 0 });
    expect((await call(all.secret, 'POST', publicPaths.showCanvas(newId()))).status).toBe(404);

    expect((await call(all.secret, 'DELETE', publicPaths.session(id))).status).toBe(204);
    expect(hub.state.sessions).toEqual([]);
    expect((await call(all.secret, 'GET', publicPaths.session(id))).status).toBe(404);
  }, 60_000);

  it('follows changes as they happen, without seeing anything about tokens', async () => {
    const reader = await makeToken('reader', ['read']);
    const lines: string[] = [];
    const stream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { authorization: `Bearer ${reader.secret}` } }, resolve).on('error', reject);
    });
    expect(stream.statusCode).toBe(200);
    expect(stream.headers['content-type']).toContain('text/event-stream');
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => lines.push(...chunk.split('\n').filter((line) => line.startsWith('data: '))));
    const until = async (check: () => boolean): Promise<void> => {
      for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(check()).toBe(true);
    };

    sessions.createCanvas({ name: 'Second' });
    await makeToken('another', ['read']);
    sessions.updateCanvas(mainCanvas(), { name: 'Renamed' });
    await until(() => lines.length >= 2);
    const events = lines.map((line) => JSON.parse(line.slice('data: '.length)) as { type: string });
    expect(events.map((e) => e.type)).toEqual(['canvas.created', 'canvas.updated']);
    expect(lines.join('\n')).not.toContain('token');
    stream.destroy();

    // The connection is on record, once.
    await until(() => true);
    expect((await activityOf(reader.id)).map((e) => `${e.route} ${e.action} ${e.outcome}`)).toEqual(['/v1/events events.read ok']);
    // A stream for a canvas that does not exist is refused up front.
    expect((await call(reader.secret, 'GET', `${publicPaths.events}?canvasId=${newId()}`)).status).toBe(404);
  });
});

describe('limits', () => {
  /** The same server, started again with limits small enough to reach. */
  async function restartWith(api: Record<string, number>): Promise<void> {
    await stop();
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ api }));
    await start();
  }

  it('holds each token to its rate, says when to come back, and leaves other tokens alone', async () => {
    await restartWith({ rateLimitPerMinute: 5 });
    const greedy = await makeToken('greedy', ['read']);
    const patient = await makeToken('patient', ['read']);

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await call(greedy.secret, 'GET', publicPaths.canvases)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);

    const limited = await call(greedy.secret, 'GET', publicPaths.canvases);
    expect(limited.body).toEqual({ error: { code: 'rate_limited', message: expect.stringContaining('Too many calls') } });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(12);

    // Another token, and the owner in the browser, are not held up by it.
    expect((await call(patient.secret, 'GET', publicPaths.canvases)).status).toBe(200);
    expect((await asOwner('GET', publicPaths.canvases)).status).toBe(200);

    const log = await activityOf(greedy.id);
    expect(log.map((e) => e.outcome)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'limited', 'limited', 'limited', 'limited']);
    expect(log.at(-1)).toMatchObject({ status: 429, action: '' });
  });

  it('refuses a body that is too large, in the usual error shape', async () => {
    await restartWith({ maxBodyBytes: 2048 });
    const writer = await makeToken('writer', ['canvases:write', 'notes:write']);
    const fits = await call(writer.secret, 'POST', publicPaths.canvases, { name: 'Small', labels: { why: 'x'.repeat(200) } });
    expect(fits.status).toBe(201);

    const big = await call(writer.secret, 'POST', publicPaths.canvases, { name: 'Big', padding: 'x'.repeat(4000) });
    expect(big.status).toBe(413);
    expect(big.body).toEqual({ error: { code: 'too_large', message: expect.stringContaining('2048 bytes') } });
    expect(hub.state.canvases.map((c) => c.name)).toEqual(['Main', 'Small']);
    // The owner in the browser has the same limit.
    expect((await asOwner('POST', publicPaths.canvases, { name: 'Big', padding: 'x'.repeat(4000) })).status).toBe(413);

    const log = await activityOf(writer.id);
    expect(log.map((e) => [e.status, e.outcome])).toEqual([
      [201, 'ok'],
      [413, 'error'],
    ]);
  });
});

describe('the secret', () => {
  it('is in no file in the data folder and in nothing the server printed', async () => {
    const original = { log: console.log, warn: console.warn, error: console.error };
    for (const level of ['log', 'warn', 'error'] as const) console[level] = (...args: unknown[]) => void printed.push(args.map(String).join(' '));
    const secrets: string[] = [];
    try {
      const a = await makeToken('first', ['read', 'canvases:write']);
      const b = await makeToken('second', ['read'], { expiresInDays: 1 });
      secrets.push(a.secret, b.secret);

      // Use them every way a secret might leak: allowed, denied, wrong route, bad body, limited by scope, revoked.
      await call(a.secret, 'GET', publicPaths.canvases);
      await call(a.secret, 'POST', publicPaths.canvases, { name: 'Made by a token' });
      await call(a.secret, 'POST', publicPaths.canvases, { name: '' });
      await call(a.secret, 'GET', '/v1/no-such-route');
      await call(b.secret, 'POST', publicPaths.canvases, { name: 'Refused' });
      await call(b.secret, 'GET', publicPaths.root);
      await asOwner('DELETE', publicPaths.token(b.id));
      await call(b.secret, 'GET', publicPaths.canvases);
      // A body that happens to carry a secret, in a field the server does not know: it is neither stored nor recorded.
      await call(a.secret, 'POST', publicPaths.canvases, { name: 'Echo', somethingElse: a.secret });
      await hub.flush();
    } finally {
      Object.assign(console, original);
    }

    const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
    expect(files.map((file) => path.basename(file))).toEqual(expect.arrayContaining(['state.json', ACTIVITY_FILE]));
    for (const file of files) {
      const searched = await readFile(file, 'utf8');
      for (const secret of secrets) {
        expect(searched.includes(secret), `${path.basename(file)} holds a secret`).toBe(false);
        expect(searched.includes(secret.slice(TOKEN_PREFIX.length)), `${path.basename(file)} holds the random part of a secret`).toBe(false);
      }
    }
    const activity = await readFile(path.join(dir, ACTIVITY_FILE), 'utf8');
    const recorded = activity
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as ActivityEntry)
      .map((e) => `${e.tokenName} ${e.method} ${e.route} ${e.status}`);
    // Every call made with a token, and none made by the owner.
    expect(recorded).toEqual([
      'first GET /v1/canvases 200',
      'first POST /v1/canvases 201',
      'first POST /v1/canvases 400',
      'first GET (no such route) 404',
      'second POST /v1/canvases 403',
      'second GET /v1 200',
      'second GET /v1/canvases 401',
      'first POST /v1/canvases 201',
    ]);
    expect(activity).not.toContain(TOKEN_PREFIX);
    expect(activity).not.toContain('Made by a token');
    expect(activity).not.toContain('Echo');
    for (const secret of secrets) expect(printed.join('\n')).not.toContain(secret);

    // The hash is what is stored, and it is not sent to the page.
    const state = JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'));
    expect(state.version).toBe(10);
    expect(state.tokens.map((t: { hash: string }) => t.hash)).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/), expect.stringMatching(/^[0-9a-f]{64}$/)]);
  });

  it('survives a restart of the server as a hash, and still works', async () => {
    const { secret, id } = await makeToken('kept', ['read']);
    await stop();
    await start();
    expect(hub.state.tokens.map((t) => t.id)).toEqual([id]);
    expect((await call(secret, 'GET', publicPaths.canvases)).status).toBe(200);
    // The log from before the restart is still there to read.
    expect((await activityOf(id)).length).toBe(1);
  });
});

describe('what the owner does from outside the browser', () => {
  /** A call as the command line makes it: the owner's cookie and Origin, and nothing a browser page adds. */
  const asCommand = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer> => {
    const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin, cookie: `${cookieName(port)}=${ownerToken}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
    return { status: response.statusCode, body: response.body ? safeJson(response.body) : null, headers: response.headers as Answer['headers'] };
  };

  it('is recorded for the things only the owner may do, with the session it says it came from', async () => {
    const { session } = await sessions.create({});
    // Making a token from the command line, inside a session.
    const made = await asCommand('POST', publicPaths.tokens, { name: 'made in a terminal', scopes: ['read'] }, { 'x-aubergine-session': session.id });
    expect(made.status).toBe(201);
    // Revoking it, from a command line outside any session.
    expect((await asCommand('DELETE', publicPaths.token(made.body.token.id))).status).toBe(200);
    // Deciding about a draft.
    const writer = await makeToken('writer', ['workflows:write']);
    const draft = await call(writer.secret, 'POST', '/v1/drafts', { element: { name: 'An element', instructions: 'Do it.' } });
    expect((await asCommand('POST', `/v1/drafts/${draft.body.draft.id}/accept`, {}, { 'x-aubergine-session': session.id })).status).toBe(200);
    const second = await call(writer.secret, 'POST', '/v1/drafts', { element: { name: 'Another', instructions: 'Do it.' } });
    expect((await asCommand('DELETE', `/v1/drafts/${second.body.draft.id}`)).status).toBe(204);
    // A session that does not exist, or nonsense, is not taken at its word.
    expect((await asCommand('POST', publicPaths.tokens, { name: 'x', scopes: [] }, { 'x-aubergine-session': newId() })).status).toBe(400);

    const log = (await activityOf()).filter((e) => e.caller === 'owner-cli');
    expect(log.map((e) => [e.method, e.route, e.action, e.status, e.fromSessionId])).toEqual([
      ['POST', '/v1/tokens', 'tokens.manage', 201, session.id],
      ['DELETE', '/v1/tokens/:tokenId', 'tokens.manage', 200, null],
      ['POST', '/v1/drafts/:draftId/accept', 'drafts.review', 200, session.id],
      ['DELETE', '/v1/drafts/:draftId', 'drafts.review', 204, null],
      ['POST', '/v1/tokens', 'tokens.manage', 400, null],
    ]);
    for (const entry of log) expect(entry).toMatchObject({ tokenId: null, tokenName: '' });
    // The record of drafts says the same: who decided, and from where.
    const records = await asOwner('GET', '/v1/draft-records');
    expect(records.body.items.map((r: { outcome: string; kind: string; by: unknown; proposedBy: { kind: string } }) => [r.outcome, r.kind, r.by, r.proposedBy.kind])).toEqual([
      ['discarded', 'element', { kind: 'owner-cli', sessionId: null }, 'token'],
      ['accepted', 'element', { kind: 'owner-cli', sessionId: session.id }, 'token'],
    ]);
    // Not what the drafts said.
    expect(JSON.stringify(records.body)).not.toContain('Do it.');
    expect(await readFile(path.join(dir, ACTIVITY_FILE), 'utf8')).not.toContain(made.body.secret);
  });

  it('is not recorded when it is done in the browser, nor for reading, nor for ordinary work', async () => {
    // The page: the same calls with what a browser adds.
    const made = await asOwner('POST', publicPaths.tokens, { name: 'made in the browser', scopes: ['workflows:write'], reviewWorkflowChanges: false });
    const draft = await call(made.body.secret, 'POST', '/v1/drafts', { element: { name: 'An element', instructions: 'Do it.' } });
    expect((await asOwner('POST', `/v1/drafts/${draft.body.draft.id}/accept`)).status).toBe(200);
    // The command line: reading tokens and drafts, making a canvas, starting a workflow.
    await asCommand('GET', publicPaths.tokens);
    await asCommand('GET', '/v1/draft-records');
    await asCommand('POST', publicPaths.canvases, { name: 'From the command line' });
    await asCommand('POST', '/v1/workflows', { name: 'Mine', elements: [{ name: 'One', instructions: 'x' }] });
    expect((await activityOf()).filter((e) => e.caller === 'owner-cli')).toEqual([]);
    expect((await asOwner('GET', '/v1/draft-records')).body.items.map((r: { by: unknown }) => r.by)).toEqual([{ kind: 'owner', sessionId: null }]);
  });
});
