import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { LAST_EVENT_ID_HEADER, NO_ATTENTION, NO_STATUS, StreamHello, StreamReset, createInitialState, newId, publicPaths, readStreamEventId, streamEventId, type AppState, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import { createClient } from '@aubergine/client';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryActivityLog } from './activity';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { RECENT_CHANGES, StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * Not missing anything on `GET /v1/events`: every change has an `id` made of the hub's own numbers, a program that
 * comes back with the last one is sent what it missed (through the filters a live change goes through, asked now),
 * and one that cannot be is told `reset`. Against a real server and a real state file; shells are a stand-in.
 * Nothing here waits for a time to pass: each wait is for what is then read.
 */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
/** Every change the hub told of since the server listened, with its number. */
let told: { event: ChangeEvent; revision: number }[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  foreground: async () => 'zsh',
  typeLine: async () => {},
  create: async (options: { id: string }) => ({ id: options.id, cwd: null, command: null, activityAt: null }),
  type: async () => {},
  press: async () => {},
  screen: async () => ({ text: '', columns: 80, rows: 24, cursor: { x: 0, y: 0 }, line: 0 }),
  lines: async () => ({ lines: [], more: false, lost: false }),
  search: async () => ({ hits: [], truncated: false }),
  snapshot: async () => '',
} as unknown as SessionRuntime;

async function start(remembered?: number): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store, () => {}, remembered);
  const settings = new SettingsFile(dir);
  const sessions = new Sessions(hub, runtime, {});
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), activity: new MemoryActivityLog(), version: '9.8.7' });
  told = [];
  hub.subscribe((event, revision) => told.push({ event, revision }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}
async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-event-stream-'));
  ownerToken = await loadOrCreateToken(dir);
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  await start();
});
afterEach(async () => {
  for (const open of opened.splice(0)) open.close();
  await stop();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

async function asOwner(method: string, url: string, body?: unknown): Promise<{ status: number; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, ...(body === undefined ? {} : { payload: body as object }) });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}
async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, reach: { kind: 'all' }, ...more });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.secret as string;
}
async function until(done: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!done()) {
    if (Date.now() > end) throw new Error('Waited too long');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** One event as the standard for server-sent events reads it. */
interface Sent {
  event: string;
  id: string | null;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- looked at field by field
}
interface Stream {
  /** Every event so far, `hello` and `reset` among them. */
  events: Sent[];
  /** The changes only. */
  changes: () => Sent[];
  /** Everything received, as text. */
  raw: () => string;
  /** The `id` a program would send back: of the last event that had one. */
  lastId: () => string;
  close: () => void;
}
const opened: Stream[] = [];

/** Follows the stream as a program does: a bearer token, and `Last-Event-ID` when it has one. */
async function follow(secret: string, lastEventId?: string, query = ''): Promise<Stream> {
  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: `${publicPaths.events}${query}`, headers: { authorization: `Bearer ${secret}`, ...(lastEventId === undefined ? {} : { [LAST_EVENT_ID_HEADER]: lastEventId }) } }, resolve).on('error', reject);
  });
  expect(response.statusCode).toBe(200);
  response.setEncoding('utf8');
  let raw = '';
  let pending = '';
  const events: Sent[] = [];
  response.on('data', (chunk: string) => {
    raw += chunk;
    pending += chunk;
    for (let end = pending.indexOf('\n\n'); end >= 0; end = pending.indexOf('\n\n')) {
      const block = pending.slice(0, end);
      pending = pending.slice(end + 2);
      const field = (name: string): string | null => block.split('\n').find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? null;
      const data = field('data');
      if (data !== null) events.push({ event: field('event') ?? 'message', id: field('id'), data: JSON.parse(data) });
    }
  });
  response.on('error', () => {});
  const stream: Stream = {
    events,
    changes: () => events.filter((e) => e.event === 'message'),
    raw: () => raw,
    lastId: () => events.filter((e) => e.id !== null).at(-1)?.id ?? '',
    close: () => response.destroy(),
  };
  opened.push(stream);
  await until(() => events.some((e) => e.event === 'hello'));
  return stream;
}

