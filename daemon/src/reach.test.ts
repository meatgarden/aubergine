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
  PairingCodeAnswer,
  Settings,
  StateResponse,
  newId,
  paths,
  publicPaths,
  type ActivityEntry,
  type ChangeEvent,
} from '@aubergine/shared';
import { ACTIVITY_FILE, FileActivityLog } from './activity';
import { StylesheetFile } from './custom-css';
import { authorize, sessionToken } from './auth';
import type { DesktopOpener } from './desktop/open';
import { TRIES_PER_MINUTE, WRONG_CODES_ALLOWED, Pairing } from './pairing';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { NOT_AT_THIS_COMPUTER, buildServer, cookieName, deviceCookieName, everyRouteOf } from './server';
import { Sessions } from './sessions';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

/**
 * The server under an outside address: where a request came in, from Host alone; the sign-in each place takes;
 * pairing a device with a code; what a device holds and loses. Every host here is made up, every request is
 * injected or sent to the test's own port on 127.0.0.1, and no real network or proxy is involved.
 */

const SOCKET = testSocketName('reach');
const runtime = new TmuxRuntime({ socket: SOCKET });

const OUTSIDE = 'https://aubergine.example.test';
const OUTSIDE_HOST = 'aubergine.example.test';
const SECOND = 'https://second.example.test';
const SECOND_HOST = 'second.example.test';
const DAY = 24 * 60 * 60 * 1000;

let dir: string;
let token: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let here: string;
/** The clock devices and codes are judged by: moved by the tests, never waited for. */
let now = Date.parse('2026-06-01T09:00:00.000Z');
/** What the stand-in opener was asked to open. */
let opened: string[] = [];
const sockets: WebSocket[] = [];

async function start(addresses: string[] = [OUTSIDE, SECOND]): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  sessions = new Sessions(hub, runtime, {});
  const web = path.join(dir, 'web');
  await mkdir(path.join(web, 'assets'), { recursive: true });
  await writeFile(path.join(web, 'index.html'), '<!doctype html><html lang="en"><head><title>Aubergine</title></head><body></body></html>\n');
  await writeFile(path.join(web, 'assets', 'app.js'), 'console.log("the page");\n');
  // The owner's own stylesheet is there, so that the walks reach its route with a file to give.
  await writeFile(path.join(dir, 'custom.css'), '[data-part="map"] { display: none; }\n');
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
    settings: async () => Settings.parse({ access: { addresses } }),
    token,
    devOrigin: null,
    webDist: web,
    activity: new FileActivityLog(dir, 1024 * 1024),
    desktop: opener,
    stylesheet: new StylesheetFile(dir),
    now: () => now,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  here = `http://127.0.0.1:${port}`;
}

