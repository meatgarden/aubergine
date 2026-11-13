import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  CLOSE_SESSION_ENDED,
  CreateSessionResponse,
  EventsServerMessage,
  Frame,
  OutsideResponse,
  OutsideResult,
  SESSION_ENV,
  SearchResponse,
  SnapshotResponse,
  StateResponse,
  newId,
  paths,
  type ChangeEvent,
} from '@aubergine/shared';
import { sessionToken } from './auth';
import { Canvas } from './canvas';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { buildServer, cookieName } from './server';
import type { ClaudeSession } from './migrate/claude-sessions';
import { Outside } from './migrate/outside';
import type { ScannedShell } from './migrate/shells';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile, expandHome } from './settings';
import { ZshIntegration } from './shell/integration';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const SOCKET = testSocketName('server');
const runtime = new TmuxRuntime({ socket: SOCKET });
let dir: string;
let token: string;
let app: FastifyInstance;
let canvas: Canvas;
let sessions: Sessions;
let settingsFile: SettingsFile;

/** A pretend set of terminals outside the canvas, so that these tests never look at or touch real ones. */
const outsideWorld = {
  shells: [] as ScannedShell[],
  records: new Map<number, ClaudeSession>(),
  /** Process IDs that were sent a termination request. */
  terminated: [] as number[],
  /** Whether a process exits when asked. */
  exits: true,
  processes: {
    startOf: async (pid: number) => {
      const record = outsideWorld.records.get(pid);
      if (!record || (outsideWorld.exits && outsideWorld.terminated.includes(pid))) return null;
      return { started: record.processStart, args: 'claude' };
    },
    terminate: (pid: number) => {
      outsideWorld.terminated.push(pid);
    },
    wait: () => sleep(5),
  },
};
let port: number;
let origin: string;
const sockets: WebSocket[] = [];

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  canvas = new Canvas(await store.load(), store);
  settingsFile = new SettingsFile(dir);
  await settingsFile.reload();
  sessions = new Sessions(canvas, runtime, {
    integration: new ZshIntegration(path.join(dir, 'shell')),
    sessionEnv: (sessionId) => ({
      [SESSION_ENV.url]: `http://127.0.0.1:${port}`,
      [SESSION_ENV.sessionId]: sessionId,
      [SESSION_ENV.token]: sessionToken(token, sessionId),
    }),
    logPrompts: () => settingsFile.value.agents.logPrompts,
    // A stand-in for starting an agent: any line will do to check that it is typed.
    agentLaunchLine: async (_agent, args) => `echo "agent-""launched${args.map((a) => `:${a}`).join('')}"`,
    defaultFolder: () => (settingsFile.value.defaultFolder ? expandHome(settingsFile.value.defaultFolder) : null),
    shell: () => settingsFile.value.shell,
  });
  app = await buildServer({
    canvas,
    sessions,
    runtime,
    outside: new Outside({
      scan: async () => outsideWorld.shells,
      readAgentRecord: async (pid) => outsideWorld.records.get(pid) ?? null,
      processes: outsideWorld.processes,
      stopWaitMs: 300,
      createSession: (input) => sessions.create(input),
    }),
    settings: () => settingsFile.reload(),
    token,
    devOrigin: null,
    webDist: path.join(dir, 'no-web-build'),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  // After listening, so that shells started now are given the right address.
  await sessions.reconcile();
}

async function stop(): Promise<void> {
  for (const socket of sockets.splice(0)) socket.terminate();
  await canvas.flush();
  await app.close();
}

const authCookie = (): string => `${cookieName(port)}=${token}`;

function request(
  method: string,
  url: string,
  options: { body?: unknown; headers?: Record<string, string>; cookie?: boolean; origin?: string | null } = {},
) {
  const headers: Record<string, string> = { host: `127.0.0.1:${port}`, ...options.headers };
  if (options.cookie !== false) headers.cookie = authCookie();
  if (options.origin !== null) headers.origin = options.origin ?? origin;
  return app.inject({
    method: method as 'GET',
    url,
    headers,
    ...(options.body === undefined ? {} : { payload: options.body as object }),
  });
}

function openSocket(
  urlPath: string,
  options: { cookie?: boolean; origin?: string | null; host?: string } = {},
): WebSocket {
  const headers: Record<string, string> = {};
  if (options.cookie !== false) headers.cookie = authCookie();
  if (options.host) headers.host = options.host;
  const socket = new WebSocket(`ws://127.0.0.1:${port}${urlPath}`, {
    headers,
    ...(options.origin === null ? {} : { origin: options.origin ?? origin }),
  });
  sockets.push(socket);
  return socket;
}

/** Resolves with the HTTP status when the upgrade is refused, or 101 when it opens. */
function upgradeStatus(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.on('open', () => resolve(101));
    socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    socket.on('error', reject);
  });
}

async function waitFor(check: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(20);
  }
}

/** Like waitFor, for conditions on what the runtime reports: asks it afresh before each check. */
async function waitForRefreshed(check: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  for (;;) {
    await sessions.refresh();
    if (check()) return;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(40);
  }
}

function terminal(sessionId: string, options: Parameters<typeof openSocket>[1] = {}) {
  const socket = openSocket(`${paths.terminal(sessionId)}?cols=80&rows=24`, options);
  const decoder = new TextDecoder();
  const view = { text: '', control: [] as unknown[], closeCode: null as number | null, socket };
  socket.on('message', (data, isBinary) => {
    if (isBinary) view.text += decoder.decode(data as Buffer, { stream: true });
    else view.control.push(JSON.parse(data.toString()));
  });
  socket.on('close', (code) => {
    view.closeCode = code;
  });
  return view;
}

/**
 * Waits until the session's shell has drawn its prompt. A shell throws away
 * anything typed while it is still starting up, so tests must not type sooner.
 */
async function shellReady(sessionId: string): Promise<void> {
  const started = Date.now();
  while ((await runtime.snapshot(sessionId)).trim() === '') {
    if (Date.now() - started > 15_000) throw new Error('The shell never showed a prompt');
    await sleep(25);
  }
}

async function createSession(name?: string): Promise<CreateSessionResponse> {
  const response = await request('POST', paths.sessions, { body: name ? { name } : {} });
  expect(response.statusCode).toBe(201);
  const created = CreateSessionResponse.parse(response.json());
  await shellReady(created.session.id);
  return created;
}

