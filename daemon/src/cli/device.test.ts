import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Settings, paths } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TmuxRuntime } from '../runtime/tmux-runtime';
import { buildServer } from '../server';
import { Sessions } from '../sessions';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { destroyTmuxServer, testSocketName } from '../test-support';
import { loadOrCreateToken } from '../token';
import { UsageError, parseCommand } from './commands';
import { DEFAULT_DEVICE_NAME, DEFAULT_PAGE_NAME, formatDevices, pairingLink, parseDeviceCommand, resolveDevice } from './device';

const run = promisify(execFile);
const SOCKET = testSocketName('cli-device');
const COMMAND = fileURLToPath(new URL('../../../bin/aubergine.mjs', import.meta.url));
const OUTSIDE = 'https://aubergine.example.test';
const PAGE = 'http://127.0.0.1:4600';

describe('parsing the device commands', () => {
  it('reads add, list and revoke', () => {
    expect(parseCommand(['device', 'add'])).toEqual({ name: 'device', words: ['add'] });
    expect(parseDeviceCommand([])).toEqual({ action: 'list' });
    expect(parseDeviceCommand(['list'])).toEqual({ action: 'list' });
    expect(parseDeviceCommand(['add'])).toEqual({ action: 'add', name: DEFAULT_DEVICE_NAME });
    expect(parseDeviceCommand(['add', '--name', 'My phone'])).toEqual({ action: 'add', name: 'My phone' });
    expect(parseDeviceCommand(['add', '--name=Tablet'])).toEqual({ action: 'add', name: 'Tablet' });
    expect(parseDeviceCommand(['add', '--page', 'http://127.0.0.1:4600'])).toEqual({ action: 'add', name: DEFAULT_PAGE_NAME, page: 'http://127.0.0.1:4600' });
    expect(parseDeviceCommand(['add', '--page=https://other.example.test', '--name', 'Laptop'])).toEqual({ action: 'add', name: 'Laptop', page: 'https://other.example.test' });
    expect(() => parseDeviceCommand(['add', '--page'])).toThrow(/--page needs the origin/);
    expect(parseDeviceCommand(['revoke', 'My', 'phone'])).toEqual({ action: 'revoke', query: 'My phone', yes: false });
    expect(parseDeviceCommand(['revoke', 'phone', '--yes'])).toEqual({ action: 'revoke', query: 'phone', yes: true });
  });

  it('reads who a device is for', () => {
    expect(parseDeviceCommand(['add', '--name', 'Phone', '--person', 'Ada Example'])).toEqual({ action: 'add', name: 'Phone', person: 'Ada Example' });
    expect(parseDeviceCommand(['add', '--person=Ada', '--page', 'http://127.0.0.1:4600'])).toEqual({ action: 'add', name: DEFAULT_PAGE_NAME, page: 'http://127.0.0.1:4600', person: 'Ada' });
    expect(() => parseDeviceCommand(['add', '--person'])).toThrow(/--person needs the name/);
    expect(() => parseDeviceCommand(['add', '--person', '--name', 'Phone'])).toThrow(/--person needs the name/);
    expect(() => parseDeviceCommand(['add', '--person', 'two\u0007bells'])).toThrow(/--person needs the name/);
    expect(() => parseDeviceCommand(['add', '--person', 'a'.repeat(81)])).toThrow(/--person needs the name/);
  });

  it('says what is wrong', () => {
    expect(() => parseDeviceCommand(['add', '--name'])).toThrow(/--name needs a name/);
    expect(() => parseDeviceCommand(['add', 'phone'])).toThrow(/does not know phone/);
    expect(() => parseDeviceCommand(['add', '--name', 'two\u0007bells'])).toThrow(/plain text/);
    expect(() => parseDeviceCommand(['revoke'])).toThrow(UsageError);
    expect(() => parseDeviceCommand(['revoke', 'x', '--force'])).toThrow(/does not know --force/);
    expect(() => parseDeviceCommand(['rename', 'x'])).toThrow(UsageError);
  });

  it('finds a device by name or ID, refuses a name that two have, and lists them', () => {
    const devices = [
      { id: '01900000-0000-7000-8000-0000000000a1', name: 'Phone', kind: 'browser' as const, origin: null, person: null, createdAt: '2026-03-01T09:00:00.000Z', lastUsedAt: '2026-03-02T09:00:00.000Z', revokedAt: null, status: 'active' as const, current: false },
      { id: '01900000-0000-7000-8000-0000000000b2', name: 'Tablet', kind: 'browser' as const, origin: null, person: null, createdAt: '2026-03-01T09:00:00.000Z', lastUsedAt: null, revokedAt: null, status: 'unused' as const, current: true },
      { id: '01900000-0000-7000-8000-0000000000c3', name: 'Tablet', kind: 'browser' as const, origin: null, person: null, createdAt: '2026-03-01T09:00:00.000Z', lastUsedAt: null, revokedAt: null, status: 'active' as const, current: false },
    ];
    expect(resolveDevice(devices, 'phone')).toBe(devices[0]);
    expect(resolveDevice(devices, devices[2]!.id)).toBe(devices[2]);
    expect(resolveDevice(devices, '01900000-0000-7000-8000-0000000000b')).toBe(devices[1]);
    expect(() => resolveDevice(devices, 'tablet')).toThrow(/2 devices are named "tablet"/);
    expect(() => resolveDevice(devices, 'laptop')).toThrow(/No device named "laptop"/);
    const table = formatDevices(devices).split('\n');
    expect(table[0]).toMatch(/^NAME +KIND +STATE +ADDED +LAST USED +ID$/);
    expect(table[1]).toMatch(/^Phone +browser +active +2026-03-01 +2026-03-02 +01900000/);
    expect(table[2]).toMatch(/^Tablet \(this one\) +browser +unused 90 days +2026-03-01 +never /);
    const page = { ...devices[0]!, name: 'Laptop', kind: 'page' as const, origin: 'http://127.0.0.1:4600' };
    expect(formatDevices([page]).split('\n')[1]).toMatch(/^Laptop +page http:\/\/127\.0\.0\.1:4600 +active /);
    // Who a device is for is a column only where some device is for someone; a name is shown with its control characters.
    const theirs = formatDevices([{ ...devices[0]!, person: 'Ada' }, { ...devices[2]!, person: null }, { ...devices[1]!, person: 'Bell \u0007' }]).split('\n');
    expect(theirs[0]).toMatch(/^NAME +FOR +KIND +STATE +ADDED +LAST USED +ID$/);
    expect(theirs[1]).toMatch(/^Phone +Ada +browser +active /);
    expect(theirs[2]).toMatch(/^Tablet +- +browser +active /);
    expect(theirs[3]).not.toContain('\u0007');
    expect(formatDevices([])).toContain('aubergine device add');
    expect(pairingLink(OUTSIDE, 'ABCDE-FGHJK')).toBe('https://aubergine.example.test/#pair=ABCDE-FGHJK');
  });
});