beforeAll(async () => {
  await runtime.killServer();
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-reach-'));
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

/** The owner at this computer, in the page. */
const asOwnerHere = (method: string, url: string, body?: unknown): Promise<Answer> => send(method, url, { host: `127.0.0.1:${port}`, origin: here, cookie: masterCookie(), 'sec-fetch-site': 'same-origin' }, body);
/** A request that came in under the outside address, with its own Origin unless another is given. */
const fromOutside = (method: string, url: string, headers: Record<string, string | undefined> = {}, body?: unknown): Promise<Answer> => send(method, url, { host: OUTSIDE_HOST, origin: OUTSIDE, ...headers }, body);

async function makeCode(name = 'Phone'): Promise<string> {
  const made = await asOwnerHere('POST', paths.pairingCodes, { name, kind: 'browser' });
  expect(made.status).toBe(201);
  return PairingCodeAnswer.parse(made.json).code;
}

const tryCode = (code: unknown, headers: Record<string, string | undefined> = {}): Promise<Answer> => fromOutside('POST', paths.pair, headers, { code });

/** The secret in a device's cookie, as the browser was given it. */
function secretOf(answer: Answer): string {
  const set = [answer.headers['set-cookie'] ?? []].flat().find((line) => line.startsWith(`${deviceCookieName(port)}=`));
  if (!set) throw new Error('no device cookie was set');
  return decodeURIComponent(set.split(';')[0]!.split('=')[1]!);
}

async function pairDevice(name = 'Phone'): Promise<{ secret: string; id: string; setCookie: string }> {
  const answer = await tryCode(await makeCode(name));
  expect(answer.status).toBe(204);
  const secret = secretOf(answer);
  const device = hub.state.devices.at(-1)!;
  // The next one is made a moment later, so that the list's order is the order they were made in.
  now += 1000;
  return { secret, id: device.id, setCookie: [answer.headers['set-cookie']].flat().join('\n') };
}

function openSocket(urlPath: string, headers: Record<string, string>, origin: string): WebSocket {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${urlPath}`, { headers, origin });
  sockets.push(socket);
  return socket;
}

/** 101 when the upgrade opens, else the status it was refused with. */
function upgradeStatus(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.on('open', () => resolve(101));
    socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    socket.on('error', reject);
  });
}

async function makeToken(scopes: string[]): Promise<string> {
  const made = await asOwnerHere('POST', publicPaths.tokens, { name: `t${Math.random()}`, scopes, reach: { kind: 'all' }, reviewWorkflowChanges: true });
  expect(made.status).toBe(201);
  return CreatedToken.parse(made.json).secret;
}

describe('where a request came in', () => {
  it('is decided by Host, and the Origin must go with it', async () => {
    const { secret } = await pairDevice();
    // Here, as before: the local origins and the access token's cookie.
    expect((await asOwnerHere('GET', paths.state)).status).toBe(200);
    expect((await send('GET', paths.state, { host: `localhost:${port}`, origin: `http://localhost:${port}`, cookie: masterCookie() })).status).toBe(200);
    // Without an Origin a read is still let through, as before.
    expect((await send('GET', paths.state, { host: `127.0.0.1:${port}`, cookie: masterCookie() })).status).toBe(200);
    // Outside: exactly that address as the Origin, and a device's cookie.
    expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) })).status).toBe(200);
    expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(secret), origin: undefined })).status).toBe(200);
    // Host is compared as a browser would send it: case does not matter in a name.
    expect((await send('GET', paths.state, { host: 'Aubergine.Example.TEST', origin: OUTSIDE, cookie: deviceCookie(secret) })).status).toBe(200);
    // The second address works under its own name, with its own Origin.
    expect((await send('GET', paths.state, { host: SECOND_HOST, origin: SECOND, cookie: deviceCookie(secret) })).status).toBe(200);
  });

  it('refuses every crossing of Host and Origin, and a Host it does not know', async () => {
    const { secret } = await pairDevice();
    const crossed: [string, Record<string, string>][] = [
      ['a local Origin with the outside Host', { host: OUTSIDE_HOST, origin: here, cookie: deviceCookie(secret) }],
      ['the outside Origin with a local Host', { host: `127.0.0.1:${port}`, origin: OUTSIDE, cookie: masterCookie() }],
      ['the second address as Origin under the first', { host: OUTSIDE_HOST, origin: SECOND, cookie: deviceCookie(secret) }],
      ['the first address as Origin under the second', { host: SECOND_HOST, origin: OUTSIDE, cookie: deviceCookie(secret) }],
      ['the address over plain http', { host: OUTSIDE_HOST, origin: `http://${OUTSIDE_HOST}`, cookie: deviceCookie(secret) }],
      ['the address with a port it was not given', { host: `${OUTSIDE_HOST}:8443`, origin: `${OUTSIDE}:8443`, cookie: deviceCookie(secret) }],
      ['a Host nobody wrote down', { host: 'elsewhere.example.test', origin: 'https://elsewhere.example.test', cookie: deviceCookie(secret) }],
      ['a Host nobody wrote down, without Origin', { host: 'elsewhere.example.test', cookie: masterCookie() }],
      ['a name that only ends like the address', { host: `evil-${OUTSIDE_HOST}`, origin: `https://evil-${OUTSIDE_HOST}`, cookie: deviceCookie(secret) }],
    ];
    for (const [what, headers] of crossed) {
      for (const [method, url] of [['GET', paths.state], ['POST', paths.sessions], ['GET', publicPaths.canvases], ['GET', '/'], ['POST', paths.pair]] as const) {
        expect((await send(method, url, headers, method === 'POST' ? {} : undefined)).status, `${what}: ${method} ${url}`).toBe(403);
      }
    }
    // A forwarded header changes nothing: neither where it came in, nor what it is taken for.
    for (const forwarded of [{ 'x-forwarded-host': `127.0.0.1:${port}` }, { forwarded: `host=127.0.0.1:${port};proto=http` }, { 'x-forwarded-for': '127.0.0.1', 'x-forwarded-proto': 'http' }]) {
      expect((await fromOutside('GET', paths.state, { cookie: masterCookie(), ...forwarded })).status).toBe(401);
      expect((await send('GET', paths.state, { host: 'elsewhere.example.test', cookie: masterCookie(), ...forwarded })).status).toBe(403);
      expect((await fromOutside('GET', `${paths.auth}?token=${token}`, forwarded)).status).toBe(404);
    }
  });

  it('says in the state whether it came in here, and puts HTTPS on every answer from outside', async () => {
    const { secret } = await pairDevice();
    expect(StateResponse.parse((await asOwnerHere('GET', paths.state)).json).here).toBe(true);
    const outside = await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) });
    expect(StateResponse.parse(outside.json).here).toBe(false);
    for (const answer of [outside, await fromOutside('GET', paths.state), await fromOutside('GET', '/'), await fromOutside('GET', '/no-such-thing'), await tryCode('nope'), await fromOutside('GET', publicPaths.canvases)]) {
      expect(answer.headers['strict-transport-security']).toBe('max-age=31536000');
    }
    expect((await asOwnerHere('GET', paths.state)).headers['strict-transport-security']).toBeUndefined();
  });

  it('never lets the page be framed, here or from outside, at a linked server\'s addresses in it too', async () => {
    for (const answer of [await send('GET', '/', { host: `127.0.0.1:${port}` }), await fromOutside('GET', '/'), await fromOutside('GET', `/c/${newId()}`), await fromOutside('GET', '/index.html'), await send('GET', `/s/abcd1234/p/${newId()}/c/${newId()}/runs`, { host: `127.0.0.1:${port}` }), await fromOutside('GET', `/s/abcd1234/t/${newId()}`), await fromOutside('GET', '/s/abcd1234')]) {
      expect(answer.status).toBe(200);
      expect(answer.headers['content-security-policy']).toBe("frame-ancestors 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:");
      expect(answer.headers['x-frame-options']).toBe('DENY');
    }
  });
});

