import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FOLLOW, GRANTABLE_SCOPES, NO_ATTENTION, NO_STATUS, PLUGIN_FILE_MAX_BYTES, PluginsAnswer, newId, paths, pluginFileHref, pluginStarter, readPluginManifest, type Scope, type Session } from '@aubergine/shared';
import { sessionToken } from './auth';
import { parsePluginCommand, runPluginCommand } from './cli/plugin';
import { FileActivityLog } from './activity';
import { PluginFolder, readPlugin, readPluginsFolder, writePluginStarter } from './plugins';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * Plugins: the one module that reads their folder, the routes that switch one on and read them again, the address
 * their files are served at to the owner alone and only under the digest switched on, and `aubergine plugin`. Every
 * file is in a temporary folder of the test's own; the runtime is a stand-in.
 */

const OUTSIDE = 'https://aubergine.example.test';
const OUTSIDE_HOST = 'aubergine.example.test';
const PAGE = 'https://elsewhere.example.test';
const MANIFEST = { name: 'Tickets', version: '0.1.0', runs: 'page', main: 'index.js', style: 'style.css', api: 1 };
const MODULE = 'export function activate(aubergine) { aubergine.say("hello"); }\n';
const STYLE = '[data-plugin] { color: var(--text); }\n';

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
let warnings: string[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
} as unknown as SessionRuntime;

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(dir);
  app = await buildServer({
    hub,
    sessions: new Sessions(hub, runtime, {}),
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: path.join(dir, 'none'),
    activity: new FileActivityLog(dir, 1024 * 1024),
    plugins: new PluginFolder(dir, (message) => warnings.push(message)),
    setPluginSwitch: (id, on) => settings.setPluginSwitch(id, on),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}

async function writePlugin(id: string, files: Record<string, string | Buffer> = { 'plugin.json': JSON.stringify(MANIFEST), 'index.js': MODULE, 'style.css': STYLE }): Promise<string> {
  const folder = path.join(dir, 'plugins', id);
  await mkdir(folder, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(folder, name), text);
  return folder;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-plugins-'));
  ownerToken = await loadOrCreateToken(dir);
  warnings = [];
  await writeFile(path.join(dir, 'config.json'), `${JSON.stringify({ theme: 'dark', access: { addresses: [OUTSIDE], pages: [PAGE] } }, null, 2)}\n`);
});
afterEach(async () => {
  await hub?.flush();
  await app?.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  text: string;
  headers: Record<string, unknown>;
}
async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
  let parsed: unknown;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch {
    parsed = response.body;
  }
  return { status: response.statusCode, body: parsed, text: response.body, headers: response.headers };
}
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const asOwnerCli = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}` }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);

async function makeToken(scopes: Scope[]): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name: 'everything', scopes, reach: { kind: 'all' } });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.secret as string;
}

function fakeSession(): Session {
  const session: Session = { id: newId(), projectId: hub.state.projects[0]!.id, name: 'agent', createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], fields: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}

const answerOf = async (): Promise<PluginsAnswer> => PluginsAnswer.parse((await asOwner('POST', '/v1/settings/plugins/read', {})).body);
const digestOf = async (id: string): Promise<string> => (await answerOf()).plugins.find((p) => p.id === id)!.digest!;
const settingsFile = async (): Promise<Record<string, unknown>> => JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8')) as Record<string, unknown>;

describe('the folder of plugins', () => {
  it('reads each plugin: its manifest, its files with their sizes, a digest over them, in the order of their IDs', async () => {
    await writePlugin('tickets');
    await writePlugin('another');
    const read = await readPluginsFolder(path.join(dir, 'plugins'));
    expect(read.problems).toEqual([]);
    expect(read.plugins.map((p) => p.found.id)).toEqual(['another', 'tickets']);
    const found = read.plugins[1]!.found;
    expect(found).toMatchObject({ id: 'tickets', name: 'Tickets', notLoaded: null, problems: [], manifest: { ...MANIFEST } });
    expect(found.files).toEqual([
      { name: 'index.js', bytes: MODULE.length },
      { name: 'plugin.json', bytes: JSON.stringify(MANIFEST).length },
      { name: 'style.css', bytes: STYLE.length },
    ]);
    expect(found.digest).toMatch(/^[0-9a-f]{64}$/);
    // The same files are the same digest; a changed one is another.
    expect(read.plugins[0]!.found.digest).toBe(found.digest);
    await writeFile(path.join(dir, 'plugins', 'tickets', 'index.js'), `${MODULE}// more\n`);
    expect((await readPlugin(path.join(dir, 'plugins'), 'tickets'))!.found.digest).not.toBe(found.digest);
  });

  it('is no plugins and no problem where there is no folder', async () => {
    expect(await readPluginsFolder(path.join(dir, 'plugins'))).toEqual({ plugins: [], problems: [] });
  });

  it('follows no link, reads no subfolder, no pipe and no odd name, and says each', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'aubergine-plugins-outside-'));
    try {
      await writeFile(path.join(outside, 'secret.js'), 'secret');
      const folder = await writePlugin('tickets');
      await symlink(path.join(outside, 'secret.js'), path.join(folder, 'linked.js'));
      await mkdir(path.join(folder, 'lib'));
      await writeFile(path.join(folder, 'lib', 'deep.js'), 'deep');
      await writeFile(path.join(folder, 'odd name.js'), 'odd');
      execFileSync('mkfifo', [path.join(folder, 'pipe.js')]);
      const found = (await readPlugin(path.join(dir, 'plugins'), 'tickets'))!.found;
      expect(found.notLoaded).toBeNull();
      expect(found.files.map((f) => f.name)).toEqual(['index.js', 'plugin.json', 'style.css']);
      expect(found.problems).toEqual([
        expect.stringMatching(/lib: it is a folder/),
        expect.stringMatching(/linked\.js: it is a link/),
        expect.stringMatching(/odd name\.js: its name is not one/),
        expect.stringMatching(/pipe\.js: it is not a regular file/),
      ]);
      // A plugin that is itself a link is not followed: it cannot be loaded.
      await mkdir(path.join(outside, 'elsewhere'));
      await writeFile(path.join(outside, 'elsewhere', 'plugin.json'), JSON.stringify(MANIFEST));
      await symlink(path.join(outside, 'elsewhere'), path.join(dir, 'plugins', 'linked'));
      const linked = (await readPlugin(path.join(dir, 'plugins'), 'linked'))!.found;
      expect(linked).toMatchObject({ manifest: null, digest: null, files: [], notLoaded: expect.stringMatching(/it is a link/) });
      // Nor is the folder of plugins.
      await rm(path.join(dir, 'plugins'), { recursive: true });
      await symlink(outside, path.join(dir, 'plugins'));
      expect(await readPluginsFolder(path.join(dir, 'plugins'))).toEqual({ plugins: [], problems: [expect.stringMatching(/plugins: it is a link/)] });
      expect(await new PluginFolder(dir).one('elsewhere')).toBeNull();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('reads at most 20 plugins, by name, and says the rest; skips what is no plugin and says it', async () => {
    for (let i = 0; i < 21; i += 1) await writePlugin(`p${String(i).padStart(2, '0')}`);
    await writeFile(path.join(dir, 'plugins', 'loose.js'), 'x');
    await mkdir(path.join(dir, 'plugins', 'Upper'));
    await writeFile(path.join(dir, 'plugins', '.DS_Store'), 'x');
    const read = await readPluginsFolder(path.join(dir, 'plugins'));
    expect(read.plugins).toHaveLength(20);
    expect(read.plugins.at(-1)!.found.id).toBe('p19');
    expect(read.problems).toEqual([expect.stringMatching(/Upper: its folder’s name is not one/), expect.stringMatching(/loose\.js: it is not a folder/), expect.stringMatching(/there are 21 plugins; the first 20/)]);
  });

  it('is not loaded with more than 40 files, a file over 1 MB, no manifest, a wrong one, or a manifest that names a file that is not there', async () => {
    const many: Record<string, string> = { 'plugin.json': JSON.stringify(MANIFEST), 'index.js': MODULE, 'style.css': STYLE };
    for (let i = 0; i < 37; i += 1) many[`f${i}.txt`] = 'x';
    await writePlugin('forty', many);
    many['one-more.txt'] = 'x';
    await writePlugin('forty-one', many);
    await writePlugin('large', { 'plugin.json': JSON.stringify(MANIFEST), 'index.js': MODULE, 'style.css': STYLE, 'big.png': Buffer.alloc(PLUGIN_FILE_MAX_BYTES + 1) });
    await writePlugin('exactly', { 'plugin.json': JSON.stringify(MANIFEST), 'index.js': MODULE, 'style.css': STYLE, 'big.png': Buffer.alloc(PLUGIN_FILE_MAX_BYTES) });
    await writePlugin('none', { 'index.js': MODULE });
    await writePlugin('wrong', { 'plugin.json': JSON.stringify({ ...MANIFEST, runs: 'sandbox' }), 'index.js': MODULE, 'style.css': STYLE });
    await writePlugin('missing', { 'plugin.json': JSON.stringify(MANIFEST), 'index.js': MODULE });
    const byId = Object.fromEntries((await readPluginsFolder(path.join(dir, 'plugins'))).plugins.map((p) => [p.found.id, p.found]));
    expect(byId.forty!.notLoaded).toBeNull();
    expect(byId['forty-one']).toMatchObject({ notLoaded: expect.stringMatching(/41 files, and a plugin may have at most 40/), digest: null, files: [] });
    expect(byId.large).toMatchObject({ notLoaded: expect.stringMatching(/big\.png: .*The plugin is not loaded/), digest: null });
    expect(byId.exactly!.notLoaded).toBeNull();
    expect(byId.none!.notLoaded).toMatch(/there is no plugin\.json/);
    expect(byId.wrong).toMatchObject({ name: 'Tickets', manifest: null, notLoaded: expect.stringMatching(/cannot run a plugin that way/) });
    expect(byId.missing!.notLoaded).toMatch(/names style\.css, which is not a file/);
  });

  it('says a problem in the log once', async () => {
    await writePlugin('none', { 'index.js': MODULE });
    const folder = new PluginFolder(dir, (message) => warnings.push(message));
    await folder.answer({});
    await folder.answer({});
    expect(warnings).toEqual([expect.stringMatching(/there is no plugin\.json/)]);
  });
});