beforeAll(async () => {
  await runtime.killServer();
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-server-'));
  token = await loadOrCreateToken(dir);
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

describe('access token', () => {
  it('is created once, kept private and reused', async () => {
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await loadOrCreateToken(dir)).toBe(token);
    expect((await stat(path.join(dir, 'token'))).mode & 0o777).toBe(0o600);
  });

  it('is exchanged for an HttpOnly cookie', async () => {
    const wrong = await request('GET', `${paths.auth}?token=${'0'.repeat(64)}`, { cookie: false, origin: null });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.headers['set-cookie']).toBeUndefined();

    const right = await request('GET', `${paths.auth}?token=${token}`, { cookie: false, origin: null });
    expect(right.statusCode).toBe(302);
    expect(right.headers.location).toBe('/');
    const setCookie = String(right.headers['set-cookie']);
    expect(setCookie).toContain(`${cookieName(port)}=${token}`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
  });
});

describe('request checks', () => {
  it('refuses requests for another Host', async () => {
    for (const host of ['evil.example', `evil.example:${port}`, '127.0.0.1:1', `127.0.0.1.evil.example:${port}`]) {
      const response = await request('GET', paths.state, { headers: { host } });
      expect(response.statusCode, host).toBe(403);
    }
    expect((await request('GET', paths.state, { headers: { host: `localhost:${port}` }, origin: null })).statusCode).toBe(200);
  });

  it('refuses a foreign Origin, and a missing one on anything that changes state', async () => {
    expect((await request('GET', paths.state, { origin: 'http://evil.example' })).statusCode).toBe(403);
    expect((await request('GET', paths.state, { origin: 'null' })).statusCode).toBe(403);
    expect((await request('POST', paths.sessions, { body: {}, origin: 'http://evil.example' })).statusCode).toBe(403);
    expect((await request('POST', paths.sessions, { body: {}, origin: null })).statusCode).toBe(403);
    expect((await request('DELETE', paths.session(newId()), { origin: null })).statusCode).toBe(403);
    expect(canvas.state.sessions).toEqual([]);
  });

  it('requires the token cookie on the API', async () => {
    expect((await request('GET', paths.state, { cookie: false })).statusCode).toBe(401);
    const wrong = await request('GET', paths.state, {
      cookie: false,
      headers: { cookie: `${cookieName(port)}=${'f'.repeat(64)}` },
    });
    expect(wrong.statusCode).toBe(401);
    expect((await request('POST', paths.sessions, { body: {}, cookie: false })).statusCode).toBe(401);
  });

  it('applies the same checks to WebSocket upgrades', async () => {
    const id = newId();
    const url = `${paths.terminal(id)}?cols=80&rows=24`;
    expect(await upgradeStatus(openSocket(url, { cookie: false }))).toBe(401);
    expect(await upgradeStatus(openSocket(url, { origin: 'http://evil.example' }))).toBe(403);
    expect(await upgradeStatus(openSocket(url, { origin: null }))).toBe(403);
    expect(await upgradeStatus(openSocket(url, { host: 'evil.example' }))).toBe(403);
    expect(await upgradeStatus(openSocket(paths.events, { cookie: false }))).toBe(401);
    expect(await upgradeStatus(openSocket(paths.events))).toBe(101);
  });
});

describe('API', () => {
  it('reports state and a usable runtime', async () => {
    const body = StateResponse.parse((await request('GET', paths.state)).json());
    expect(body.runtime.status).toBe('ok');
    expect(body.state.sessions).toEqual([]);
  });

  it('creates, renames, moves and closes a session', async () => {
    const { session, node } = await createSession();
    expect(session.name).toBe('Terminal 1');
    expect(session.projectId).toBe(canvas.state.project.id);
    expect(node.sessionId).toBe(session.id);
    expect(await runtime.has(session.id)).toBe(true);

    const second = await createSession('logs');
    const a = node;
    const b = second.node;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap).toBe(false);

    const renamed = await request('PATCH', paths.session(session.id), { body: { name: 'build' } });
    expect(renamed.statusCode).toBe(200);
    expect(canvas.state.sessions.find((s) => s.id === session.id)?.name).toBe('build');

    const rect = { x: 500, y: -200, width: 900, height: 600 };
    const moved = await request('PUT', paths.node(node.id), { body: rect });
    expect(moved.statusCode).toBe(200);
    expect(canvas.state.layout.nodes.find((n) => n.id === node.id)).toMatchObject(rect);

    const closed = await request('DELETE', paths.session(session.id));
    expect(closed.statusCode).toBe(204);
    expect(await runtime.has(session.id)).toBe(false);
    expect(canvas.state.sessions.map((s) => s.id)).toEqual([second.session.id]);
    expect(canvas.state.layout.nodes.map((n) => n.id)).toEqual([second.node.id]);
  });

  it('answers bad input with 400 and unknown IDs with 404', async () => {
    const { session, node } = await createSession();
    expect((await request('PATCH', paths.session(session.id), { body: { name: '' } })).statusCode).toBe(400);
    expect((await request('PUT', paths.node(node.id), { body: { x: 0, y: 0, width: 1, height: 1 } })).statusCode).toBe(400);
    expect((await request('PATCH', paths.session('not-an-id'), { body: { name: 'x' } })).statusCode).toBe(400);
    expect((await request('PATCH', paths.session(newId()), { body: { name: 'x' } })).statusCode).toBe(404);
    expect((await request('DELETE', paths.session(newId()))).statusCode).toBe(404);
    expect((await request('PUT', paths.node(newId()), { body: { x: 0, y: 0, width: 800, height: 500 } })).statusCode).toBe(404);
  });
});

describe('change events', () => {
  it('streams every change to subscribers', async () => {
    const socket = openSocket(paths.events);
    const messages: EventsServerMessage[] = [];
    socket.on('message', (data) => messages.push(EventsServerMessage.parse(JSON.parse(data.toString()))));
    await waitFor(() => messages.length === 1, 'hello');
    expect(messages[0]).toEqual({ type: 'hello', protocolVersion: 1 });

    const { session, node } = await createSession();
    await request('PATCH', paths.session(session.id), { body: { name: 'build' } });
    await request('PUT', paths.node(node.id), { body: { x: 1, y: 2, width: 800, height: 500 } });
    await request('DELETE', paths.session(session.id));
    await waitFor(() => messages.length === 5, 'four events');

    const events = messages.slice(1).map((m) => (m as { event: ChangeEvent }).event);
    expect(events.map((e) => e.type)).toEqual([
      'session.created',
      'session.renamed',
      'node.updated',
      'session.closed',
    ]);
  });
});