describe('the access token from outside', () => {
  it('is refused in every form: cookie, bearer, socket, the sign-in address', async () => {
    expect((await fromOutside('GET', paths.state, { cookie: masterCookie() })).status).toBe(401);
    expect((await fromOutside('POST', paths.sessions, { cookie: masterCookie() }, {})).status).toBe(401);
    expect((await fromOutside('GET', publicPaths.canvases, { cookie: masterCookie() })).status).toBe(401);
    expect((await fromOutside('GET', publicPaths.canvases, { authorization: `Bearer ${token}` })).status).toBe(401);
    expect((await fromOutside('GET', publicPaths.canvases, { authorization: `Bearer ${token}`, cookie: masterCookie() })).status).toBe(401);
    // Not even compared: there is no such address there, right token or wrong.
    const signIn = await fromOutside('GET', `${paths.auth}?token=${token}`);
    expect(signIn.status).toBe(404);
    expect(signIn.headers['set-cookie']).toBeUndefined();
    expect((await fromOutside('GET', `${paths.auth}?token=wrong`)).body).toBe(signIn.body);
    const socket = openSocket(paths.events, { host: OUTSIDE_HOST, cookie: masterCookie() }, OUTSIDE);
    expect(await upgradeStatus(socket)).toBe(401);
    // Here it still signs in, as before.
    const local = await send('GET', `${paths.auth}?token=${token}`, { host: `127.0.0.1:${port}` });
    expect(local.status).toBe(302);
    expect(String(local.headers['set-cookie'])).toContain(cookieName(port));
  });

  it('leaves session tokens and API tokens working on /v1 from outside as from here, and opens neither /api nor /ws to them', async () => {
    const { session } = await sessions.create({});
    const ownToken = sessionToken(token, session.id);
    const apiToken = await makeToken(['read']);
    for (const from of [{ host: `127.0.0.1:${port}`, origin: undefined }, { host: OUTSIDE_HOST, origin: undefined }, { host: OUTSIDE_HOST, origin: OUTSIDE }]) {
      expect((await send('GET', publicPaths.canvases, { ...from, authorization: `Bearer ${apiToken}` })).status).toBe(200);
      expect((await send('GET', publicPaths.root, { ...from, authorization: `Bearer ${ownToken}` })).json.caller).toEqual({ kind: 'session', sessionId: session.id });
      // A session token reaches what it reaches from here: not the canvases.
      expect((await send('GET', publicPaths.canvases, { ...from, authorization: `Bearer ${ownToken}` })).status).toBe(403);
      for (const secret of [apiToken, ownToken]) {
        expect((await send('GET', paths.state, { ...from, authorization: `Bearer ${secret}` })).status).toBe(401);
        expect((await send('GET', paths.devices, { ...from, authorization: `Bearer ${secret}` })).status).toBe(401);
      }
    }
    for (const secret of [apiToken, ownToken]) {
      const socket = openSocket(paths.events, { host: OUTSIDE_HOST, authorization: `Bearer ${secret}` }, OUTSIDE);
      expect(await upgradeStatus(socket)).toBe(401);
    }
  });
});

