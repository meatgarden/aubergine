import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { MAX_FIELDS, paths, publicPaths, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { MemoryActivityLog } from './activity';
import { sessionToken } from './auth';
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

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => live,
  has: async () => true,
  kill: async (id: string) => void (live = live.filter((s) => s.id !== id)),
  foreground: async () => 'zsh',
  typeLine: async () => {},
  create: async (options: { id: string; cwd?: string }) => {
    const made = { id: options.id, cwd: options.cwd ?? null, command: null, activityAt: null };
    live.push(made);
    return made;
  },
  type: async () => {},
  press: async () => {},
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
  for (const socket of sockets) socket.terminate();
  sockets = [];
  await hub.flush();
  await app.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});


const fieldsOf = (id: string): unknown => now(id).fields;
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
    expect(set.body.fields).toEqual(two);
    expect(events.filter((e) => e.type === 'session.fields')).toEqual([{ type: 'session.fields', sessionId: session.id, fields: two }]);

    // Trimmed as they are kept.
    const tidied = await asOwner('PATCH', publicPaths.session(session.id), { fields: [{ label: '  Environment ', value: ' staging  ' }, ...two] });
    expect(tidied.body.fields[0]).toEqual({ label: 'Environment', value: 'staging' });

    // A change of something else leaves them as they were, and sends no event about them.
    const before = events.filter((e) => e.type === 'session.fields').length;
    await asOwner('PATCH', publicPaths.session(session.id), { name: 'Renamed', tags: ['api'] });
    expect(fieldsOf(session.id)).toHaveLength(3);
    expect(events.filter((e) => e.type === 'session.fields')).toHaveLength(before);
    // The page's own route takes them the same way.
    expect((await asOwner('PATCH', paths.session(session.id), { fields: two })).body.fields).toEqual(two);

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
    expect(fieldsOf(session.id)).toEqual(kept);
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
    expect(fieldsOf(session.id)).toEqual(fields);
    // Readers see them: they are not what a terminal shows.
    expect((await call(reader, 'GET', publicPaths.session(session.id))).body.fields).toEqual(fields);
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
    const expected = { type: 'session.fields', sessionId: session.id, fields };
    await until(() => lines.some((line) => line.includes('session.fields')));
    expect(lines.map((line) => JSON.parse(line.slice('data: '.length)) as { type: string }).filter((e) => e.type === 'session.fields')).toEqual([expected]);
    await until(() => told.some((message) => message.event?.type === 'session.fields'));
    expect(told.filter((message) => message.event?.type === 'session.fields').map((message) => message.event)).toEqual([expected]);
    stream.destroy();
  });
});
