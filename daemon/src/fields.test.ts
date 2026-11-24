import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, MAX_FIELDS, SESSION_ENV, paths, publicPaths, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { MemoryActivityLog } from './activity';
import { sessionToken } from './auth';
import { agentClient, fieldCommand } from './cli/agent';
import { FileRunArchive } from './run-archive';
import type { RuntimeSession, SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { FileTaskArchive } from './task-archive';
import { loadOrCreateToken } from './token';

/** A terminal's fields, through the server: the owner's own words, changed like tags, and no session's. */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let origin: string;
let events: ChangeEvent[] = [];
let live: RuntimeSession[] = [];
let sockets: WebSocket[] = [];
const activity = new MemoryActivityLog();
/** Everything the server asked the runtime to type or press: nothing, in every test here. */
const typed: string[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => live,
  has: async () => true,
  kill: async (id: string) => void (live = live.filter((s) => s.id !== id)),
  foreground: async () => 'zsh',
  typeLine: async (_id: string, line: string) => void typed.push(line),
  create: async (options: { id: string; cwd?: string }) => {
    const made = { id: options.id, cwd: options.cwd ?? null, command: null, activityAt: null };
    live.push(made);
    return made;
  },
  type: async (_id: string, text: string) => void typed.push(text),
  press: async (_id: string, key: string) => void typed.push(key),
  screen: async () => ({ text: '', columns: 80, rows: 24, cursor: { x: 0, y: 0 }, line: 0 }),
  lines: async () => ({ lines: [], more: false, lost: false }),
  search: async () => ({ hits: [], truncated: false }),
  snapshot: async () => '',
} as unknown as SessionRuntime;

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
}
async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
  let parsed: unknown;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch {
    parsed = response.body;
  }
  return { status: response.statusCode, body: parsed };
}
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, ...more });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}
async function make(body: object = {}): Promise<Session> {
  const made = await asOwner('POST', '/api/v1/sessions', { cwd: dir, ...body });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.session as Session;
}
const now = (id: string): Session => sessions.get(id);

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-described-'));
  ownerToken = await loadOrCreateToken(dir);
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  live = [];
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(dir);
  sessions = new Sessions(hub, runtime, { agentLaunchLine: async () => 'the-agent' });
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: path.join(dir, 'none'),
    runArchive: new FileRunArchive(dir),
    taskArchive: new FileTaskArchive(dir),
    activity,
    setDescribeRemind: (value) => settings.setDescribeRemind(value),
    folderFacts: async () => ({ branch: null, repository: null, repositoryUrl: null }),
    pullRequests: { find: async () => null },
  });
  events = [];
  hub.subscribe((event) => events.push(event));
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
});
afterEach(async () => {
  expect(typed).toEqual([]);
  for (const socket of sockets) socket.terminate();
  sockets = [];
  await hub.flush();
  await app.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});


const fieldsOf = (id: string): unknown => now(id).fields;
/** Fields as the server keeps what the owner sent: the owner's. */
const owners = (fields: readonly { label: string; value: string }[]): unknown[] => fields.map((field) => ({ ...field, source: 'owner' }));
const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
  expect(check()).toBe(true);
};

