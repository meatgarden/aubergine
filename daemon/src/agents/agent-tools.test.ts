import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, newId, type ChangeEvent } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_FILE, FileActivityLog } from '../activity';
import { sessionToken } from '../auth';
import type { SessionRuntime } from '../runtime/runtime';
import { buildServer, cookieName } from '../server';
import { Sessions } from '../sessions';
import { SettingsFile } from '../settings';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { loadOrCreateToken } from '../token';
import { Tokens } from '../tokens';
import { AgentTools, MCP_SERVER_NAME, mcpConfig } from './agent-tools';
import { claudeLaunchLine } from './claude-code';

/**
 * Giving an agent the tools, through the routes, with a runtime that keeps
 * every line it is asked to type. What matters here: who can cause a token
 * to be made, where its secret is, and what removes it.
 */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let agentTools: AgentTools;
let port: number;
let origin: string;
let typed: [string, string][] = [];
let events: ChangeEvent[] = [];
const logged: string[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  create: async (options: { id: string }) => ({ id: options.id, cwd: null, command: null, activityAt: null }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  typeLine: async (id: string, line: string) => void typed.push([id, line]),
  snapshot: async () => '',
} as unknown as SessionRuntime;

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  events = [];
  hub.subscribe((event) => events.push(event));
  const settings = new SettingsFile(dir);
  await settings.reload();
  agentTools = new AgentTools(hub, new Tokens(hub), dir, (message) => logged.push(message));
  sessions = new Sessions(hub, runtime, {
    protectByDefault: () => ({ all: false, agents: settings.value.terminal.protectAgentSessions }),
    // As in main.ts: the launch line names the file, and nothing else about the tools.
    agentLaunchLine: async (_agent, args, sessionId) => claudeLaunchLine(path.join(dir, 'agents', 'claude-code-settings.json'), { args, mcpConfig: await agentTools.fileFor(sessionId) }),
    prepareAgentTools: (session, choice) => agentTools.prepare(session, choice),
  });
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), activity: new FileActivityLog(dir, 1024 * 1024) });
  app.log.info = ((...args: unknown[]) => void logged.push(JSON.stringify(args))) as typeof app.log.info;
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  await agentTools.sweep();
}
async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-agent-tools-'));
  ownerToken = await loadOrCreateToken(dir);
  typed = [];
  logged.length = 0;
  await start();
});
afterEach(async () => {
  await stop();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  text: string;
}
async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
  let parsed: unknown = null;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch {
    // Not JSON.
  }
  return { status: response.statusCode, body: parsed, text: response.body };
}
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const withBearer = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);

/** As the launch line quotes a path. */
const q = (file: string): string => `'${file}'`;
const settingsFile = (): string => path.join(dir, 'agents', 'claude-code-settings.json');
const mcpFolder = (): string => path.join(dir, 'agents', 'mcp');
const mcpFiles = (): Promise<string[]> => readdir(mcpFolder()).catch(() => []);
const fileOf = (sessionId: string): string => path.join(mcpFolder(), `${sessionId}.json`);
/** The secret a session's file holds, or null when it holds none. */
async function secretIn(sessionId: string): Promise<string | null> {
  const config = JSON.parse(await readFile(fileOf(sessionId), 'utf8'));
  return config.mcpServers[MCP_SERVER_NAME].env?.AUBERGINE_API_TOKEN ?? null;
}
/** Every file in the data folder, as text, by path. */
async function everyFile(folder: string = dir): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) for (const [name, text] of await everyFile(full)) found.set(name, text);
    // A file being replaced while this looks may be gone by the time it is read.
    else if (entry.isFile()) found.set(full, await readFile(full, 'utf8').catch(() => ''));
  }
  return found;
}
async function settled(): Promise<void> {
  // Removing a file after an event is not awaited by whoever emitted it.
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
}
const tokensNow = (): { id: string; name: string; sessionId: string | null; revokedAt: string | null; scopes: string[]; reviewWorkflowChanges: boolean; reach: unknown }[] => hub.state.tokens;