// The real command against real servers, with data folders, ports and a tmux socket of the test's own.
describe('aubergine device', () => {
  const runtime = new TmuxRuntime({ socket: SOCKET });
  let dir: string;
  const servers: { app: FastifyInstance; hub: StateHub; port: number; env: NodeJS.ProcessEnv }[] = [];

  const serve = async (name: string, addresses: string[], pages: string[] = []): Promise<(typeof servers)[number]> => {
    const data = path.join(dir, name);
    const token = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    const hub = new StateHub(await store.load(), store);
    const app = await buildServer({ hub, sessions: new Sessions(hub, runtime), runtime, settings: async () => Settings.parse({ access: { addresses, pages } }), token, devOrigin: null, webDist: path.join(dir, 'no-web') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as AddressInfo).port;
    const { TMUX: _tmux, ...outside } = process.env;
    const server = { app, hub, port, env: { ...outside, AUBERGINE_PORT: String(port), AUBERGINE_DATA_DIR: data, AUBERGINE_TMUX_SOCKET: SOCKET } };
    servers.push(server);
    return server;
  };

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-cli-device-')));
  });

  afterAll(async () => {
    for (const server of servers) {
      await server.hub.flush();
      await server.app.close();
    }
    await destroyTmuxServer(runtime, SOCKET);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const aubergine = async (env: NodeJS.ProcessEnv, ...args: string[]): Promise<{ code: number; out: string; err: string }> => {
    try {
      const result = await run(process.execPath, [COMMAND, ...args], { env, cwd: dir, timeout: 30_000 });
      return { code: 0, out: result.stdout, err: result.stderr };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      return { code: failed.code ?? -1, out: failed.stdout ?? '', err: failed.stderr ?? '' };
    }
  };
  /** What a new browser at the outside address does with a code. */
  const pair = async (server: (typeof servers)[number], code: string): Promise<number> =>
    (await server.app.inject({ method: 'POST', url: paths.pair, headers: { host: 'aubergine.example.test', origin: OUTSIDE }, payload: { code } })).statusCode;

  it('says there is no outside address, and which setting to write, and makes no code', async () => {
    const server = await serve('none', []);
    const added = await aubergine(server.env, 'device', 'add', '--name', 'Phone');
    expect(added.code).toBe(1);
    expect(added.out).toContain('No outside address is written in the settings');
    expect(added.out).toContain('"access": { "addresses": ["https://aubergine.example.net"] }');
    expect(added.out).not.toMatch(/[0-9A-Z]{5}-[0-9A-Z]{5}/);
    expect((await aubergine(server.env, 'device', 'list')).out).toContain('No devices');
  }, 60_000);

  it('prints a code with the address and a QR of it, lists the device it made, and revokes by ID and by name', async () => {
    const server = await serve('some', [OUTSIDE]);
    const added = await aubergine(server.env, 'device', 'add', '--name', 'Phone');
    expect(added.code, added.err).toBe(0);
    const code = /Pairing code for "Phone": ([0-9A-Z]{5}-[0-9A-Z]{5})/.exec(added.out)?.[1];
    expect(code).toBeDefined();
    expect(added.out).toContain('It works once, for three minutes');
    expect(added.out).toContain(`  ${OUTSIDE}/#pair=${code}`);
    // The QR, drawn in blocks (standard output is not a terminal here).
    expect(added.out).toMatch(/[█▀▄]{7}/);
    expect(await pair(server, code!)).toBe(204);

    // Two devices of one name, and a third.
    for (const name of ['Tablet', 'Tablet', 'Laptop']) {
      const made = await aubergine(server.env, 'device', 'add', '--name', name);
      expect(await pair(server, /: ([0-9A-Z]{5}-[0-9A-Z]{5})/.exec(made.out)![1]!)).toBe(204);
    }
    const listed = await aubergine(server.env, 'device', 'list');
    expect(listed.out).toMatch(/^NAME +KIND +STATE +ADDED +LAST USED +ID$/m);
    expect(listed.out).toMatch(/^Phone +browser +active /m);
    for (const device of server.hub.state.devices) expect(listed.out).not.toContain(device.hash);

    const ambiguous = await aubergine(server.env, 'device', 'revoke', 'tablet', '--yes');
    expect(ambiguous.code).toBe(2);
    expect(ambiguous.err).toContain('2 devices are named "tablet"');
    // Without --yes and with nobody at a terminal to answer, nothing is revoked.
    expect((await aubergine(server.env, 'device', 'revoke', 'phone')).err).toContain('asks before revoking');
    expect(server.hub.state.devices.every((d) => d.revokedAt === null)).toBe(true);

    const byName = await aubergine(server.env, 'device', 'revoke', 'phone', '--yes');
    expect(byName.out).toContain('Revoked "Phone"');
    const tablet = server.hub.state.devices.find((d) => d.name === 'Tablet')!;
    expect((await aubergine(server.env, 'device', 'revoke', tablet.id, '--yes')).out).toContain('Revoked "Tablet"');
    expect(server.hub.state.devices.filter((d) => d.revokedAt !== null).map((d) => d.id).sort()).toEqual([server.hub.state.devices.find((d) => d.name === 'Phone')!.id, tablet.id].sort());
    // With one of the two revoked, the name means the other.
    expect((await aubergine(server.env, 'device', 'revoke', 'tablet', '--yes')).out).toContain('Revoked "Tablet"');
    expect((await aubergine(server.env, 'device', 'list')).out).toMatch(/^Phone +browser +revoked /m);
  }, 120_000);

  it('makes a code for a linked page at an origin in access.pages, and refuses one that is not', async () => {
    const server = await serve('pages', [], [PAGE]);
    const refused = await aubergine(server.env, 'device', 'add', '--page', 'https://unlisted.example.test');
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('access.pages');
    expect(refused.out).not.toMatch(/[0-9A-Z]{5}-[0-9A-Z]{5}/);

    const added = await aubergine(server.env, 'device', 'add', '--page', PAGE, '--name', 'Laptop');
    expect(added.code, added.err).toBe(0);
    const code = /Pairing code for the page "Laptop": ([0-9A-Z]{5}-[0-9A-Z]{5})/.exec(added.out)?.[1];
    expect(code).toBeDefined();
    expect(added.out).toContain('It works once, for three minutes');
    expect(added.out).toContain(`In the page at ${PAGE}, choose "Link a server\u2026" and type this code there.`);
    // No address with the code in it, and no QR.
    expect(added.out).not.toContain('#pair=');
    expect(added.out).not.toMatch(/[█▀▄]{7}/);
    const paired = await server.app.inject({ method: 'POST', url: paths.pair, headers: { host: `127.0.0.1:${server.port}`, origin: PAGE }, payload: { code } });
    expect(paired.statusCode).toBe(200);
    const listed = await aubergine(server.env, 'device', 'list');
    expect(listed.out).toMatch(new RegExp(`^Laptop +page ${PAGE.replace(/[.]/g, '\\.')} +active `, 'm'));
  }, 60_000);
});