describe('fields of a terminal', () => {
  it('start empty, are replaced as a whole list, cleared with none, and left as they were when not sent', async () => {
    const session = await make();
    expect(session.fields).toEqual([]);
    const two = [{ label: 'Ticket', value: 'https://example.com/t/DEMO-12' }, { label: 'Owner', value: 'Sam' }];
    const set = await asOwner('PATCH', publicPaths.session(session.id), { fields: two });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.fields).toEqual(owners(two));
    expect(events.filter((e) => e.type === 'session.fields')).toEqual([{ type: 'session.fields', sessionId: session.id, fields: owners(two) }]);

    // Trimmed as they are kept.
    const tidied = await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: '  Environment ', value: ' staging  ' }, ...two] });
    expect(tidied.body.fields[0]).toEqual({ label: 'Environment', value: 'staging', source: 'owner' });

    // A change of something else leaves them as they were, and sends no event about them.
    const before = events.filter((e) => e.type === 'session.fields').length;
    await asOwner('PATCH', publicPaths.session(session.id), { name: 'Renamed', tags: ['api'] });
    expect(fieldsOf(session.id)).toHaveLength(3);
    expect(events.filter((e) => e.type === 'session.fields')).toHaveLength(before);
    // The page's own route takes them the same way.
    expect((await asOwner('PATCH', paths.session(session.id), { fields: two })).body.fields).toEqual(owners(two));

    expect((await asOwner('PATCH', publicPaths.session(session.id), { fields: [] })).body.fields).toEqual([]);
    expect(fieldsOf(session.id)).toEqual([]);
    expect((await asOwner('GET', publicPaths.session(session.id))).body.fields).toEqual([]);
  });

  it('are refused whole, in the one error shape, when the list is not one of fields', async () => {
    const session = await make();
    const kept = [{ label: 'Owner', value: 'Sam' }];
    await asOwner('PATCH', publicPaths.session(session.id), { fields: kept });
    const wrong: unknown[] = [
      Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({ label: `Field ${i}`, value: 'x' })),
      [{ label: 'Owner', value: 'Sam' }, { label: 'owner', value: 'Alex' }],
      [{ label: 'Ticket: DEMO', value: '12' }],
      [{ label: 'Note', value: 'one\ntwo' }],
      [{ label: '', value: 'x' }],
      [{ label: 'Empty', value: '   ' }],
      [{ label: 'x'.repeat(41), value: 'x' }],
      [{ label: 'Long', value: 'x'.repeat(201) }],
      [{ label: 'Turned‮', value: 'x' }],
    ];
    for (const fields of wrong) {
      for (const url of [publicPaths.session(session.id), paths.session(session.id)]) {
        const answer = await asOwner('PATCH', url, { fields });
        expect(answer.status, JSON.stringify(fields)).toBe(400);
        expect(answer.body.error, JSON.stringify(answer.body)).toMatchObject({ code: expect.any(String), message: expect.any(String) });
      }
    }
    expect(fieldsOf(session.id)).toEqual(owners(kept));
    // Nothing to update is still refused, and fields count as something.
    expect((await asOwner('PATCH', publicPaths.session(session.id), {})).status).toBe(400);
  });

  it('are changed by a token with the scope that changes sessions, and by no token without it', async () => {
    const session = await make();
    const writer = await makeToken('writer', ['read', 'sessions:write']);
    const reader = await makeToken('reader', ['read']);
    const fields = [{ label: 'Build', value: '#4512' }];
    expect((await call(reader, 'PATCH', publicPaths.session(session.id), { fields })).status).toBe(403);
    expect(fieldsOf(session.id)).toEqual([]);
    const answer = await call(writer, 'PATCH', publicPaths.session(session.id), { fields });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(fieldsOf(session.id)).toEqual(owners(fields));
    // Readers see them: they are not what a terminal shows.
    expect((await call(reader, 'GET', publicPaths.session(session.id))).body.fields).toEqual(owners(fields));
  });

  it('are not changed by a session, not even its own', async () => {
    const session = await make();
    const other = await make();
    const own = sessionToken(ownerToken, session.id);
    for (const id of [session.id, other.id]) {
      const answer = await call(own, 'PATCH', publicPaths.session(id), { fields: [{ label: 'Mine', value: 'yes' }] });
      expect(answer.status).toBe(403);
      // Nor beside a name, nor through the page's own route, which takes the owner's sign-in only.
      expect((await call(own, 'PATCH', publicPaths.session(id), { name: 'Mine', fields: [{ label: 'Mine', value: 'yes' }] })).status).toBe(403);
      expect((await call(own, 'PATCH', paths.session(id), { fields: [{ label: 'Mine', value: 'yes' }] })).status).toBe(403);
    }
    expect(fieldsOf(session.id)).toEqual([]);
    expect(events.some((e) => e.type === 'session.fields')).toBe(false);
  });

  it('are told on the browser stream and on the stream for programs', async () => {
    const session = await make();
    const reader = await makeToken('reader', ['read']);
    const lines: string[] = [];
    const stream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { authorization: `Bearer ${reader}` } }, resolve).on('error', reject);
    });
    expect(stream.statusCode).toBe(200);
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => lines.push(...chunk.split('\n').filter((line) => line.startsWith('data: '))));

    const told: { type: string; event?: ChangeEvent }[] = [];
    const socket = new WebSocket(`ws://127.0.0.1:${port}${paths.events}`, { headers: { host: `127.0.0.1:${port}`, cookie: `${cookieName(port)}=${ownerToken}` }, origin });
    sockets.push(socket);
    socket.on('message', (data) => told.push(JSON.parse(String(data)) as { type: string; event?: ChangeEvent }));
    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });

    const fields = [{ label: 'Environment', value: 'staging' }];
    await asOwner('PATCH', publicPaths.session(session.id), { fields });
    const expected = { type: 'session.fields', sessionId: session.id, fields: owners(fields) };
    await until(() => lines.some((line) => line.includes('session.fields')));
    expect(lines.map((line) => JSON.parse(line.slice('data: '.length)) as { type: string }).filter((e) => e.type === 'session.fields')).toEqual([expected]);
    await until(() => told.some((message) => message.event?.type === 'session.fields'));
    expect(told.filter((message) => message.event?.type === 'session.fields').map((message) => message.event)).toEqual([expected]);
    stream.destroy();
  });
});