const mainCanvas = (): string => hub.state.canvases[0]!.id;
const rename = (name: string): void => hub.emit({ type: 'canvas.updated', canvasId: mainCanvas(), changes: { name } });
const names = (stream: Stream): string[] => stream.changes().filter((e) => e.data.type === 'canvas.updated').map((e) => e.data.changes.name as string);

function terminal(name: string, canvasId = mainCanvas()): Session {
  const projectId = hub.state.canvases.find((c) => c.id === canvasId)!.projectId;
  const session: Session = { id: newId(), projectId, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], fields: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null };
  hub.emit({ type: 'session.created', session, canvasId, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}
/** A command line that must be found nowhere it does not belong. */
const MARKER = 'deploy --password=PLANTED-MARKER-7f3a';
const runs = (session: Session, commandLine: string): void => hub.emit({ type: 'session.status', sessionId: session.id, status: { ...NO_STATUS, state: 'busy', commandLine, startedAt: new Date().toISOString() } });

describe('the memory of the state holder', () => {
  const store = { load: async () => createInitialState(), save: async (_state: AppState) => {} };

  it('gives back the changes after a number, in order, and stays at its bound however many are made', () => {
    const small = new StateHub(createInitialState(), store, () => {}, 5);
    const canvasId = small.state.canvases[0]!.id;
    const change = (n: number): void => small.emit({ type: 'canvas.updated', canvasId, changes: { name: `n${n}` } });
    expect(small.since(0)).toEqual([]);
    for (let n = 1; n <= 3; n += 1) change(n);
    expect(small.since(0)!.map((c) => c.revision)).toEqual([1, 2, 3]);
    expect(small.since(3)).toEqual([]);
    // A number no change has had yet, and nonsense.
    for (const wrong of [4, -1, 1.5, Number.NaN]) expect(small.since(wrong)).toBeNull();
    for (let n = 4; n <= 12; n += 1) change(n);
    expect(small.toldRevision).toBe(12);
    // The last five are kept: from the seventh on is everything since, from the sixth on is one too many.
    expect(small.since(7)!.map((c) => [c.revision, (c.event as { changes: { name: string } }).changes.name])).toEqual([8, 9, 10, 11, 12].map((n) => [n, `n${n}`]));
    expect(small.since(6)).toBeNull();
    // What is given is the caller's own list: emptying it takes nothing from the next one who asks.
    small.since(7)!.length = 0;
    expect(small.since(7)).toHaveLength(5);

    const usual = new StateHub(createInitialState(), store);
    const id = usual.state.canvases[0]!.id;
    for (let n = 1; n <= RECENT_CHANGES * 3 + 7; n += 1) usual.emit({ type: 'canvas.updated', canvasId: id, changes: { name: `n${n}` } });
    const ring = (usual as unknown as { recent: unknown[] }).recent;
    expect(ring).toHaveLength(RECENT_CHANGES);
    expect(usual.since(usual.toldRevision - RECENT_CHANGES)).toHaveLength(RECENT_CHANGES);
    expect(usual.since(usual.toldRevision - RECENT_CHANGES - 1)).toBeNull();
  });

  it('remembers nothing of a step that did not happen, and a step that did as its changes in order', () => {
    const small = new StateHub(createInitialState(), store, () => {}, 50);
    const canvasId = small.state.canvases[0]!.id;
    const change = (name: string): void => small.emit({ type: 'canvas.updated', canvasId, changes: { name } });
    change('one');
    expect(() =>
      small.atomically(() => {
        change('never');
        throw new Error('no');
      }),
    ).toThrow('no');
    small.atomically(() => {
      change('two');
      change('three');
    });
    expect(small.since(0)!.map((c) => [c.revision, (c.event as { changes: { name: string } }).changes.name])).toEqual([[1, 'one'], [2, 'two'], [3, 'three']]);
  });

  it('reads an id back as what it was made of, and nothing else as one', () => {
    const epoch = newId();
    expect(readStreamEventId(streamEventId(epoch, 0))).toEqual({ epoch, revision: 0 });
    expect(readStreamEventId(streamEventId(epoch, 123456))).toEqual({ epoch, revision: 123456 });
    for (const wrong of ['', 'abc', epoch, `${epoch}.`, `${epoch}.-1`, `${epoch}.01`, `${epoch}.1.2`, `${epoch}.1 `, ` ${epoch}.1`, `${epoch}-1`, `${epoch}.1e3`, `${epoch}.${'9'.repeat(30)}`, `${epoch}.1, ${epoch}.2`]) expect(readStreamEventId(wrong), wrong).toBeNull();
  });
});

describe('every event has an id', () => {
  it('begins with hello, and numbers each change with the hub’s own numbers', async () => {
    const reader = await makeToken('reader', ['read']);
    const before = hub.toldRevision;
    const stream = await follow(reader);
    const hello = stream.events[0]!;
    expect(hello.event).toBe('hello');
    expect(StreamHello.parse(hello.data)).toEqual({ type: 'hello', epoch: hub.epoch, revision: hello.data.revision, version: '9.8.7', resumed: false });
    // Where the server stood: not before the connection was asked for, and not after what follows.
    expect(hello.data.revision).toBeGreaterThanOrEqual(before);
    expect(hello.id).toBe(streamEventId(hub.epoch, hello.data.revision));
    expect(stream.raw().startsWith(': connected\n\n')).toBe(true);
    expect(stream.events.some((e) => e.event === 'reset')).toBe(false);

    rename('One');
    terminal('worker');
    rename('Two');
    await until(() => names(stream).includes('Two'));
    const changes = stream.changes();
    expect(changes.map((e) => e.data.type)).toEqual(['canvas.updated', 'session.created', 'canvas.updated']);
    // Each id is the epoch and the revision of exactly that change in the hub.
    for (const sent of changes) {
      const read = readStreamEventId(sent.id!)!;
      expect(read.epoch).toBe(hub.epoch);
      const was = told.find((t) => t.revision === read.revision)!;
      expect(was.event.type).toBe(sent.data.type);
    }
    const revisions = changes.map((e) => readStreamEventId(e.id!)!.revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(revisions[0]).toBeGreaterThan(hello.data.revision);
    expect(revisions.at(-1)).toBe(hub.toldRevision);
  });

  it('shows a client that reads the stream the old way what it saw before', async () => {
    const reader = await makeToken('reader', ['read']);
    // The old way: `data: ` lines, each one JSON, nothing else looked at.
    const lines: string[] = [];
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { authorization: `Bearer ${reader}` } }, resolve).on('error', reject);
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    response.setEncoding('utf8');
    let raw = '';
    response.on('data', (chunk: string) => {
      raw += chunk;
      lines.push(...chunk.split('\n').filter((line) => line.startsWith('data: ')));
    });
    const mark = told.length;
    const session = terminal('old way');
    runs(session, 'ls');
    hub.emit({ type: 'session.renamed', sessionId: session.id, name: 'renamed' });
    rename('Last');
    await until(() => lines.some((line) => line.includes('"Last"')));
    response.destroy();
    const seen = lines.map((line) => JSON.parse(line.slice('data: '.length)) as { type: string });
    // One thing it did not see before, first, of a type it does not know and passes over as it does any other.
    expect(seen[0]!.type).toBe('hello');
    // The changes themselves are, to the byte, what the hub told of (this token may not read a command line).
    const made = told.slice(mark).map((t) => t.event).filter((e) => !e.type.startsWith('token.'));
    const expected = made.map((e) => (e.type === 'session.status' ? { ...e, status: { ...e.status, commandLine: null } } : e));
    expect(lines.slice(1)).toEqual(expected.map((e) => `data: ${JSON.stringify(e)}`));
    // And nothing else is on the stream but comments, the two lines of `hello`, and one `id:` line for each change.
    const others = raw.split('\n').filter((line) => line !== '' && !line.startsWith('data: '));
    expect(others.filter((line) => line.startsWith(':'))).toEqual([': connected']);
    expect(others.filter((line) => !line.startsWith(':') && !line.startsWith('id: '))).toEqual(['event: hello']);
    expect(others.filter((line) => line.startsWith('id: '))).toHaveLength(1 + expected.length);
  });
});

