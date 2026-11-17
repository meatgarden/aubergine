import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { COPY_BRANCH, COPY_NAME, DIFFERENCE_MAX_BYTES, GRANTABLE_SCOPES, NO_ATTENTION, NO_STATUS, newId, type ChangeEvent, type Difference, type Ending, type EnvironmentDetail, type EnvironmentOffers, type Scope, type Session, type SessionEnvironment } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { registerEnvironmentKind, unregisterEnvironmentKind } from './environments/kind';
import { FileRunArchive } from './run-archive';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * Working copies, through the routes against a real server, a real state
 * file and real Git repositories made for each test. Shells are a stand-in
 * that remembers which folder each was started in.
 */

let dir: string;
let saved: { global: string | undefined; system: string | undefined };
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
let typed: [string, string][] = [];
let failShell = false;
const startedIn = new Map<string, string>();
let copies: string;
let events: ChangeEvent[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  // The program an agent's record names is in front.
  foreground: async () => 'the-agent',
  typeLine: async (id: string, line: string) => {
    typed.push([id, line]);
  },
  create: async (options: { id: string; cwd: string }) => {
    if (failShell) throw new Error('no shell today');
    startedIn.set(options.id, options.cwd);
    return { id: options.id, cwd: options.cwd, command: null, activityAt: null };
  },
  // What a token that may type causes is another matter than deciding, and is not what these tests collect.
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
  const sessions = new Sessions(hub, runtime, {});
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir), copiesDir: copies });
  // What the server does while starting (reading the library that ships with it) is not what these tests are about.
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

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-copies-'));
  ownerToken = await loadOrCreateToken(dir);
  copies = path.join(await realpath(dir), 'copies');
  failShell = false;
  // The server's Git reads the owner's configuration. Here that is a file of this test, never the developer's own.
  saved = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_SYSTEM };
  process.env.GIT_CONFIG_GLOBAL = path.join(dir, 'owner.gitconfig');
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
  await writeFile(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = An Owner\n\temail = owner@example.invalid\n');
  // The walk below makes more calls with one token than the usual limit allows in a minute.
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  typed = [];
  await start();
});
afterEach(async () => {
  await stop();
  for (const [name, value] of [['GIT_CONFIG_GLOBAL', saved.global], ['GIT_CONFIG_SYSTEM', saved.system]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

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
/** The owner in the page: a browser says where a request comes from. */
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
/** The owner's command line: the same sign-in, and no word from a browser. */
const asCommand = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}` }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
const asSession = (session: Session, method: string, url: string, body?: unknown): Promise<Answer> => call(sessionToken(ownerToken, session.id), method, url, body);

async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, ...more });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}

function fakeSession(name: string, more: Partial<Session> = {}): Session {
  const session: Session = { id: newId(), projectId: hub.state.project.id, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, ...more };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}

/** Git, for making fixtures and for what an agent in a working copy would do: with no configuration of anyone's. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH ?? '', HOME: path.join(dir, 'fixture-home'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'Someone', GIT_AUTHOR_EMAIL: 'someone@example.invalid', GIT_COMMITTER_NAME: 'Someone', GIT_COMMITTER_EMAIL: 'someone@example.invalid' },
  }).trim();
}
async function put(root: string, file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), content);
}

/** A repository as an owner has one: two commits, a subfolder, something ignored, and work that is in no commit. */
async function repository(name = 'project'): Promise<string> {
  const root = path.join(await realpath(dir), name);
  await put(root, 'README.md', 'A project.\n');
  await put(root, 'src/retry.js', 'export const tries = 3;\n');
  await put(root, 'src/old.js', 'export const old = true;\n');
  await put(root, '.gitignore', 'node_modules/\n.env\n');
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'First');
  await put(root, 'src/retry.js', 'export const tries = 3;\nexport const wait = 100;\n');
  git(root, 'commit', '--quiet', '-am', 'Second');
  // What the owner has lying about: a change they have not committed, a new file, and files Git ignores.
  await put(root, 'README.md', 'A project.\nNotes of mine, not committed.\n');
  await put(root, 'scratch.txt', 'mine\n');
  await put(root, 'node_modules/dep/index.js', 'module.exports = 1;\n');
  await put(root, '.env', 'SECRET=made-up-value\n');
  return root;
}

/** Everything of the owner's that must stay as it is: every file of the checkout, the index, what is checked out, the branch, the configuration. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.name === '.git' && folder === root) continue;
      if (entry.isDirectory()) await walk(full);
      else found[path.relative(root, full)] = createHash('sha256').update(await readFile(full)).digest('hex');
    }
  };
  await walk(root);
  for (const file of ['index', 'HEAD', 'config']) found[`.git/${file}`] = createHash('sha256').update(await readFile(path.join(root, '.git', file))).digest('hex');
  found['branch main'] = git(root, 'rev-parse', 'refs/heads/main');
  found['checked out'] = git(root, 'symbolic-ref', 'HEAD');
  return found;
}

const environmentsNow = (): readonly SessionEnvironment[] => hub.state.environments;
const environmentOf = (sessionId: string): SessionEnvironment => environmentsNow().find((e) => e.sessionId === sessionId) as SessionEnvironment;

/** A terminal started by the owner, in a working copy unless said otherwise. */
async function startIn(folder: string, name: string, environment: string | null = 'working-copy'): Promise<{ status: number; body: any; session: Session }> { // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  const answer = await asOwner('POST', `/v1/canvases/${hub.state.canvases[0]!.id}/sessions`, { name, cwd: folder, ...(environment ? { environment } : {}) });
  return { ...answer, session: answer.body?.session as Session };
}
const detailOf = async (sessionId: string): Promise<EnvironmentDetail> => (await asOwner('GET', `/v1/sessions/${sessionId}/environment`)).body as EnvironmentDetail;
const endingsOf = async (id: string): Promise<Ending[]> => (await asOwner('GET', `/v1/environments/${id}/endings`)).body.endings as Ending[];
const branchesOf = (root: string): string[] => git(root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter((line) => line !== '');
const worktreesOf = (root: string): number => git(root, 'worktree', 'list', '--porcelain').split('\n').filter((line) => line.startsWith('worktree ')).length;

describe('starting in a working copy', () => {
  it("makes a second checkout on a branch of its own, in Aubergine's own folder, from what the owner has checked out, and leaves the owner's checkout exactly as it was", async () => {
    const root = await repository();
    const before = await snapshot(root);
    const started = await startIn(path.join(root, 'src'), 'Fix the retry');
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const environment = environmentOf(started.session.id);
    expect(environment).toMatchObject({ kind: 'working-copy', title: 'In its own working copy', projectFolder: root, sessionName: 'Fix the retry', startCommit: git(root, 'rev-parse', 'HEAD'), broken: null });
    expect(environment.words).toContain('Kept apart');
    expect(environment.words).not.toMatch(/sandbox|isolat|locked in|\bsafe\b/i);
    // In the folder for copies, not in the owner's repository; the names are made from a strict alphabet.
    expect(path.dirname(environment.folder)).toBe(copies);
    expect(path.basename(environment.folder)).toMatch(COPY_NAME);
    expect(path.basename(environment.folder).startsWith('fix-the-retry-')).toBe(true);
    expect(environment.branch).toMatch(COPY_BRANCH);
    expect(environment.folder.startsWith(root)).toBe(false);
    // The shell starts in the same place inside the copy that the owner was in.
    expect(startedIn.get(started.session.id)).toBe(path.join(environment.folder, 'src'));
    expect(started.session.cwd).toBe(path.join(environment.folder, 'src'));

    // What is in it: the commit. Not the owner's uncommitted change, not their untracked file, not what Git ignores.
    expect(await readFile(path.join(environment.folder, 'README.md'), 'utf8')).toBe('A project.\n');
    expect(await readFile(path.join(environment.folder, 'src/retry.js'), 'utf8')).toContain('wait = 100');
    for (const absent of ['scratch.txt', 'node_modules', '.env']) expect(existsSync(path.join(environment.folder, absent)), absent).toBe(false);
    expect(git(environment.folder, 'symbolic-ref', '--short', 'HEAD')).toBe(environment.branch);
    expect(await snapshot(root)).toEqual(before);

    // Reading what changed changes nothing either, and nothing has changed yet.
    const detail = await detailOf(started.session.id);
    expect(detail).toMatchObject({ kind: 'working-copy', files: [], filesCut: false, onBranch: environment.branch, note: null });
    expect(detail.environment?.changes).toMatchObject({ changed: 0, added: 0, removed: 0, commits: 0, uncommitted: 0 });
    expect(await snapshot(root)).toEqual(before);
  });

  it('is offered only where a working copy can be had, with the reason where it cannot, and says what is not carried over', async () => {
    const root = await repository();
    const before = await snapshot(root);
    const offers = (await asOwner('GET', `/v1/environments/offers?folder=${encodeURIComponent(path.join(root, 'src'))}`)).body as EnvironmentOffers;
    expect(offers.offers.map((o) => [o.kind, o.available])).toEqual([['full', true], ['working-copy', true]]);
    const copy = offers.offers[1]!;
    // The owner's README is changed and scratch.txt is new: two files, said with the count. Ignored files are not counted.
    expect(copy.notes.join(' ')).toContain('2 files in your checkout have changes that are in no commit. They are not carried over, and they are not touched');
    expect(copy.notes.join(' ')).toContain('Files Git ignores or does not track are not in a new working copy');
    expect(copy.notes.join(' ')).toContain('(main)');
    // Asking wrote nothing: not even the refresh of the index that a plain `git status` does.
    expect(await snapshot(root)).toEqual(before);

    const reasonFor = async (folder: string): Promise<string | null> => ((await asOwner('GET', `/v1/environments/offers?folder=${encodeURIComponent(folder)}`)).body as EnvironmentOffers).offers.find((o) => o.kind === 'working-copy')?.reason ?? null;
    const plain = path.join(dir, 'no-repository');
    await mkdir(plain);
    expect(await reasonFor(plain)).toBe('This folder is not in a Git repository.');
    const bare = path.join(dir, 'bare.git');
    git(dir, 'init', '--quiet', '--bare', bare);
    expect(await reasonFor(bare)).toContain('bare repository');
    const empty = path.join(dir, 'empty');
    await mkdir(empty);
    git(empty, 'init', '--quiet');
    expect(await reasonFor(empty)).toContain('no commit yet');
    expect(await reasonFor(path.join(dir, 'not-there'))).toBe('That folder does not exist.');
    // Starting there anyway is refused with the same reason, and starts nothing.
    const refused = await startIn(plain, 'nowhere');
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe('This folder is not in a Git repository.');
    expect(hub.state.sessions).toEqual([]);
    expect(environmentsNow()).toEqual([]);
    // A kind nobody registered is refused by name.
    expect((await startIn(root, 'x', 'a-container')).status).toBe(400);
  });

  it('gives a valid branch and folder for any name a session may have, and two sessions of one name do not collide', async () => {
    const root = await repository();
    const names = ['with spaces and CAPITALS', 'a/b/../c', '...', '-rf --force', 'tab\there', 'x'.repeat(80), 'ünïcödé ✓', 'same', 'same'];
    const made: SessionEnvironment[] = [];
    for (const name of names) {
      const started = await startIn(root, name);
      expect(started.status, `${JSON.stringify(name)} ${JSON.stringify(started.body)}`).toBe(201);
      made.push(environmentOf(started.session.id));
    }
    for (const environment of made) {
      expect(path.basename(environment.folder)).toMatch(COPY_NAME);
      expect(environment.branch).toMatch(COPY_BRANCH);
      expect(path.basename(environment.folder).length).toBeLessThanOrEqual(47);
      // Git agrees that it is a branch name.
      expect(git(root, 'check-ref-format', '--branch', environment.branch as string)).toBe(environment.branch);
      expect(existsSync(path.join(environment.folder, 'README.md'))).toBe(true);
    }
    expect(new Set(made.map((e) => e.folder)).size).toBe(names.length);
    expect(new Set(made.map((e) => e.branch)).size).toBe(names.length);
    expect(path.basename(made[3]!.folder)).toMatch(/^rf-force-[0-9a-f]{6}$/);
    expect(path.basename(made[2]!.folder)).toMatch(/^terminal-[0-9a-f]{6}$/);
  });

  it('leaves nothing behind when it fails half way: no folder, no branch, no entry in the repository, no session, and the owner as before', async () => {
    const root = await repository();
    // A filter the owner configured that must succeed and does not: Git makes the branch and the entry, then fails writing files out.
    await writeFile(path.join(root, '.git', 'config'), `${await readFile(path.join(root, '.git', 'config'), 'utf8')}[filter "broken"]\n\tsmudge = false\n\tclean = cat\n\trequired = true\n`);
    await put(root, '.gitattributes', 'src/*.js filter=broken\n');
    git(root, 'add', '.gitattributes');
    git(root, 'commit', '--quiet', '-m', 'A filter that fails');
    const before = await snapshot(root);
    const refused = await startIn(root, 'will not start');
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('The working copy could not be made');
    expect(existsSync(copies) ? await readdir(copies) : []).toEqual([]);
    expect(branchesOf(root)).toEqual(['main']);
    expect(worktreesOf(root)).toBe(1);
    expect(hub.state.sessions).toEqual([]);
    expect(environmentsNow()).toEqual([]);
    expect(await snapshot(root)).toEqual(before);
  });

  it('takes away what it made when the shell cannot be started after all', async () => {
    const root = await repository();
    const before = await snapshot(root);
    failShell = true;
    expect((await startIn(root, 'no shell')).status).toBeGreaterThanOrEqual(500);
    failShell = false;
    expect(await readdir(copies)).toEqual([]);
    expect(branchesOf(root)).toEqual(['main']);
    expect(worktreesOf(root)).toBe(1);
    expect(environmentsNow()).toEqual([]);
    expect(await snapshot(root)).toEqual(before);
  });
});

describe('two terminals on one repository', () => {
  it('change the same file differently, neither sees the other, the owner sees neither, and each one can be read apart', async () => {
    const root = await repository();
    const before = await snapshot(root);
    const one = environmentOf((await startIn(root, 'one')).session.id);
    const two = environmentOf((await startIn(root, 'two')).session.id);

    // One commits its change and adds a file; the other leaves its change uncommitted, removes a file and adds one Git does not know yet.
    await put(one.folder, 'src/retry.js', 'export const tries = 5;\nexport const wait = 100;\n');
    await put(one.folder, 'src/new-in-one.js', 'export const one = 1;\n');
    git(one.folder, 'add', '-A');
    git(one.folder, 'commit', '--quiet', '-m', 'Five tries');
    await put(two.folder, 'src/retry.js', 'export const tries = 9;\nexport const wait = 100;\n');
    await rm(path.join(two.folder, 'src/old.js'));
    await put(two.folder, 'notes of two.txt', 'first line\nsecond line\n');

    expect(await readFile(path.join(one.folder, 'src/retry.js'), 'utf8')).toContain('tries = 5');
    expect(await readFile(path.join(two.folder, 'src/retry.js'), 'utf8')).toContain('tries = 9');
    expect(await readFile(path.join(root, 'src/retry.js'), 'utf8')).toContain('tries = 3');
    expect(existsSync(path.join(two.folder, 'src/new-in-one.js'))).toBe(false);

    const first = await detailOf(one.sessionId as string);
    expect(first.files).toEqual([{ path: 'src/new-in-one.js', state: 'added', committed: true }, { path: 'src/retry.js', state: 'changed', committed: true }]);
    expect(first.environment?.changes).toMatchObject({ changed: 1, added: 1, removed: 0, commits: 1, uncommitted: 0 });
    const second = await detailOf(two.sessionId as string);
    expect(second.files).toEqual([{ path: 'notes of two.txt', state: 'added', committed: false }, { path: 'src/old.js', state: 'removed', committed: false }, { path: 'src/retry.js', state: 'changed', committed: false }]);
    expect(second.environment?.changes).toMatchObject({ changed: 1, added: 1, removed: 1, commits: 0, uncommitted: 3 });
    // The counts are in the state, for the page; no file name is.
    expect(environmentOf(two.sessionId as string).changes).toMatchObject({ changed: 1, added: 1, removed: 1 });
    expect(JSON.stringify(hub.state.environments)).not.toContain('retry.js');

    const difference = async (sessionId: string, file: string): Promise<Difference> => (await asOwner('GET', `/v1/sessions/${sessionId}/environment/difference?file=${encodeURIComponent(file)}`)).body as Difference;
    const inOne = await difference(one.sessionId as string, 'src/retry.js');
    expect(inOne.text).toContain('-export const tries = 3;');
    expect(inOne.text).toContain('+export const tries = 5;');
    expect(inOne.text).not.toContain('tries = 9');
    const inTwo = await difference(two.sessionId as string, 'src/retry.js');
    expect(inTwo.text).toContain('+export const tries = 9;');
    expect(inTwo.text).not.toContain('tries = 5');
    expect((await difference(two.sessionId as string, 'notes of two.txt')).text).toBe('+++ notes of two.txt (new, not yet known to Git)\n+first line\n+second line');
    expect((await difference(two.sessionId as string, 'src/old.js')).text).toContain('-export const old = true;');
    // Only a file that is listed as changed can be asked for: not another file of the copy, not a path out of it.
    for (const file of ['README.md', '../../project/.env', '/etc/passwd', '.git/config']) expect((await asOwner('GET', `/v1/sessions/${two.sessionId}/environment/difference?file=${encodeURIComponent(file)}`)).status, file).toBe(404);

    expect(await snapshot(root)).toEqual(before);
  });

  it('bounds the text of a difference: a long one is cut and says so, and a file that is not text, or is very large, is not drawn', async () => {
    const root = await repository();
    const copy = environmentOf((await startIn(root, 'big')).session.id);
    await put(copy.folder, 'src/retry.js', Array.from({ length: 40_000 }, (_unused, n) => `export const line${n} = ${n};`).join('\n'));
    await put(copy.folder, 'picture.bin', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 0, 0, 255]));
    await put(copy.folder, 'huge.txt', 'x'.repeat(2_100_000));
    await put(copy.folder, 'long-new.txt', `${'a line\n'.repeat(60_000)}`);
    const read = async (file: string): Promise<Difference> => (await asOwner('GET', `/v1/sessions/${copy.sessionId}/environment/difference?file=${encodeURIComponent(file)}`)).body as Difference;
    const long = await read('src/retry.js');
    expect(long.cut).toBe(true);
    expect(Buffer.byteLength(long.text)).toBeLessThanOrEqual(DIFFERENCE_MAX_BYTES);
    expect(await read('picture.bin')).toMatchObject({ text: '', notDrawn: 'This file is not text.' });
    expect(await read('huge.txt')).toMatchObject({ text: '', notDrawn: 'This file is too large to draw here.' });
    const longNew = await read('long-new.txt');
    expect(longNew.cut).toBe(true);
    expect(Buffer.byteLength(longNew.text)).toBeLessThanOrEqual(DIFFERENCE_MAX_BYTES + 2 * 60_000);
    // A binary file that Git tracks, changed.
    await put(copy.folder, 'tracked.bin', Buffer.from([0, 1, 2, 3]));
    git(copy.folder, 'add', 'tracked.bin');
    git(copy.folder, 'commit', '--quiet', '-m', 'A binary file');
    expect(await read('tracked.bin')).toMatchObject({ text: '', notDrawn: 'This file is not text.' });
  });
});

describe('the text of a difference is content', () => {
  it('is refused to a token without the scope for reading terminals, to one whose reach does not cover the session, and for a terminal that is people only; names and counts are reading', async () => {
    const root = await repository();
    const started = await startIn(root, 'reachable');
    const copy = environmentOf(started.session.id);
    await put(copy.folder, 'src/retry.js', 'export const tries = 7; // PRIVATE-CONTENT-4471\n');
    const url = `/v1/sessions/${started.session.id}/environment/difference?file=${encodeURIComponent('src/retry.js')}`;
    const reader = await makeToken('reader', ['read']);
    const names = await call(reader, 'GET', `/v1/sessions/${started.session.id}/environment`);
    expect(names.status).toBe(200);
    expect(names.body.files).toEqual([{ path: 'src/retry.js', state: 'changed', committed: false }]);
    expect(JSON.stringify(names.body)).not.toContain('PRIVATE-CONTENT-4471');
    expect((await call(reader, 'GET', '/v1/environments')).status).toBe(200);
    expect(JSON.stringify((await call(reader, 'GET', '/v1/environments')).body)).not.toContain('PRIVATE-CONTENT-4471');
    expect((await call(reader, 'GET', url)).status).toBe(403);

    const elsewhere = await makeToken('elsewhere', ['read', 'terminal:read'], { reach: { kind: 'tag', tag: 'another' } });
    const out = await call(elsewhere, 'GET', url);
    expect(out.status).toBe(403);
    expect(out.body.error.code).toBe('out_of_reach');
    expect(JSON.stringify(out.body)).not.toContain('PRIVATE-CONTENT-4471');
    // Told the same about a session that does not exist.
    expect((await call(elsewhere, 'GET', `/v1/sessions/${newId()}/environment/difference?file=x`)).body).toEqual(out.body);

    const within = await makeToken('within', ['read', 'terminal:read'], { reach: { kind: 'all' } });
    const allowed = await call(within, 'GET', url);
    expect(allowed.status).toBe(200);
    expect(allowed.body.text).toContain('PRIVATE-CONTENT-4471');
    // The session's own token reads neither.
    expect((await asSession(started.session, 'GET', url)).status).toBe(403);
    // People only closes it to every token.
    expect((await asOwner('PUT', `/v1/sessions/${started.session.id}/protection`, { peopleOnly: true })).status).toBe(200);
    expect((await call(within, 'GET', url)).status).toBe(403);
    // The route for an environment by its own ID is the owner's alone.
    expect((await call(within, 'GET', `/v1/environments/${copy.id}/difference?file=${encodeURIComponent('src/retry.js')}`)).status).toBe(403);
    expect((await asOwner('GET', `/v1/environments/${copy.id}/difference?file=${encodeURIComponent('src/retry.js')}`)).body.text).toContain('PRIVATE-CONTENT-4471');
  });
});

describe('when the session ends', () => {
  it('nothing is removed by ending the session; the working copy stays in the list and says its session is gone', async () => {
    const root = await repository();
    const started = await startIn(root, 'ends');
    const copy = environmentOf(started.session.id);
    await put(copy.folder, 'work.txt', 'not committed\n');
    expect((await asOwner('DELETE', `/v1/sessions/${started.session.id}`)).status).toBe(204);
    expect(environmentsNow()).toMatchObject([{ id: copy.id, sessionId: null, sessionName: 'ends' }]);
    expect(await readFile(path.join(copy.folder, 'work.txt'), 'utf8')).toBe('not committed\n');
    const listed = await asOwner('GET', '/v1/environments');
    expect(listed.body.items).toMatchObject([{ id: copy.id, sessionId: null, branch: copy.branch, changes: { added: 1, uncommitted: 1 } }]);
    expect(listed.body.items[0].bytes).toBeGreaterThan(0);
    // A terminal the owner starts by hand inside it takes the place of the one that is gone.
    const again = await startIn(path.join(copy.folder, 'src'), 'back again', null);
    expect(environmentOf(again.session.id)).toMatchObject({ id: copy.id, sessionName: 'back again' });
  });

  it('the branch is kept and the folder removed only when everything is committed; otherwise it says what is not', async () => {
    const root = await repository();
    const before = await snapshot(root);
    const copy = environmentOf((await startIn(root, 'keeps a branch')).session.id);
    await put(copy.folder, 'src/retry.js', 'export const tries = 4;\n');
    await put(copy.folder, 'untracked.txt', 'x\n');
    const endings = await endingsOf(copy.id);
    expect(endings.map((e) => [e.choice, e.available])).toEqual([['keep-branch', false], ['keep', true], ['discard', true]]);
    expect(endings[0]?.reason).toBe('2 files hold work that is in no commit, and would be lost with the folder. Commit there first, or keep everything.');
    const refused = await asOwner('POST', `/v1/environments/${copy.id}/end`, { choice: 'keep-branch' });
    expect(refused.status).toBe(409);
    expect(existsSync(path.join(copy.folder, 'untracked.txt'))).toBe(true);
    // Keeping everything keeps everything.
    expect((await asOwner('POST', `/v1/environments/${copy.id}/end`, { choice: 'keep' })).body).toEqual({ removed: false, says: 'Everything is kept.' });
    expect(environmentsNow().map((e) => e.id)).toEqual([copy.id]);

    git(copy.folder, 'add', '-A');
    git(copy.folder, 'commit', '--quiet', '-m', 'Four tries');
    const tip = git(copy.folder, 'rev-parse', 'HEAD');
    const done = await asOwner('POST', `/v1/environments/${copy.id}/end`, { choice: 'keep-branch' });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.removed).toBe(true);
    expect(existsSync(copy.folder)).toBe(false);
    expect(git(root, 'rev-parse', `refs/heads/${copy.branch}`)).toBe(tip);
    expect(worktreesOf(root)).toBe(1);
    expect(environmentsNow()).toEqual([]);
    // Nothing was merged, and the owner's checkout is as it was.
    expect(await snapshot(root)).toEqual(before);
  });

  it('nothing is discarded without the second question when work exists nowhere else, and the question names the commits and the files', async () => {
    const root = await repository();
    const before = await snapshot(root);
    // Nothing done in it: discarding loses nothing, and asks once.
    const idle = environmentOf((await startIn(root, 'idle')).session.id);
    expect((await endingsOf(idle.id)).find((e) => e.choice === 'discard')?.asksAgain).toBeNull();
    expect((await asOwner('POST', `/v1/environments/${idle.id}/end`, { choice: 'discard' })).status).toBe(200);
    expect(existsSync(idle.folder)).toBe(false);
    expect(branchesOf(root)).toEqual(['main']);

    const copy = environmentOf((await startIn(root, 'has work')).session.id);
    await put(copy.folder, 'src/retry.js', 'export const tries = 6;\n');
    git(copy.folder, 'commit', '--quiet', '-am', 'Six');
    await put(copy.folder, 'src/retry.js', 'export const tries = 7;\n');
    git(copy.folder, 'commit', '--quiet', '-am', 'Seven');
    await put(copy.folder, 'loose.txt', 'x\n');
    const question = 'This working copy holds 2 commits that are on no other branch and 1 file with work that is in no commit. That work exists nowhere else, and discarding loses it for good. Discard anyway?';
    expect((await endingsOf(copy.id)).find((e) => e.choice === 'discard')?.asksAgain).toBe(question);
    for (const body of [{ choice: 'discard' }, { choice: 'discard', confirm: false }]) {
      const refused = await asOwner('POST', `/v1/environments/${copy.id}/end`, body);
      expect(refused.status).toBe(409);
      expect(refused.body.error.message).toBe(question);
    }
    expect(existsSync(path.join(copy.folder, 'loose.txt'))).toBe(true);
    expect(branchesOf(root)).toContain(copy.branch);
    // Commits that another branch also holds are not "nowhere else".
    git(root, 'branch', 'saved-by-the-owner', copy.branch as string);
    expect((await endingsOf(copy.id)).find((e) => e.choice === 'discard')?.asksAgain).toBe('This working copy holds 1 file with work that is in no commit. That work exists nowhere else, and discarding loses it for good. Discard anyway?');
    git(root, 'branch', '-D', 'saved-by-the-owner');

    const done = await asOwner('POST', `/v1/environments/${copy.id}/end`, { choice: 'discard', confirm: true });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(existsSync(copy.folder)).toBe(false);
    expect(branchesOf(root)).toEqual(['main']);
    expect(worktreesOf(root)).toBe(1);
    expect(environmentsNow()).toEqual([]);
    expect((await asOwner('POST', `/v1/environments/${copy.id}/end`, { choice: 'discard', confirm: true })).status).toBe(404);
    expect(await snapshot(root)).toEqual(before);
  });

  it('cannot be removed or discarded by any token or any session, by any route', async () => {
    const root = await repository();
    const started = await startIn(root, 'guarded');
    const copy = environmentOf(started.session.id);
    await put(copy.folder, 'src/retry.js', 'export const tries = 8;\n');
    git(copy.folder, 'commit', '--quiet', '-am', 'Eight');
    await put(copy.folder, 'loose.txt', 'x\n');
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });
    const other = fakeSession('another');
    const bodies: (object | undefined)[] = [undefined, {}, { choice: 'discard', confirm: true }, { choice: 'keep-branch', confirm: true }, { choice: 'forget', confirm: true }, { choice: 'discard' }, { environment: 'working-copy' }];
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') continue;
      // Ending the session is a token's to do where it has the scope, and removes nothing of the copy: tested above.
      const ids: Record<string, string> = route.method === 'DELETE' ? { environmentId: copy.id } : { environmentId: copy.id, sessionId: started.session.id };
      const url = route.url.replace(/:([A-Za-z]+)/g, (_all, name: string) => ids[name] ?? newId());
      for (const body of bodies) {
        if ((route.method === 'GET' || route.method === 'DELETE') && body !== undefined) continue;
        for (const secret of [everything, sessionToken(ownerToken, started.session.id), sessionToken(ownerToken, other.id)]) {
          const answer = await call(secret, route.method, url, body);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(429);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(500);
    expect(environmentsNow().map((e) => e.id)).toContain(copy.id);
    expect(await readFile(path.join(copy.folder, 'loose.txt'), 'utf8')).toBe('x\n');
    expect(git(copy.folder, 'log', '--format=%s', '-1')).toBe('Eight');
    expect(branchesOf(root)).toContain(copy.branch);
    for (const secret of [everything, sessionToken(ownerToken, started.session.id)]) {
      expect((await call(secret, 'POST', `/v1/environments/${copy.id}/end`, { choice: 'discard', confirm: true })).status).toBe(403);
      expect((await call(secret, 'GET', `/v1/environments/${copy.id}/endings`)).status).toBe(403);
      expect((await call(secret, 'GET', '/v1/environments/offers')).status).toBe(403);
    }
    // Refused the same way for one that does not exist, before anything is looked up.
    expect((await call(everything, 'POST', `/v1/environments/${newId()}/end`, { choice: 'discard', confirm: true })).status).toBe(403);
  });
});

describe('surviving', () => {
  it('a restart keeps a session attached to its working copy; a copy whose folder was deleted by hand says so and can be forgotten', async () => {
    const root = await repository();
    const started = await startIn(root, 'stays');
    const copy = environmentOf(started.session.id);
    await stop();
    await start();
    expect(environmentOf(started.session.id)).toMatchObject({ id: copy.id, folder: copy.folder, branch: copy.branch });
    expect((await detailOf(started.session.id)).environment?.broken).toBeNull();

    await rm(copy.folder, { recursive: true, force: true });
    const broken = await detailOf(started.session.id);
    expect(broken.environment?.broken).toContain('Its folder is gone');
    expect(broken.note).toContain('Its folder is gone');
    expect(environmentOf(started.session.id).broken).toContain('Its folder is gone');
    const endings = await endingsOf(copy.id);
    expect(endings.map((e) => e.choice)).toEqual(['forget', 'discard']);
    expect((await asOwner('POST', `/v1/environments/${copy.id}/end`, { choice: 'forget' })).body.removed).toBe(true);
    expect(environmentsNow()).toEqual([]);
    // Forgetting removed nothing: the branch is still the owner's to deal with.
    expect(branchesOf(root)).toContain(copy.branch);

    // A repository that moved: said as that.
    const second = environmentOf((await startIn(root, 'moves')).session.id);
    await rm(path.join(dir, 'moved'), { recursive: true, force: true });
    execFileSync('mv', [root, path.join(dir, 'moved')]);
    expect((await detailOf(second.sessionId as string)).note).toContain('no longer where it was');
    expect((await endingsOf(second.id)).find((e) => e.choice === 'discard')?.available).toBe(false);
  });
});

describe('a repository that means harm', () => {
  it('runs no hook, no file-system watcher, no program for showing differences and no submodule; a filter the owner configured does run, as it does for their own Git', async () => {
    const root = await repository();
    const marks = path.join(dir, 'marks');
    await mkdir(marks);
    const script = async (file: string, mark: string, more = ''): Promise<string> => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `#!/bin/sh\ntouch '${path.join(marks, mark)}'\n${more}`);
      await chmod(file, 0o755);
      return file;
    };
    // Hooks where Git looks by default, and where the repository's configuration says they live.
    for (const hook of ['post-checkout', 'reference-transaction', 'post-index-change', 'pre-auto-gc']) await script(path.join(root, '.git', 'hooks', hook), `hook-${hook}`);
    const elsewhere = path.join(dir, 'configured-hooks');
    for (const hook of ['post-checkout', 'reference-transaction']) await script(path.join(elsewhere, hook), `configured-hook-${hook}`);
    const watcher = await script(path.join(dir, 'watcher'), 'fsmonitor');
    const shower = await script(path.join(dir, 'shower'), 'external-diff');
    const converter = await script(path.join(dir, 'converter'), 'textconv', 'cat "$1"\n');
    const filter = await script(path.join(dir, 'filter'), 'filter', 'cat\n');
    // A submodule, whose content would arrive if it were followed.
    const inner = path.join(dir, 'inner');
    await put(inner, 'FROM-THE-SUBMODULE.txt', 'x\n');
    git(inner, 'init', '--quiet', '--initial-branch=main');
    git(inner, 'add', '-A');
    git(inner, 'commit', '--quiet', '-m', 'inner');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', '--quiet', 'add', `file://${inner}`, 'sub');
    await put(root, '.gitattributes', 'src/*.js filter=marked diff=shown\n');
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'With everything that should not run');
    // The repository's own configuration, as hostile as it can be made.
    await writeFile(
      path.join(root, '.git', 'config'),
      `${await readFile(path.join(root, '.git', 'config'), 'utf8')}[core]\n\thooksPath = ${elsewhere}\n\tfsmonitor = ${watcher}\n[diff]\n\texternal = ${shower}\n[diff "shown"]\n\ttextconv = ${converter}\n\tcommand = ${shower}\n[filter "marked"]\n\tsmudge = ${filter}\n\tclean = ${filter}\n[submodule]\n\trecurse = true\n`,
    );
    for (const mark of await readdir(marks)) await rm(path.join(marks, mark));

    const started = await startIn(root, 'in a hostile place');
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const copy = environmentOf(started.session.id);
    await put(copy.folder, 'src/retry.js', 'export const tries = 2;\n');
    await put(copy.folder, 'README.md', 'Changed.\n');
    const detail = await detailOf(started.session.id);
    expect(detail.files.map((f) => f.path)).toEqual(['README.md', 'src/retry.js']);
    expect((await asOwner('GET', `/v1/sessions/${started.session.id}/environment/difference?file=${encodeURIComponent('src/retry.js')}`)).body.text).toContain('+export const tries = 2;');
    await asOwner('GET', `/v1/environments/${copy.id}/endings`);
    await asOwner('GET', '/v1/environments');
    await asOwner('GET', `/v1/environments/offers?folder=${encodeURIComponent(root)}`);
    expect((await asOwner('POST', `/v1/environments/${copy.id}/end`, { choice: 'discard', confirm: true })).status).toBe(200);

    // Exactly this ran: the filter the owner's configuration names for those files. Nothing else did.
    expect((await readdir(marks)).sort()).toEqual(['filter']);
    // The submodule was neither fetched nor entered.
    expect(existsSync(path.join(copy.folder, 'sub', 'FROM-THE-SUBMODULE.txt'))).toBe(false);
  });
});