describe('terminal WebSocket', () => {
  it('carries input to the shell and output back', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(JSON.stringify({ t: 'input', data: 'echo "hel""lo-$((6 * 7))"\r' }));
    await waitFor(() => view.text.includes('hello-42'), 'output');
  });

  it('handles input sent the moment the socket opens', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    view.socket.on('open', () => {
      view.socket.send(JSON.stringify({ t: 'resize', cols: 100, rows: 30 }));
      view.socket.send(JSON.stringify({ t: 'input', data: 'echo "ear""ly"\r' }));
    });
    await waitFor(() => view.text.includes('early'), 'output');
  });

  it('lets two viewers watch one session', async () => {
    const { session } = await createSession();
    const a = terminal(session.id);
    const b = terminal(session.id);
    await waitFor(() => a.socket.readyState === WebSocket.OPEN && b.socket.readyState === WebSocket.OPEN, 'open');
    a.socket.send(JSON.stringify({ t: 'input', data: 'echo "bo""th"\r' }));
    await waitFor(() => a.text.includes('both') && b.text.includes('both'), 'output on both');
  });

  it('keeps the shell when the viewer leaves', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.text.length > 0, 'first output');
    view.socket.close();
    await waitFor(() => view.closeCode !== null, 'close');
    await sleep(100);
    expect(await runtime.has(session.id)).toBe(true);
    expect(canvas.state.sessions).toHaveLength(1);
  });

  it('marks the session as ended when its shell exits, and can restart it in the same folder', async () => {
    const { session, node } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    const folder = await realpath(dir);
    view.socket.send(JSON.stringify({ t: 'input', data: `cd ${folder}\r` }));
    await waitForRefreshed(() => {
      return canvas.state.sessions[0]?.cwd === folder;
    }, 'folder noticed');

    view.socket.send(JSON.stringify({ t: 'input', data: 'exit\r' }));
    await waitFor(() => view.closeCode !== null, 'close');
    expect(view.closeCode).toBe(CLOSE_SESSION_ENDED);
    expect(view.control).toContainEqual({ t: 'exit', reason: 'session_ended' });
    // The node stays, marked as ended.
    expect(canvas.state.sessions[0]).toMatchObject({ id: session.id, state: 'exited', cwd: folder });
    expect(canvas.state.layout.nodes.map((n) => n.id)).toEqual([node.id]);

    // A viewer cannot attach to an ended session.
    const late = terminal(session.id);
    await waitFor(() => late.closeCode !== null, 'late close');
    expect(late.closeCode).toBe(CLOSE_SESSION_ENDED);

    expect((await request('POST', paths.parkSession(session.id), { body: {} })).statusCode).toBe(409);
    const restarted = await request('POST', paths.restartSession(session.id), { body: {} });
    expect(restarted.statusCode).toBe(200);
    expect(canvas.state.sessions[0]?.state).toBe('open');
    expect(await runtime.has(session.id)).toBe(true);
    // Ask the runtime itself: the saved folder was already this one before the restart.
    const started = Date.now();
    while ((await runtime.list()).find((x) => x.id === session.id)?.cwd !== folder) {
      if (Date.now() - started > 8000) throw new Error('The new shell did not start in the same folder');
      await sleep(40);
    }
    expect((await request('POST', paths.restartSession(session.id), { body: {} })).statusCode).toBe(409);
  });

  it('closes on unknown sessions and on bad messages', async () => {
    const unknown = terminal(newId());
    await waitFor(() => unknown.closeCode !== null, 'close');
    expect(unknown.closeCode).toBe(CLOSE_SESSION_ENDED);

    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(JSON.stringify({ t: 'run', command: 'ls' }));
    await waitFor(() => view.closeCode !== null, 'close');
    expect(view.closeCode).toBe(4002);
    expect(await runtime.has(session.id)).toBe(true);
  });
});

describe('parked sessions', () => {
  it('parks a session without ending its shell, and restores it to the same place', async () => {
    const { session, node } = await createSession('keeper');
    const parked = await request('POST', paths.parkSession(session.id), { body: {} });
    expect(parked.statusCode).toBe(200);
    expect(parked.json().state).toBe('parked');
    expect(await runtime.has(session.id)).toBe(true);
    expect(canvas.state.layout.nodes).toEqual([node]);

    // New nodes may use the space a parked node left.
    const other = await createSession();
    expect(other.node.id).not.toBe(node.id);

    const restored = await request('POST', paths.restoreSession(session.id), { body: {} });
    expect(restored.json().state).toBe('open');
    expect(canvas.state.layout.nodes.find((n) => n.sessionId === session.id)).toEqual(node);
  });

  it('survives a restart while parked', async () => {
    const { session } = await createSession();
    await request('POST', paths.parkSession(session.id), { body: {} });
    await stop();
    await start();
    expect(canvas.state.sessions[0]).toMatchObject({ id: session.id, state: 'parked' });
    expect(await runtime.has(session.id)).toBe(true);
  });

  it('ends a parked session for good on request', async () => {
    const { session } = await createSession();
    await request('POST', paths.parkSession(session.id), { body: {} });
    expect((await request('DELETE', paths.session(session.id))).statusCode).toBe(204);
    expect(await runtime.has(session.id)).toBe(false);
    expect(canvas.state.sessions).toEqual([]);
  });

  it('never answers a refresh with a picture taken before it was asked', async () => {
    const { session } = await createSession();
    const earlier = sessions.refresh(); // under way while the shell is ended
    await runtime.kill(session.id);
    await sessions.refresh();
    expect(canvas.state.sessions[0]?.state).toBe('exited');
    await earlier;
  });

  it('removes a parked session whose shell ended unwatched, and marks an open one as ended', async () => {
    const parked = await createSession();
    const open = await createSession();
    await request('POST', paths.parkSession(parked.session.id), { body: {} });
    await runtime.kill(parked.session.id);
    await runtime.kill(open.session.id);
    await sessions.refresh();
    expect(canvas.state.sessions).toHaveLength(1);
    expect(canvas.state.sessions[0]).toMatchObject({ id: open.session.id, state: 'exited' });
  });
});