describe('switching one on, and its files', () => {
  it('serves nothing of a plugin that is off; switched on by its digest now, its files to the owner, as what they are', async () => {
    await writePlugin('tickets');
    await start();
    const digest = await digestOf('tickets');
    const file = (name: string, at = digest) => asOwner('GET', pluginFileHref('tickets', at, name));
    expect((await file('index.js')).status).toBe(404);
    const on = await asOwner('PUT', '/v1/settings/plugins', { id: 'tickets', on: digest });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(PluginsAnswer.parse(on.body).on).toEqual({ tickets: digest });
    // One entry of the file, and the rest of it as it was.
    expect(await settingsFile()).toEqual({ theme: 'dark', access: { addresses: [OUTSIDE], pages: [PAGE] }, plugins: { on: { tickets: digest } } });
    const module = await file('index.js');
    expect(module.status).toBe(200);
    expect(module.text).toBe(MODULE);
    expect(module.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(module.headers['x-content-type-options']).toBe('nosniff');
    expect(module.headers['cache-control']).toBe('no-cache');
    expect((await file('style.css')).headers['content-type']).toBe('text/css; charset=utf-8');
    expect((await file('plugin.json')).headers['content-type']).toBe('application/json; charset=utf-8');
    // Under another digest, or a file that is not there, or of a kind that is not sent: not found.
    expect((await file('index.js', 'b'.repeat(64))).status).toBe(404);
    expect((await file('nothing.js')).status).toBe(404);
    await writeFile(path.join(dir, 'plugins', 'tickets', 'page.html'), '<script>1</script>');
    // The plugin changed (a file was added): nothing of it is served under the old switch.
    expect((await file('index.js')).status).toBe(404);
    const changed = await digestOf('tickets');
    expect(changed).not.toBe(digest);
    expect((await file('index.js', changed)).status).toBe(404);
    // Switched on again at what it is now.
    expect((await asOwner('PUT', '/v1/settings/plugins', { id: 'tickets', on: changed })).status).toBe(200);
    expect((await file('index.js', changed)).status).toBe(200);
    expect((await file('page.html', changed)).status).toBe(404);
    expect((await asOwner('GET', `${pluginFileHref('tickets', changed, 'x')}/../../../../config.json`)).status).toBe(404);
  });

  it('refuses a digest that is not the plugin’s now, a plugin that is not there or cannot be loaded; switches off with null', async () => {
    await writePlugin('tickets');
    await writePlugin('wrong', { 'plugin.json': '{', 'index.js': MODULE });
    await start();
    const digest = await digestOf('tickets');
    await writeFile(path.join(dir, 'plugins', 'tickets', 'index.js'), `${MODULE}// changed after it was read\n`);
    const stale = await asOwner('PUT', '/v1/settings/plugins', { id: 'tickets', on: digest });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toMatch(/not its digest now/);
    expect((await asOwner('PUT', '/v1/settings/plugins', { id: 'nothing', on: FOLLOW })).status).toBe(404);
    expect((await asOwner('PUT', '/v1/settings/plugins', { id: 'wrong', on: FOLLOW })).status).toBe(409);
    expect((await asOwner('PUT', '/v1/settings/plugins', { id: 'tickets', on: 'yes' })).status).toBe(400);
    expect((await settingsFile()).plugins).toBeUndefined();
    // Following changes: whatever is there is served, under the digest it has now.
    expect((await asOwner('PUT', '/v1/settings/plugins', { id: 'tickets', on: FOLLOW })).status).toBe(200);
    const now = await digestOf('tickets');
    expect((await asOwner('GET', pluginFileHref('tickets', now, 'index.js'))).text).toContain('changed after');
    expect((await asOwner('GET', pluginFileHref('tickets', digest, 'index.js'))).status).toBe(404);
    // Off: the entry goes, and nothing is served.
    expect((await asOwner('PUT', '/v1/settings/plugins', { id: 'tickets', on: null })).status).toBe(200);
    expect((await settingsFile()).plugins).toEqual({ on: {} });
    expect((await asOwner('GET', pluginFileHref('tickets', now, 'index.js'))).status).toBe(404);
  });

  it('takes a switch written by hand, and skips a wrong entry while the others count', async () => {
    await writePlugin('tickets');
    await start();
    const digest = await digestOf('tickets');
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ plugins: { on: { tickets: digest, Bad: FOLLOW, other: 'nope' } } }));
    const answer = await answerOf();
    expect(answer.on).toEqual({ tickets: digest });
    expect(answer.problems).toEqual([expect.stringMatching(/"Bad" is not a plugin’s ID/), expect.stringMatching(/plugins\.on\.other: is neither/)]);
    expect((await asOwner('GET', pluginFileHref('tickets', digest, 'index.js'))).status).toBe(200);
  });

  it('is in the owner’s state answer, with what the settings switch on', async () => {
    await writePlugin('tickets');
    await start();
    const state = { plugins: PluginsAnswer.parse((await asOwner('GET', paths.state)).body.plugins) };
    expect(state.plugins?.plugins.map((p) => [p.id, p.notLoaded])).toEqual([['tickets', null]]);
    expect(state.plugins?.folder).toBe(path.join(dir, 'plugins'));
    expect(state.plugins?.on).toEqual({});
  });

  it('is on record when the owner switches one from outside the browser', async () => {
    await writePlugin('tickets');
    await start();
    const digest = await digestOf('tickets');
    expect((await asOwnerCli('PUT', '/v1/settings/plugins', { id: 'tickets', on: digest })).status).toBe(200);
    for (let i = 0; i < 50; i += 1) {
      const activity = JSON.stringify((await asOwner('GET', '/v1/activity?limit=100')).body);
      if (activity.includes('plugins.manage') && activity.includes('owner-cli')) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Switching a plugin on from the command line is not in the activity log');
  });
});