describe('another kind of environment', () => {
  afterEach(() => unregisterEnvironmentKind('test-box'));

  it('is offered, started in, shown with its own words, read and cleaned up, with nothing but its registration', async () => {
    const calls: string[] = [];
    const place = path.join(dir, 'a-box');
    await mkdir(place);
    registerEnvironmentKind({
      kind: 'test-box',
      title: 'In a box of its own',
      words: 'Kept apart in a box made for this test.',
      offer: async () => ({ available: true, reason: null, notes: ['A note of its own.'] }),
      prepare: async ({ folder, sessionName }) => {
        calls.push(`prepare ${sessionName}`);
        return { projectFolder: folder, folder: place, startFolder: place, branch: null, startCommit: null };
      },
      changes: async () => ({ changed: 2, added: 0, removed: 0, commits: 0, uncommitted: 2, files: [{ path: 'a.txt', state: 'changed', committed: false }], filesCut: false, onBranch: null, note: 'Its own note.' }),
      difference: async (_environment, file) => ({ file: file.path, state: file.state, text: '+from the box', cut: false, notDrawn: null }),
      broken: async () => null,
      endings: async () => [{ choice: 'empty-it', label: 'Empty the box', says: 'Empties it.', available: true, reason: null, asksAgain: 'There is something in the box. Empty it anyway?' }],
      end: async (_environment, choice) => {
        calls.push(`end ${choice}`);
        return { removed: true, says: 'The box is empty.' };
      },
      cleanUp: async () => void calls.push('clean up'),
      size: async () => ({ bytes: 12, atLeast: false }),
    });
    const offers = (await asOwner('GET', `/v1/environments/offers?folder=${encodeURIComponent(dir)}`)).body as EnvironmentOffers;
    expect(offers.offers.find((o) => o.kind === 'test-box')).toMatchObject({ title: 'In a box of its own', words: 'Kept apart in a box made for this test.', available: true, notes: ['A note of its own.'] });
    const started = await startIn(dir, 'boxed', 'test-box');
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(startedIn.get(started.session.id)).toBe(place);
    const detail = await detailOf(started.session.id);
    expect(detail).toMatchObject({ kind: 'test-box', title: 'In a box of its own', words: 'Kept apart in a box made for this test.', note: 'Its own note.', files: [{ path: 'a.txt' }] });
    expect(environmentOf(started.session.id).changes).toMatchObject({ changed: 2 });
    expect((await asOwner('GET', `/v1/sessions/${started.session.id}/environment/difference?file=a.txt`)).body.text).toBe('+from the box');
    expect((await asOwner('GET', '/v1/environments')).body.items[0]).toMatchObject({ kind: 'test-box', bytes: 12 });
    const id = environmentOf(started.session.id).id;
    // Its own choice, its own second question.
    expect((await asOwner('POST', `/v1/environments/${id}/end`, { choice: 'empty-it' })).body.error.message).toBe('There is something in the box. Empty it anyway?');
    expect((await asOwner('POST', `/v1/environments/${id}/end`, { choice: 'discard', confirm: true })).status).toBe(400);
    expect((await asOwner('POST', `/v1/environments/${id}/end`, { choice: 'empty-it', confirm: true })).body).toEqual({ removed: true, says: 'The box is empty.' });
    expect(environmentsNow()).toEqual([]);
    // A session that cannot be started after all: the kind is asked to clean up.
    failShell = true;
    await startIn(dir, 'never starts', 'test-box');
    expect(calls).toEqual(['prepare boxed', 'end empty-it', 'prepare never starts', 'clean up']);
  });
});
