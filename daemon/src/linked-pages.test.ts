import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  CreateSessionResponse,
  CreatedToken,
  DEVICE_PREFIX,
  DeviceList,
  GRANTABLE_SCOPES,
  PROTOCOL_VERSION,
  PairedPage,
  PairingCodeAnswer,
  Settings,
  SocketTicket,
  StateResponse,
  CUSTOM_CSS_PATH,
  NO_PLUGINS_ANSWER,
  pluginFileHref,
  newId,
  paths,
  publicPaths,
  type ActivityEntry,
} from '@aubergine/shared';
import { ACTIVITY_FILE, FileActivityLog } from './activity';
import { StylesheetFile } from './custom-css';
import { PluginFolder } from './plugins';
import { sessionToken } from './auth';
import type { DesktopOpener } from './desktop/open';
import { TRIES_PER_MINUTE, WRONG_CODES_ALLOWED } from './pairing';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { NOT_AT_THIS_COMPUTER, buildServer, cookieName, deviceCookieName, everyRouteOf } from './server';
import { Sessions } from './sessions';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

/**
 * A linked page: the page of another Aubergine, at an origin written in access.pages, calling this server across
 * origins with a credential of its own. What it may send, what it is answered, how its sockets are signed in, and
 * that no cookie and no other credential is ever taken from it. Every host is made up; every request is injected or
 * sent to the test's own port on 127.0.0.1.
 */

const SOCKET = testSocketName('linked');
const runtime = new TmuxRuntime({ socket: SOCKET });

const OUTSIDE = 'https://aubergine.example.test';
const OUTSIDE_HOST = 'aubergine.example.test';
/** Two pages that may show this server: another Aubergine on this computer, and one elsewhere. */
const PAGE = 'http://127.0.0.1:4600';
const OTHER_PAGE = 'https://other.example.test';
const UNLISTED = 'https://unlisted.example.test';
const ALLOWED_HEADERS = 'authorization, content-type, idempotency-key, x-aubergine-project, x-aubergine-client';

let dir: string;
let token: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let here: string;
let localHost: string;
let now = Date.parse('2026-06-01T09:00:00.000Z');
let opened: string[] = [];
const sockets: WebSocket[] = [];

async function start(addresses: string[] = [OUTSIDE], pages: string[] = [PAGE, OTHER_PAGE]): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  sessions = new Sessions(hub, runtime, {});
  const web = path.join(dir, 'web');
  await mkdir(path.join(web, 'assets'), { recursive: true });
  await writeFile(path.join(web, 'index.html'), '<!doctype html><html lang="en"><head><title>Aubergine</title></head><body></body></html>\n');
  await writeFile(path.join(web, 'assets', 'app.js'), 'console.log("the page");\n');
  // The owner's own stylesheet is there, so that the walks reach its route with a file to give.
  await writeFile(path.join(dir, 'custom.css'), '[data-part="map"] { display: none; }\n');
  // And a plugin, switched on to follow changes, so that they reach its files with a plugin to give.
  await mkdir(path.join(dir, 'plugins', 'tickets'), { recursive: true });
  await writeFile(path.join(dir, 'plugins', 'tickets', 'plugin.json'), JSON.stringify({ name: 'Tickets', version: '1', runs: 'page', main: 'index.js', api: 1 }));
  await writeFile(path.join(dir, 'plugins', 'tickets', 'index.js'), 'export function activate() {}\n');
  const opener: DesktopOpener = {
    open: async (sessionId) => {
      opened.push(sessionId);
      return { ok: true, says: 'Opened.' };
    },
    forget: async () => {},
    sweep: async () => {},
  };
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: async () => Settings.parse({ access: { addresses, pages }, plugins: { on: { tickets: 'follow' } } }),
    token,
    devOrigin: null,
    webDist: web,
    activity: new FileActivityLog(dir, 1024 * 1024),
    desktop: opener,
    stylesheet: new StylesheetFile(dir),
    plugins: new PluginFolder(dir),
    now: () => now,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  here = `http://127.0.0.1:${port}`;
  localHost = `127.0.0.1:${port}`;
}

beforeAll(async () => {
  await runtime.killServer();
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-linked-'));
  token = await loadOrCreateToken(dir);
  now = Date.parse('2026-06-01T09:00:00.000Z');
  opened = [];
  await start();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await hub.flush();
  await app.close();
  await runtime.killServer();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

afterAll(async () => {
  await destroyTmuxServer(runtime, SOCKET);
});

interface Answer {
  status: number;
  body: string;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- answers are checked field by field
  headers: Record<string, string | string[] | undefined>;
}

async function send(method: string, url: string, headers: Record<string, string | undefined>, body?: unknown): Promise<Answer> {
  const clean = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)) as Record<string, string>;
  const response = await app.inject({ method: method as 'GET', url, headers: clean, ...(body === undefined ? {} : typeof body === 'string' ? { payload: body } : { payload: body as object }) });
  let json: unknown = null;
  try {
    json = JSON.parse(response.body);
  } catch {
    // Not JSON: the page, or nothing.
  }
  return { status: response.statusCode, body: response.body, json, headers: response.headers as Answer['headers'] };
}

const masterCookie = (): string => `${cookieName(port)}=${token}`;
const deviceCookie = (secret: string): string => `${deviceCookieName(port)}=${secret}`;
const bearer = (secret: string): string => `Bearer ${secret}`;