describe('nobody but the owner', () => {
  it('can switch one on, read them again or be sent a file: not a token with every scope, not a session, not a stranger, not from outside with the access token, not a linked page', async () => {
    await writePlugin('tickets');
    await start();
    const digest = await digestOf('tickets');
    expect((await asOwner('PUT', '/v1/settings/plugins', { id: 'tickets', on: digest })).status).toBe(200);
    const href = pluginFileHref('tickets', digest, 'index.js');
    const everything = await makeToken([...GRANTABLE_SCOPES]);
    const agent = fakeSession();
    const session = sessionToken(ownerToken, agent.id);
    for (const secret of [everything, session]) {
      expect((await call(secret, 'PUT', '/v1/settings/plugins', { id: 'tickets', on: null })).status).toBe(403);
      expect((await call(secret, 'POST', '/v1/settings/plugins/read', {})).status).toBe(403);
      const file = await call(secret, 'GET', href);
      expect(file.status).toBe(401);
      expect(file.text).not.toContain('activate');
    }
    for (const headers of <Record<string, string>[]>[{}, { authorization: `Bearer ${ownerToken}` }, { cookie: `${cookieName(port)}=wrong` }]) {
      const file = await send(headers, 'GET', href);
      expect(file.status, JSON.stringify(headers)).toBe(401);
    }
    // From outside, the access token's cookie signs in nobody.
    const outside = await app.inject({ method: 'GET', url: href, headers: { host: OUTSIDE_HOST, origin: OUTSIDE, cookie: `${cookieName(port)}=${ownerToken}` } });
    expect(outside.statusCode).toBe(401);
    // A linked page with no credential, or a made-up one, is refused; no page device is told of them either.
    for (const authorization of [undefined, 'Bearer made-up']) {
      const linked = await send({ origin: PAGE, ...(authorization ? { authorization } : {}) }, 'GET', href);
      expect(linked.status).toBe(401);
    }
    // Still switched on as the owner left it.
    expect((await settingsFile()).plugins).toEqual({ on: { tickets: digest } });
    expect((await readdir(dir)).sort()).toContain('plugins');
  });
});