describe('coming back with the last id', () => {
  it('is sent exactly what was made meanwhile, once, in order, and then what is made next', async () => {
    const reader = await makeToken('reader', ['read']);
    const first = await follow(reader);
    rename('Before');
    await until(() => names(first).includes('Before'));
    const last = first.lastId();
    first.close();

    for (const name of ['Missed 1', 'Missed 2', 'Missed 3']) rename(name);
    const second = await follow(reader, last);
    await until(() => names(second).length >= 3);
    expect(second.events[0]!.event).toBe('hello');
    expect(second.events[0]!.data.resumed).toBe(true);
    expect(second.events[0]!.data.revision).toBe(hub.toldRevision);
    // Until something of what was missed is read, the program stands where it said it stood.
    expect(second.events[0]!.id).toBe(last);
    expect(second.events.some((e) => e.event === 'reset')).toBe(false);
    rename('After');
    await until(() => names(second).includes('After'));
    expect(names(second)).toEqual(['Missed 1', 'Missed 2', 'Missed 3', 'After']);
    const revisions = second.changes().map((e) => readStreamEventId(e.id!)!.revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);

    // Coming back with the id of the last change of all: nothing again, then what is new.
    const third = await follow(reader, second.lastId());
    expect(third.events[0]!.data.resumed).toBe(true);
    rename('New');
    await until(() => names(third).includes('New'));
    expect(names(third)).toEqual(['New']);

    // With the id of a `hello` alone (nothing was told before the drop): everything since that connection.
    const quiet = await follow(reader);
    const atHello = quiet.lastId();
    quiet.close();
    rename('While away');
    const back = await follow(reader, atHello);
    await until(() => names(back).includes('While away'));
    expect(names(back)).toEqual(['While away']);
  });

  it('neither loses nor repeats a change made while it is coming back', async () => {
    const reader = await makeToken('reader', ['read']);
    const first = await follow(reader);
    rename('n0');
    await until(() => names(first).includes('n0'));
    const last = first.lastId();
    first.close();
    // Changes are made without a pause while the program connects again: some before the server takes the request,
    // some in the turn it is answered in or after. Which is which is not known here, and must not matter.
    let n = 0;
    const making = (async () => {
      while (n < 400) {
        for (let i = 0; i < 20; i += 1) rename(`n${(n += 1)}`);
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();
    const second = await follow(reader, last);
    await making;
    await until(() => names(second).includes('n400'));
    expect(second.events[0]!.data.resumed).toBe(true);
    expect(names(second)).toEqual(Array.from({ length: 400 }, (_, i) => `n${i + 1}`));
    const sentAgain = second.changes().filter((e) => readStreamEventId(e.id!)!.revision <= second.events[0]!.data.revision).length;
    expect(sentAgain).toBeGreaterThan(0);
  });

  it('goes through the same filters as a change that just happened: no command line, and nothing about tokens or devices', async () => {
    const reader = await makeToken('reader', ['read']);
    const mayRead = await makeToken('may read terminals', ['read', 'terminal:read']);
    const first = await follow(reader);
    const last = first.lastId();
    first.close();

    const session = terminal('builder');
    runs(session, MARKER);
    hub.emit({ type: 'session.note.appended', sessionId: session.id, entry: { id: newId(), at: new Date().toISOString(), author: 'user', kind: 'prompt', text: `please run ${MARKER}` } });
    hub.emit({ type: 'session.note.appended', sessionId: session.id, entry: { id: newId(), at: new Date().toISOString(), author: 'agent', kind: 'note', text: 'a plain note' } });
    // What is the owner's business: a token made, a token used, a device seen.
    await makeToken('made meanwhile', ['read']);
    hub.emit({ type: 'token.used', tokenId: hub.state.tokens[0]!.id, at: new Date().toISOString() });
    hub.emit({ type: 'device.used', deviceId: newId(), at: new Date().toISOString() });
    rename('End');

    const second = await follow(reader, last);
    await until(() => names(second).includes('End'));
    expect(second.events[0]!.data.resumed).toBe(true);
    expect(second.changes().map((e) => e.data.type)).toEqual(['session.created', 'session.status', 'session.note.appended', 'canvas.updated']);
    expect(second.changes()[1]!.data.status).toMatchObject({ state: 'busy', commandLine: null });
    expect(second.changes()[2]!.data.entry.text).toBe('a plain note');
    expect(second.raw()).not.toContain('PLANTED-MARKER');
    expect(second.raw()).not.toMatch(/"type":"(token|device)\./);
    expect(second.raw()).not.toContain('made meanwhile');

    // The same again for a token that may read terminals: it is sent the command line, and still no token or device.
    const third = await follow(mayRead, last);
    await until(() => names(third).includes('End'));
    expect(third.changes().map((e) => e.data.type)).toEqual(['session.created', 'session.status', 'session.note.appended', 'session.note.appended', 'canvas.updated']);
    expect(third.changes()[1]!.data.status.commandLine).toBe(MARKER);
    expect(third.raw()).not.toMatch(/"type":"(token|device)\./);
    // The changes about tokens and devices were made, and are remembered by the hub: they were left out, not absent.
    expect(hub.since(readStreamEventId(last)!.revision)!.filter((c) => /^(token|device)\./.test(c.event.type)).length).toBeGreaterThanOrEqual(3);
  });

  it('judges by now: a terminal that became people only since is sent again without what it showed', async () => {
    const mayRead = await makeToken('may read terminals', ['read', 'terminal:read']);
    const first = await follow(mayRead);
    const session = terminal('builder');
    await until(() => first.changes().some((e) => e.data.type === 'session.created'));
    const last = first.lastId();
    // Live, it is sent the command line: it may read this terminal now.
    runs(session, MARKER);
    await until(() => first.raw().includes('PLANTED-MARKER'));
    first.close();
    // The owner closes the terminal to programs. Then the program comes back for what it "missed".
    expect((await asOwner('PUT', `/v1/sessions/${session.id}/protection`, { peopleOnly: true })).status).toBe(200);
    rename('End');
    const second = await follow(mayRead, last);
    await until(() => names(second).includes('End'));
    expect(second.changes().map((e) => e.data.type)).toEqual(['session.status', 'session.protected', 'canvas.updated']);
    expect(second.changes()[0]!.data.status.commandLine).toBeNull();
    expect(second.raw()).not.toContain('PLANTED-MARKER');
  });

  it('keeps a token to its projects, as they are now', async () => {
    const a = hub.state.projects[0]!;
    const made = await asOwner('POST', '/v1/projects', { name: 'Bravo secret project' });
    expect(made.status).toBe(201);
    const b = made.body as { id: string };
    const canvasB = hub.state.canvases.find((c) => c.projectId === b.id)!.id;
    const second = (await asOwner('POST', '/v1/canvases', { name: 'Alpha second canvas' })).body as { id: string };
    const limited = await makeToken('limited to A', ['read'], { projects: { kind: 'projects', projectIds: [a.id] } });

    const first = await follow(limited);
    const last = first.lastId();
    first.close();

    // In B, never within its reach: a terminal made, renamed, ended (a change that names only an ID).
    const inB = terminal('bravo terminal', canvasB);
    hub.emit({ type: 'session.renamed', sessionId: inB.id, name: 'bravo renamed' });
    hub.emit({ type: 'session.closed', sessionId: inB.id });
    // In A, and still in A: made and ended. Both are for it, the ending too, though the terminal is gone by now.
    const stays = terminal('alpha stays', mainCanvas());
    hub.emit({ type: 'session.closed', sessionId: stays.id });
    // In A when it happened, and not now: a terminal on a canvas the owner then moved to B.
    const moves = terminal('alpha that moves', second.id);
    hub.emit({ type: 'session.renamed', sessionId: moves.id, name: 'moved away' });
    expect((await asOwner('POST', `/v1/canvases/${second.id}/project`, { projectId: b.id })).status).toBe(200);
    expect(hub.state.sessions.find((s) => s.id === moves.id)!.projectId).toBe(b.id);
    rename('End');

    const back = await follow(limited, last);
    await until(() => names(back).includes('End'));
    expect(back.events[0]!.data.resumed).toBe(true);
    expect(back.changes().map((e) => [e.data.type, e.data.sessionId ?? e.data.session?.id ?? null])).toEqual([
      ['session.created', stays.id],
      ['session.closed', stays.id],
      ['canvas.updated', null],
    ]);
    for (const of of [b.id, canvasB, inB.id, moves.id, second.id, 'bravo', 'Bravo', 'moved away', 'alpha that moves']) expect(back.raw().includes(of), `sent again: “${of}”`).toBe(false);

    // The same token, had it listened all along, was told of the terminal while it was in A: that is what "live" was.
    // A token over every project is sent all of it again.
    const everything = await makeToken('everything', ['read']);
    const whole = await follow(everything, last);
    await until(() => names(whole).includes('End'));
    for (const of of [inB.id, moves.id, 'moved away']) expect(whole.raw().includes(of), of).toBe(true);
  });

  it('narrows what is sent again to one canvas when asked', async () => {
    const reader = await makeToken('reader', ['read']);
    const other = (await asOwner('POST', '/v1/canvases', { name: 'Other' })).body as { id: string };
    const first = await follow(reader, undefined, `?canvasId=${other.id}`);
    const last = first.lastId();
    first.close();
    terminal('on main');
    const there = terminal('on other', other.id);
    hub.emit({ type: 'canvas.updated', canvasId: other.id, changes: { name: 'End' } });
    const back = await follow(reader, last, `?canvasId=${other.id}`);
    await until(() => names(back).includes('End'));
    expect(back.changes().map((e) => e.data.type)).toEqual(['session.created', 'canvas.updated']);
    expect(back.changes()[0]!.data.session.id).toBe(there.id);
  });
});

describe('when it cannot go on from there, it says so', () => {
  it('says restarted for an id of another run of the server', async () => {
    const reader = await makeToken('reader', ['read']);
    const first = await follow(reader);
    rename('Before');
    await until(() => names(first).includes('Before'));
    const last = first.lastId();
    const epochBefore = hub.epoch;
    first.close();
    opened.length = 0;
    await stop();
    await start();
    expect(hub.epoch).not.toBe(epochBefore);

    const second = await follow(reader, last);
    expect(second.events.slice(0, 2).map((e) => e.event)).toEqual(['reset', 'hello']);
    expect(StreamReset.parse(second.events[0]!.data)).toEqual({ type: 'reset', reason: 'restarted' });
    // `reset` has no id: a program that got no further asks from the same place again and is told again.
    expect(second.events[0]!.id).toBeNull();
    expect(second.events[1]!.data).toMatchObject({ epoch: hub.epoch, resumed: false });
    expect(second.events[1]!.id).toBe(streamEventId(hub.epoch, second.events[1]!.data.revision));
    // Then it is live, and from the id it now has it can go on.
    rename('After');
    await until(() => names(second).includes('After'));
    expect(names(second)).toEqual(['After']);
    const at = second.lastId();
    second.close();
    rename('Missed');
    const third = await follow(reader, at);
    await until(() => names(third).includes('Missed'));
    expect(third.events[0]!.event).toBe('hello');
    expect(names(third)).toEqual(['Missed']);
  });

  it('says too-old for an id further back than is remembered', async () => {
    await stop();
    await start(10);
    const reader = await makeToken('reader', ['read']);
    const first = await follow(reader);
    const last = first.lastId();
    first.close();
    for (let n = 1; n <= 10; n += 1) rename(`n${n}`);
    // Exactly as many as are remembered: all of them again.
    const within = await follow(reader, streamEventId(hub.epoch, hub.toldRevision - 10));
    await until(() => names(within).length >= 10);
    expect(within.events[0]!.data.resumed).toBe(true);
    expect(names(within)).toEqual(Array.from({ length: 10 }, (_, i) => `n${i + 1}`));
    // One more back: not a part of them with a hole before it, but `reset`.
    rename('n11');
    const beyond = await follow(reader, last);
    expect(beyond.events.slice(0, 2).map((e) => [e.event, e.data.reason ?? e.data.resumed])).toEqual([['reset', 'too-old'], ['hello', false]]);
    rename('After');
    await until(() => names(beyond).includes('After'));
    expect(names(beyond)).toEqual(['After']);
  });

  it('says unreadable for anything that is not an id of this stream', async () => {
    const reader = await makeToken('reader', ['read']);
    rename('Before');
    for (const garbage of ['garbage', '42', `${hub.epoch}`, `${hub.epoch}.x`, `${hub.epoch}.-3`, `${hub.epoch}.${hub.toldRevision + 1000}`, `${'a'.repeat(4000)}`, '{"epoch":1}']) {
      const stream = await follow(reader, garbage);
      expect(stream.events.slice(0, 2).map((e) => [e.event, e.data.reason ?? e.data.resumed]), garbage.slice(0, 40)).toEqual([['reset', 'unreadable'], ['hello', false]]);
      expect(stream.changes()).toEqual([]);
      stream.close();
    }
    // An empty header is a header: it does not pass for a first connection.
    const empty = await follow(reader, '');
    expect(empty.events[0]!.data).toEqual({ type: 'reset', reason: 'unreadable' });
  });

  it('says nothing of the kind on a first connection, and sends nothing again', async () => {
    const reader = await makeToken('reader', ['read']);
    rename('Long before');
    const stream = await follow(reader);
    rename('Now');
    await until(() => names(stream).includes('Now'));
    expect(stream.events.map((e) => e.event)).toEqual(['hello', 'message']);
    expect(names(stream)).toEqual(['Now']);
  });
});

describe('what it costs', () => {
  it('does not hold up a change for a client that does not read, and keeps nothing for it but the same memory', async () => {
    const reader = await makeToken('reader', ['read']);
    // A program that asks for everything since the start, and then reads nothing at all.
    const socket = net.connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    socket.pause();
    socket.write(`GET ${publicPaths.events} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${reader}\r\n${LAST_EVENT_ID_HEADER}: ${streamEventId(hub.epoch, 0)}\r\n\r\n`);
    const listening = (): number => (hub as unknown as { listeners: Set<unknown> }).listeners.size;
    const before = listening();
    await until(() => listening() > before);

    // Each change is made, told and counted before `emit` returns, whatever that client does.
    const big = 'x'.repeat(2000);
    const started = performance.now();
    for (let n = 1; n <= RECENT_CHANGES * 2; n += 1) {
      const revision = hub.revision;
      rename(`${n} ${big}`);
      expect(hub.toldRevision).toBe(revision + 1);
    }
    const took = performance.now() - started;
    expect(hub.state.canvases[0]!.name).toBe(`${RECENT_CHANGES * 2} ${big}`);
    // 4,000 changes of 2 KB each to a client that takes none of them: far under a second on a busy machine too.
    expect(took).toBeLessThan(20_000);
    expect((hub as unknown as { recent: unknown[] }).recent).toHaveLength(RECENT_CHANGES);

    // A client that does read is, meanwhile, told of all of it.
    const other = await follow(reader, streamEventId(hub.epoch, hub.toldRevision - RECENT_CHANGES));
    await until(() => names(other).length >= RECENT_CHANGES);
    expect(names(other).at(-1)).toBe(`${RECENT_CHANGES * 2} ${big}`);
    socket.destroy();
    await until(() => listening() === before + 1);
  }, 60_000);

  it('writes nothing of the memory to the data folder', async () => {
    const reader = await makeToken('reader', ['read']);
    const first = await follow(reader);
    const session = terminal('builder');
    runs(session, MARKER);
    // The state holds the command line while the command runs; once it has ended, only the memory does.
    hub.emit({ type: 'session.status', sessionId: session.id, status: { ...NO_STATUS, state: 'idle', lastExit: 0 } });
    rename('End');
    await until(() => names(first).includes('End'));
    const again = await follow(reader, streamEventId(hub.epoch, 0));
    await until(() => names(again).includes('End'));
    await hub.flush();
    const files = await readdir(dir, { recursive: true, withFileTypes: true });
    let searched = 0;
    for (const file of files) {
      if (!file.isFile()) continue;
      const text = await readFile(path.join(file.parentPath, file.name), 'utf8');
      searched += 1;
      expect(text.includes('PLANTED-MARKER'), file.name).toBe(false);
      expect(text.includes(hub.epoch), file.name).toBe(false);
    }
    expect(searched).toBeGreaterThan(0);
    expect(hub.since(0)!.some((c) => JSON.stringify(c.event).includes('PLANTED-MARKER'))).toBe(true);
  });
});

describe('the client', () => {
  it('tells the id of each event after handing it over, and sends the last one back', async () => {
    const reader = await makeToken('reader', ['read']);
    const client = createClient({ baseUrl: origin, token: reader });
    /** Reads until a canvas is renamed to `last`; answers the types seen and the ids told. */
    const read = async (last: string, lastEventId?: string): Promise<{ seen: string[]; ids: string[] }> => {
      const stop = new AbortController();
      const seen: string[] = [];
      const ids: string[] = [];
      try {
        for await (const event of client.streamEvents({ signal: stop.signal, ...(lastEventId === undefined ? {} : { lastEventId }), onEventId: (id) => ids.push(id) })) {
          // Told only once the event before it was taken.
          expect(ids).toHaveLength(seen.length);
          seen.push(event.type === 'canvas.updated' ? String((event as unknown as { changes: { name: string } }).changes.name) : event.type);
          if (seen.at(-1) === last) break;
        }
      } finally {
        stop.abort();
      }
      return { seen, ids };
    };
    const first = read('One');
    await until(() => (hub as unknown as { listeners: Set<unknown> }).listeners.size > 1 && told.length > 0);
    // Made again until the stream has it: when the stream began to listen is not known here.
    const making = setInterval(() => rename('One'), 20);
    const { seen, ids } = await first.finally(() => clearInterval(making));
    expect(seen[0]).toBe('hello');
    expect(seen.at(-1)).toBe('One');
    // The id of the event it stopped in was not told: it was not finished. The one before is where it stands.
    expect(ids).toHaveLength(seen.length - 1);
    const at = ids.at(-1)!;
    const from = readStreamEventId(at)!.revision;
    rename('Two');
    rename('Three');
    const next = await read('Three', at);
    const expected = hub.since(from)!.filter((c) => c.event.type === 'canvas.updated').map((c) => (c.event as { changes: { name: string } }).changes.name);
    expect(next.seen).toEqual(['hello', ...expected.slice(0, expected.indexOf('Three') + 1)]);
    expect(next.seen.slice(-2)).toEqual(['Two', 'Three']);
  });
});