const asOwnerHere = (method: string, url: string, body?: unknown): Promise<Answer> => send(method, url, { host: localHost, origin: here, cookie: masterCookie(), 'sec-fetch-site': 'same-origin' }, body);
const fromOutside = (method: string, url: string, headers: Record<string, string | undefined> = {}, body?: unknown): Promise<Answer> => send(method, url, { host: OUTSIDE_HOST, origin: OUTSIDE, ...headers }, body);
/** A request from a linked page: by default the one on this computer, under this server's own local name. */
const fromPage = (method: string, url: string, headers: Record<string, string | undefined> = {}, body?: unknown): Promise<Answer> => send(method, url, { host: localHost, origin: PAGE, 'sec-fetch-site': 'cross-site', ...headers }, body);

async function makePageCode(origin: string = PAGE, name = 'Laptop'): Promise<string> {
  const made = await asOwnerHere('POST', paths.pairingCodes, { name, kind: 'page', origin });
  expect(made.status, made.body).toBe(201);
  return PairingCodeAnswer.parse(made.json).code;
}

async function pairPage(origin: string = PAGE, name = 'Laptop'): Promise<{ credential: string; id: string }> {
  const answer = await fromPage('POST', paths.pair, { origin }, { code: await makePageCode(origin, name) });
  expect(answer.status, answer.body).toBe(200);
  const paired = PairedPage.parse(answer.json);
  now += 1000;
  return { credential: paired.credential, id: paired.device.id };
}

async function pairBrowser(): Promise<string> {
  const made = await asOwnerHere('POST', paths.pairingCodes, { name: 'Phone', kind: 'browser' });
  const answer = await fromOutside('POST', paths.pair, {}, { code: PairingCodeAnswer.parse(made.json).code });
  expect(answer.status).toBe(204);
  const set = [answer.headers['set-cookie'] ?? []].flat().find((line) => line.startsWith(`${deviceCookieName(port)}=`))!;
  now += 1000;
  return decodeURIComponent(set.split(';')[0]!.split('=')[1]!);
}

async function makeToken(scopes: string[]): Promise<string> {
  const made = await asOwnerHere('POST', publicPaths.tokens, { name: `t${Math.random()}`, scopes, reach: { kind: 'all' }, reviewWorkflowChanges: true });
  expect(made.status).toBe(201);
  return CreatedToken.parse(made.json).secret;
}

async function ticketFor(credential: string, origin: string = PAGE): Promise<string> {
  const answer = await fromPage('POST', paths.socketTickets, { origin, authorization: bearer(credential) });
  expect(answer.status, answer.body).toBe(201);
  return SocketTicket.parse(answer.json).ticket;
}