describe('aubergine plugin', () => {
  const run = async (words: string[]) => {
    const printed: string[] = [];
    const warned: string[] = [];
    const code = await runPluginCommand(parsePluginCommand(words), { dataDir: dir, print: (text) => printed.push(text), warn: (text) => warned.push(text) });
    return { code, printed, warned };
  };

  it('says where the folder is, and lists what is there with its state and what is wrong', async () => {
    expect((await run(['path'])).printed).toEqual([path.join(dir, 'plugins')]);
    expect((await run([])).printed).toEqual([expect.stringMatching(/There are no plugins in .*aubergine plugin new <id>/)]);
    await writePlugin('tickets');
    await writePlugin('none', { 'index.js': MODULE });
    const listed = await run(['list']);
    expect(listed.code).toBe(0);
    expect(listed.printed).toEqual(['none  none  not loaded  1 file, 64 B', expect.stringMatching(/^ {2}plugins\/none: there is no plugin\.json/), expect.stringMatching(/^tickets {2}Tickets 0\.1\.0 {2}off {2}3 files, /)]);
    const digest = (await readPlugin(path.join(dir, 'plugins'), 'tickets'))!.found.digest!;
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ plugins: { on: { tickets: digest } } }));
    expect((await run([])).printed.at(-1)).toMatch(/ {2}on {2}/);
    await writeFile(path.join(dir, 'plugins', 'tickets', 'index.js'), 'changed');
    expect((await run([])).printed.at(-1)).toMatch(/changed since you switched it on/);
    for (const words of [['path', 'x'], ['list', 'x'], ['remove'], ['new'], ['new', 'Bad'], ['new', 'a', 'b'], ['new', 'a', '--name'], ['new', 'a', '--name', 'two\nlines'], ['new', 'a', '--force'], ['on', 'tickets']]) expect(() => parsePluginCommand(words), words.join(' ')).toThrow();
  });

  it('writes a starter that is off, reads as a plugin, never over what is there, never through a link', async () => {
    const made = await run(['new', 'by-ticket', '--name', 'By ticket']);
    expect(made.code).toBe(0);
    expect(made.printed.join(' ')).toMatch(/It is off/);
    const folder = path.join(dir, 'plugins', 'by-ticket');
    for (const [name, text] of Object.entries(pluginStarter('By ticket'))) expect(await readFile(path.join(folder, name), 'utf8')).toBe(text);
    expect(readPluginManifest('by-ticket', await readFile(path.join(folder, 'plugin.json'), 'utf8'))).toMatchObject({ manifest: { name: 'By ticket' }, problems: [] });
    expect((await readPlugin(path.join(dir, 'plugins'), 'by-ticket'))!.found.notLoaded).toBeNull();
    // Nothing switched it on.
    expect(JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8')).plugins).toBeUndefined();
    // Never over what is there.
    const again = await run(['new', 'by-ticket']);
    expect(again.code).toBe(1);
    expect(again.warned[0]).toMatch(/already something named by-ticket/);
    // Never through a link: the folder of plugins as a link, or a plugin's folder as one.
    const outside = await mkdtemp(path.join(os.tmpdir(), 'aubergine-plugins-outside-'));
    try {
      await symlink(outside, path.join(dir, 'plugins', 'linked'));
      expect((await run(['new', 'linked'])).code).toBe(1);
      await rm(path.join(dir, 'plugins'), { recursive: true });
      await symlink(outside, path.join(dir, 'plugins'));
      await expect(writePluginStarter(dir, 'fresh', 'Fresh')).rejects.toThrow(/is a link/);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