describe('session activity', () => {
  it('records the folder and command of each session', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    const folder = await realpath(dir);
    view.socket.send(JSON.stringify({ t: 'input', data: `cd ${folder} && sleep 30\r` }));
    await waitForRefreshed(() => {
      const current = canvas.state.sessions[0];
      return current?.cwd === folder && current.command === 'sleep';
    }, 'folder and command');
  });

  it('saves a note with the session', async () => {
    const { session } = await createSession();
    const noted = await request('PATCH', paths.session(session.id), { body: { note: '# billing bug\nretry logic' } });
    expect(noted.statusCode).toBe(200);
    await stop();
    await start();
    expect(canvas.state.sessions[0]?.note).toBe('# billing bug\nretry logic');
  });
});

describe('agent API', () => {
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });
  /** A call the way a program inside a session makes it: bearer token, no cookie, no Origin. */
  const agent = (method: string, url: string, tokenValue: string | null, body?: unknown) =>
    request(method, url, {
      cookie: false,
      origin: null,
      ...(tokenValue === null ? {} : { headers: bearer(tokenValue) }),
      ...(body === undefined ? {} : { body }),
    });

  it('lets a session set its own attention and append to its own note log', async () => {
    const { session } = await createSession();
    const mine = sessionToken(token, session.id);

    const attention = await agent('PUT', paths.agent.attention(session.id), mine, { state: 'waiting', message: 'Allow the edit?' });
    expect(attention.statusCode).toBe(200);
    expect(canvas.state.sessions[0]?.attention).toMatchObject({ state: 'waiting', message: 'Allow the edit?' });

    const noted = await agent('POST', paths.agent.notes(session.id), mine, { text: 'Tests pass.' });
    expect(noted.statusCode).toBe(201);
    expect(canvas.state.sessions[0]?.noteLog).toMatchObject([{ author: 'agent', kind: 'note', text: 'Tests pass.' }]);
    // The pinned note is untouched.
    expect(canvas.state.sessions[0]?.note).toBe('');
  });

  it('refuses a session token everything else', async () => {
    const mine = await createSession();
    const other = await createSession();
    const tokenValue = sessionToken(token, mine.session.id);

    // Another session's attention and notes.
    expect((await agent('PUT', paths.agent.attention(other.session.id), tokenValue, { state: 'waiting' })).statusCode).toBe(403);
    expect((await agent('POST', paths.agent.notes(other.session.id), tokenValue, { text: 'x' })).statusCode).toBe(403);
    // The rest of the API does not take bearer tokens at all.
    expect((await agent('GET', paths.state, tokenValue)).statusCode).toBe(401);
    expect((await agent('DELETE', paths.session(mine.session.id), tokenValue)).statusCode).toBe(403);
    expect((await agent('POST', paths.sessions, tokenValue, {})).statusCode).toBe(403);
    expect((await agent('PATCH', paths.session(mine.session.id), tokenValue, { note: 'x' })).statusCode).toBe(403);
    expect(canvas.state.sessions.map((s) => s.attention.state)).toEqual(['none', 'none']);
    expect(canvas.state.sessions).toHaveLength(2);
  });

  it('refuses missing, wrong and cookie-only credentials, and still checks Host and Origin', async () => {
    const { session } = await createSession();
    const url = paths.agent.attention(session.id);
    const body = { state: 'waiting' };
    expect((await agent('PUT', url, null, body)).statusCode).toBe(401);
    expect((await agent('PUT', url, 'aub1.x.y', body)).statusCode).toBe(401);
    expect((await agent('PUT', url, sessionToken('wrong-secret', session.id), body)).statusCode).toBe(401);
    // The browser cookie is not a credential here.
    expect((await request('PUT', url, { body, origin: null })).statusCode).toBe(401);

    const mine = sessionToken(token, session.id);
    const badHost = await request('PUT', url, { body, cookie: false, origin: null, headers: { ...bearer(mine), host: 'evil.example' } });
    expect(badHost.statusCode).toBe(403);
    const badOrigin = await request('PUT', url, { body, cookie: false, origin: 'http://evil.example', headers: bearer(mine) });
    expect(badOrigin.statusCode).toBe(403);
    expect(canvas.state.sessions[0]?.attention.state).toBe('none');
  });

  it('validates what it is sent', async () => {
    const { session } = await createSession();
    const mine = sessionToken(token, session.id);
    expect((await agent('PUT', paths.agent.attention(session.id), mine, { state: 'panicking' })).statusCode).toBe(400);
    expect((await agent('POST', paths.agent.notes(session.id), mine, { text: '   ' })).statusCode).toBe(400);
    expect((await agent('POST', paths.agent.notes(newId()), sessionToken(token, newId()), { text: 'x' })).statusCode).toBe(403);
  });

  it('gives each session its address, ID and token in its environment', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(
      JSON.stringify({ t: 'input', data: 'echo "env=[$AUBERGINE_URL] [$AUBERGINE_SESSION_ID] [$AUBERGINE_TOKEN]"\r' }),
    );
    const expected = `env=[http://127.0.0.1:${port}] [${session.id}] [${sessionToken(token, session.id)}]`;
    await waitFor(() => view.text.replace(/\s+/g, '').includes(expected.replace(/\s+/g, '')), 'environment');
  });

  it('starts an agent in a new session by typing its launch line once the shell is ready', async () => {
    const response = await request('POST', paths.sessions, { body: { agent: 'claude-code' } });
    const { session } = CreateSessionResponse.parse(response.json());
    expect(session.name).toBe('Claude Code 1');
    const started = Date.now();
    while (!(await runtime.snapshot(session.id)).includes('agent-launched')) {
      if (Date.now() - started > 15_000) throw new Error('The launch line was never run');
      await sleep(40);
    }
    expect((await request('POST', paths.sessions, { body: { agent: 'something-else' } })).statusCode).toBe(400);
  });

  it("clears attention when the user looks, and keeps it while the agent works", async () => {
    const { session } = await createSession();
    const mine = sessionToken(token, session.id);
    await agent('PUT', paths.agent.attention(session.id), mine, { state: 'working' });
    await request('POST', paths.seenSession(session.id), { body: {} });
    expect(canvas.state.sessions[0]?.attention.state).toBe('working');

    await agent('PUT', paths.agent.attention(session.id), mine, { state: 'done' });
    await request('POST', paths.seenSession(session.id), { body: {} });
    expect(canvas.state.sessions[0]?.attention).toEqual({ state: 'none', message: null, at: null });
  });

  it('remembers the agent conversation a session reports, and can resume it', async () => {
    const { session } = await createSession();
    const mine = sessionToken(token, session.id);
    const id = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
    expect((await request('POST', paths.resumeAgent(session.id), { body: {} })).statusCode).toBe(409);

    const reported = await agent('PUT', paths.agent.report(session.id), mine, { kind: 'claude-code', conversationId: id });
    expect(reported.statusCode).toBe(200);
    expect(canvas.state.sessions[0]?.agent).toEqual({ kind: 'claude-code', conversationId: id });

    // Not something another session may set, and not with an ID that is unsafe to type.
    const other = await createSession();
    expect((await agent('PUT', paths.agent.report(other.session.id), mine, { kind: 'claude-code', conversationId: id })).statusCode).toBe(403);
    const unsafe = await agent('PUT', paths.agent.report(session.id), mine, { kind: 'claude-code', conversationId: 'aaaaaaaa; touch /tmp/x' });
    expect(unsafe.statusCode).toBe(400);
    expect(canvas.state.sessions[0]?.agent?.conversationId).toBe(id);

    const resumed = await request('POST', paths.resumeAgent(session.id), { body: {} });
    expect(resumed.statusCode).toBe(200);
    const started = Date.now();
    while (!(await runtime.snapshot(session.id)).includes(`agent-launched:--resume:${id}`)) {
      if (Date.now() - started > 15_000) throw new Error('The agent was never started again');
      await sleep(40);
    }

    // Still known after a restart of the daemon.
    await stop();
    await start();
    expect(canvas.state.sessions[0]?.agent).toEqual({ kind: 'claude-code', conversationId: id });
  });

  it("keeps prompts out of the log when prompt logging is turned off", async () => {
    const { session } = await createSession();
    const mine = sessionToken(token, session.id);
    await agent('POST', paths.agent.notes(session.id), mine, { text: 'fix the build', kind: 'prompt' });
    expect(canvas.state.sessions[0]?.noteLog).toHaveLength(1);

    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ agents: { logPrompts: false } }));
    await settingsFile.reload();
    const dropped = await agent('POST', paths.agent.notes(session.id), mine, { text: 'the password is hunter2', kind: 'prompt' });
    expect(dropped.statusCode).toBe(201);
    expect(dropped.json()).toEqual({ entry: null });
    // Other entries are still kept.
    await agent('POST', paths.agent.notes(session.id), mine, { text: 'Finished.', kind: 'event' });
    expect(canvas.state.sessions[0]?.noteLog.map((e) => e.text)).toEqual(['fix the build', 'Finished.']);
  });

  it('lets the user append entries from the browser, and saves the log', async () => {
    const { session } = await createSession();
    const added = await request('POST', paths.sessionNotes(session.id), { body: { text: 'Remember to rebase.' } });
    expect(added.statusCode).toBe(201);
    await stop();
    await start();
    expect(canvas.state.sessions[0]?.noteLog).toMatchObject([{ author: 'user', text: 'Remember to rebase.' }]);
  });
});

