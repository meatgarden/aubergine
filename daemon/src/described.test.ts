import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DESCRIBE_LINES, type ChangeEvent, type FoundPullRequest, type Scope, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryActivityLog } from './activity';
import { hookActions, hookOutput } from './agents/claude-code';
import { sessionToken } from './auth';
import { readRemote, type FolderFacts } from './found/folder';
import { ghFinder, readPullRequest } from './found/pull-request';
import { FileRunArchive } from './run-archive';
import type { RuntimeSession, SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { FileTaskArchive } from './task-archive';
import { withoutTerminalContent } from './terminal-redact';
import { loadOrCreateToken } from './token';

/**
 * What a terminal says about itself, through the server. No Git and no `gh` is started here: the server is given
 * the facts of a folder and a stand-in for the tool, and both keep what they were asked.
 */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let origin: string;
let events: ChangeEvent[] = [];
let live: RuntimeSession[] = [];
/** What each terminal's screen holds, by session; and how often it was read. */
let screens = new Map<string, string[]>();
let reads = 0;
/** What the stand-in facts and the stand-in tool answer, and how often each was asked. */
let facts: FolderFacts = { branch: null, repository: null, repositoryUrl: null };
let factsAsked = 0;
let pullRequest: FoundPullRequest | null = null;
let toolAsked: string[] = [];
const activity = new MemoryActivityLog();

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => live,
  has: async () => true,
  kill: async (id: string) => void (live = live.filter((s) => s.id !== id)),
  foreground: async () => 'zsh',
  typeLine: async () => {},
  create: async (options: { id: string; cwd?: string }) => {
    const made = { id: options.id, cwd: options.cwd ?? null, command: null, activityAt: null };
    live.push(made);
    return made;
  },
  type: async () => {},
  press: async () => {},
  screen: async () => ({ text: '', columns: 80, rows: 24, cursor: { x: 0, y: 0 }, line: 0 }),
  lines: async (id: string) => {
    reads += 1;
    return { lines: screens.get(id) ?? [], more: false, lost: false };
  },
  search: async () => ({ hits: [], truncated: false }),
  snapshot: async () => '',
} as unknown as SessionRuntime;

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
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, ...more });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}
async function make(body: object = {}): Promise<Session> {
  const made = await asOwner('POST', '/api/v1/sessions', { cwd: dir, ...body });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.session as Session;
}
const now = (id: string): Session => sessions.get(id);
const filesOf = async (folder: string): Promise<string> => {
  let all = '';
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    all += entry.isDirectory() ? await filesOf(file) : await readFile(file, 'utf8').catch(() => '');
  }
  return all;
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-described-'));
  ownerToken = await loadOrCreateToken(dir);
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  live = [];
  screens = new Map();
  reads = 0;
  facts = { branch: null, repository: null, repositoryUrl: null };
  factsAsked = 0;
  pullRequest = null;
  toolAsked = [];
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(dir);
  sessions = new Sessions(hub, runtime, { agentLaunchLine: async () => 'the-agent' });
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: path.join(dir, 'none'),
    runArchive: new FileRunArchive(dir),
    taskArchive: new FileTaskArchive(dir),
    activity,
    setDescribeRemind: (value) => settings.setDescribeRemind(value),
    folderFacts: async () => {
      factsAsked += 1;
      return facts;
    },
    pullRequests: {
      find: async (folder) => {
        toolAsked.push(folder);
        return pullRequest;
      },
    },
  });
  events = [];
  hub.subscribe((event) => events.push(event));
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
});
afterEach(async () => {
  await hub.flush();
  await app.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('links of a terminal', () => {
  it('the owner adds one by hand: its kind and label are told from the address, and only http and https are taken', async () => {
    const session = await make();
    const added = await asOwner('POST', `/v1/sessions/${session.id}/links`, { url: 'https://acme.atlassian.net/browse/ABC-123' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ kept: true, link: { kind: 'ticket', label: 'ABC-123', source: 'owner', url: 'https://acme.atlassian.net/browse/ABC-123' } });
    expect(now(session.id).links).toHaveLength(1);
    for (const url of ['ftp://example.org/x', 'javascript:alert(1)', 'not an address', 'https://user:secret@example.org/x']) expect((await asOwner('POST', `/v1/sessions/${session.id}/links`, { url })).status, url).toBe(400);
    expect(now(session.id).links).toHaveLength(1);
    // Changed and removed by hand.
    const id = added.body.link.id as string;
    expect((await asOwner('PATCH', `/v1/sessions/${session.id}/links/${id}`, { label: 'The login ticket', kind: 'issue' })).body.link).toMatchObject({ label: 'The login ticket', kind: 'issue', ownerSet: true });
    expect((await asOwner('GET', `/v1/sessions/${session.id}/links`)).body.links.map((link: { label: string }) => link.label)).toEqual(['The login ticket']);
    expect((await asOwner('DELETE', `/v1/sessions/${session.id}/links/${id}`)).body).toEqual({ links: [] });
    expect((await asOwner('DELETE', `/v1/sessions/${session.id}/links/${id}`)).status).toBe(404);
  });

  it("a session's own credential writes its own terminal's links and no other's; a token needs the scope that writes notes", async () => {
    const mine = await make();
    const other = await make();
    const own = sessionToken(ownerToken, mine.id);
    const added = await call(own, 'POST', `/v1/sessions/${mine.id}/links`, { url: 'https://github.com/acme-co/widgets/pull/54' });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.link, JSON.stringify(added.body)).toMatchObject({ kind: 'pull-request', label: 'PR 54', source: 'agent' });
    expect((await call(own, 'GET', `/v1/sessions/${mine.id}/links`)).body.links).toHaveLength(1);
    // Nothing of another terminal: not its links, not its name, not its checks.
    for (const [method, url, body] of [
      ['GET', `/v1/sessions/${other.id}/links`, undefined],
      ['POST', `/v1/sessions/${other.id}/links`, { url: 'https://example.org/x' }],
      ['PUT', `/v1/sessions/${other.id}/described`, { name: 'Taken' }],
      ['POST', `/v1/sessions/${other.id}/described/check`, { event: 'stop' }],
    ] as const)
      expect((await call(own, method, url, body)).status, `${method} ${url}`).toBe(403);
    expect(now(other.id).links).toEqual([]);
    expect(now(other.id).name).toBe(other.name);
    // What is the owner's alone stays so, for a session and for a token with every scope.
    const reader = await makeToken('reader', ['read']);
    const writer = await makeToken('writer', ['read', 'notes:write']);
    for (const secret of [own, writer]) {
      expect((await call(secret, 'POST', `/v1/sessions/${mine.id}/links/keep`, { url: 'https://example.org/x' })).status).toBe(403);
      expect((await call(secret, 'POST', `/v1/sessions/${mine.id}/found`)).status).toBe(403);
      expect((await call(secret, 'POST', `/v1/sessions/${mine.id}/described/use`, { what: 'name' })).status).toBe(403);
      expect((await call(secret, 'PUT', '/v1/settings/describing', { remind: false })).status).toBe(403);
    }
    // A token: reading with `read`, writing only with `notes:write`; and a session's own describing is no token's.
    expect((await call(reader, 'GET', `/v1/sessions/${mine.id}/links`)).status).toBe(200);
    expect((await call(reader, 'POST', `/v1/sessions/${other.id}/links`, { url: 'https://example.org/x' })).status).toBe(403);
    const byToken = await call(writer, 'POST', `/v1/sessions/${other.id}/links`, { url: 'https://example.org/x' });
    expect(byToken.status).toBe(201);
    expect(byToken.body.link).toMatchObject({ source: 'agent', by: 'writer' });
    expect((await call(writer, 'PUT', `/v1/sessions/${mine.id}/described`, { name: 'By a token' })).status).toBe(403);
    expect((await call(writer, 'GET', `/v1/sessions/${mine.id}/links/seen`)).status).toBe(403);
  });

  it("the owner's change is not overwritten by the agent's: it is kept as a suggestion the owner can use", async () => {
    const session = await make();
    const own = sessionToken(ownerToken, session.id);
    const url = 'https://www.figma.com/file/AbCdEf123/Canvas-redesign';
    const added = await call(own, 'POST', `/v1/sessions/${session.id}/links`, { url });
    const id = added.body.link.id as string;
    await asOwner('PATCH', `/v1/sessions/${session.id}/links/${id}`, { label: 'The new canvas' });
    const again = await call(own, 'POST', `/v1/sessions/${session.id}/links`, { url, label: 'Redesign file' });
    expect(again.body).toMatchObject({ kept: false, link: { label: 'The new canvas', suggested: { label: 'Redesign file' } } });
    expect((await call(own, 'PATCH', `/v1/sessions/${session.id}/links/${id}`, { label: 'Mine' })).body).toMatchObject({ kept: false, link: { label: 'The new canvas' } });
    expect((await call(own, 'DELETE', `/v1/sessions/${session.id}/links/${id}`)).status).toBe(409);
    expect(now(session.id).links[0]?.label).toBe('The new canvas');
    expect((await asOwner('POST', `/v1/sessions/${session.id}/described/use`, { what: 'link', linkId: id })).body.links[0]).toMatchObject({ label: 'Mine' });
  });
});

describe('a name and a summary', () => {
  it('an agent names its own terminal and writes its summary; what the owner wrote stays, with the agent\'s beside it', async () => {
    const session = await make();
    const own = sessionToken(ownerToken, session.id);
    expect((await call(own, 'PUT', `/v1/sessions/${session.id}/described`, {})).body.missing).toEqual(['name', 'summary']);
    const described = await call(own, 'PUT', `/v1/sessions/${session.id}/described`, { name: 'Fixing the login', summary: 'Reproduced the double redirect.' });
    expect(described.body).toEqual({ name: 'Fixing the login', summary: 'Reproduced the double redirect.', kept: { name: true, summary: true }, missing: [] });
    expect(now(session.id)).toMatchObject({ name: 'Fixing the login', note: 'Reproduced the double redirect.', written: { name: { by: 'agent' }, summary: { by: 'agent' } } });
    // The owner renames it and rewrites the summary, by hand, as before.
    expect((await asOwner('PATCH', `/v1/sessions/${session.id}`, { name: 'Login bug', note: 'Mine.' })).status).toBe(200);
    expect(now(session.id).written).toMatchObject({ name: { by: 'owner' }, summary: { by: 'owner' } });
    const second = await call(own, 'PUT', `/v1/sessions/${session.id}/described`, { name: 'Fixing the login, again', summary: 'Found the cause.' });
    expect(second.body).toMatchObject({ name: 'Login bug', summary: 'Mine.', kept: { name: false, summary: false } });
    expect(now(session.id)).toMatchObject({ name: 'Login bug', note: 'Mine.', suggested: { name: { value: 'Fixing the login, again' }, summary: { value: 'Found the cause.' } } });
    // A program with a token is held to the same.
    const writer = await makeToken('writer', ['read', 'notes:write', 'sessions:write']);
    await call(writer, 'PATCH', `/v1/sessions/${session.id}`, { name: 'By a program' });
    expect(now(session.id).name).toBe('Login bug');
    // The owner uses the name that was suggested; and where the owner empties the summary, the agent writes it again.
    await asOwner('POST', `/v1/sessions/${session.id}/described/use`, { what: 'name' });
    expect(now(session.id)).toMatchObject({ name: 'By a program', written: { name: { by: 'owner' } } });
    expect(now(session.id).suggested.name).toBeUndefined();
    await asOwner('PATCH', `/v1/sessions/${session.id}`, { note: '' });
    expect((await call(own, 'PUT', `/v1/sessions/${session.id}/described`, { summary: 'Found the cause.' })).body.kept.summary).toBe(true);
    expect(now(session.id).note).toBe('Found the cause.');
  });
});

describe('the check at a stop', () => {
  it('reminds once in a turn and not twice, says three lines at the start, and says nothing when switched off', async () => {
    const session = await make();
    const own = sessionToken(ownerToken, session.id);
    const check = (body: object): Promise<Answer> => call(own, 'POST', `/v1/sessions/${session.id}/described/check`, body);
    expect((await check({ event: 'start' })).body).toEqual({ say: DESCRIBE_LINES.join('\n'), hold: false });
    const first = await check({ event: 'stop' });
    expect(first.body.hold).toBe(true);
    expect(first.body.say).toContain('aubergine describe --name');
    expect(first.body.say).toContain('aubergine describe --summary');
    // Again in the same turn: the stop goes through, whatever is still missing.
    expect((await check({ event: 'stop' })).body).toEqual({ say: null, hold: false });
    expect((await check({ event: 'stop', again: true })).body).toEqual({ say: null, hold: false });
    // A new prompt begins a new turn. An agent that is already going on because it was told is never told again.
    await call(own, 'PUT', `/v1/sessions/${session.id}/attention`, { state: 'working' });
    expect((await check({ event: 'stop', again: true })).body).toEqual({ say: null, hold: false });
    expect((await check({ event: 'stop' })).body.hold).toBe(true);
    // Named, but no summary: only that is said. Described: nothing.
    await call(own, 'PUT', `/v1/sessions/${session.id}/attention`, { state: 'working' });
    await call(own, 'PUT', `/v1/sessions/${session.id}/described`, { name: 'Fixing the login' });
    const half = await check({ event: 'stop' });
    expect(half.body.say).not.toContain('--name');
    expect(half.body.say).toContain('--summary');
    await call(own, 'PUT', `/v1/sessions/${session.id}/attention`, { state: 'working' });
    await call(own, 'PUT', `/v1/sessions/${session.id}/described`, { summary: 'Reproduced it.' });
    expect((await check({ event: 'stop' })).body).toEqual({ say: null, hold: false });
    // Switched off in the settings: nothing at the start and nothing at a stop.
    const other = await make();
    const otherOwn = sessionToken(ownerToken, other.id);
    expect((await asOwner('PUT', '/v1/settings/describing', { remind: false })).body).toEqual({ remind: false });
    expect(JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'))).toEqual({ api: { rateLimitPerMinute: 100_000 }, describe: { remind: false } });
    expect((await call(otherOwn, 'POST', `/v1/sessions/${other.id}/described/check`, { event: 'start' })).body).toEqual({ say: null, hold: false });
    expect((await call(otherOwn, 'POST', `/v1/sessions/${other.id}/described/check`, { event: 'stop' })).body).toEqual({ say: null, hold: false });
  });

  it('a hook prints only what the check answers, and a held stop reports nothing else', () => {
    expect(hookOutput('start', { say: 'three lines', hold: false })).toBe('three lines');
    expect(hookOutput('stop', { say: 'set a name', hold: true })).toBe('{"decision":"block","reason":"set a name"}');
    expect(hookOutput('stop', { say: null, hold: false })).toBeNull();
    expect(hookOutput('tool', { say: 'x', hold: false })).toBeNull();
    // The stop hook asks first; the start hook asks; a tool is reported only for a command that makes or changes a branch or a pull request.
    expect(hookActions('stop', { stop_hook_active: true }).at(0)).toEqual({ do: 'check', event: 'stop', again: true });
    expect(hookActions('start', {})).toEqual([{ do: 'check', event: 'start' }]);
    for (const command of ['git checkout -b fix-login', 'git switch main', 'cd x && git push -u origin fix', 'gh pr create --fill', 'git branch -m new']) expect(hookActions('tool', { tool_input: { command } }), command).toEqual([{ do: 'check', event: 'tool' }]);
    for (const command of ['git status', 'ls', 'echo git checkout', 'npm test', '']) expect(hookActions('tool', { tool_input: { command } }), command).toEqual(command === 'echo git checkout' ? [{ do: 'check', event: 'tool' }] : []);
    expect(hookActions('tool', {})).toEqual([]);
  });
});

describe('what is found by looking', () => {
  it('the branch and the pull request appear when the details open; the tool is asked at most once a minute, and its absence is silent', async () => {
    const session = await make();
    facts = { branch: 'fix-login', repository: 'acme-co/widgets', repositoryUrl: 'https://github.com/acme-co/widgets' };
    // No tool, or no pull request: nothing is shown and nothing is said.
    const first = await asOwner('POST', `/v1/sessions/${session.id}/found`);
    expect(first.status).toBe(200);
    expect(first.body.found).toMatchObject({ branch: 'fix-login', repository: 'acme-co/widgets', repositoryUrl: 'https://github.com/acme-co/widgets', pullRequest: null });
    expect(toolAsked).toHaveLength(1);
    // Asked again at once: the folder is not looked at again so soon, and the tool is not asked twice in a minute.
    pullRequest = { url: 'https://github.com/acme-co/widgets/pull/54', number: 54, title: 'Fix the double redirect', state: 'open' };
    await asOwner('POST', `/v1/sessions/${session.id}/found`);
    expect(factsAsked).toBe(1);
    expect(toolAsked).toHaveLength(1);
    expect(now(session.id).found?.pullRequest).toBeNull();
    // After the agent ran a command that changes a branch, both are looked at afresh.
    const own = sessionToken(ownerToken, session.id);
    expect((await call(own, 'POST', `/v1/sessions/${session.id}/described/check`, { event: 'tool' })).body).toEqual({ say: null, hold: false });
    expect(factsAsked).toBe(2);
    expect(toolAsked).toHaveLength(1);
    facts = { ...facts, branch: 'fix-login-2' };
    await call(own, 'POST', `/v1/sessions/${session.id}/described/check`, { event: 'tool' });
    expect(toolAsked).toHaveLength(2);
    expect(now(session.id).found).toMatchObject({ branch: 'fix-login-2', pullRequest: { number: 54, state: 'open', title: 'Fix the double redirect' } });
    // Switched off by hand in the settings file: the tool is not asked.
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 }, describe: { pullRequests: false } }));
    facts = { ...facts, branch: 'another' };
    await call(own, 'POST', `/v1/sessions/${session.id}/described/check`, { event: 'tool' });
    expect(toolAsked).toHaveLength(2);
    expect(now(session.id).found).toMatchObject({ branch: 'another', pullRequest: null });
  });

  it('the real tool, missing: nothing is found and nothing fails; and what it prints is read strictly', async () => {
    process.env.AUBERGINE_GH_BIN = path.join(dir, 'no-such-tool');
    try {
      expect(await ghFinder().find(dir)).toBeNull();
    } finally {
      delete process.env.AUBERGINE_GH_BIN;
    }
    // Under the test runner, with no stand-in named, the tool is not started at all.
    expect(await ghFinder(() => '/bin/echo').find(dir)).toBeNull();
    expect(readPullRequest('{"number":54,"url":"https://github.com/acme-co/widgets/pull/54","title":"Fix","state":"MERGED","isDraft":false}')).toEqual({ number: 54, url: 'https://github.com/acme-co/widgets/pull/54', title: 'Fix', state: 'merged' });
    expect(readPullRequest('{"number":1,"url":"https://github.com/a/b/pull/1","title":"T","state":"OPEN","isDraft":true}')?.state).toBe('draft');
    for (const printed of ['', 'no pull requests found', '{"number":"x"}', '{"number":1,"url":"javascript:alert(1)","title":"T","state":"OPEN"}', '[]']) expect(readPullRequest(printed), printed).toBeNull();
  });

  it("a remote's address gives the repository's name and page, and never a name or a password", () => {
    expect(readRemote('git@github.com:acme-co/widgets.git')).toEqual({ repository: 'acme-co/widgets', repositoryUrl: 'https://github.com/acme-co/widgets' });
    expect(readRemote('https://github.com/acme-co/widgets.git\n')).toEqual({ repository: 'acme-co/widgets', repositoryUrl: 'https://github.com/acme-co/widgets' });
    expect(readRemote('https://someone:s3cret@github.com/acme-co/widgets.git')).toEqual({ repository: 'acme-co/widgets', repositoryUrl: 'https://github.com/acme-co/widgets' });
    expect(readRemote('ssh://git@example.org:2222/group/sub/tools.git')).toEqual({ repository: 'sub/tools', repositoryUrl: 'https://example.org/group/sub/tools' });
    for (const odd of ['', '/a/local/folder', '../other', 'https://example.org/one', 'git@example.org:a b/c']) expect(readRemote(odd), odd).toEqual({ repository: null, repositoryUrl: null });
  });

  it('addresses seen in a terminal are remembered in memory only, a known kind is kept as a link, and a caller who may not read the terminal gets neither', async () => {
    const session = await make();
    const secret = 'https://example.org/reset?token=s3cr3t-in-a-terminal';
    screens.set(session.id, ['$ open https://acme.atlassian.net/browse/ABC-9', `see ${secret} and https://example.org/guide.`, 'and https://github.com/acme-co/widgets/pull/54?token=abc']);
    const seen = await asOwner('GET', `/v1/sessions/${session.id}/links/seen`);
    expect(seen.status).toBe(200);
    // The ticket was kept by itself; the others are only seen.
    expect(now(session.id).links.map((link) => [link.url, link.source, link.fromTerminal])).toEqual([['https://acme.atlassian.net/browse/ABC-9', 'found', true]]);
    expect(seen.body.seen.map((one: { url: string }) => one.url)).toEqual([secret, 'https://example.org/guide', 'https://github.com/acme-co/widgets/pull/54?token=abc']);
    expect(seen.body.seen[1]).toEqual({ url: 'https://example.org/guide', kind: 'link', label: 'example.org · guide' });
    // Nothing that was only seen is in the data folder.
    await hub.flush();
    expect(await filesOf(dir)).not.toContain('s3cr3t-in-a-terminal');
    expect(JSON.stringify(events)).not.toContain('s3cr3t-in-a-terminal');
    // The owner keeps one with a press; only one that was seen can be kept so.
    expect((await asOwner('POST', `/v1/sessions/${session.id}/links/keep`, { url: 'https://example.org/never-seen' })).status).toBe(409);
    expect((await asOwner('POST', `/v1/sessions/${session.id}/links/keep`, { url: 'https://example.org/guide' })).body.link).toMatchObject({ source: 'found', fromTerminal: true, label: 'example.org · guide' });
    expect((await asOwner('GET', `/v1/sessions/${session.id}/links/seen`)).body.seen).toHaveLength(2);
    // A token with `read` and without `terminal:read`: no seen list, and no link that came from the screen; with it, both.
    const reader = await makeToken('reader', ['read']);
    expect((await call(reader, 'GET', `/v1/sessions/${session.id}/links/seen`)).status).toBe(403);
    expect((await call(reader, 'GET', `/v1/sessions/${session.id}/links`)).body.links).toEqual([]);
    expect((await call(reader, 'GET', `/v1/sessions/${session.id}`)).body.links).toEqual([]);
    await asOwner('POST', `/v1/sessions/${session.id}/links`, { url: 'https://example.org/by-hand' });
    expect((await call(reader, 'GET', `/v1/sessions/${session.id}/links`)).body.links.map((link: { url: string }) => link.url)).toEqual(['https://example.org/by-hand']);
    const looker = await makeToken('looker', ['read', 'terminal:read'], { reach: { kind: 'all' } });
    expect((await call(looker, 'GET', `/v1/sessions/${session.id}/links`)).body.links).toHaveLength(3);
    expect((await call(looker, 'GET', `/v1/sessions/${session.id}/links/seen`)).status).toBe(200);
    // The same on the stream of changes.
    const change = events.filter((event) => event.type === 'session.described').at(-1);
    const closed = withoutTerminalContent(change, () => false) as unknown as { change: { links: unknown[] } };
    expect(closed.change.links).toHaveLength(1);
    // A read attaches no viewer: it is the runtime's read of lines, and was asked a few times, not on a timer.
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThan(8);
  });
});