describe('a device cookie and the access token cookie', () => {
  it('each work only where they belong', async () => {
    const { secret } = await pairDevice();
    // A device's cookie at this computer's own name: not a sign-in here.
    expect((await send('GET', paths.state, { host: `127.0.0.1:${port}`, origin: here, cookie: deviceCookie(secret) })).status).toBe(401);
    expect((await send('GET', publicPaths.canvases, { host: `127.0.0.1:${port}`, cookie: deviceCookie(secret) })).status).toBe(401);
    // Under the name of the other's cookie, neither is taken for the other.
    expect((await fromOutside('GET', paths.state, { cookie: `${cookieName(port)}=${secret}` })).status).toBe(401);
    expect((await asOwnerHere('GET', paths.state)).status).toBe(200);
    expect((await send('GET', paths.state, { host: `127.0.0.1:${port}`, origin: here, cookie: `${deviceCookieName(port)}=${token}` })).status).toBe(401);
    // A device's secret is not a bearer credential.
    expect((await fromOutside('GET', publicPaths.canvases, { authorization: `Bearer ${secret}` })).status).toBe(401);
  });
});

describe('pairing', () => {
  it('turns a right code into a device, once, with a cookie that has every flag', async () => {
    const code = await makeCode('Phone');
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    const answer = await tryCode(code.toLowerCase().replace('-', ''));
    expect(answer.status).toBe(204);
    expect(answer.headers['cache-control']).toBe('no-store');
    const set = [answer.headers['set-cookie']].flat().join(';');
    expect(set).toMatch(new RegExp(`^${deviceCookieName(port)}=${DEVICE_PREFIX}[A-Za-z0-9_-]{43};`));
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', `Max-Age=${90 * 24 * 60 * 60}`]) expect(set).toContain(flag);
    expect(set).not.toContain('Domain');
    expect(deviceCookieName(port)).not.toBe(cookieName(port));
    expect(hub.state.devices).toHaveLength(1);
    expect(hub.state.devices[0]).toMatchObject({ name: 'Phone', kind: 'browser', origin: null, revokedAt: null, lastUsedAt: null });
    // Only its hash is kept.
    expect(JSON.stringify(hub.state)).not.toContain(secretOf(answer));
    // The same code again: it worked once.
    expect((await tryCode(code)).status).toBe(401);
    expect(hub.state.devices).toHaveLength(1);
  });

  it('answers every failure alike: wrong, used, expired, none waiting, not a code, a body that is not one', async () => {
    const answers: [string, Answer][] = [];
    answers.push(['none waiting', await tryCode('ABCDE-FGHJK')]);
    const used = await makeCode();
    expect((await tryCode(used)).status).toBe(204);
    answers.push(['used', await tryCode(used)]);
    const late = await makeCode();
    now += 3 * 60 * 1000 + 1;
    answers.push(['expired', await tryCode(late)]);
    now += 61 * 1000;
    await makeCode();
    answers.push(['wrong', await tryCode('ABCDE-FGHJK')]);
    answers.push(['too short', await tryCode('ABC')]);
    answers.push(['not text', await tryCode(12345)]);
    answers.push(['no code at all', await fromOutside('POST', paths.pair, {}, {})]);
    now += 61 * 1000;
    answers.push(['not JSON', await fromOutside('POST', paths.pair, { 'content-type': 'application/json' }, '{"code": ')]);
    answers.push(['not JSON at all', await fromOutside('POST', paths.pair, { 'content-type': 'text/plain' }, 'ABCDE-FGHJK')]);
    const first = answers[0]![1];
    expect(first.status).toBe(401);
    for (const [what, answer] of answers) {
      expect(answer.status, what).toBe(401);
      expect(answer.body, what).toBe(first.body);
      expect(answer.headers['content-type'], what).toBe(first.headers['content-type']);
      expect(answer.headers['set-cookie'], what).toBeUndefined();
      expect(answer.headers['cache-control'], what).toBe('no-store');
    }
    expect(hub.state.devices).toHaveLength(1);
  });

  it('refuses a code made for a page, like a wrong one', () => {
    const pairing = new Pairing(() => now);
    const page = pairing.make('Laptop page', 'page').code;
    expect(pairing.try(page, { accept: true, kinds: ['browser'] })).toEqual({ result: 'wrong' });
    const browser = pairing.make('Phone', 'browser').code;
    expect(pairing.try(browser, { accept: true, kinds: ['browser'] })).toMatchObject({ result: 'right', name: 'Phone', kind: 'browser' });
  });

  it('keeps at most three codes waiting: a fourth withdraws the oldest', () => {
    const pairing = new Pairing(() => now);
    const codes = [1, 2, 3, 4].map((n) => pairing.make(`d${n}`, 'browser').code);
    expect(pairing.waitingCount()).toBe(3);
    expect(pairing.try(codes[0], { accept: true, kinds: ['browser'] }).result).toBe('wrong');
    expect(pairing.try(codes[3], { accept: true, kinds: ['browser'] }).result).toBe('right');
  });

  it(`withdraws every waiting code after ${WRONG_CODES_ALLOWED} wrong ones`, async () => {
    const right = await makeCode('Phone');
    const other = await makeCode('Tablet');
    for (let n = 0; n < WRONG_CODES_ALLOWED; n += 1) expect((await tryCode(`ZZZZZ-ZZZZ${n}`)).status).toBe(401);
    expect((await tryCode(right)).status).toBe(401);
    expect((await tryCode(other)).status).toBe(401);
    expect(hub.state.devices).toHaveLength(0);
    // A new code made afterwards works.
    now += 61 * 1000;
    expect((await tryCode(await makeCode())).status).toBe(204);
  });

  it(`answers more than ${TRIES_PER_MINUTE} tries in a minute with 429, before looking at the code`, async () => {
    const code = await makeCode();
    for (let n = 0; n < TRIES_PER_MINUTE; n += 1) {
      // Wrong codes, though fewer than would withdraw it, while codes keep being made.
      if (n % 4 === 3) await makeCode();
      expect((await tryCode('nope')).status).toBe(401);
    }
    const limited = await tryCode(code);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.json).toEqual({ error: { code: 'rate_limited', message: expect.stringContaining('Try again in') } });
    expect(hub.state.devices).toHaveLength(0);
    now += 61 * 1000;
    expect((await tryCode(await makeCode())).status).toBe(204);
  });

  it('is refused from this computer’s own name, like a wrong code, and spends nothing', async () => {
    const code = await makeCode();
    const fromHere = await send('POST', paths.pair, { host: `127.0.0.1:${port}`, origin: here }, { code });
    const wrong = await tryCode('ABCDE-FGHJK');
    expect(fromHere.status).toBe(401);
    expect(fromHere.body).toBe(wrong.body);
    expect(fromHere.headers['set-cookie']).toBeUndefined();
    expect(hub.state.devices).toHaveLength(0);
    // It needs an Origin, as everything that changes something does.
    expect((await fromOutside('POST', paths.pair, { origin: undefined }, { code })).status).toBe(403);
    expect((await tryCode(code)).status).toBe(204);
  });

  it('is made only by the owner, and only where an outside address is written', async () => {
    for (const secret of [await makeToken([...GRANTABLE_SCOPES]), sessionToken(token, (await sessions.create({})).session.id)]) {
      expect((await send('POST', paths.pairingCodes, { host: `127.0.0.1:${port}`, origin: here, authorization: `Bearer ${secret}` }, { name: 'x', kind: 'browser' })).status).toBe(401);
    }
    expect((await asOwnerHere('POST', paths.pairingCodes, { name: 'x', kind: 'page' })).status).toBe(400);
    expect((await asOwnerHere('POST', paths.pairingCodes, { name: 'two\nlines', kind: 'browser' })).status).toBe(400);
    const made = PairingCodeAnswer.parse((await asOwnerHere('POST', paths.pairingCodes, { name: 'Phone', kind: 'browser' })).json);
    expect(made.addresses).toEqual([OUTSIDE, SECOND]);
    expect(Date.parse(made.expiresAt)).toBe(now + 3 * 60 * 1000);

    await app.close();
    await start([]);
    const none = await asOwnerHere('POST', paths.pairingCodes, { name: 'Phone', kind: 'browser' });
    expect(none.status).toBe(409);
    expect(none.json.error.message).toContain('access.addresses');
  });
});