const usesZsh = (process.env.SHELL ?? '').endsWith('/zsh');

describe.runIf(usesZsh)('shell status', () => {
  it('shows a running command as busy, then idle with its exit code', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    await waitForRefreshed(() => canvas.state.sessions[0]?.status.state === 'idle', 'idle at the prompt');
    expect(canvas.state.sessions[0]?.status.lastExit).toBeNull();

    view.socket.send(JSON.stringify({ t: 'input', data: 'sleep 2; (exit 3)\r' }));
    await waitForRefreshed(() => canvas.state.sessions[0]?.status.state === 'busy', 'busy');
    expect(canvas.state.sessions[0]?.status).toMatchObject({ commandLine: 'sleep 2; (exit 3)', lastExit: null });

    await waitForRefreshed(() => canvas.state.sessions[0]?.status.state === 'idle', 'idle again');
    const status = canvas.state.sessions[0]!.status;
    expect(status).toMatchObject({ commandLine: null, lastExit: 3 });
    expect(Date.parse(status.lastFinishedAt!)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('reports status for a parked session, which nobody is viewing', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(JSON.stringify({ t: 'input', data: 'sleep 2; (exit 7)\r' }));
    await waitForRefreshed(() => canvas.state.sessions[0]?.status.state === 'busy', 'busy');
    view.socket.close();
    await request('POST', paths.parkSession(session.id), { body: {} });
    await waitForRefreshed(() => canvas.state.sessions[0]?.status.lastExit === 7, 'exit code while parked');
  });
});

describe('unread output', () => {
  it('marks a session that printed since it was last looked at, until it is looked at again', async () => {
    const { session } = await createSession();
    await request('POST', paths.seenSession(session.id), { body: {} });
    await sessions.refresh();
    expect(canvas.state.sessions[0]?.status.unread).toBe(false);

    await sleep(1200); // tmux keeps activity times in whole seconds
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(JSON.stringify({ t: 'input', data: 'sleep 1.2; echo "something ""new"\r' }));
    await waitForRefreshed(() => canvas.state.sessions[0]?.status.unread === true, 'unread');

    const seen = await request('POST', paths.seenSession(session.id), { body: {} });
    expect(seen.json().status.unread).toBe(false);
    await sessions.refresh();
    expect(canvas.state.sessions[0]?.status.unread).toBe(false);
  });
});

describe('settings', () => {
  it('serves the settings file with the state and applies shell and folder to new sessions', async () => {
    const initial = StateResponse.parse((await request('GET', paths.state)).json());
    expect(initial.settings.theme).toBe('dark');

    const folder = await realpath(dir);
    await writeFile(
      path.join(dir, SETTINGS_FILE),
      JSON.stringify({ theme: 'light', font: { size: 15 }, shell: '/bin/sh', defaultFolder: folder }),
    );
    const edited = StateResponse.parse((await request('GET', paths.state)).json());
    expect(edited.settings).toMatchObject({ theme: 'light', shell: '/bin/sh', defaultFolder: folder });
    expect(edited.settings.font.size).toBe(15);

    const { session } = await createSession();
    await waitForRefreshed(() => {
      const current = canvas.state.sessions.find((s) => s.id === session.id);
      // Not the user's own shell: `sh` (which some systems run as bash or dash).
      return current?.cwd === folder && ['sh', 'bash', 'dash'].includes(current.command ?? '');
    }, 'configured shell in the configured folder');
  });
});

describe('sessions started from another terminal', () => {
  it('starts in the given folder, with a unique name taken from it, and types a command', async () => {
    const folder = await realpath(dir);
    const body = { name: 'api', uniqueName: true, cwd: folder, command: 'echo "typed-""for-you"' };
    const first = CreateSessionResponse.parse((await request('POST', paths.sessions, { body })).json());
    const second = CreateSessionResponse.parse((await request('POST', paths.sessions, { body })).json());
    expect([first.session.name, second.session.name]).toEqual(['api', 'api 2']);
    expect(first.session.cwd).toBe(folder);

    const started = Date.now();
    while (!(await runtime.snapshot(first.session.id)).includes('typed-for-you')) {
      if (Date.now() - started > 15_000) throw new Error('The command was never typed');
      await sleep(40);
    }
  });

  it('refuses a folder that does not exist, and creates nothing', async () => {
    const response = await request('POST', paths.sessions, { body: { cwd: path.join(dir, 'missing') } });
    expect(response.statusCode).toBe(400);
    expect((await request('POST', paths.sessions, { body: { cwd: 'relative/path' } })).statusCode).toBe(400);
    expect(canvas.state.sessions).toEqual([]);
    expect(await runtime.list()).toEqual([]);
  });

  it('passes arguments for the agent through, in place of the default, and types no separate command', async () => {
    const body = { agent: 'claude-code', agentArgs: ['--resume', 'abc-123', '--fork-session'], command: 'echo "should-not-""run"' };
    const { session } = CreateSessionResponse.parse((await request('POST', paths.sessions, { body })).json());
    const started = Date.now();
    while (!(await runtime.snapshot(session.id)).includes('agent-launched:--resume:abc-123:--fork-session')) {
      if (Date.now() - started > 15_000) throw new Error('The launch line was never run');
      await sleep(40);
    }
    expect(await runtime.snapshot(session.id)).not.toContain('should-not-run');
  });

  it('can continue an agent conversation in the new session', async () => {
    const body = { agent: 'claude-code', agentContinue: true, name: 'api', uniqueName: true };
    const { session } = CreateSessionResponse.parse((await request('POST', paths.sessions, { body })).json());
    expect(session.name).toBe('api');
    const started = Date.now();
    while (!(await runtime.snapshot(session.id)).includes('agent-launched:--continue')) {
      if (Date.now() - started > 15_000) throw new Error('The launch line was never run');
      await sleep(40);
    }
  });
});

describe('terminals outside the canvas', () => {
  const CONVERSATION = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
  let folder: string;

  const shell = (tty: string, extra: Partial<ScannedShell> = {}): ScannedShell => ({
    tty,
    pid: 100,
    cwd: folder,
    running: null,
    runningPid: null,
    looksLikeClaude: false,
    viewingAubergine: false,
    current: false,
    ...extra,
  });
  const record = (pid: number, extra: Partial<ClaudeSession> = {}): ClaudeSession => ({
    pid,
    conversationId: CONVERSATION,
    cwd: folder,
    status: 'idle',
    entrypoint: 'cli',
    name: 'fix the build',
    processStart: new Date('2026-11-10T17:41:56Z'),
    ...extra,
  });

  beforeEach(async () => {
    folder = await realpath(dir);
    outsideWorld.terminated = [];
    outsideWorld.exits = true;
    outsideWorld.shells = [
      shell('ttys001', { pid: 101 }),
      shell('ttys002', { pid: 102, running: 'npm run dev', runningPid: 202 }),
      shell('ttys003', { pid: 103, running: 'claude', runningPid: 203, looksLikeClaude: true }),
      shell('ttys004', { pid: 104, running: 'claude', runningPid: 204, looksLikeClaude: true }),
      shell('ttys005', { pid: 105, running: 'tmux -L x attach', runningPid: 205, viewingAubergine: true }),
    ];
    outsideWorld.records = new Map([
      [203, record(203)],
      [204, record(204, { status: 'busy', name: null })],
    ]);
  });

  const launched = async (sessionId: string, text: string): Promise<void> => {
    const started = Date.now();
    while (!(await runtime.snapshot(sessionId)).includes(text)) {
      if (Date.now() - started > 15_000) throw new Error(`Never typed: ${text}`);
      await sleep(40);
    }
  };

  it('lists them with what is running and, for agents, the conversation and state', async () => {
    const { terminals } = OutsideResponse.parse((await request('GET', paths.outside)).json());
    expect(terminals.map((t) => [t.tty, t.kind, t.agent?.status ?? null, t.agent?.name ?? null])).toEqual([
      ['ttys001', 'shell', null, null],
      ['ttys002', 'command', null, null],
      ['ttys003', 'agent', 'idle', 'fix the build'],
      ['ttys004', 'agent', 'busy', null],
      ['ttys005', 'view', null, null],
    ]);
    // The conversation's ID is not part of the listing.
    expect(JSON.stringify(terminals)).not.toContain(CONVERSATION);
  });

  it('adds one terminal to the canvas, in the folder the daemon itself found', async () => {
    const elsewhere = os.tmpdir();
    const response = await request('POST', paths.outsideAdd, {
      // The extra fields are a client trying to choose the folder and command itself.
      body: { tty: 'ttys001', pid: 101, cwd: elsewhere, command: 'echo "should-not-""run"', agentArgs: ['--x'] },
    });
    expect(response.statusCode).toBe(201);
    const result = OutsideResult.parse(response.json());
    expect(result.session?.cwd).toBe(folder);
    expect(result.session?.name).toBe(path.basename(folder));
    expect(result.message).toContain('aubergine attach');
    await shellReady(result.session!.id);
    await sleep(300);
    expect(await runtime.snapshot(result.session!.id)).not.toContain('should-not-run');

    const running = OutsideResult.parse((await request('POST', paths.outsideAdd, { body: { tty: 'ttys002', pid: 102 } })).json());
    expect(running.message).toContain('a running command cannot be moved');
  });

  it('refuses a terminal that is gone, changed, or already a view', async () => {
    expect((await request('POST', paths.outsideAdd, { body: { tty: 'ttys099', pid: 101 } })).statusCode).toBe(404);
    expect((await request('POST', paths.outsideAdd, { body: { tty: 'ttys001', pid: 999 } })).statusCode).toBe(404);
    expect((await request('POST', paths.outsideAdd, { body: { tty: 'ttys005', pid: 105 } })).statusCode).toBe(409);
    expect((await request('POST', paths.outsideAdd, { body: { tty: 'tty; rm -rf', pid: 101 } })).statusCode).toBe(400);
    expect(canvas.state.sessions).toEqual([]);
  });

  it('forks an agent conversation, using the ID from the record and leaving the original alone', async () => {
    const response = await request('POST', paths.outsideMove, {
      body: { tty: 'ttys003', pid: 203, mode: 'fork', conversationId: 'attacker-chosen-id', cwd: '/' },
    });
    expect(response.statusCode).toBe(200);
    const result = OutsideResult.parse(response.json());
    expect(result.session?.cwd).toBe(folder);
    expect(result.message).toContain('two agents with the same history');
    await launched(result.session!.id, `agent-launched:--resume:${CONVERSATION}:--fork-session`);
    expect(outsideWorld.terminated).toEqual([]);
  });

  it('only says what it would do for a dry run', async () => {
    const response = await request('POST', paths.outsideMove, { body: { tty: 'ttys003', pid: 203, mode: 'stop', dryRun: true } });
    expect(OutsideResult.parse(response.json())).toMatchObject({ session: null, node: null });
    expect(response.json().message).toContain('ask the original (process 203) to exit');
    expect(outsideWorld.terminated).toEqual([]);
    expect(canvas.state.sessions).toEqual([]);
  });

  it('stops an idle agent and resumes its conversation', async () => {
    const response = await request('POST', paths.outsideMove, { body: { tty: 'ttys003', pid: 203, mode: 'stop' } });
    expect(response.statusCode).toBe(200);
    const result = OutsideResult.parse(response.json());
    expect(outsideWorld.terminated).toEqual([203]);
    expect(result.message).toContain('The original has exited');
    await launched(result.session!.id, `agent-launched:--resume:${CONVERSATION}`);
    expect(await runtime.snapshot(result.session!.id)).not.toContain('fork-session');
  });

  it('refuses to stop a busy agent, one whose process changed, and one that will not exit', async () => {
    const busy = await request('POST', paths.outsideMove, { body: { tty: 'ttys004', pid: 204, mode: 'stop' } });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.message).toContain('busy, not idle');

    // The pid in the request must be the agent the daemon sees on that terminal.
    expect((await request('POST', paths.outsideMove, { body: { tty: 'ttys003', pid: 204, mode: 'stop' } })).statusCode).toBe(404);
    expect((await request('POST', paths.outsideMove, { body: { tty: 'ttys001', pid: 101, mode: 'fork' } })).statusCode).toBe(404);

    outsideWorld.exits = false;
    const stubborn = await request('POST', paths.outsideMove, { body: { tty: 'ttys003', pid: 203, mode: 'stop' } });
    expect(stubborn.statusCode).toBe(409);
    expect(stubborn.json().error.message).toContain('did not exit when asked');
    expect(outsideWorld.terminated).toEqual([203]); // asked once, nothing stronger
    expect(canvas.state.sessions).toEqual([]);
  });

  it('never accepts a session token: these routes take the cookie only', async () => {
    const { session } = await createSession();
    const headers = { authorization: `Bearer ${sessionToken(token, session.id)}` };
    for (const [method, url, body] of [
      ['GET', paths.outside, undefined],
      ['POST', paths.outsideAdd, { tty: 'ttys001', pid: 101 }],
      ['POST', paths.outsideMove, { tty: 'ttys003', pid: 203, mode: 'stop' }],
    ] as const) {
      const response = await request(method, url, { cookie: false, origin: null, headers, ...(body ? { body } : {}) });
      expect([401, 403], `${method} ${url}`).toContain(response.statusCode);
      // Nor with the same token on the agent prefix.
      const viaAgentPrefix = await request(method, url.replace('/api/v1', '/v1'), { cookie: false, origin: null, headers, ...(body ? { body } : {}) });
      expect(viaAgentPrefix.statusCode, `${method} /v1…`).toBe(404);
    }
    expect(outsideWorld.terminated).toEqual([]);
    expect(canvas.state.sessions).toHaveLength(1);
  });
});