function openSocket(urlPath: string, headers: Record<string, string>, origin: string): WebSocket {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${urlPath}`, { headers, origin });
  sockets.push(socket);
  return socket;
}

function upgradeStatus(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.on('open', () => resolve(101));
    socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    socket.on('error', reject);
  });
}

const withTicket = (urlPath: string, ticket: string): string => `${urlPath}${urlPath.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`;

/** The CORS headers of an answer, by name. */
const corsOf = (answer: Answer): Record<string, unknown> => Object.fromEntries(Object.entries(answer.headers).filter(([name]) => name.startsWith('access-control-')));

/** What every answer to a linked page carries, refusals included. */
function expectCorsAnswer(answer: Answer, origin: string = PAGE): void {
  expect(corsOf(answer)).toEqual({ 'access-control-allow-origin': origin, 'access-control-expose-headers': 'retry-after' });
  expect(answer.headers.vary).toBe('Origin');
  expect(answer.headers['set-cookie']).toBeUndefined();
}

const activityLines = async (): Promise<ActivityEntry[]> =>
  (await readFile(path.join(dir, ACTIVITY_FILE), 'utf8').catch(() => ''))
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as ActivityEntry);

describe('CORS', () => {
  it('answers a preflight from a listed origin with exactly that origin, on every path and Host, and nothing more', async () => {
    for (const origin of [PAGE, OTHER_PAGE]) {
      for (const host of [localHost, OUTSIDE_HOST]) {
        for (const url of [publicPaths.canvases, paths.state, paths.pair, paths.events, paths.socketTickets, '/', '/no-such-thing']) {
          const answer = await send('OPTIONS', url, { host, origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' });
          expect(answer.status, `${origin} ${host} ${url}`).toBe(204);
          expect(corsOf(answer)).toEqual({
            'access-control-allow-origin': origin,
            'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
            'access-control-allow-headers': ALLOWED_HEADERS,
            'access-control-max-age': '600',
          });
          expect(answer.headers.vary).toBe('Origin');
          expect(answer.headers['set-cookie']).toBeUndefined();
          expect(answer.body).toBe('');
        }
      }
    }
  });

  it('says nothing of CORS to an origin that is not listed, to no origin, or to the page this server served', async () => {
    const { credential } = await pairPage();
    const answers = [
      await send('OPTIONS', publicPaths.canvases, { host: localHost, origin: UNLISTED, 'access-control-request-method': 'GET' }),
      await send('GET', publicPaths.canvases, { host: localHost, origin: UNLISTED, authorization: bearer(credential) }),
      await send('OPTIONS', publicPaths.canvases, { host: localHost, 'access-control-request-method': 'GET' }),
      await send('GET', publicPaths.canvases, { host: localHost, authorization: bearer(credential) }),
      await asOwnerHere('GET', paths.state),
      await asOwnerHere('GET', publicPaths.canvases),
      await send('OPTIONS', publicPaths.canvases, { host: localHost, origin: here, 'access-control-request-method': 'GET' }),
      await fromOutside('GET', paths.state, { cookie: deviceCookie(await pairBrowser()) }),
    ];
    expect(answers[0]!.status).toBe(403);
    expect(answers[1]!.status).toBe(403);
    for (const answer of answers) {
      expect(corsOf(answer)).toEqual({});
      expect(answer.headers.vary).toBeUndefined();
    }
  });

  it('puts the origin on an ordinary answer and on every refusal and error, and never says "*" or credentials', async () => {
    const { credential, id } = await pairPage();
    const ok = await fromPage('GET', publicPaths.canvases, { authorization: bearer(credential) });
    expect(ok.status).toBe(200);
    expectCorsAnswer(ok);
    const refusals: [number, Answer][] = [
      [401, await fromPage('GET', publicPaths.canvases)],
      [401, await fromPage('GET', paths.state, { authorization: 'Bearer nonsense' })],
      [403, await fromPage('GET', '/')],
      [403, await fromPage('POST', paths.sessions, { authorization: bearer(credential) }, { desktop: true }).then(async (made) => fromPage('POST', `/v1/sessions/${CreateSessionResponse.parse(made.json).session.id}/desktop`, { authorization: bearer(credential) }, {}))],
      [404, await fromPage('GET', '/api/v1/no-such-thing', { authorization: bearer(credential) })],
      [404, await fromPage('DELETE', paths.device(newId()), { authorization: bearer(credential) })],
      [400, await fromPage('POST', publicPaths.canvases, { authorization: bearer(credential) }, { name: 7 })],
    ];
    for (let n = 0; n < TRIES_PER_MINUTE; n += 1) await fromPage('POST', paths.pair, {}, { code: 'nope' });
    const limited = await fromPage('POST', paths.pair, {}, { code: 'nope' });
    refusals.push([429, limited]);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    for (const [status, answer] of refusals) {
      expect(answer.status, answer.body).toBe(status);
      expectCorsAnswer(answer);
    }
    for (const answer of [ok, ...refusals.map(([, a]) => a)]) {
      expect(JSON.stringify(answer.headers)).not.toContain('"*"');
      expect(answer.headers['access-control-allow-credentials']).toBeUndefined();
    }
    expect(hub.state.devices.find((d) => d.id === id)?.revokedAt).toBeNull();
  });

  it('answers a preflight without reaching any route: nothing made, nothing counted, nothing written', async () => {
    const before = await activityLines();
    const code = await makePageCode();
    await expect.poll(async () => (await activityLines()).length, { timeout: 5000 }).toBe(before.length + 1);
    for (let n = 0; n < TRIES_PER_MINUTE + 5; n += 1) {
      for (const [method, url] of [['POST', paths.pair], ['POST', paths.sessions], ['POST', publicPaths.canvases], ['DELETE', paths.device(newId())], ['POST', paths.socketTickets]] as const) {
        expect((await send('OPTIONS', url, { host: localHost, origin: PAGE, 'access-control-request-method': method })).status).toBe(204);
      }
    }
    // No try at a code was counted: the code still works, and no limit was reached.
    expect((await fromPage('POST', paths.pair, {}, { code })).status).toBe(200);
    expect(hub.state.sessions).toEqual([]);
    expect(hub.state.canvases).toHaveLength(1);
    await expect.poll(async () => (await activityLines()).length, { timeout: 5000 }).toBe(before.length + 2);
    await sleep(50);
    expect((await activityLines()).map((line) => `${line.caller} ${line.route}`)).toEqual(['owner /api/v1/pairing-codes', 'pairing /auth/pair']);
  });
});

describe('a page device’s credential', () => {
  it('makes the caller the owner, as a bearer from its own origin, on /v1 and /api, whatever the Host', async () => {
    const { credential, id } = await pairPage();
    const root = await fromPage('GET', publicPaths.root, { authorization: bearer(credential) });
    expect(root.json.caller).toEqual({ kind: 'user' });
    expect((await fromPage('POST', publicPaths.canvases, { authorization: bearer(credential) }, { name: 'From the page' })).status).toBe(201);
    expect(hub.state.canvases.map((c) => c.name)).toContain('From the page');
    const state = await fromPage('GET', paths.state, { authorization: bearer(credential) });
    expect(state.status).toBe(200);
    // Never at this computer, though it came in under this computer's own name.
    expect(StateResponse.parse(state.json).here).toBe(false);
    expect(hub.state.devices.find((d) => d.id === id)?.lastUsedAt).toBe(new Date(now).toISOString());
    // Under the outside address too: Host says where it came in, the Origin that it is a linked page.
    const outside = await fromPage('GET', paths.state, { host: OUTSIDE_HOST, authorization: bearer(credential) });
    expect(outside.status).toBe(200);
    expect(outside.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(StateResponse.parse(outside.json).here).toBe(false);
    // A valid credential with the owner's cookie beside it: the cookie is not looked at, the credential decides.
    expect((await fromPage('GET', paths.state, { authorization: bearer(credential), cookie: masterCookie() })).status).toBe(200);
  });

  it('works from its own origin and nowhere else, and never as a cookie', async () => {
    const { credential } = await pairPage();
    const tries: [string, Record<string, string | undefined>][] = [
      ['the other listed origin', { host: localHost, origin: OTHER_PAGE, authorization: bearer(credential) }],
      ['no Origin', { host: localHost, origin: undefined, authorization: bearer(credential) }],
      ['this server’s own origin', { host: localHost, origin: here, authorization: bearer(credential) }],
      ['the outside address’s own origin', { host: OUTSIDE_HOST, origin: OUTSIDE, authorization: bearer(credential) }],
      ['as a device cookie from outside', { host: OUTSIDE_HOST, origin: OUTSIDE, cookie: deviceCookie(credential) }],
      ['as a device cookie from its origin', { host: localHost, origin: PAGE, cookie: deviceCookie(credential) }],
      ['as the access token’s cookie', { host: localHost, origin: here, cookie: `${cookieName(port)}=${credential}` }],
    ];
    for (const [what, headers] of tries) {
      for (const url of [publicPaths.canvases, paths.state, paths.devices]) {
        expect((await send('GET', url, headers)).status, `${what}: ${url}`).toBe(401);
      }
    }
  });

  it('is the only credential a linked page may use: not a browser device’s, not an API token, not a session’s', async () => {
    const browser = await pairBrowser();
    const everything = await makeToken([...GRANTABLE_SCOPES]);
    const own = sessionToken(token, (await sessions.create({})).session.id);
    for (const secret of [browser, everything, own, token]) {
      for (const host of [localHost, OUTSIDE_HOST]) {
        for (const url of [publicPaths.root, publicPaths.canvases, paths.state, paths.devices]) {
          const answer = await fromPage('GET', url, { host, authorization: bearer(secret) });
          expect(answer.status, `${url} at ${host}`).toBe(401);
          expectCorsAnswer(answer);
        }
        const socket = openSocket(paths.events, { host, authorization: bearer(secret) }, PAGE);
        expect(await upgradeStatus(socket)).toBe(401);
      }
    }
  });

  it('ignores every cookie: the owner’s here and a browser device’s outside open nothing, and a wrong bearer is not retried as either', async () => {
    const browser = await pairBrowser();
    for (const [host, cookie] of [[localHost, masterCookie()], [OUTSIDE_HOST, deviceCookie(browser)]] as const) {
      for (const authorization of [undefined, 'Bearer wrong', `Bearer ${DEVICE_PREFIX}made-up`]) {
        for (const [method, url] of [['GET', publicPaths.canvases], ['GET', paths.state], ['POST', paths.sessions], ['GET', paths.devices]] as const) {
          expect((await fromPage(method, url, { host, cookie, authorization }, method === 'POST' ? {} : undefined)).status, `${host} ${url} ${authorization}`).toBe(401);
        }
        expect(await upgradeStatus(openSocket(paths.events, { host, cookie, ...(authorization ? { authorization } : {}) }, PAGE))).toBe(401);
      }
    }
    expect(hub.state.sessions).toEqual([]);
  });

  it('may list the devices, marked as the one asking, and revoke itself, which is unlinking', async () => {
    const { credential, id } = await pairPage();
    await pairBrowser();
    const listed = await fromPage('GET', paths.devices, { authorization: bearer(credential) });
    expect(DeviceList.parse(listed.json).devices.map((d) => [d.kind, d.origin, d.current])).toEqual([
      ['browser', null, false],
      ['page', PAGE, true],
    ]);
    for (const device of hub.state.devices) expect(listed.body).not.toContain(device.hash);
    const revoked = await fromPage('DELETE', paths.device(id), { authorization: bearer(credential) });
    expect(revoked.status).toBe(200);
    expect(revoked.json.device).toMatchObject({ id, status: 'revoked', current: true });
    expect((await fromPage('GET', paths.state, { authorization: bearer(credential) })).status).toBe(401);
    await expect.poll(async () => (await activityLines()).map((line) => `${line.caller} ${line.method} ${line.route} ${line.deviceName ?? '-'} ${line.byDeviceId ?? '-'}`), { timeout: 5000 }).toContain(`device DELETE /api/v1/devices/:deviceId Laptop ${id}`);
  });

  it('stops working after 90 days unused', async () => {
    const { credential } = await pairPage();
    now += 91 * 24 * 60 * 60 * 1000;
    expect((await fromPage('GET', paths.state, { authorization: bearer(credential) })).status).toBe(401);
  });

  it('writes what only the owner may do through it as a device’s, in the activity log', async () => {
    const { credential, id } = await pairPage();
    const { session } = await sessions.create({});
    expect((await fromPage('PUT', `/v1/sessions/${session.id}/protection`, { authorization: bearer(credential) }, { peopleOnly: true })).status).toBe(200);
    await expect.poll(async () => (await activityLines()).find((line) => line.action === 'sessions.protect'), { timeout: 5000 }).toMatchObject({ caller: 'device', byDeviceId: id, tokenId: null, status: 200 });
    // The same at this computer, in the page, is not written: as before.
    await asOwnerHere('PUT', `/v1/sessions/${session.id}/protection`, { peopleOnly: false });
    await sleep(50);
    expect((await activityLines()).filter((line) => line.action === 'sessions.protect')).toHaveLength(1);
  });
});

describe('pairing a page', () => {
  it('answers a right code from its origin with the credential in the body, and no cookie', async () => {
    const code = await makePageCode(PAGE, 'Laptop');
    const answer = await fromPage('POST', paths.pair, {}, { code });
    expect(answer.status).toBe(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.headers['set-cookie']).toBeUndefined();
    expectCorsAnswer(answer);
    const paired = PairedPage.parse(answer.json);
    expect(Object.keys(answer.json).sort()).toEqual(['credential', 'device', 'protocolVersion']);
    expect(paired.credential).toMatch(new RegExp(`^${DEVICE_PREFIX}[A-Za-z0-9_-]{43}$`));
    expect(paired.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(paired.device.name).toBe('Laptop');
    expect(hub.state.devices).toHaveLength(1);
    expect(hub.state.devices[0]).toMatchObject({ id: paired.device.id, name: 'Laptop', kind: 'page', origin: PAGE, revokedAt: null });
    expect(JSON.stringify(hub.state)).not.toContain(paired.credential);
    // Once.
    expect((await fromPage('POST', paths.pair, {}, { code })).status).toBe(401);
    // From the page elsewhere, under the outside address: the same.
    const elsewhere = await fromPage('POST', paths.pair, { host: OUTSIDE_HOST, origin: OTHER_PAGE }, { code: await makePageCode(OTHER_PAGE) });
    expect(elsewhere.status).toBe(200);
    expect(hub.state.devices.at(-1)).toMatchObject({ kind: 'page', origin: OTHER_PAGE });
  });

  it('refuses a page’s code from anywhere but its origin like a wrong code, and does not spend it', async () => {
    const code = await makePageCode(PAGE);
    const wrong = await fromPage('POST', paths.pair, {}, { code: 'ABCDE-FGHJK' });
    expect(wrong.status).toBe(401);
    const tries: [string, Answer][] = [
      ['the other listed origin', await fromPage('POST', paths.pair, { origin: OTHER_PAGE }, { code })],
      ['the other listed origin, outside', await fromPage('POST', paths.pair, { host: OUTSIDE_HOST, origin: OTHER_PAGE }, { code })],
      ['this server’s own origin', await send('POST', paths.pair, { host: localHost, origin: here }, { code })],
      ['the outside address’s own origin', await fromOutside('POST', paths.pair, {}, { code })],
    ];
    for (const [what, answer] of tries) {
      expect(answer.status, what).toBe(401);
      expect(answer.body, what).toBe(wrong.body);
      expect(answer.headers['set-cookie'], what).toBeUndefined();
      expect(answer.headers['cache-control'], what).toBe('no-store');
    }
    expect(hub.state.devices).toEqual([]);
    expect((await fromPage('POST', paths.pair, {}, { code })).status).toBe(200);
  });

  it('refuses a browser’s code from a linked page like a wrong one, and does not spend it', async () => {
    const made = await asOwnerHere('POST', paths.pairingCodes, { name: 'Phone', kind: 'browser' });
    const code = PairingCodeAnswer.parse(made.json).code;
    const wrong = await fromOutside('POST', paths.pair, {}, { code: 'ABCDE-FGHJK' });
    for (const host of [localHost, OUTSIDE_HOST]) {
      const answer = await fromPage('POST', paths.pair, { host }, { code });
      expect(answer.status).toBe(401);
      expect(answer.body).toBe(wrong.body);
      expect(answer.headers['set-cookie']).toBeUndefined();
    }
    expect(hub.state.devices).toEqual([]);
    expect((await fromOutside('POST', paths.pair, {}, { code })).status).toBe(204);
  });

  it('is made only for an origin written in access.pages, and needs no outside address', async () => {
    for (const origin of [UNLISTED, OUTSIDE, here, 'not an origin', `${PAGE}/path`]) {
      const answer = await asOwnerHere('POST', paths.pairingCodes, { name: 'Laptop', kind: 'page', origin });
      expect(answer.status, origin).toBe(409);
      expect(answer.json.error.message).toContain('access.pages');
    }
    expect((await asOwnerHere('POST', paths.pairingCodes, { name: 'Laptop', kind: 'page' })).status).toBe(400);
    // Only the owner: a token with every scope, a session, and a page device itself through /api? The last is the owner.
    const everything = await makeToken([...GRANTABLE_SCOPES]);
    expect((await send('POST', paths.pairingCodes, { host: localHost, origin: here, authorization: bearer(everything) }, { name: 'x', kind: 'page', origin: PAGE })).status).toBe(401);

    await app.close();
    await start([], [PAGE]);
    expect((await asOwnerHere('POST', paths.pairingCodes, { name: 'Laptop', kind: 'page', origin: PAGE })).status).toBe(201);
    expect((await asOwnerHere('POST', paths.pairingCodes, { name: 'Phone', kind: 'browser' })).status).toBe(409);
  });

  it(`still withdraws every code after ${WRONG_CODES_ALLOWED} wrong ones, and still limits the tries`, async () => {
    const code = await makePageCode();
    for (let n = 0; n < WRONG_CODES_ALLOWED; n += 1) expect((await fromPage('POST', paths.pair, {}, { code: `ZZZZZ-ZZZZ${n}` })).status).toBe(401);
    expect((await fromPage('POST', paths.pair, {}, { code })).status).toBe(401);
    now += 61 * 1000;
    const next = await makePageCode();
    for (let n = 0; n < TRIES_PER_MINUTE; n += 1) await fromPage('POST', paths.pair, {}, { code: 'nope' });
    expect((await fromPage('POST', paths.pair, {}, { code: next })).status).toBe(429);
    expect(hub.state.devices).toEqual([]);
  });
});

describe('socket tickets', () => {
  it('are made only for a linked page’s device', async () => {
    const browser = await pairBrowser();
    const everything = await makeToken([...GRANTABLE_SCOPES]);
    const cookieCaller = await asOwnerHere('POST', paths.socketTickets);
    expect(cookieCaller.status).toBe(403);
    expect(cookieCaller.json.error.message).toMatch(/Only a linked page needs a ticket/);
    expect((await fromOutside('POST', paths.socketTickets, { cookie: deviceCookie(browser) })).status).toBe(403);
    expect((await send('POST', paths.socketTickets, { host: localHost, origin: here, authorization: bearer(everything) })).status).toBe(401);
    expect((await fromPage('POST', paths.socketTickets, { authorization: bearer(everything) })).status).toBe(401);
    expect((await fromPage('POST', paths.socketTickets)).status).toBe(401);

    const { credential } = await pairPage();
    const made = await fromPage('POST', paths.socketTickets, { authorization: bearer(credential) });
    expect(made.status).toBe(201);
    expect(made.headers['cache-control']).toBe('no-store');
    expectCorsAnswer(made);
    const ticket = SocketTicket.parse(made.json);
    expect(ticket.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(ticket.expiresAt)).toBe(now + 30 * 1000);
  });

  it('open the events socket and a terminal socket, each once', async () => {
    const { credential } = await pairPage();
    const { session } = await sessions.create({});
    const ticket = await ticketFor(credential);
    const events = openSocket(withTicket(paths.events, ticket), { host: localHost }, PAGE);
    const hello = new Promise<string>((resolve) => events.on('message', (data) => resolve(data.toString())));
    expect(await upgradeStatus(events)).toBe(101);
    expect(JSON.parse(await hello)).toEqual({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    expect(await upgradeStatus(openSocket(withTicket(paths.events, ticket), { host: localHost }, PAGE))).toBe(401);

    const second = await ticketFor(credential);
    // Beside the size, which the terminal socket reads: the ticket is no part of it.
    const terminal = openSocket(withTicket(`${paths.terminal(session.id)}?cols=80&rows=24`, second), { host: localHost }, PAGE);
    let closedWith: number | null = null;
    terminal.on('close', (code) => (closedWith = code));
    expect(await upgradeStatus(terminal)).toBe(101);
    await sleep(300);
    expect(closedWith).toBeNull();
    expect(await upgradeStatus(openSocket(withTicket(`${paths.terminal(session.id)}?cols=80&rows=24`, second), { host: localHost }, PAGE))).toBe(401);
    // Under the outside address as well.
    expect(await upgradeStatus(openSocket(withTicket(paths.events, await ticketFor(credential)), { host: OUTSIDE_HOST }, PAGE))).toBe(101);
  });

  it(`stop working after 30 seconds, from another origin, and when the device was revoked`, async () => {
    const { credential, id } = await pairPage();
    const late = await ticketFor(credential);
    now += 30 * 1000;
    expect(await upgradeStatus(openSocket(withTicket(paths.events, late), { host: localHost }, PAGE))).toBe(401);

    const crossed = await ticketFor(credential);
    expect(await upgradeStatus(openSocket(withTicket(paths.events, crossed), { host: localHost }, OTHER_PAGE))).toBe(401);
    // Offered once from the wrong place, it is spent.
    expect(await upgradeStatus(openSocket(withTicket(paths.events, crossed), { host: localHost }, PAGE))).toBe(401);

    const revoked = await ticketFor(credential);
    expect((await asOwnerHere('DELETE', paths.device(id))).status).toBe(200);
    expect(await upgradeStatus(openSocket(withTicket(paths.events, revoked), { host: localHost }, PAGE))).toBe(401);
  });

  it('are taken nowhere but on a linked page’s socket, and that socket takes nothing else', async () => {
    const { credential } = await pairPage();
    const ticket = await ticketFor(credential);
    expect((await fromPage('GET', withTicket(paths.state, ticket))).status).toBe(401);
    expect((await fromPage('GET', withTicket(publicPaths.canvases, ticket))).status).toBe(401);
    expect((await fromPage('GET', paths.state, { authorization: bearer(ticket) })).status).toBe(401);
    expect((await send('GET', withTicket(paths.state, ticket), { host: localHost, origin: here })).status).toBe(401);
    expect(await upgradeStatus(openSocket(withTicket(paths.events, ticket), { host: localHost }, here))).toBe(401);
    expect(await upgradeStatus(openSocket(withTicket(paths.events, ticket), { host: OUTSIDE_HOST }, OUTSIDE))).toBe(401);
    // None of those looked at it: it still opens the socket it was made for.
    expect(await upgradeStatus(openSocket(withTicket(paths.events, ticket), { host: localHost }, PAGE))).toBe(101);
    // A linked page's socket with no ticket: not with its credential, not with the owner's cookie.
    expect(await upgradeStatus(openSocket(paths.events, { host: localHost, authorization: bearer(credential) }, PAGE))).toBe(401);
    expect(await upgradeStatus(openSocket(paths.events, { host: localHost, cookie: masterCookie() }, PAGE))).toBe(401);
    expect(await upgradeStatus(openSocket(withTicket(paths.events, 'made-up'), { host: localHost }, PAGE))).toBe(401);
  });

  it('keep what was opened with them only while the device lasts: revoking it closes its sockets', async () => {
    const { credential, id } = await pairPage();
    const other = await pairPage(OTHER_PAGE, 'Elsewhere');
    const { session } = await sessions.create({});
    const events = openSocket(withTicket(paths.events, await ticketFor(credential)), { host: localHost }, PAGE);
    const terminal = openSocket(withTicket(`${paths.terminal(session.id)}?cols=80&rows=24`, await ticketFor(credential)), { host: localHost }, PAGE);
    const kept = openSocket(withTicket(paths.events, await ticketFor(other.credential, OTHER_PAGE)), { host: localHost }, OTHER_PAGE);
    for (const socket of [events, terminal, kept]) expect(await upgradeStatus(socket)).toBe(101);
    const closed = (socket: WebSocket): Promise<number> => new Promise((resolve) => socket.on('close', (code) => resolve(code)));
    const eventsClosed = closed(events);
    const terminalClosed = closed(terminal);
    let keptClosed = false;
    kept.on('close', () => (keptClosed = true));
    expect((await fromPage('DELETE', paths.device(id), { authorization: bearer(credential) })).status).toBe(200);
    expect(await eventsClosed).toBe(1008);
    expect(await terminalClosed).toBe(1008);
    await sleep(50);
    expect(keptClosed).toBe(false);
  });

  it('let the stream for programs be read across origins, and close it when the device is revoked', async () => {
    const { credential, id } = await pairPage();
    const ended = new Promise<{ text: string; origin: unknown }>((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { host: localHost, origin: PAGE, authorization: bearer(credential) } }, (res) => {
        expect(res.statusCode).toBe(200);
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
          if (text.includes(': connected')) void asOwnerHere('DELETE', paths.device(id));
        });
        res.on('end', () => resolve({ text, origin: res.headers['access-control-allow-origin'] }));
      });
      req.on('error', reject);
    });
    const { text, origin } = await ended;
    expect(text).toContain(': connected');
    expect(origin).toBe(PAGE);
  });
});

describe('the desktop', () => {
  it('opens nothing for a linked page, though it came in under this computer’s own name', async () => {
    const { credential } = await pairPage();
    const made = await fromPage('POST', paths.sessions, { authorization: bearer(credential) }, { desktop: true });
    expect(made.status).toBe(201);
    expect(CreateSessionResponse.parse(made.json).desktop).toEqual({ opened: false, says: NOT_AT_THIS_COMPUTER });
    const id = CreateSessionResponse.parse(made.json).session.id;
    const asked = await fromPage('POST', `/v1/sessions/${id}/desktop`, { authorization: bearer(credential) }, {});
    expect(asked.status).toBe(403);
    expect(opened).toEqual([]);
    // The owner at this computer, as before.
    expect((await asOwnerHere('POST', `/v1/sessions/${id}/desktop`, {})).status).toBe(200);
    expect(opened).toEqual([id]);
  });
});

describe('a stranger from a linked page’s origin', () => {
  it('gets nothing from any route but the preflight, and a refusal from the one for a code', async () => {
    const filled = (url: string): string => url.replace('/*', '/assets/app.js').replace(/:[A-Za-z]+/g, () => newId());
    const routes = everyRouteOf(app);
    for (const wanted of ['GET /api/v1/state', 'POST /api/v1/sessions', 'GET /ws/v1/events', 'GET /v1/canvases', 'POST /auth/pair', 'GET /auth', 'GET /', 'GET /*', 'POST /api/v1/socket-tickets', 'DELETE /api/v1/devices/:deviceId', 'GET /api/v1/custom.css', 'GET /api/v1/plugins/:pluginId/:digest/:file', 'PUT /v1/settings/plugins', 'POST /v1/settings/plugins/read']) {
      expect(routes.map((r) => `${r.method} ${r.url}`)).toContain(wanted);
    }
    const everything = await makeToken([...GRANTABLE_SCOPES]);
    let pairTries = 0;
    for (const route of routes) {
      const url = filled(route.url);
      for (const host of [localHost, OUTSIDE_HOST]) {
        const preflight = await send('OPTIONS', url, { host, origin: PAGE, 'access-control-request-method': route.method });
        expect(preflight.status, `OPTIONS ${route.url}`).toBe(204);
        for (const headers of [{}, { authorization: `Bearer ${DEVICE_PREFIX}made-up` }, { cookie: masterCookie() }, { authorization: bearer(everything) }, { authorization: bearer(token) }]) {
          if (route.method === 'POST' && route.url === paths.pair) {
            // Kept under the limit, so that each try is answered by the route itself.
            if ((pairTries += 1) >= TRIES_PER_MINUTE) continue;
          }
          const answer = await fromPage(route.method, url, { host, ...headers }, route.method === 'GET' || route.method === 'DELETE' ? undefined : {});
          expect([401, 403, 404], `${route.method} ${route.url} at ${host} answered ${answer.status}`).toContain(answer.status);
          expectCorsAnswer(answer);
        }
      }
    }
    expect(hub.state.devices).toEqual([]);
    expect(hub.state.sessions).toEqual([]);
    expect(hub.state.canvases).toHaveLength(1);
    expect(opened).toEqual([]);
  }, 60_000);
});

describe('secrets and hashes', () => {
  it('are in no file of the data folder: not the credential, not a ticket, not a code', async () => {
    const used = await makePageCode();
    const left = await makePageCode(OTHER_PAGE);
    const answer = await fromPage('POST', paths.pair, {}, { code: used });
    const { credential } = PairedPage.parse(answer.json);
    await fromPage('GET', paths.state, { authorization: bearer(credential) });
    const spent = await ticketFor(credential);
    expect(await upgradeStatus(openSocket(withTicket(paths.events, spent), { host: localHost }, PAGE))).toBe(101);
    const waiting = await ticketFor(credential);
    await fromPage('GET', withTicket(paths.state, waiting));
    await fromPage('POST', paths.pair, {}, { code: 'ABCDE-FGHJK' });
    await hub.flush();
    await expect.poll(async () => (await activityLines()).length, { timeout: 5000 }).toBe(4);
    const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
    expect(files.map((file) => path.basename(file))).toEqual(expect.arrayContaining(['state.json', ACTIVITY_FILE]));
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const needle of [credential, credential.slice(DEVICE_PREFIX.length), spent, waiting, used, used.replace('-', ''), left, left.replace('-', '')]) {
        expect(text.includes(needle), `${path.basename(file)} holds a secret, a ticket or a code`).toBe(false);
      }
    }
    expect((await activityLines()).map((line) => `${line.caller} ${line.method} ${line.route} ${line.outcome} ${line.deviceName ?? '-'}`)).toEqual([
      'owner POST /api/v1/pairing-codes ok -',
      'owner POST /api/v1/pairing-codes ok -',
      'pairing POST /auth/pair ok Laptop',
      'pairing POST /auth/pair denied -',
    ]);
  });

  it('never send a page device’s hash in a state answer or on the sockets and stream it reads', async () => {
    const first = await pairPage();
    const messages: string[] = [];
    const socket = openSocket(withTicket(paths.events, await ticketFor(first.credential)), { host: localHost }, PAGE);
    socket.on('message', (data) => messages.push(data.toString()));
    expect(await upgradeStatus(socket)).toBe(101);
    const second = await pairPage(OTHER_PAGE, 'Elsewhere');
    await asOwnerHere('POST', publicPaths.canvases, { name: 'After' });
    await expect.poll(() => messages.join('\n'), { timeout: 5000 }).toContain('After');
    expect(messages.some((message) => message.includes('device.added'))).toBe(true);
    const state = await fromPage('GET', paths.state, { authorization: bearer(first.credential) });
    const devices = await fromPage('GET', paths.devices, { authorization: bearer(first.credential) });
    for (const device of hub.state.devices) {
      expect(device.hash).toMatch(/^[0-9a-f]{64}$/);
      for (const text of [messages.join('\n'), state.body, devices.body]) expect(text).not.toContain(device.hash);
    }
    for (const text of [messages.join('\n'), state.body, devices.body]) {
      expect(text).not.toContain(first.credential);
      expect(text).not.toContain(second.credential);
    }
  });
});

describe('the owner’s own stylesheet', () => {
  it('is the own page’s: a linked page with a good credential is given nothing of it', async () => {
    const { credential } = await pairPage();
    const file = await fromPage('GET', CUSTOM_CSS_PATH, { authorization: bearer(credential) });
    expect(file.status).toBe(404);
    expect(file.body).not.toContain('data-part');
    expectCorsAnswer(file);
    const state = await fromPage('GET', paths.state, { authorization: bearer(credential) });
    expect(state.status).toBe(200);
    expect(StateResponse.parse(state.json).customCss).toBeUndefined();
    expect('customCssProblem' in state.json).toBe(false);
    const read = await fromPage('POST', '/v1/settings/stylesheet/read', { authorization: bearer(credential) }, {});
    expect(read.status).toBe(200);
    expect(read.json).toEqual({ stylesheet: null, problem: null });
    // The owner at this computer has it.
    expect((await asOwnerHere('GET', CUSTOM_CSS_PATH)).status).toBe(200);
    expect(StateResponse.parse((await asOwnerHere('GET', paths.state)).json).customCss?.bytes).toBeGreaterThan(0);
  });
});

describe('the owner’s plugins', () => {
  it('are the own page’s: a linked page with a good credential is given nothing of them, and switches none', async () => {
    const { credential } = await pairPage();
    const owner = await asOwnerHere('GET', paths.state);
    const digest = (owner.json as { plugins: { plugins: { digest: string }[] } }).plugins.plugins[0]!.digest;
    const href = pluginFileHref('tickets', digest, 'index.js');
    expect((await asOwnerHere('GET', href)).status).toBe(200);
    const file = await fromPage('GET', href, { authorization: bearer(credential) });
    expect(file.status).toBe(404);
    expect(file.body).not.toContain('activate');
    expectCorsAnswer(file);
    const state = await fromPage('GET', paths.state, { authorization: bearer(credential) });
    expect('plugins' in state.json).toBe(false);
    const read = await fromPage('POST', '/v1/settings/plugins/read', { authorization: bearer(credential) }, {});
    expect(read.status).toBe(200);
    expect(read.json).toEqual(NO_PLUGINS_ANSWER);
    const change = await fromPage('PUT', '/v1/settings/plugins', { authorization: bearer(credential) }, { id: 'tickets', on: null });
    expect(change.status).toBe(403);
  });
});