describe('a device', () => {
  it('signs in from outside to the state, the change events and a terminal', async () => {
    const { secret } = await pairDevice();
    const { session } = await sessions.create({});
    expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) })).status).toBe(200);
    expect((await fromOutside('GET', publicPaths.canvases, { cookie: deviceCookie(secret) })).status).toBe(200);
    expect((await fromOutside('GET', publicPaths.root, { cookie: deviceCookie(secret) })).json.caller).toEqual({ kind: 'user' });
    const events = openSocket(paths.events, { host: OUTSIDE_HOST, cookie: deviceCookie(secret) }, OUTSIDE);
    expect(await upgradeStatus(events)).toBe(101);
    const terminal = openSocket(`${paths.terminal(session.id)}?cols=80&rows=24`, { host: OUTSIDE_HOST, cookie: deviceCookie(secret) }, OUTSIDE);
    expect(await upgradeStatus(terminal)).toBe(101);
    // An upgrade without Origin is refused, from outside as from here.
    expect(await upgradeStatus(new WebSocket(`ws://127.0.0.1:${port}${paths.events}`, { headers: { host: OUTSIDE_HOST, cookie: deviceCookie(secret) } }))).toBe(403);
    // Without its cookie, nothing.
    expect(await upgradeStatus(openSocket(paths.events, { host: OUTSIDE_HOST }, OUTSIDE))).toBe(401);
  });

  it('notes that it was used at most once a minute', async () => {
    const { secret, id } = await pairDevice();
    const used: ChangeEvent[] = [];
    hub.subscribe((event) => {
      if (event.type === 'device.used') used.push(event);
    });
    for (let n = 0; n < 5; n += 1) expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) })).status).toBe(200);
    expect(used).toHaveLength(1);
    now += 30 * 1000;
    await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) });
    expect(used).toHaveLength(1);
    now += 31 * 1000;
    const again = await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) });
    expect(used).toHaveLength(2);
    expect(hub.state.devices.find((d) => d.id === id)?.lastUsedAt).toBe(new Date(now).toISOString());
    // When it is noted, the cookie is given again, so that a device in use keeps it.
    expect(secretOf(again)).toBe(secret);
  });

  it('stops working after 90 days unused, and keeps working while it is used', async () => {
    const kept = await pairDevice('Kept');
    const left = await pairDevice('Left');
    for (let day = 0; day < 4; day += 1) {
      now += 30 * DAY;
      expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(kept.secret) })).status).toBe(200);
    }
    expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(left.secret) })).status).toBe(401);
    expect(DeviceList.parse((await asOwnerHere('GET', paths.devices)).json).devices.map((d) => [d.name, d.status])).toEqual([
      ['Left', 'unused'],
      ['Kept', 'active'],
    ]);
  });

  it('is signed out at once when revoked, and what it holds open is closed', async () => {
    const phone = await pairDevice('Phone');
    const other = await pairDevice('Tablet');
    const { session } = await sessions.create({});
    const events = openSocket(paths.events, { host: OUTSIDE_HOST, cookie: deviceCookie(phone.secret) }, OUTSIDE);
    const terminal = openSocket(`${paths.terminal(session.id)}?cols=80&rows=24`, { host: OUTSIDE_HOST, cookie: deviceCookie(phone.secret) }, OUTSIDE);
    const kept = openSocket(paths.events, { host: OUTSIDE_HOST, cookie: deviceCookie(other.secret) }, OUTSIDE);
    const owners = openSocket(paths.events, { host: `127.0.0.1:${port}`, cookie: masterCookie() }, here);
    for (const socket of [events, terminal, kept, owners]) expect(await upgradeStatus(socket)).toBe(101);
    const closed = (socket: WebSocket): Promise<number> => new Promise((resolve) => socket.on('close', (code) => resolve(code)));
    const eventsClosed = closed(events);
    const terminalClosed = closed(terminal);
    let keptClosed = false;
    kept.on('close', () => (keptClosed = true));
    owners.on('close', () => (keptClosed = true));

    // The device revokes itself: allowed, it is the owner.
    const revoked = await fromOutside('DELETE', paths.device(phone.id), { cookie: deviceCookie(phone.secret) });
    expect(revoked.status).toBe(200);
    expect(revoked.json.device).toMatchObject({ id: phone.id, status: 'revoked', current: true });
    expect(await eventsClosed).toBe(1008);
    expect(await terminalClosed).toBe(1008);
    expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(phone.secret) })).status).toBe(401);
    expect(await upgradeStatus(openSocket(paths.events, { host: OUTSIDE_HOST, cookie: deviceCookie(phone.secret) }, OUTSIDE))).toBe(401);
    // Nothing of another device's, or of the owner's here, was closed.
    await sleep(50);
    expect(keptClosed).toBe(false);
    expect((await fromOutside('GET', paths.state, { cookie: deviceCookie(other.secret) })).status).toBe(200);
    // Revoking again changes nothing; one that does not exist is not found.
    expect((await asOwnerHere('DELETE', paths.device(phone.id))).status).toBe(200);
    expect((await asOwnerHere('DELETE', paths.device(newId()))).status).toBe(404);
  });

  it('closes the stream for programs it holds open when revoked', async () => {
    const phone = await pairDevice('Phone');
    const ended = new Promise<string>((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { host: OUTSIDE_HOST, cookie: deviceCookie(phone.secret) } }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
          if (text.includes(': connected')) void asOwnerHere('DELETE', paths.device(phone.id));
        });
        res.on('end', () => resolve(text));
      });
      req.on('error', reject);
    });
    expect(await ended).toContain(': connected');
  });

  it('lists the devices without their hashes, and marks the one asking', async () => {
    const phone = await pairDevice('Phone');
    await pairDevice('Tablet');
    const fromPhone = DeviceList.parse((await fromOutside('GET', paths.devices, { cookie: deviceCookie(phone.secret) })).json);
    expect(fromPhone.devices.map((d) => [d.name, d.current])).toEqual([
      ['Tablet', false],
      ['Phone', true],
    ]);
    const answer = await asOwnerHere('GET', paths.devices);
    expect(DeviceList.parse(answer.json).devices.every((d) => !d.current)).toBe(true);
    for (const device of hub.state.devices) expect(answer.body).not.toContain(device.hash);
    expect(answer.body).not.toContain('"hash"');
  });
});