describe('showing a session', () => {
  it('tells every open canvas, and says how many there are', async () => {
    const { session } = await createSession();
    const none = await request('POST', paths.showSession(session.id), { body: {} });
    expect(none.json()).toEqual({ viewers: 0 });

    const socket = openSocket(paths.events);
    const messages: EventsServerMessage[] = [];
    socket.on('message', (data) => messages.push(EventsServerMessage.parse(JSON.parse(data.toString()))));
    await waitFor(() => messages.length === 1, 'hello');

    const one = await request('POST', paths.showSession(session.id), { body: {} });
    expect(one.json()).toEqual({ viewers: 1 });
    await waitFor(() => messages.length === 2, 'show');
    expect(messages[1]).toEqual({ type: 'show', sessionId: session.id });
    // Nothing about the session changed.
    expect(canvas.state.sessions[0]?.attention.state).toBe('none');

    socket.close();
    await waitFor(() => socket.readyState === WebSocket.CLOSED, 'closed');
    await sleep(50);
    expect((await request('POST', paths.showSession(session.id), { body: {} })).json()).toEqual({ viewers: 0 });
    expect((await request('POST', paths.showSession(newId()), { body: {} })).statusCode).toBe(404);
    expect((await request('POST', paths.showSession(session.id), { body: {}, cookie: false })).statusCode).toBe(401);
  });
});