describe('fields an agent sets on its own terminal', () => {
  const own = (id: string): string => sessionToken(ownerToken, id);
  const fieldsUrl = (id: string): string => `/v1/sessions/${id}/fields`;
  const fieldUrl = (id: string, label: string): string => `${fieldsUrl(id)}/${encodeURIComponent(label)}`;

  it('are set, replaced and removed by the session itself, as the agent’s', async () => {
    const session = await make();
    const mine = own(session.id);
    const set = await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Branch', value: 'fix-session-time' });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body).toEqual({ field: { label: 'Branch', value: 'fix-session-time', source: 'agent' }, kept: true });
    expect(fieldsOf(session.id)).toEqual([{ label: 'Branch', value: 'fix-session-time', source: 'agent' }]);
    // Said again as it is: nothing changes, and nothing is told.
    const told = events.filter((e) => e.type === 'session.fields').length;
    expect((await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Branch', value: 'fix-session-time' })).status).toBe(200);
    expect(events.filter((e) => e.type === 'session.fields')).toHaveLength(told);
    // Its own is replaced where it stands.
    await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Build', value: '#12' });
    expect((await call(mine, 'PUT', fieldsUrl(session.id), { label: 'branch', value: 'fix-time' })).body.field).toEqual({ label: 'branch', value: 'fix-time', source: 'agent' });
    expect((await call(mine, 'GET', fieldsUrl(session.id))).body).toEqual({ fields: [{ label: 'branch', value: 'fix-time', source: 'agent' }, { label: 'Build', value: '#12', source: 'agent' }] });
    // A label with a slash and a space, through the address.
    await call(mine, 'PUT', fieldsUrl(session.id), { label: 'CI / main', value: 'green' });
    const removed = await call(mine, 'DELETE', fieldUrl(session.id, 'ci / MAIN'));
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body.fields.map((field: { label: string }) => field.label)).toEqual(['branch', 'Build']);
    expect((await call(mine, 'DELETE', fieldUrl(session.id, 'Build'))).body.fields).toEqual([{ label: 'branch', value: 'fix-time', source: 'agent' }]);
    // There is no such field.
    const none = await call(mine, 'DELETE', fieldUrl(session.id, 'Build'));
    expect(none.status).toBe(404);
    expect(none.body.error).toMatchObject({ code: expect.any(String), message: 'This terminal has no field “Build”.' });
    // What is not a field is refused with a sentence, and nothing is kept.
    for (const [label, value] of [['a:b', 'x'], ['', 'x'], ['Note', 'one\ntwo'], ['x'.repeat(41), 'x'], ['Long', 'x'.repeat(201)]]) {
      const answer = await call(mine, 'PUT', fieldsUrl(session.id), { label, value });
      expect(answer.status, `${label}: ${value}`).toBe(400);
      expect(answer.body.error.message).toMatch(/\.$/);
    }
    // Who set it is never read from what is sent.
    expect((await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Sneaky', value: 'x', source: 'owner' })).body.field.source).toBe('agent');
    expect((await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: 'Planted', value: 'x', source: 'agent' }] })).body.fields).toEqual([{ label: 'Planted', value: 'x', source: 'owner' }]);
  });

  it('never change the owner’s: what the agent sends is kept on it as a suggestion, which the owner can use', async () => {
    const session = await make();
    const mine = own(session.id);
    await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: 'Environment', value: 'staging' }] });
    const answer = await call(mine, 'PUT', fieldsUrl(session.id), { label: 'environment', value: 'production' });
    expect(answer.status).toBe(200);
    expect(answer.body.kept).toBe(false);
    expect(answer.body.field).toEqual({ label: 'Environment', value: 'staging', source: 'owner', suggested: { value: 'production', at: expect.any(String) } });
    // The session cannot remove the owner's.
    const refused = await call(mine, 'DELETE', fieldUrl(session.id, 'Environment'));
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/owner’s: only they remove it/);
    expect(now(session.id).fields[0]).toMatchObject({ value: 'staging', source: 'owner' });
    // Nor use the suggestion; the owner can, and the value is the owner's.
    expect((await call(mine, 'POST', `/v1/sessions/${session.id}/described/use`, { what: 'field', label: 'Environment' })).status).toBe(403);
    const used = await asOwner('POST', `/v1/sessions/${session.id}/described/use`, { what: 'field', label: 'environment' });
    expect(used.status, JSON.stringify(used.body)).toBe(200);
    expect(fieldsOf(session.id)).toEqual([{ label: 'Environment', value: 'production', source: 'owner' }]);
    // Nothing left to use.
    expect((await asOwner('POST', `/v1/sessions/${session.id}/described/use`, { what: 'field', label: 'Environment' })).status).toBe(409);
  });

  it('keep who set them when the owner sends the list back as it stood, and are the owner’s once the owner changes them', async () => {
    const session = await make();
    const mine = own(session.id);
    await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Branch', value: 'fix' });
    await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Build', value: '#12' });
    await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: 'Ticket', value: 'DEMO-12' }, ...now(session.id).fields] });
    await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Ticket', value: 'DEMO-13' });
    // Moved, one changed: the untouched keeps the agent, the changed one is the owner's, the suggestion stays while its value does.
    const after = await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: 'Build', value: '#13' }, { label: 'Branch', value: 'fix' }, { label: 'Ticket', value: 'DEMO-12' }] });
    expect(after.body.fields).toEqual([
      { label: 'Build', value: '#13', source: 'owner' },
      { label: 'Branch', value: 'fix', source: 'agent' },
      { label: 'Ticket', value: 'DEMO-12', source: 'owner', suggested: { value: 'DEMO-13', at: expect.any(String) } },
    ]);
    // Now the owner's, the agent cannot change it or remove it.
    expect((await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Build', value: '#14' })).body.kept).toBe(false);
    expect((await call(mine, 'DELETE', fieldUrl(session.id, 'Build'))).status).toBe(409);
    // The owner changes the value: the suggestion goes.
    const changed = await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: 'Ticket', value: 'DEMO-14' }] });
    expect(changed.body.fields).toEqual([{ label: 'Ticket', value: 'DEMO-14', source: 'owner' }]);
  });

  it('count every field towards the limit', async () => {
    const session = await make();
    const mine = own(session.id);
    await asOwner('PATCH', publicPaths.session(session.id), { fields: Array.from({ length: MAX_FIELDS - 1 }, (_, i) => ({ label: `Owner ${i}`, value: 'x' })) });
    expect((await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Last', value: 'one' })).status).toBe(200);
    const full = await call(mine, 'PUT', fieldsUrl(session.id), { label: 'More', value: 'two' });
    expect(full.status).toBe(409);
    expect(full.body.error.message).toBe(`This terminal has ${MAX_FIELDS} fields, the most it can have. Remove one of your own first, or leave this one out.`);
    expect(now(session.id).fields).toHaveLength(MAX_FIELDS);
    // Its own can still be changed at the limit.
    expect((await call(mine, 'PUT', fieldsUrl(session.id), { label: 'Last', value: 'three' })).status).toBe(200);
  });

  it('are not another terminal’s to touch, and no API token takes a session’s place', async () => {
    const session = await make();
    const other = await make();
    const mine = own(session.id);
    await asOwner('PATCH', publicPaths.session(other.id), { fields: [{ label: 'Ticket', value: 'DEMO-12' }] });
    // The answer about another terminal is the one its links and its description give: 403, in the one shape.
    const links = await call(mine, 'POST', `/v1/sessions/${other.id}/links`, { url: 'https://example.org/x' });
    const described = await call(mine, 'PUT', `/v1/sessions/${other.id}/described`, { name: 'Taken' });
    for (const [method, url, body] of [
      ['GET', fieldsUrl(other.id), undefined],
      ['PUT', fieldsUrl(other.id), { label: 'Ticket', value: 'mine' }],
      ['PUT', fieldsUrl(other.id), { label: 'New', value: 'mine' }],
      ['DELETE', fieldUrl(other.id, 'Ticket'), undefined],
    ] as const) {
      const answer = await call(mine, method, url, body);
      expect(answer.status, `${method} ${url}`).toBe(403);
      expect(answer.body).toEqual(links.body);
      expect(answer.body).toEqual(described.body);
    }
    expect(fieldsOf(other.id)).toEqual([{ label: 'Ticket', value: 'DEMO-12', source: 'owner' }]);
    // A token with every scope there is: refused on all three, as on the routes a session describes itself by.
    const every = await makeToken('every', [...GRANTABLE_SCOPES], { reach: { kind: 'all' } });
    expect((await call(every, 'PUT', `/v1/sessions/${session.id}/described`, { name: 'Taken' })).status).toBe(403);
    for (const [method, url, body] of [
      ['GET', fieldsUrl(session.id), undefined],
      ['PUT', fieldsUrl(session.id), { label: 'Ticket', value: 'token' }],
      ['DELETE', fieldUrl(session.id, 'Ticket'), undefined],
    ] as const)
      expect((await call(every, method, url, body)).status, `${method} ${url}`).toBe(403);
    expect(fieldsOf(session.id)).toEqual([]);
  });

  it('are told on both streams as the agent’s', async () => {
    const session = await make();
    const reader = await makeToken('reader', ['read']);
    const lines: string[] = [];
    const stream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { authorization: `Bearer ${reader}` } }, resolve).on('error', reject);
    });
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => lines.push(...chunk.split('\n').filter((line) => line.startsWith('data: '))));
    const told: { type: string; event?: ChangeEvent }[] = [];
    const socket = new WebSocket(`ws://127.0.0.1:${port}${paths.events}`, { headers: { host: `127.0.0.1:${port}`, cookie: `${cookieName(port)}=${ownerToken}` }, origin });
    sockets.push(socket);
    socket.on('message', (data) => told.push(JSON.parse(String(data)) as { type: string; event?: ChangeEvent }));
    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });
    await call(own(session.id), 'PUT', fieldsUrl(session.id), { label: 'Branch', value: 'fix' });
    const expected = { type: 'session.fields', sessionId: session.id, fields: [{ label: 'Branch', value: 'fix', source: 'agent' }] };
    await until(() => lines.some((line) => line.includes('session.fields')));
    expect(lines.map((line) => JSON.parse(line.slice('data: '.length)) as { type: string }).filter((e) => e.type === 'session.fields')).toEqual([expected]);
    await until(() => told.some((message) => message.event?.type === 'session.fields'));
    expect(told.filter((message) => message.event?.type === 'session.fields').map((message) => message.event)).toEqual([expected]);
    stream.destroy();
  });
});

