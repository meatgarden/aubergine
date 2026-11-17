import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { GRANTABLE_SCOPES, Settings, newId, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryActivityLog } from './activity';
import { sessionToken } from './auth';
import { DESKTOP_OPENS_PER_MINUTE } from './desktop';
import { FileDesktopOpener, chosenKind, commandFor, desktopKind, scriptFile, scriptFor, shQuote, splitCommand, startProgram, type DesktopOpener, type ScriptFacts, type Started } from './desktop/open';
import { FileRunArchive } from './run-archive';
import type { RuntimeSession, SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { FileTaskArchive } from './task-archive';
import { loadOrCreateToken } from './token';

/**
 * Opening a terminal on the owner's desktop. No test here opens an
 * application: the server is given a stand-in opener that keeps what it was
 * asked, and where the real opener is used, the program it would start is a
 * stand-in that keeps what it was given.
 */

const run = promisify(execFile);
/** Text that a shell would do something with, were it not quoted. */
const HOSTILE = ['plain', 'two words', "it's", 'say "hi"', '$HOME', '$(touch nope)', '`touch nope`', 'a;b|c&d', 'star *', 'back\\slash', "'", "''", '-n', 'tab\there', 'new\nline', 'ünï', ''];

describe('quoting for sh', () => {
  it('gives back every text exactly, through a real sh', async () => {
    for (const text of HOSTILE) {
      const { stdout } = await run('/bin/sh', ['-c', `printf %s ${shQuote(text)}`]);
      expect(stdout, JSON.stringify(text)).toBe(text);
    }
    // Several in a row stay several, each whole.
    const { stdout } = await run('/bin/sh', ['-c', `for a in ${HOSTILE.map(shQuote).join(' ')}; do printf '[%s]' "$a"; done`]);
    expect(stdout).toBe(HOSTILE.map((text) => `[${text}]`).join(''));
  });
});

describe('the script for a session', () => {
  const id = newId();
  const facts: ScriptFacts = { command: '/made up/data folder/bin/aubergine', port: 4999, dataDir: '/made up/data folder', socket: 'made-up', tmuxBin: null };

  it('is one command: this copy\'s attach for that ID, with this server\'s port and folders, each quoted', () => {
    expect(scriptFor(id, facts)).toBe(
      `#!/bin/sh\n# Written by Aubergine. Shows one of its terminals in this window; closing the window ends nothing.\nAUBERGINE_PORT='4999' AUBERGINE_DATA_DIR='/made up/data folder' AUBERGINE_TMUX_SOCKET='made-up' exec '/made up/data folder/bin/aubergine' attach '${id}'\n`,
    );
    const lines = scriptFor(id, { ...facts, tmuxBin: '/opt/made up/tmux' }).trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("AUBERGINE_TMUX_BIN='/opt/made up/tmux' exec ");
    // Only an ID is ever written into it.
    for (const bad of ['', 'x', `${id}; touch nope`, `${id}\n`, "'; touch nope; '", '../../etc']) expect(() => scriptFor(bad, facts), bad).toThrow();
  });

  it('runs that one command with exactly those values, whatever the paths hold', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aubergine-desktop-script-'));
    try {
      // A data folder with a space, both quotes and a dollar sign in its name.
      const dataDir = path.join(root, `a b'c"$HOME $(touch nope) d`);
      await mkdir(path.join(dataDir, 'bin'), { recursive: true });
      const out = path.join(root, 'out.txt');
      // A stand-in for the command: it writes down what it was started with.
      const command = path.join(dataDir, 'bin', 'aubergine');
      await writeFile(command, `#!/bin/sh\n{ printf '%s\\n' "$#" "$1" "$2" "$AUBERGINE_PORT" "$AUBERGINE_DATA_DIR" "$AUBERGINE_TMUX_SOCKET"; } > ${shQuote(out)}\n`);
      await chmod(command, 0o700);
      const file = path.join(root, 'made.command');
      await writeFile(file, scriptFor(id, { command, port: 4999, dataDir, socket: 'made-up', tmuxBin: null }));
      await chmod(file, 0o700);
      await run(file, [], { cwd: root });
      expect((await readFile(out, 'utf8')).split('\n').slice(0, 6)).toEqual(['2', 'attach', id, '4999', dataDir, 'made-up']);
      expect(await readdir(root)).not.toContain('nope');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('kinds', () => {
  const none = Settings.parse({}).desktop;
  const asked: [string, readonly string[], boolean][] = [];
  const start = async (program: string, args: readonly string[], wait: boolean): Promise<Started> => {
    asked.push([program, args, wait]);
    return { ok: true };
  };
  beforeEach(() => void (asked.length = 0));

  it('the usual one for the system, or the one the settings name; and a sentence where there is none', () => {
    expect(chosenKind(none, 'darwin')).toMatchObject({ kind: { kind: 'terminal' } });
    expect(chosenKind({ ...none, app: 'iterm' }, 'darwin')).toMatchObject({ kind: { kind: 'iterm' } });
    expect(chosenKind(none, 'linux')).toEqual({ problem: 'No terminal application is known for this system. Set desktop.app to "command" in the settings file, and write desktop.command.' });
    expect(chosenKind({ ...none, command: 'a-terminal -e {file}' }, 'linux')).toMatchObject({ kind: { kind: 'command' } });
    expect(chosenKind({ ...none, app: 'terminal' }, 'linux')).toEqual({ problem: 'Terminal is an application of macOS. On this system, set desktop.app to "command" and write desktop.command.' });
    expect(chosenKind({ ...none, app: 'command' }, 'darwin')).toMatchObject({ problem: expect.stringContaining('desktop.command is not written') });
    expect(chosenKind({ ...none, app: 'something-else' }, 'darwin')).toMatchObject({ problem: expect.stringContaining('is not one of: terminal, iterm, command') });
  });

  it('an application of macOS is handed the file to open, and nothing else is asked of it', async () => {
    const file = '/made up/desktop/x.command';
    expect(await desktopKind('terminal')?.open(file, { platform: 'darwin', settings: none, start })).toEqual({ ok: true });
    expect(await desktopKind('iterm')?.open(file, { platform: 'darwin', settings: none, start })).toEqual({ ok: true });
    expect(asked).toEqual([
      ['/usr/bin/open', ['-a', 'Terminal', file], true],
      ['/usr/bin/open', ['-a', 'iTerm', file], true],
    ]);
    // Not installed: said, with what the system said.
    const failed = await desktopKind('iterm')?.open(file, { platform: 'darwin', settings: none, start: async () => ({ ok: false, reason: 'Unable to find application named ‘iTerm’' }) });
    expect(failed).toEqual({ ok: false, reason: 'iTerm could not be asked to open it. Is it installed? (Unable to find application named ‘iTerm’)' });
  });

  it('a command of the owner\'s is split once, and the file is one argument whatever its path holds', async () => {
    expect(splitCommand('a-terminal  --title "my window" -e {file}')).toEqual(['a-terminal', '--title', 'my window', '-e', '{file}']);
    expect(splitCommand("x 'a b' \"\" c")).toEqual(['x', 'a b', '', 'c']);
    expect(splitCommand('x "open')).toBeNull();
    // Nothing is expanded: this is not a shell.
    expect(splitCommand('x $HOME ~ * a\\ b')).toEqual(['x', '$HOME', '~', '*', 'a\\', 'b']);
    for (const text of HOSTILE.filter((t) => t !== '')) {
      const file = `/made up/${text}/x.command`;
      expect(commandFor('a-terminal --run={file} -x', file), text).toEqual({ program: 'a-terminal', args: [`--run=${file}`, '-x'] });
      expect(commandFor('a-terminal -e {file}', file), text).toEqual({ program: 'a-terminal', args: ['-e', file] });
    }
    expect(commandFor('a-terminal -e', '/x')).toEqual({ problem: 'desktop.command needs {file} once, where the script file goes.' });
    expect(commandFor('a-terminal {file} {file}', '/x')).toMatchObject({ problem: expect.stringContaining('once') });
    expect(commandFor('{file}', '/x')).toEqual({ problem: 'desktop.command must begin with the program to start.' });
    expect(commandFor(null, '/x')).toMatchObject({ problem: expect.stringContaining('is not written') });
    await desktopKind('command')?.open('/made up/$(touch nope)/x.command', { platform: 'linux', settings: { ...none, command: 'a-terminal -e {file}' }, start });
    expect(asked).toEqual([['a-terminal', ['-e', '/made up/$(touch nope)/x.command'], false]]);
  });

  it('a program is started without a shell: what it is given arrives as it is', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aubergine-desktop-start-'));
    try {
      const out = path.join(root, 'out.json');
      const given = HOSTILE.filter((t) => t !== '-n');
      // A stand-in program (this very Node) that writes down its arguments.
      const made = commandFor(`${process.execPath} -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" ${out} {file} `, '$(touch nope) `touch nope` ; touch nope');
      if ('problem' in made) throw new Error(made.problem);
      expect(await startProgram(made.program, [...made.args, ...given], true)).toEqual({ ok: true });
      expect(JSON.parse(await readFile(out, 'utf8'))).toEqual(['$(touch nope) `touch nope` ; touch nope', ...given]);
      expect(await readdir(root)).toEqual(['out.json']);
      expect(await readdir(process.cwd())).not.toContain('nope');
      // A program that is not there, and one that ends badly, are a sentence.
      expect(await startProgram(path.join(root, 'no-such-program'), [], false)).toEqual({ ok: false, reason: `There is no program “${path.join(root, 'no-such-program')}” here.` });
      expect(await startProgram(process.execPath, ['-e', 'console.error("it said why"); process.exit(3)'], true)).toEqual({ ok: false, reason: 'it said why' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/* ---------- Through the server ---------- */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let origin: string;
let events: ChangeEvent[] = [];
const activity = new MemoryActivityLog();
/** What the stand-in opener was asked, and what it answers. */
let asked: string[] = [];
let answer: { ok: boolean; says: string } = { ok: true, says: 'Asked the stand-in to open it.' };
/** What the stand-in shells are, as the runtime would list them. */
let live: RuntimeSession[] = [];
/** With this set, the server gets the real opener, whose program is a stand-in that keeps what it was given. */
let realOpener = false;
let started: [string, readonly string[]][] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => live,
  has: async () => true,
  kill: async (id: string) => void (live = live.filter((s) => s.id !== id)),
  foreground: async () => 'zsh',
  typeLine: async () => {},
  create: async (options: { id: string }) => {
    const made = { id: options.id, cwd: null, command: null, activityAt: null };
    live.push(made);
    return made;
  },
  type: async () => {},
  press: async () => {},
  screen: async () => ({ text: 'ready> ', columns: 80, rows: 24, cursor: { x: 7, y: 0 }, line: 0 }),
  lines: async () => ({ lines: ['ready> '], more: false, lost: false }),
  search: async () => ({ hits: [], truncated: false }),
  snapshot: async () => 'ready> ',
} as unknown as SessionRuntime;

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(dir);
  sessions = new Sessions(hub, runtime, { agentLaunchLine: async () => 'the-agent' });
  const standIn: DesktopOpener = {
    open: async (sessionId) => {
      asked.push(sessionId);
      return answer;
    },
    forget: async () => {},
    sweep: async () => {},
  };
  const real = new FileDesktopOpener({
    dataDir: dir,
    facts: () => ({ command: path.join(dir, 'bin', 'aubergine'), port, dataDir: dir, socket: 'made-up', tmuxBin: null }),
    settings: async () => (await settings.reload()).desktop,
    platform: 'darwin',
    start: async (program, args) => {
      started.push([program, args]);
      return { ok: true };
    },
  });
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir), taskArchive: new FileTaskArchive(dir), activity, desktop: realOpener ? real : standIn, setDesktopOpenNew: (value) => settings.setDesktopOpenNew(value) });
  events = [];
  hub.subscribe((event) => events.push(event));
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}
async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
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
  return { status: response.statusCode, body: parsed, headers: response.headers };
}
/** The owner in the page: a browser says where a request comes from. */
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
/** The owner from a command line: the same cookie, and nothing that says a page sent it. */
const asOwnerOutside = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}` }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, ...more });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}
/** A terminal made in the page. */
async function make(body: object = {}): Promise<{ session: Session; desktop?: { opened: boolean; says: string } }> {
  const made = await asOwner('POST', '/api/v1/sessions', body);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body;
}
const config = async (): Promise<unknown> => JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'));
async function until(done: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await done())) {
    if (Date.now() > end) throw new Error('Waited too long');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const exists = (file: string): Promise<boolean> => stat(file).then(() => true, () => false);

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-desktop-'));
  ownerToken = await loadOrCreateToken(dir);
  // The walk below makes more calls with one token than the usual limit allows in a minute.
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 }, desktop: { command: 'a-terminal -e {file}' } }));
  asked = [];
  started = [];
  live = [];
  answer = { ok: true, says: 'Asked the stand-in to open it.' };
  realOpener = false;
  activity.entries.length = 0;
  await start();
});
afterEach(async () => {
  await stop();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('open on desktop', () => {
  it('asks the opener once for a running session, also one that runs an agent, and says what it did', async () => {
    const { session } = await make();
    const { session: withAgent } = await make({ agent: 'claude-code' });
    expect(asked).toEqual([]);
    events = [];
    expect((await asOwner('POST', `/v1/sessions/${session.id}/desktop`)).body).toEqual({ opened: true, says: 'Asked the stand-in to open it.' });
    expect((await asOwner('POST', `/v1/sessions/${withAgent.id}/desktop`)).status).toBe(200);
    expect(asked).toEqual([session.id, withAgent.id]);
    // Nothing about the session changed, and nothing was typed: opening is not a change.
    expect(events).toEqual([]);
    // A session that is not there; and one whose shell has ended, which has nothing to show.
    expect((await asOwner('POST', `/v1/sessions/${newId()}/desktop`)).status).toBe(404);
    hub.emit({ type: 'session.exited', sessionId: session.id });
    const ended = await asOwner('POST', `/v1/sessions/${session.id}/desktop`);
    expect(ended.status).toBe(409);
    expect(ended.body.error.message).toBe('This shell has ended: there is nothing to show. Restart it first.');
    expect(asked).toHaveLength(2);
  });

  it('says why when the application could not be asked, with the same answer shape', async () => {
    const { session } = await make();
    answer = { ok: false, says: 'iTerm could not be asked to open it. Is it installed?' };
    const failed = await asOwner('POST', `/v1/sessions/${session.id}/desktop`);
    expect(failed.status).toBe(200);
    expect(failed.body).toEqual({ opened: false, says: 'iTerm could not be asked to open it. Is it installed?' });
  });

  it('is bounded in rate', async () => {
    const { session } = await make();
    for (let n = 0; n < DESKTOP_OPENS_PER_MINUTE; n += 1) expect((await asOwner('POST', `/v1/sessions/${session.id}/desktop`)).status).toBe(200);
    const over = await asOwner('POST', `/v1/sessions/${session.id}/desktop`);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('rate_limited');
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
    expect(asked).toHaveLength(DESKTOP_OPENS_PER_MINUTE);
  });

  it('is in the activity log when the owner asks from outside the browser, and not from the page', async () => {
    const { session } = await make();
    await asOwner('POST', `/v1/sessions/${session.id}/desktop`);
    await asOwner('PUT', '/v1/settings/desktop', { openNew: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(activity.entries).toEqual([]);
    expect((await asOwnerOutside('POST', `/v1/sessions/${session.id}/desktop`)).body).toMatchObject({ opened: true });
    expect((await asOwnerOutside('PUT', '/v1/settings/desktop', { openNew: false })).body).toEqual({ openNew: false });
    await until(() => activity.entries.length === 2);
    expect(activity.entries.map((entry) => [entry.caller, entry.action, entry.status])).toEqual([
      ['owner-cli', 'desktop.open', 200],
      ['owner-cli', 'settings.write', 200],
    ]);
  });
});

describe('what stays the owner\'s', () => {
  it('no token of any scope and no session can open a desktop terminal or change the settings', async () => {
    const { session } = await make();
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });
    const own = sessionToken(ownerToken, session.id);
    const before = JSON.stringify(await config());
    for (const secret of [everything, own]) {
      expect((await call(secret, 'POST', `/v1/sessions/${session.id}/desktop`)).status).toBe(403);
      expect((await call(secret, 'POST', `/v1/sessions/${session.id}/desktop`, {})).status).toBe(403);
      for (const body of [{ openNew: true }, { app: 'command' }, { command: 'touch nope {file}' }, { openNew: true, app: 'command', command: 'touch nope {file}' }]) expect((await call(secret, 'PUT', '/v1/settings/desktop', body)).status).toBe(403);
    }
    // Every route there is, with bodies that ask for a window in every way a body could.
    const bodies: (object | undefined)[] = [undefined, {}, { desktop: true }, { openNew: true, app: 'command', command: 'touch nope {file}' }, { desktop: true, agent: 'claude-code', command: 'true', name: 'x' }];
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events' || route.method === 'DELETE') continue;
      const url = route.url.replace(/:([A-Za-z]+)/g, (_all, name: string) => (name === 'sessionId' ? session.id : name === 'canvasId' ? hub.state.canvases[0]!.id : newId()));
      for (const body of bodies) {
        if (route.method === 'GET' && body !== undefined) continue;
        for (const secret of [everything, own]) {
          const answered = await call(secret, route.method, url, body);
          expect(answered.status, `${route.method} ${route.url}`).not.toBe(500);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(500);
    // The token made sessions on the way, as it may. None of them, and nothing else, reached the opener or the file.
    expect(hub.state.sessions.length).toBeGreaterThan(1);
    expect(asked).toEqual([]);
    expect(JSON.stringify(await config())).toBe(before);
    // The cookie-only route that makes a terminal is not a token's either.
    expect((await call(everything, 'POST', '/api/v1/sessions', { desktop: true })).status).toBeGreaterThanOrEqual(400);
    expect(asked).toEqual([]);
  });

  it('the page changes one key of the settings file and leaves the rest; which application, and a command, are changed by no route', async () => {
    await writeFile(path.join(dir, 'config.json'), '{ "theme": "light", "api": { "rateLimitPerMinute": 100000 },\n  "desktop": { "app": "iterm", "command": "a-terminal -e {file}" }, "somethingOfTheirs": [1, 2] }');
    const changed = await asOwner('PUT', '/v1/settings/desktop', { openNew: true, app: 'command', command: 'touch nope {file}' });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toEqual({ openNew: true });
    expect(await config()).toEqual({ theme: 'light', api: { rateLimitPerMinute: 100000 }, desktop: { app: 'iterm', command: 'a-terminal -e {file}', openNew: true }, somethingOfTheirs: [1, 2] });
    // The page reads it back with the rest of the settings.
    expect((await asOwner('GET', '/api/v1/state')).body.settings.desktop).toEqual({ app: 'iterm', command: 'a-terminal -e {file}', openNew: true });
    expect((await asOwner('PUT', '/v1/settings/desktop', { openNew: false })).body).toEqual({ openNew: false });
    expect((await asOwner('PUT', '/v1/settings/desktop', {})).status).toBe(400);
    // A file that cannot be read is left exactly as it is.
    await writeFile(path.join(dir, 'config.json'), '{ not json');
    const refused = await asOwner('PUT', '/v1/settings/desktop', { openNew: true });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('Mend it by hand; it was not changed.');
    expect(await readFile(path.join(dir, 'config.json'), 'utf8')).toBe('{ not json');
    // No file yet: one is made with that key alone.
    await rm(path.join(dir, 'config.json'));
    expect((await asOwner('PUT', '/v1/settings/desktop', { openNew: true })).status).toBe(200);
    expect(await config()).toEqual({ desktop: { openNew: true } });
  });
});

describe('a new terminal', () => {
  it('made in the page with the box ticked asks the opener once for that session; not ticked, never, whatever the setting says', async () => {
    const withIt = await make({ desktop: true });
    expect(asked).toEqual([withIt.session.id]);
    expect(withIt.desktop).toEqual({ opened: true, says: 'Asked the stand-in to open it.' });
    // The setting is the page's default for its box. A request that does not say so opens nothing, also with the setting on.
    await asOwner('PUT', '/v1/settings/desktop', { openNew: true });
    const without = await make();
    const saidNo = await make({ desktop: false });
    expect(without.desktop).toBeUndefined();
    expect(saidNo.desktop).toBeUndefined();
    expect(asked).toEqual([withIt.session.id]);
    // And with the setting off, one terminal may still have it.
    await asOwner('PUT', '/v1/settings/desktop', { openNew: false });
    const once = await make({ desktop: true, agent: 'claude-code' });
    expect(asked).toEqual([withIt.session.id, once.session.id]);
  });

  it('made by a token, by the queue or by a schedule never opens a window, whatever the setting and whatever the request says', async () => {
    await asOwner('PUT', '/v1/settings/desktop', { openNew: true });
    const program = await makeToken('program', [...GRANTABLE_SCOPES], { reach: { kind: 'all' } });
    const byToken = await call(program, 'POST', `/v1/canvases/${hub.state.canvases[0]!.id}/sessions`, { name: 'by a token', desktop: true });
    expect(byToken.status, JSON.stringify(byToken.body)).toBe(201);
    expect(byToken.body.desktop).toBeUndefined();
    // A task that gets a new agent terminal, started by the owner; and a schedule run now, which goes the same way.
    const canvasId = hub.state.canvases[0]!.id;
    const task = await asOwner('POST', '/v1/tasks', { title: 'In a terminal of its own', taker: { kind: 'new', canvasId }, environment: 'full', desktop: true });
    expect(task.status, JSON.stringify(task.body)).toBe(201);
    expect((await asOwner('POST', '/v1/tasks/start', { taskId: task.body.id })).body.started).toMatchObject([{ ok: true }]);
    const element = await asOwner('POST', '/v1/elements', { name: 'Morning list', instructions: 'Gather: {{task}}' });
    const schedule = await asOwner('POST', '/v1/schedules', { name: 'By a schedule', time: '08:30', days: ['mon'], what: { kind: 'element', elementId: element.body.id }, where: { kind: 'new', canvasId }, environment: 'full' });
    expect(schedule.status, JSON.stringify(schedule.body)).toBe(201);
    expect((await asOwner('POST', `/v1/schedules/${schedule.body.id}/run`)).status).toBe(200);
    await until(() => hub.state.sessions.some((s) => s.name === 'By a schedule'));
    expect(hub.state.sessions.map((s) => s.name).sort()).toEqual(['By a schedule', 'In a terminal of its own', 'by a token']);
    expect(asked).toEqual([]);
  });

  it('is made all the same when the application could not be asked, and the answer says why', async () => {
    answer = { ok: false, says: 'Terminal could not be asked to open it. Is it installed?' };
    const made = await make({ desktop: true });
    expect(made.desktop).toEqual({ opened: false, says: 'Terminal could not be asked to open it. Is it installed?' });
    expect(hub.state.sessions.map((s) => s.id)).toEqual([made.session.id]);
    expect(live.map((s) => s.id)).toEqual([made.session.id]);
  });
});

describe('the script file', () => {
  it('is written for the session with only the owner allowed to run it, handed to the application, and removed when the session ends', async () => {
    await stop();
    realOpener = true;
    await start();
    const { session } = await make({ name: 'a name; $(touch nope)', desktop: true });
    const file = scriptFile(dir, session.id);
    // The application was handed the file, and nothing else.
    expect(started).toEqual([['/usr/bin/open', ['-a', 'Terminal', file]]]);
    expect((await stat(file)).mode & 0o777).toBe(0o700);
    const text = await readFile(file, 'utf8');
    expect(text).toBe(scriptFor(session.id, { command: path.join(dir, 'bin', 'aubergine'), port, dataDir: dir, socket: 'made-up', tmuxBin: null }));
    // Nothing of the session but its ID is in it.
    expect(text).not.toContain('a name');
    expect(text).not.toContain('touch');
    // The settings are read each time: the owner changed the application by hand.
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ desktop: { app: 'command', command: 'a-terminal --hold -e {file}' } }));
    expect((await asOwner('POST', `/v1/sessions/${session.id}/desktop`)).body.opened).toBe(true);
    expect(started[1]).toEqual(['a-terminal', ['--hold', '-e', file]]);
    // Ended for good: the file goes.
    expect((await asOwner('DELETE', `/api/v1/sessions/${session.id}`)).status).toBeLessThan(300);
    await until(async () => !(await exists(file)));
  });

  it('is removed when its shell ends by itself, and stale ones are removed at start', async () => {
    await stop();
    realOpener = true;
    await start();
    const [one, two] = [await make({ desktop: true }), await make({ desktop: true })];
    expect((await readdir(path.join(dir, 'desktop'))).sort()).toEqual([`${one.session.id}.command`, `${two.session.id}.command`].sort());
    hub.emit({ type: 'session.exited', sessionId: one.session.id });
    await until(async () => !(await exists(scriptFile(dir, one.session.id))));
    // Left behind by a server that stopped at a bad moment: a script of a session that is gone, half a file, something else.
    const gone = newId();
    for (const name of [`${gone}.command`, `${gone}.command.123.tmp`, 'something.txt']) await writeFile(path.join(dir, 'desktop', name), 'x');
    await stop();
    await start();
    expect(await readdir(path.join(dir, 'desktop'))).toEqual([`${two.session.id}.command`]);
  });
});

describe('the mark', () => {
  it('follows what the runtime counts: a viewer from outside this server appears on the session, and goes', async () => {
    const { session } = await make();
    await sessions.status();
    await sessions.refresh();
    expect(hub.state.sessions[0]?.outsideViewers ?? 0).toBe(0);
    events = [];
    live = [{ ...live[0]!, outside: 1 }];
    await sessions.refresh();
    await sessions.refresh();
    expect(events.filter((event) => event.type === 'session.viewers')).toEqual([{ type: 'session.viewers', sessionId: session.id, outside: 1 }]);
    expect((await asOwner('GET', `/v1/sessions/${session.id}`)).body.outsideViewers).toBe(1);
    live = [{ ...live[0]!, outside: 0 }];
    await sessions.refresh();
    expect(hub.state.sessions[0]?.outsideViewers).toBe(0);
    // A runtime that cannot tell says nothing, and nothing is claimed.
    live = [{ id: session.id, cwd: null, command: null, activityAt: null }];
    await sessions.refresh();
    expect(hub.state.sessions[0]?.outsideViewers).toBe(0);
  });
});