describe('what only the owner may do about devices', () => {
  it('is closed to every token whatever its scopes, and to sessions', () => {
    expect(authorize({ kind: 'token', tokenId: newId(), name: 'everything', scopes: [...GRANTABLE_SCOPES], reach: { kind: 'all' } }, 'devices.manage', {})).toBe(false);
    expect(authorize({ kind: 'session', sessionId: newId() }, 'devices.manage', {})).toBe(false);
    const sessionId = newId();
    expect(authorize({ kind: 'session', sessionId }, 'devices.manage', { sessionId })).toBe(false);
    expect(authorize({ kind: 'user' }, 'devices.manage', {})).toBe(true);
  });

  it('is behind the cookie: a token with every scope is refused on each of its routes', async () => {
    const everything = await makeToken([...GRANTABLE_SCOPES]);
    const { id } = await pairDevice();
    for (const [method, url] of [['GET', paths.devices], ['POST', paths.pairingCodes], ['DELETE', paths.device(id)]] as const) {
      for (const host of [`127.0.0.1:${port}`, OUTSIDE_HOST]) {
        expect((await send(method, url, { host, origin: host === OUTSIDE_HOST ? OUTSIDE : here, authorization: `Bearer ${everything}` }, method === 'POST' ? { name: 'x', kind: 'browser' } : undefined)).status, `${method} ${url} at ${host}`).toBe(401);
      }
    }
    expect(hub.state.devices[0]?.revokedAt).toBeNull();
  });
});