describe('tools for an agent', () => {
  it('makes nothing when the choice is none: no token, no file, the launch line as it always was', async () => {
    const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code' });
    expect(made.status).toBe(201);
    await settled();
    expect(tokensNow()).toEqual([]);
    expect(await mcpFiles()).toEqual([]);
    expect(typed).toEqual([[made.body.session.id, `claude --settings ${q(settingsFile())}`]]);
    expect(events.some((event) => event.type === 'token.created')).toBe(false);
  });

  it('for "its own work only": a file that names the server and holds no secret, and no token', async () => {
    const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: { kind: 'own' } });
    expect(made.status).toBe(201);
    const id = made.body.session.id as string;
    expect(tokensNow()).toEqual([]);
    expect(events.some((event) => event.type === 'token.created')).toBe(false);
    expect(await mcpFiles()).toEqual([`${id}.json`]);
    expect((await stat(fileOf(id))).mode & 0o777).toBe(0o600);
    expect((await stat(mcpFolder())).mode & 0o777).toBe(0o700);
    const config = JSON.parse(await readFile(fileOf(id), 'utf8'));
    expect(Object.keys(config.mcpServers)).toEqual(['aubergine']);
    expect(config.mcpServers.aubergine.args.slice(-2)).toEqual([expect.stringMatching(/bin\/aubergine\.mjs$/), 'mcp']);
    expect(config.mcpServers.aubergine.env).toBeUndefined();
    // The file is on the launch line; nothing else about the tools is.
    expect(typed).toEqual([[id, `claude --settings ${q(settingsFile())} --mcp-config ${q(fileOf(id))}`]]);
    // The session's own token is nowhere in the folder.
    for (const text of (await everyFile()).values()) expect(text.includes(sessionToken(ownerToken, id))).toBe(false);
  });

  it('for "more": a token for that one session, named after it, with review on, its secret in the one file and nowhere else', async () => {
    const canvas = hub.state.canvases[0]!.id;
    const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', name: 'Fix the build', agentTools: { kind: 'token', scopes: ['terminal:input', 'read', 'workflows:write'], reach: { kind: 'canvases', canvasIds: [canvas] } } });
    expect(made.status).toBe(201);
    const id = made.body.session.id as string;
    await hub.flush();

    expect(tokensNow()).toHaveLength(1);
    const token = tokensNow()[0]!;
    expect(token).toMatchObject({ name: 'Agent in "Fix the build"', sessionId: id, revokedAt: null, scopes: ['read', 'workflows:write', 'terminal:input'], reviewWorkflowChanges: true, reach: { kind: 'canvases', canvasIds: [canvas] } });
    // Listed like any other token, with the session it belongs to, and without its hash.
    const listed = await asOwner('GET', '/v1/tokens');
    expect(listed.body.items).toEqual([expect.objectContaining({ id: token.id, sessionId: id })]);
    expect(listed.text).not.toContain('hash');

    const secret = (await secretIn(id)) as string;
    expect(secret).toMatch(/^aubt_[A-Za-z0-9_-]{20,}$/);
    // Nothing the server wrote down while making it holds the secret. (Looked at now: from here on this test sends it itself.)
    expect(logged.filter((line) => line.includes(secret))).toEqual([]);
    expect((await stat(fileOf(id))).mode & 0o777).toBe(0o600);
    // It works, as that token.
    expect((await withBearer(secret, 'GET', '/v1')).body.caller).toMatchObject({ kind: 'token', id: token.id, name: 'Agent in "Fix the build"', reviewWorkflowChanges: true });
    // With review on, it proposes and cannot write a workflow itself.
    expect((await withBearer(secret, 'POST', '/v1/workflows', { name: 'Mine', elements: [{ name: 'One' }] })).status).toBe(403);

    // Where the secret is: that file. Not the state, not the activity log, not the launch line, not an answer, not an event.
    await hub.flush();
    const holding = [...(await everyFile()).entries()].filter(([, text]) => text.includes(secret)).map(([name]) => name);
    expect(holding).toEqual([fileOf(id)]);
    expect(await readFile(path.join(dir, ACTIVITY_FILE), 'utf8')).not.toContain(secret);
    expect(JSON.stringify(typed)).not.toContain(secret);
    expect(made.text).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(typed).toEqual([[id, `claude --settings ${q(settingsFile())} --mcp-config ${q(fileOf(id))}`]]);
  });

  it('cannot reach a people-only terminal with that token, and other agents are people only from the start', async () => {
    const other = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', name: 'Another agent' });
    expect(other.body.session.peopleOnly).toBe(true);
    const plain = await asOwner('POST', '/api/v1/sessions', { name: 'A plain shell' });
    const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: { kind: 'token', scopes: [...GRANTABLE_SCOPES], reach: { kind: 'all' } } });
    const secret = (await secretIn(made.body.session.id)) as string;
    typed = [];
    for (const [method, url, body] of [
      ['GET', `/v1/sessions/${other.body.session.id}/screen`, undefined],
      ['POST', `/v1/sessions/${other.body.session.id}/input`, { text: 'echo in', enter: true }],
      ['POST', `/v1/sessions/${other.body.session.id}/run`, { command: 'echo in' }],
      // Its own terminal is an agent's too.
      ['POST', `/v1/sessions/${made.body.session.id}/input`, { text: 'echo in', enter: true }],
    ] as const) {
      const refused = await withBearer(secret, method, url, body);
      expect([refused.status, refused.body.error.code]).toEqual([403, 'people_only']);
    }
    expect(typed).toEqual([]);
    // And it cannot open one: that stays the owner's.
    expect((await withBearer(secret, 'PUT', `/v1/sessions/${other.body.session.id}/protection`, { peopleOnly: false })).status).toBe(403);
    expect((await withBearer(secret, 'GET', `/v1/sessions/${plain.body.session.id}`)).status).toBe(200);
  });

  it('is made only by the owner in the browser route: not by a token, not by a session, not through the public routes', async () => {
    const canvas = hub.state.canvases[0]!.id;
    const choice = { kind: 'token', scopes: [...GRANTABLE_SCOPES], reach: { kind: 'all' } };
    const strongest = (await asOwner('POST', '/v1/tokens', { name: 'every scope', scopes: [...GRANTABLE_SCOPES], reach: { kind: 'all' }, reviewWorkflowChanges: false })).body.secret as string;
    const plain = (await asOwner('POST', '/api/v1/sessions', { name: 'plain' })).body.session.id as string;
    const before = tokensNow().length;
    typed = [];

    // The route that takes the choice is the cookie's alone.
    for (const credential of [strongest, sessionToken(ownerToken, plain)]) {
      const refused = await withBearer(credential, 'POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: choice });
      expect([401, 403]).toContain(refused.status);
    }
    // The public route that starts sessions knows no such field: it starts a plain shell and makes nothing.
    const publicly = await withBearer(strongest, 'POST', `/v1/canvases/${canvas}/sessions`, { agent: 'claude-code', agentTools: choice, name: 'asked for tools' });
    expect(publicly.status).toBe(201);
    expect(hub.state.sessions.find((s) => s.id === publicly.body.session.id)?.agent).toBeNull();
    // A token cannot make tokens at all.
    expect((await withBearer(strongest, 'POST', '/v1/tokens', { name: 'child', scopes: ['read'] })).status).toBe(403);
    await settled();
    expect(tokensNow().length).toBe(before);
    expect(await mcpFiles()).toEqual([]);
    expect(typed).toEqual([]);

    // A choice that is not one makes nothing either, and starts nothing.
    const sessionsBefore = hub.state.sessions.length;
    for (const bad of [{ kind: 'token', scopes: ['terminal:read'] }, { kind: 'token', scopes: [] }, { kind: 'token', scopes: ['tokens:manage'] }, { kind: 'everything' }]) {
      expect((await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: bad })).status).toBe(400);
    }
    expect(hub.state.sessions.length).toBe(sessionsBefore);
    expect(tokensNow().length).toBe(before);
  });

  it('is revoked, and its file removed, when the session is ended for good; parking and restoring keep both', async () => {
    const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: { kind: 'token', scopes: ['read'] } });
    const id = made.body.session.id as string;
    const secret = (await secretIn(id)) as string;
    const own = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: { kind: 'own' } });

    expect((await asOwner('POST', `/v1/sessions/${id}/park`)).status).toBe(200);
    await settled();
    expect((await withBearer(secret, 'GET', '/v1')).status).toBe(200);
    expect(await mcpFiles()).toHaveLength(2);
    expect((await asOwner('POST', `/v1/sessions/${id}/restore`, {})).status).toBe(200);

    expect((await asOwner('DELETE', `/v1/sessions/${id}`)).status).toBe(204);
    await settled();
    expect(tokensNow()[0]?.revokedAt).not.toBeNull();
    expect((await withBearer(secret, 'GET', '/v1')).status).toBe(401);
    // Removing the file follows the answer: waited for, not read at once (a busy machine is slower).
    await expect.poll(mcpFiles).toEqual([`${own.body.session.id}.json`]);
    // Nothing in the data folder holds the secret any more.
    await hub.flush();
    for (const text of (await everyFile()).values()) expect(text.includes(secret)).toBe(false);

    expect((await asOwner('DELETE', `/v1/sessions/${own.body.session.id}`)).status).toBe(204);
    await settled();
    await expect.poll(mcpFiles).toEqual([]);
  });

  it('loses its file when the owner revokes the token by hand', async () => {
    const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: { kind: 'token', scopes: ['read'] } });
    const id = made.body.session.id as string;
    const secret = (await secretIn(id)) as string;
    expect((await asOwner('DELETE', `/v1/tokens/${tokensNow()[0]!.id}`)).status).toBe(200);
    await settled();
    await hub.flush();
    expect(await mcpFiles()).toEqual([]);
    for (const text of (await everyFile()).values()) expect(text.includes(secret)).toBe(false);
    // Resuming the agent later starts it without tools rather than pointing it at a file that is gone.
    expect(await agentTools.fileFor(id)).toBeNull();
  });

  it('clears at start what a session that is gone left behind', async () => {
    const kept = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: { kind: 'token', scopes: ['read'] } });
    const keptSecret = (await secretIn(kept.body.session.id)) as string;
    // Left behind: a token and a file of a session that is no longer in the state, as after a crash between the two.
    const gone = newId();
    const orphan = new Tokens(hub).create({ name: 'left behind', scopes: ['read'], sessionId: gone });
    await writeFile(fileOf(gone), JSON.stringify(mcpConfig(orphan.secret)), { mode: 0o600 });
    await writeFile(path.join(mcpFolder(), 'notes.txt'), 'not ours to judge');
    await stop();
    await start();

    expect((await withBearer(orphan.secret, 'GET', '/v1')).status).toBe(401);
    expect((await mcpFiles()).sort()).toEqual([`${kept.body.session.id}.json`, 'notes.txt'].sort());
    expect((await withBearer(keptSecret, 'GET', '/v1')).status).toBe(200);
  });

  it('keeps the tools when the agent is resumed', async () => {
    const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', agentTools: { kind: 'own' } });
    const id = made.body.session.id as string;
    const conversation = '0f3d1c2a-5b6e-4f70-8a91-b2c3d4e5f607';
    expect((await withBearer(sessionToken(ownerToken, id), 'PUT', `/v1/sessions/${id}/agent`, { kind: 'claude-code', conversationId: conversation })).status).toBe(200);
    typed = [];
    await sessions.resumeAgent(id);
    expect(typed).toEqual([[id, `claude --resume ${conversation} --settings ${q(settingsFile())} --mcp-config ${q(fileOf(id))}`]]);
  });
});

describe('the launch line', () => {
  it('quotes the path of the file, and puts it where the launcher wants its flags', () => {
    expect(claudeLaunchLine('/data/s.json', { mcpConfig: "/data folder/it's.json" })).toBe(`claude --settings '/data/s.json' --mcp-config '/data folder/it'\\''s.json'`);
    expect(claudeLaunchLine('/data/s.json', { command: 'wrap {flags} --', mcpConfig: '/data/m.json' })).toBe("wrap --settings '/data/s.json' --mcp-config '/data/m.json' --");
    expect(claudeLaunchLine('/data/s.json', { mcpConfig: null })).toBe("claude --settings '/data/s.json'");
  });
});