describe('history search', () => {
  it('finds text printed in a parked session and leaves out sessions that ended', async () => {
    const parked = await createSession('quiet one');
    const ended = await createSession();
    for (const { session } of [parked, ended]) {
      const view = terminal(session.id);
      await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
      view.socket.send(JSON.stringify({ t: 'input', data: 'echo "find-""me-later"\r' }));
      await waitFor(() => view.text.includes('find-me-later'), 'output');
      view.socket.close();
    }
    await request('POST', paths.parkSession(parked.session.id), { body: {} });
    await runtime.kill(ended.session.id);
    await sessions.refresh();

    const response = await request('GET', `${paths.search}?q=find-me-later`);
    expect(response.statusCode).toBe(200);
    const { hits } = SearchResponse.parse(response.json());
    expect(hits.map((h) => [h.sessionId, h.text])).toEqual([[parked.session.id, 'find-me-later']]);

    expect((await request('GET', `${paths.search}?q=x`)).statusCode).toBe(400);
    expect((await request('GET', `${paths.search}?q=find-me-later`, { cookie: false })).statusCode).toBe(401);
    expect((await request('POST', paths.revealInSession(parked.session.id), { body: { text: 'find-me-later' } })).statusCode).toBe(204);
    expect((await request('POST', paths.revealInSession(newId()), { body: { text: 'x' } })).statusCode).toBe(404);
  });
});