describe('a stranger from outside', () => {
  it('gets nothing from any route but the page and the one for a code', async () => {
    const isPage = (url: string): boolean => url === '/' || url === '/index.html' || url === '/*' || /^\/(c|p|t|s)\//.test(url);
    const filled = (url: string): string => url.replace('/*', '/assets/app.js').replace(/:[A-Za-z]+/g, () => newId());
    const routes = everyRouteOf(app);
    // Every kind of route is there to be tried: a walk of nothing would pass.
    for (const wanted of ['GET /api/v1/state', 'POST /api/v1/sessions', 'GET /ws/v1/events', 'GET /v1/canvases', 'POST /auth/pair', 'GET /auth', 'GET /', 'GET /*', 'GET /api/v1/devices', 'POST /api/v1/pairing-codes', 'DELETE /api/v1/devices/:deviceId', 'GET /api/v1/custom.css']) {
      expect(routes.map((r) => `${r.method} ${r.url}`)).toContain(wanted);
    }
    const answered: string[] = [];
    for (const route of routes) {
      const url = filled(route.url);
      for (const headers of [{ origin: OUTSIDE }, { origin: undefined }, { origin: OUTSIDE, cookie: masterCookie() }, { origin: OUTSIDE, cookie: `${deviceCookieName(port)}=${DEVICE_PREFIX}made-up` }]) {
        const answer = await fromOutside(route.method, url, headers, route.method === 'GET' || route.method === 'DELETE' ? undefined : {});
        expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
        if ([401, 403, 404].includes(answer.status)) continue;
        answered.push(`${route.method} ${route.url}`);
        if (route.method === 'POST' && route.url === paths.pair) continue;
        expect(isPage(route.url) && route.method === 'GET', `${route.method} ${route.url} answered ${answer.status}`).toBe(true);
      }
    }
    expect(answered).toContain('GET /');
    expect(answered).not.toContain('POST /auth/pair'); // A stranger's code does not work: it is refused too.
    expect(hub.state.devices).toEqual([]);
    expect(hub.state.sessions).toEqual([]);
    expect(opened).toEqual([]);
  });
});

