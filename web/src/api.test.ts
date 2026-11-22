import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, DEFAULT_SETTINGS, PROTOCOL_VERSION, paths } from '@aubergine/shared';
import { NotUnderstood, Superseded, api, openSocket, pairWith, requestFor, showTarget, socketAddress, subscribeToEvents, whenRefused, type LinkedTarget } from './api';

/**
 * The two targets of the page's requests, with a stand-in `fetch` and a stand-in socket: where a linked server's
 * credential goes, what goes with it, and that nothing that arrives for a server no longer shown lands anywhere.
 */

const LINKED: LinkedTarget = { id: 'abcd1234', address: 'https://cloud.example.test', credential: 'aubd_made-up-credential' };
const OTHER: LinkedTarget = { id: 'wxyz9876', address: 'http://127.0.0.1:4700', credential: 'aubd_another-made-up-one' };

const state = createInitialState(new Date('2026-06-01T09:00:00.000Z'));
const stateAnswer = (): Response =>
  new Response(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, runtime: { status: 'ok', version: '3.4', minVersion: '3.2' }, settings: DEFAULT_SETTINGS, state, defaultCanvasId: state.canvases[0]!.id, here: false, epoch: 'e', revision: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });

interface Sent {
  url: string;
  init: RequestInit;
}
let sent: Sent[] = [];
let answer: (sent: Sent) => Promise<Response> = async () => stateAnswer();

/** A socket that opens nothing: it keeps its address, and what was done to it. */
class StandInSocket {
  static made: StandInSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  closed = false;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  binaryType = 'blob';
  constructor(readonly url: string) {
    StandInSocket.made.push(this);
  }
  send(): void {}
  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  sent = [];
  StandInSocket.made = [];
  answer = async () => stateAnswer();
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    const one = { url, init };
    sent.push(one);
    return answer(one);
  });
  vi.stubGlobal('WebSocket', StandInSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:4600', origin: 'http://127.0.0.1:4600' });
  vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined });
});

afterEach(() => {
  showTarget(null);
  vi.unstubAllGlobals();
});

const headersOf = (one: Sent): Headers => new Headers(one.init.headers);

describe('the one place a request is made', () => {
  it('for the own server: a path of the page, its cookie, and no credential of anyone else', () => {
    const made = requestFor(null, '/api/v1/state', { headers: { authorization: 'Bearer smuggled' } });
    expect(made.url).toBe('/api/v1/state');
    expect(made.init.credentials).toBe('same-origin');
    expect(new Headers(made.init.headers).has('authorization')).toBe(false);
  });

  it('for a linked server: its own origin, its credential, no cookie, no redirect', () => {
    const made = requestFor(LINKED, '/v1/canvases?limit=5');
    expect(made.url).toBe('https://cloud.example.test/v1/canvases?limit=5');
    expect(new Headers(made.init.headers).get('authorization')).toBe(`Bearer ${LINKED.credential}`);
    expect([made.init.credentials, made.init.redirect, made.init.mode]).toEqual(['omit', 'error', 'cors']);
  });

  it('refuses, and sends nothing, where the credential would go anywhere but its server', () => {
    for (const path of ['https://elsewhere.example.test/v1', '//elsewhere.example.test/v1', 'v1/canvases', '', '\\\\elsewhere.example.test/v1', '/\\elsewhere.example.test/v1']) {
      expect(() => requestFor(LINKED, path), path).toThrow();
    }
    expect(() => requestFor(null, '//elsewhere.example.test/v1')).toThrow();
    expect(() => requestFor(null, '/\\elsewhere.example.test/v1')).toThrow();
  });
});

describe('the server shown', () => {
  it('is where every call goes, the hand-written ones and the generated client’s, with the credential only there', async () => {
    showTarget(LINKED);
    await api.getState();
    answer = async () => new Response(JSON.stringify({ kinds: [], perServer: '' }), { status: 200 });
    await api.getSharing();
    expect(sent.map((one) => one.url)).toEqual([`${LINKED.address}${paths.state}`, `${LINKED.address}/v1/sharing`]);
    for (const one of sent) {
      expect(headersOf(one).get('authorization')).toBe(`Bearer ${LINKED.credential}`);
      expect([one.init.credentials, one.init.redirect]).toEqual(['omit', 'error']);
    }
    // Back to the own server: no credential at all, and the page's own paths.
    sent = [];
    showTarget(null);
    answer = async () => stateAnswer();
    await api.getState();
    expect(sent[0]!.url).toBe(paths.state);
    expect(headersOf(sent[0]!).has('authorization')).toBe(false);
    expect(sent[0]!.init.credentials).toBe('same-origin');
  });

  it('drops an answer, and a failure, that arrive after another server was shown', async () => {
    let release: (response: Response) => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    showTarget(LINKED);
    answer = () => new Promise<Response>((resolve) => (release = resolve));
    const asked = api.getState();
    showTarget(OTHER);
    release(stateAnswer());
    await expect(asked).rejects.toBeInstanceOf(Superseded);

    answer = () => new Promise<Response>((_resolve, reject) => (fail = reject));
    const failing = api.getState();
    showTarget(null);
    fail(new TypeError('Failed to fetch'));
    await expect(failing).rejects.toBeInstanceOf(Superseded);
  });

  it('says once, to whoever listens, that a linked server no longer takes the credential; never for the own server', async () => {
    const told: string[] = [];
    whenRefused(() => told.push('refused'));
    answer = async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Missing or wrong credential for a linked page' } }), { status: 401 });
    showTarget(LINKED);
    await expect(api.getState()).rejects.toMatchObject({ status: 401 });
    expect(told).toEqual(['refused']);
    showTarget(null);
    await expect(api.getState()).rejects.toMatchObject({ status: 401 });
    expect(told).toEqual(['refused']);
    whenRefused(() => undefined);
  });

  it('takes an answer it does not understand for another version', async () => {
    showTarget(LINKED);
    answer = async () => new Response(JSON.stringify({ protocolVersion: PROTOCOL_VERSION + 1, state: {} }), { status: 200 });
    await expect(api.getState()).rejects.toBeInstanceOf(NotUnderstood);
  });
});