describe('snapshots', () => {
  it('returns the visible screen as plain text', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(JSON.stringify({ t: 'input', data: 'echo "snap""shot-$((3 * 3))"\r' }));
    await waitFor(() => view.text.includes('snapshot-9'), 'output');
    view.socket.close();

    // No viewer is needed to take one.
    const response = await request('GET', paths.snapshot(session.id));
    expect(response.statusCode).toBe(200);
    const text = SnapshotResponse.parse(response.json()).text;
    expect(text).toContain('snapshot-9');
    expect(text).not.toContain('\u001b');

    expect((await request('GET', paths.snapshot(newId()))).statusCode).toBe(404);
    expect((await request('GET', paths.snapshot(session.id), { cookie: false })).statusCode).toBe(401);
  });
});

describe('frames and colors', () => {
  it('creates, edits and removes a frame, and saves it', async () => {
    const created = await request('POST', paths.frames, {
      body: { label: 'API', rect: { x: -40, y: -60, width: 1000, height: 700 } },
    });
    expect(created.statusCode).toBe(201);
    const frame = Frame.parse(created.json());
    const edited = await request('PUT', paths.frame(frame.id), {
      body: { x: -40, y: -60, width: 1200, height: 700, label: 'Backend', color: 'blue' },
    });
    expect(Frame.parse(edited.json())).toMatchObject({ label: 'Backend', color: 'blue', width: 1200 });

    await stop();
    await start();
    expect(canvas.state.layout.frames).toMatchObject([{ id: frame.id, label: 'Backend' }]);

    expect((await request('PUT', paths.frame(frame.id), { body: { x: 0, y: 0, width: 10, height: 10 } })).statusCode).toBe(400);
    expect((await request('DELETE', paths.frame(frame.id))).statusCode).toBe(204);
    expect((await request('DELETE', paths.frame(frame.id))).statusCode).toBe(404);
    expect(canvas.state.layout.frames).toEqual([]);
  });

  it('carries the nodes inside a frame when the frame moves', async () => {
    const inside = await createSession();
    await request('PUT', paths.node(inside.node.id), { body: { x: 0, y: 0, width: 720, height: 440 } });
    const outside = await createSession();
    await request('PUT', paths.node(outside.node.id), { body: { x: 3000, y: 0, width: 720, height: 440 } });
    const frame = Frame.parse(
      (await request('POST', paths.frames, { body: { rect: { x: -50, y: -50, width: 900, height: 600 } } })).json(),
    );

    await request('PUT', paths.frame(frame.id), { body: { x: 150, y: 50, width: 900, height: 600, carry: true } });
    const nodes = canvas.state.layout.nodes;
    expect(nodes.find((n) => n.id === inside.node.id)).toMatchObject({ x: 200, y: 100 });
    expect(nodes.find((n) => n.id === outside.node.id)).toMatchObject({ x: 3000, y: 0 });

    // Without `carry` (a resize, say) nothing else moves.
    await request('PUT', paths.frame(frame.id), { body: { x: 0, y: 0, width: 2000, height: 900 } });
    expect(canvas.state.layout.nodes.find((n) => n.id === inside.node.id)).toMatchObject({ x: 200, y: 100 });
  });

  it('colors a node and keeps the color when the node moves', async () => {
    const { node } = await createSession();
    await request('PUT', paths.node(node.id), { body: { x: 5, y: 5, width: 720, height: 440, color: 'green' } });
    await request('PUT', paths.node(node.id), { body: { x: 50, y: 5, width: 720, height: 440 } });
    expect(canvas.state.layout.nodes[0]).toMatchObject({ x: 50, color: 'green' });
    expect((await request('PUT', paths.node(node.id), { body: { x: 5, y: 5, width: 720, height: 440, color: 'pink' } })).statusCode).toBe(400);
  });
});

describe('restart', () => {
  it('restores sessions and layout, with the same shells still running', async () => {
    const { session, node } = await createSession('keeper');
    await request('PUT', paths.node(node.id), { body: { x: 111, y: 222, width: 800, height: 500 } });
    const before = terminal(session.id);
    await waitFor(() => before.socket.readyState === WebSocket.OPEN, 'open');
    before.socket.send(JSON.stringify({ t: 'input', data: 'SURVIVOR=yes-$((2 + 3))\r' }));
    before.socket.send(JSON.stringify({ t: 'input', data: 'echo "var"" set"\r' }));
    await waitFor(() => before.text.includes('var set'), 'variable set');

    await stop();
    await start();

    const body = StateResponse.parse((await request('GET', paths.state)).json());
    expect(body.state.sessions).toMatchObject([{ id: session.id, name: 'keeper', state: 'open' }]);
    expect(body.state.layout.nodes[0]).toMatchObject({ id: node.id, x: 111, y: 222 });

    const after = terminal(session.id);
    // The screen from before the restart is redrawn without any input.
    await waitFor(() => after.text.includes('var set'), 'redraw');
    after.socket.send(JSON.stringify({ t: 'input', data: 'echo "got=$SURVIVOR"\r' }));
    await waitFor(() => after.text.includes('got=yes-5'), 'variable survived');
  });

  it('after the shells are lost, starts fresh ones in their last folders without re-running anything', async () => {
    const { session, node } = await createSession();
    const ended = await createSession();
    const folder = await realpath(dir);
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(JSON.stringify({ t: 'input', data: `cd ${folder}\r` }));
    await waitForRefreshed(() => {
      return canvas.state.sessions[0]?.cwd === folder;
    }, 'folder noticed');
    await runtime.kill(ended.session.id);
    await sessions.refresh();

    await stop();
    await runtime.killServer(); // what a reboot does
    await start();

    expect(canvas.state.sessions.map((s) => [s.id, s.state])).toEqual([
      [session.id, 'open'],
      [ended.session.id, 'exited'],
    ]);
    expect(canvas.state.layout.nodes.map((n) => n.id)).toContain(node.id);
    const running = await runtime.list();
    expect(running.map((s) => s.id)).toEqual([session.id]); // the ended one stays ended
    await waitForRefreshed(() => {
      return canvas.state.sessions[0]?.cwd === folder;
    }, 'fresh shell in the last folder');
    expect((await runtime.list())[0]?.command).toMatch(/sh$/); // just a shell, nothing re-run
  });

  it('puts a running session back on the canvas when the saved state was lost', async () => {
    const { session } = await createSession();
    await stop();
    await rm(path.join(dir, 'state.json'));
    await start();
    expect(canvas.state.sessions.map((s) => s.id)).toEqual([session.id]);
    expect(canvas.state.layout.nodes).toHaveLength(1);
  });
});