describe('aubergine field', () => {
  it('sets, lists and removes through the terminal’s own routes, and says the server’s sentence when refused', async () => {
    const session = await make();
    await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: 'Environment', value: 'staging' }] });
    const client = agentClient({ [SESSION_ENV.url]: origin, [SESSION_ENV.sessionId]: session.id, [SESSION_ENV.token]: sessionToken(ownerToken, session.id) });
    const run = (words: object) => fieldCommand(words as Parameters<typeof fieldCommand>[0], client);
    expect(await run({ name: 'field-set', label: 'Branch', value: 'fix-session-time' })).toEqual(['Set: Branch: fix-session-time.']);
    expect(await run({ name: 'field-set', label: 'Environment', value: 'production' })).toEqual(['Your owner set "Environment" themselves ("staging"): it stays so, and yours is offered to them beside it.']);
    expect(await run({ name: 'field-list' })).toEqual(['Environment: staging  (the owner’s; you suggested "production")', 'Branch: fix-session-time  (yours)']);
    await expect(run({ name: 'field-remove', label: 'Environment' })).rejects.toThrow(/owner’s: only they remove it/);
    expect(await run({ name: 'field-remove', label: 'branch' })).toEqual(['Removed "branch".']);
    await expect(run({ name: 'field-remove', label: 'branch' })).rejects.toThrow('This terminal has no field “branch”.');
    await asOwner('PATCH', publicPaths.session(session.id), { fields: [] });
    expect(await run({ name: 'field-list' })).toEqual(['This terminal has no fields yet. Set one with: aubergine field set <label> <value>']);
  });
});
