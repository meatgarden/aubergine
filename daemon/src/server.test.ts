import { mkdtemp, rm, stat } from 'node:fs/promises';
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
  StateResponse,
  newId,
  paths,
  type ChangeEvent,
} from '@aubergine/shared';
import { Canvas } from './canvas';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

const runtime = new TmuxRuntime({ socket: 'aubergine-test-server' });
let dir: string;
let token: string;
let app: FastifyInstance;
let canvas: Canvas;
let port: number;
let origin: string;
const sockets: WebSocket[] = [];

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  canvas = new Canvas(await store.load(), store);
  const sessions = new Sessions(canvas, runtime);
  await sessions.reconcile();
  app = await buildServer({
    canvas,
    sessions,
    runtime,
    token,
    devOrigin: null,
    webDist: path.join(dir, 'no-web-build'),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
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

async function createSession(name?: string): Promise<CreateSessionResponse> {
  const response = await request('POST', paths.sessions, { body: name ? { name } : {} });
  expect(response.statusCode).toBe(201);
  return CreateSessionResponse.parse(response.json());
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
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await runtime.killServer();
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
    expect(second.node.x).toBeGreaterThanOrEqual(node.x + node.width);

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

  it('removes the session when its shell exits', async () => {
    const { session } = await createSession();
    const view = terminal(session.id);
    await waitFor(() => view.socket.readyState === WebSocket.OPEN, 'open');
    view.socket.send(JSON.stringify({ t: 'input', data: 'exit\r' }));
    await waitFor(() => view.closeCode !== null, 'close');
    expect(view.closeCode).toBe(CLOSE_SESSION_ENDED);
    expect(view.control).toContainEqual({ t: 'exit', reason: 'session_ended' });
    expect(canvas.state.sessions).toEqual([]);
    expect(canvas.state.layout.nodes).toEqual([]);
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
    expect(body.state.sessions).toEqual([{ ...session, name: 'keeper' }]);
    expect(body.state.layout.nodes[0]).toMatchObject({ id: node.id, x: 111, y: 222 });

    const after = terminal(session.id);
    // The screen from before the restart is redrawn without any input.
    await waitFor(() => after.text.includes('var set'), 'redraw');
    after.socket.send(JSON.stringify({ t: 'input', data: 'echo "got=$SURVIVOR"\r' }));
    await waitFor(() => after.text.includes('got=yes-5'), 'variable survived');
  });

  it('starts a fresh shell for a saved session whose shell is gone', async () => {
    const { session, node } = await createSession();
    await stop();
    await runtime.killServer();
    await start();
    expect(canvas.state.sessions.map((s) => s.id)).toEqual([session.id]);
    expect(canvas.state.layout.nodes.map((n) => n.id)).toEqual([node.id]);
    expect(await runtime.has(session.id)).toBe(true);
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