describe('the desktop', () => {
  it('opens nothing for a request from outside, and says why', async () => {
    const { secret } = await pairDevice();
    const made = await fromOutside('POST', paths.sessions, { cookie: deviceCookie(secret) }, { desktop: true });
    expect(made.status).toBe(201);
    expect(CreateSessionResponse.parse(made.json).desktop).toEqual({ opened: false, says: NOT_AT_THIS_COMPUTER });
    const id = CreateSessionResponse.parse(made.json).session.id;
    const asked = await fromOutside('POST', `/v1/sessions/${id}/desktop`, { cookie: deviceCookie(secret) }, {});
    expect(asked.status).toBe(403);
    expect(asked.json.error.message).toMatch(/only for a request made at this computer/);
    expect(opened).toEqual([]);
    // At this computer, as before.
    expect((await asOwnerHere('POST', `/v1/sessions/${id}/desktop`, {})).status).toBe(200);
    expect(CreateSessionResponse.parse((await asOwnerHere('POST', paths.sessions, { desktop: true })).json).desktop?.opened).toBe(true);
    expect(opened).toHaveLength(2);
  });
});

describe('secrets and hashes', () => {
  it('are in no file of the data folder: not the secret, not a code', async () => {
    const used = await makeCode();
    const left = await makeCode();
    const answer = await tryCode(used);
    const secret = secretOf(answer);
    await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) });
    await tryCode('ABCDE-FGHJK');
    await fromOutside('DELETE', paths.device(hub.state.devices[0]!.id), { cookie: deviceCookie(secret) });
    await hub.flush();
    // Lines are written after the answer: wait for all four (two codes made, one paired, one refused, one revoked).
    await expect.poll(async () => (await readFile(path.join(dir, ACTIVITY_FILE), 'utf8').catch(() => '')).trimEnd().split('\n').length, { timeout: 5000 }).toBe(5);
    const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
    expect(files.map((file) => path.basename(file))).toEqual(expect.arrayContaining(['state.json', ACTIVITY_FILE]));
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const needle of [secret, secret.slice(DEVICE_PREFIX.length), used, used.replace('-', ''), left, left.replace('-', '')]) {
        expect(text.includes(needle), `${path.basename(file)} holds a secret or a code`).toBe(false);
      }
    }
    const lines = (await readFile(path.join(dir, ACTIVITY_FILE), 'utf8'))
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as ActivityEntry);
    expect(lines.map((line) => `${line.caller} ${line.method} ${line.route} ${line.outcome} ${line.deviceName ?? '-'}`)).toEqual([
      'owner POST /api/v1/pairing-codes ok -',
      'owner POST /api/v1/pairing-codes ok -',
      'pairing POST /auth/pair ok Phone',
      'pairing POST /auth/pair denied -',
      'device DELETE /api/v1/devices/:deviceId ok Phone',
    ]);
    expect(lines[4]?.byDeviceId).toBe(hub.state.devices[0]!.id);
    expect(lines[2]?.deviceId).toBe(hub.state.devices[0]!.id);
  });

  it('never send a device’s hash in a state answer, on the browser’s stream or on the stream for programs', async () => {
    const browser: string[] = [];
    const socket = openSocket(paths.events, { host: `127.0.0.1:${port}`, cookie: masterCookie() }, here);
    socket.on('message', (data) => browser.push(data.toString()));
    expect(await upgradeStatus(socket)).toBe(101);
    const programs: string[] = [];
    const reader = await makeToken(['read']);
    const stream = http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${reader}` } }, (res) => res.on('data', (chunk: Buffer) => programs.push(chunk.toString())));
    const owners: string[] = [];
    const ownerStream = http.get({ host: '127.0.0.1', port, path: publicPaths.events, headers: { host: `127.0.0.1:${port}`, cookie: masterCookie() } }, (res) => res.on('data', (chunk: Buffer) => owners.push(chunk.toString())));
    await expect.poll(() => programs.join('') + owners.join(''), { timeout: 5000 }).toMatch(/: connected[\s\S]*: connected/);

    const { secret, id } = await pairDevice();
    await fromOutside('GET', paths.state, { cookie: deviceCookie(secret) });
    await asOwnerHere('DELETE', paths.device(id));
    // Something every stream carries, to know the device's changes had their turn.
    await asOwnerHere('POST', publicPaths.canvases, { name: 'After' });
    await expect.poll(() => browser.join('\n'), { timeout: 5000 }).toContain('After');
    await expect.poll(() => programs.join('') + owners.join(''), { timeout: 5000 }).toMatch(/After[\s\S]*After/);
    stream.destroy();
    ownerStream.destroy();

    const hash = hub.state.devices[0]!.hash;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(browser.some((message) => message.includes('device.added'))).toBe(true);
    for (const text of [browser.join('\n'), programs.join(''), owners.join(''), (await asOwnerHere('GET', paths.state)).body, (await fromOutside('GET', paths.state, { cookie: deviceCookie((await pairDevice('Other')).secret) })).body]) {
      expect(text).not.toContain(hash);
      expect(text).not.toContain(secret);
    }
    // The stream for programs does not carry devices at all.
    expect(programs.join('') + owners.join('')).not.toContain('device.');
  });
});