describe('sockets', () => {
  it('at a linked server: a fresh ticket for every one, beside the query its path has, ws for plain http', async () => {
    let n = 0;
    answer = async () => new Response(JSON.stringify({ ticket: `ticket-${(n += 1)}`, expiresAt: '2026-06-01T09:00:30.000Z' }), { status: 201 });
    showTarget(LINKED);
    const first = (await openSocket(`${paths.terminal('s1')}?cols=80&rows=24`)) as unknown as StandInSocket;
    const again = (await openSocket(paths.events)) as unknown as StandInSocket;
    expect(sent.map((one) => [one.url, one.init.method])).toEqual([
      [`${LINKED.address}${paths.socketTickets}`, 'POST'],
      [`${LINKED.address}${paths.socketTickets}`, 'POST'],
    ]);
    expect(first.url).toBe('wss://cloud.example.test/ws/v1/terminal/s1?cols=80&rows=24&ticket=ticket-1');
    expect(again.url).toBe('wss://cloud.example.test/ws/v1/events?ticket=ticket-2');
    expect(socketAddress('http://127.0.0.1:4700', '/ws/v1/events', 'a b')).toBe('ws://127.0.0.1:4700/ws/v1/events?ticket=a+b');
    expect(() => socketAddress(LINKED.address, '//elsewhere.example.test/ws', 't')).toThrow();
  });

  it('at the own server: no ticket, the page’s own host', async () => {
    const socket = (await openSocket(paths.events)) as unknown as StandInSocket;
    expect(sent).toEqual([]);
    expect(socket.url).toBe('ws://127.0.0.1:4600/ws/v1/events');
  });

  it('opened for a server no longer shown: what it says is ignored, and it is closed', async () => {
    answer = async () => new Response(JSON.stringify({ ticket: 't', expiresAt: '2026-06-01T09:00:30.000Z' }), { status: 201 });
    showTarget(LINKED);
    const heard: string[] = [];
    const subscription = subscribeToEvents({ onReady: () => heard.push('ready'), onEvent: () => heard.push('event'), onShow: () => heard.push('show'), onShowCanvas: () => heard.push('show-canvas'), onDown: () => heard.push('down') });
    await vi.waitFor(() => expect(StandInSocket.made).toHaveLength(1));
    const socket = StandInSocket.made[0]!;
    socket.onmessage?.({ data: JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION }) });
    expect(heard).toEqual(['ready']);
    showTarget(OTHER);
    socket.onmessage?.({ data: JSON.stringify({ type: 'event', event: { type: 'canvas.removed', canvasId: state.canvases[0]!.id }, revision: 1 }) });
    socket.onclose?.();
    expect(heard).toEqual(['ready']);
    expect(socket.closed).toBe(true);
    subscription.stop();
  });

  it('a ticket refused: told, and not asked for again', async () => {
    const told: string[] = [];
    whenRefused(() => told.push('refused'));
    answer = async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Missing or wrong credential for a linked page' } }), { status: 401 });
    showTarget(LINKED);
    await expect(openSocket(paths.events)).rejects.toMatchObject({ status: 401 });
    expect(told).toEqual(['refused']);
    expect(StandInSocket.made).toEqual([]);
    whenRefused(() => undefined);
  });
});

describe('pairing with another server', () => {
  it('sends the code in the body to that server alone, with no credential, cookie or redirect', async () => {
    answer = async () => new Response(JSON.stringify({ credential: 'aubd_new', device: { id: '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee', name: 'Laptop' }, protocolVersion: PROTOCOL_VERSION }), { status: 200 });
    const paired = await pairWith('https://cloud.example.test', 'ABCDE12345');
    expect(paired.credential).toBe('aubd_new');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://cloud.example.test/auth/pair');
    expect(sent[0]!.url).not.toContain('ABCDE');
    expect(JSON.parse(String(sent[0]!.init.body))).toEqual({ code: 'ABCDE12345' });
    expect([sent[0]!.init.credentials, sent[0]!.init.redirect]).toEqual(['omit', 'error']);
    expect(headersOf(sent[0]!).has('authorization')).toBe(false);
  });

  it('says the other server’s own sentence, the time to wait, or that no answer came', async () => {
    answer = async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'That code did not work.' } }), { status: 401 });
    await expect(pairWith('https://cloud.example.test', 'ABCDE12345')).rejects.toMatchObject({ status: 401, message: 'That code did not work.' });
    answer = async () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'Too many' } }), { status: 429, headers: { 'retry-after': '42' } });
    await expect(pairWith('https://cloud.example.test', 'ABCDE12345')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42 });
    answer = async () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(pairWith('https://cloud.example.test', 'ABCDE12345')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});
