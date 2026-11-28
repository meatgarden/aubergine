import http from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { NO_ATTENTION, NO_STATUS, THEME_PROPOSALS_MAX, newId, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { ThemeFolder } from './theme-files';
import { loadOrCreateToken } from './token';

/**
 * Color themes proposed by agents and programs, through the routes against a real server, a real state file and a
 * real folder of theme files. Nothing is typed: the runtime is a stand-in that keeps what it would have typed.
 */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
let typed: string[] = [];
let events: ChangeEvent[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  foreground: async () => 'the-agent',
  typeLine: async (_id: string, line: string) => void typed.push(line),
} as unknown as SessionRuntime;

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const themes = new ThemeFolder(dir);
  await themes.reload();
  const settings = new SettingsFile(dir, () => {}, () => themes.value.themes);
  app = await buildServer({ hub, sessions: new Sessions(hub, runtime, {}), runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), themes });
  events = [];
  hub.subscribe((event) => events.push(event));
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-theme-proposals-'));
  ownerToken = await loadOrCreateToken(dir);
  typed = [];
  await start();
});
afterEach(async () => {
  await hub.flush();
  await app.close();
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
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const asOwnerCli = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}` }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
const asSession = (session: Session, method: string, url: string, body?: unknown): Promise<Answer> => call(sessionToken(ownerToken, session.id), method, url, body);

async function makeToken(name: string, scopes: Scope[]): Promise<{ secret: string; id: string }> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes });
  expect(made.status).toBe(201);
  return { secret: made.body.secret as string, id: made.body.token.id as string };
}

function fakeSession(name: string): Session {
  const session: Session = { id: newId(), projectId: hub.state.projects[0]!.id, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], fields: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, group: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}

/** The text of a theme file, with one entry that is skipped and a stray key. */
const HARBOR = `${JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3', bg: 'red' }, terminal: { ansi: [null, '#cf8a90'] } }, null, 2)}\n`;
const waiting = () => hub.state.themeProposals.waiting;

describe('a theme proposed by an agent in a terminal', () => {
  it('is kept with its exact text, its digest and what was skipped, the proposer set by the server, and nothing is drawn, written or typed', async () => {
    const agent = fakeSession('designer');
    const made = await asSession(agent, 'POST', `/v1/sessions/${agent.id}/theme-proposals`, { id: 'harbor', text: HARBOR, why: 'easier at night', proposedBy: { kind: 'person' } });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body).toMatchObject({ themeId: 'harbor', name: 'Harbor', kind: 'dark', base: 'nord', colors: 1, why: 'easier at night', state: 'waiting', proposedBy: { kind: 'session', sessionId: agent.id } });
    expect(made.body.problems).toEqual(['themes/harbor.json, colors: "bg" is not a color written as #rrggbb. It is skipped.']);
    expect(made.body).not.toHaveProperty('text');
    const [kept] = waiting();
    expect(kept?.text).toBe(HARBOR);
    expect(kept?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(events.map((event) => event.type)).toContain('theme.proposed');
    // Nothing of it is a theme yet: no file, nothing among the themes, nothing typed.
    expect(await readdir(dir)).not.toContain('themes');
    expect((await asSession(agent, 'GET', `/v1/sessions/${agent.id}/themes`)).body.items.map((t: { id: string }) => t.id)).not.toContain('harbor');
    expect(typed).toEqual([]);
    // It is kept in the state file, and comes back after a restart.
    await hub.flush();
    await app.close();
    await start();
    expect(waiting().map((one) => one.text)).toEqual([HARBOR]);
  });

  it('lists the themes there are for the session, built-in and the owner\'s', async () => {
    const agent = fakeSession('designer');
    await mkdir(path.join(dir, 'themes'));
    await writeFile(path.join(dir, 'themes', 'mine.json'), JSON.stringify({ name: 'Mine', kind: 'light' }));
    const listed = await asSession(agent, 'GET', `/v1/sessions/${agent.id}/themes`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(11);
    expect(listed.body.items.at(-1)).toEqual({ id: 'mine', name: 'Mine', kind: 'light', base: 'light', own: true });
    expect(JSON.stringify(listed.body)).not.toMatch(/#[0-9a-f]{6}/);
  });

  it('refuses a file that cannot be read, and a why that is not one plain line, and keeps nothing', async () => {
    const agent = fakeSession('designer');
    const url = `/v1/sessions/${agent.id}/theme-proposals`;
    const notJson = await asSession(agent, 'POST', url, { id: 'harbor', text: '{' });
    expect(notJson.status).toBe(400);
    expect(notJson.body.error.message).toBe('themes/harbor.json: it is not JSON. It is not read.');
    expect((await asSession(agent, 'POST', url, { id: 'nord', text: HARBOR })).status).toBe(400);
    expect((await asSession(agent, 'POST', url, { id: 'x', text: JSON.stringify({ name: 'X', kind: 'dark', base: 'light' }) })).status).toBe(400);
    for (const why of ['two\nlines', 'red \u001b[31m', 'turned ‮', 'x'.repeat(301)]) expect((await asSession(agent, 'POST', url, { id: 'harbor', text: HARBOR, why })).status, why).toBe(400);
    expect((await asSession(agent, 'POST', url, { id: '../up', text: HARBOR })).status).toBe(400);
    expect(waiting()).toEqual([]);
    expect(events.filter((event) => event.type === 'theme.proposed')).toEqual([]);
  });

  it('keeps one per proposer and ID, and at most twenty from everyone', async () => {
    const agent = fakeSession('designer');
    const other = fakeSession('other');
    const url = (s: Session) => `/v1/sessions/${s.id}/theme-proposals`;
    expect((await asSession(agent, 'POST', url(agent), { id: 'harbor', text: HARBOR })).status).toBe(201);
    expect((await asSession(agent, 'POST', url(agent), { id: 'harbor', text: HARBOR.replace('Harbor', 'Harbor two') })).status).toBe(201);
    expect((await asSession(other, 'POST', url(other), { id: 'harbor', text: HARBOR })).status).toBe(201);
    expect(waiting().map((one) => [one.proposedBy.kind === 'session' ? one.proposedBy.sessionId : '', one.theme.name])).toEqual([
      [agent.id, 'Harbor two'],
      [other.id, 'Harbor'],
    ]);
    for (let i = waiting().length; i < THEME_PROPOSALS_MAX; i += 1) expect((await asSession(agent, 'POST', url(agent), { id: `t${i}`, text: HARBOR })).status).toBe(201);
    const full = await asSession(agent, 'POST', url(agent), { id: 'one-more', text: HARBOR });
    expect(full.status).toBe(409);
    expect(full.body.error.message).toContain('20 color themes are waiting to be read');
    // A newer one in place of its own older still fits.
    expect((await asSession(agent, 'POST', url(agent), { id: 'harbor', text: HARBOR })).status).toBe(201);
    expect(waiting()).toHaveLength(THEME_PROPOSALS_MAX);
  });

  it('is read back by that session alone, and no session or token accepts or declines anything', async () => {
    const agent = fakeSession('designer');
    const other = fakeSession('other');
    await asSession(agent, 'POST', `/v1/sessions/${agent.id}/theme-proposals`, { id: 'harbor', text: HARBOR });
    const proposal = waiting()[0]!;
    expect((await asSession(agent, 'GET', `/v1/sessions/${agent.id}/theme-proposals`)).body.items.map((row: { id: string }) => row.id)).toEqual([proposal.id]);
    expect((await asSession(other, 'GET', `/v1/sessions/${other.id}/theme-proposals`)).body.items).toEqual([]);
    expect((await asSession(other, 'GET', `/v1/sessions/${agent.id}/theme-proposals`)).status).toBe(403);
    expect((await asSession(other, 'POST', `/v1/sessions/${agent.id}/theme-proposals`, { id: 'x', text: HARBOR })).status).toBe(403);
    expect((await asSession(agent, 'GET', '/v1/themes/proposals')).status).toBe(403);
    expect((await asSession(agent, 'POST', '/v1/themes/proposals', { id: 'x', text: HARBOR })).status).toBe(403);
    const everything = await makeToken('everything', ['read', 'workflows:write', 'canvases:write', 'sessions:write', 'notes:write', 'runs:write', 'tasks:write']);
    for (const secret of [sessionToken(ownerToken, agent.id), everything.secret]) {
      expect((await call(secret, 'POST', `/v1/themes/proposals/${proposal.id}/accept`, { digest: proposal.digest })).status).toBe(403);
      expect((await call(secret, 'DELETE', `/v1/themes/proposals/${proposal.id}`)).status).toBe(403);
    }
    // A token reaches no session's own routes.
    expect((await call(everything.secret, 'GET', `/v1/sessions/${agent.id}/theme-proposals`)).status).toBe(403);
    expect((await call(everything.secret, 'POST', `/v1/sessions/${agent.id}/theme-proposals`, { id: 'x', text: HARBOR })).status).toBe(403);
    expect(waiting().map((one) => one.id)).toEqual([proposal.id]);
    expect(await readdir(dir)).not.toContain('themes');
  });
});

describe('a theme proposed by a program', () => {
  it('needs the scope that proposes drafts; reading what there is needs read', async () => {
    const reader = await makeToken('reader', ['read']);
    const writer = await makeToken('writer', ['workflows:write']);
    expect((await call(reader.secret, 'POST', '/v1/themes/proposals', { id: 'harbor', text: HARBOR })).status).toBe(403);
    const made = await call(writer.secret, 'POST', '/v1/themes/proposals', { id: 'harbor', text: HARBOR, why: 'for the demo' });
    expect(made.status).toBe(201);
    expect(made.body.proposedBy).toEqual({ kind: 'token', tokenId: writer.id, name: 'writer' });
    expect((await call(writer.secret, 'GET', '/v1/themes')).status).toBe(403);
    const themes = await call(reader.secret, 'GET', '/v1/themes');
    expect(themes.status).toBe(200);
    expect(themes.body.items.map((t: { id: string }) => t.id)).toContain('nord');
    const rows = await call(reader.secret, 'GET', '/v1/themes/proposals');
    expect(rows.body.items).toEqual([expect.objectContaining({ themeId: 'harbor', why: 'for the demo', state: 'waiting' })]);
    expect(JSON.stringify(rows.body)).not.toContain('#5fb3b3');
  });

  it('is told on the programs\' stream of changes, and on the owner\'s', async () => {
    const reader = await makeToken('reader', ['read']);
    const writer = await makeToken('writer', ['workflows:write']);
    const lines: string[] = [];
    const stream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/v1/events', headers: { authorization: `Bearer ${reader.secret}` } }, resolve).on('error', reject);
    });
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => lines.push(...chunk.split('\n').filter((line) => line.startsWith('data: '))));
    await call(writer.secret, 'POST', '/v1/themes/proposals', { id: 'harbor', text: HARBOR });
    const proposal = waiting()[0]!;
    expect((await asOwner('DELETE', `/v1/themes/proposals/${proposal.id}`)).status).toBe(204);
    for (let i = 0; i < 100 && lines.length < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    stream.destroy();
    expect(lines.map((line) => (JSON.parse(line.slice(6)) as { type: string }).type)).toEqual(['theme.proposed', 'theme.decided']);
    // The browser's stream is the hub's: the same two changes.
    expect(events.map((event) => event.type).filter((type) => type.startsWith('theme.'))).toEqual(['theme.proposed', 'theme.decided']);
  });
});

describe('the owner\'s decision', () => {
  async function proposed(): Promise<{ agent: Session; id: string; digest: string }> {
    const agent = fakeSession('designer');
    await asSession(agent, 'POST', `/v1/sessions/${agent.id}/theme-proposals`, { id: 'harbor', text: HARBOR, why: 'night' });
    const proposal = waiting()[0]!;
    return { agent, id: proposal.id, digest: proposal.digest };
  }

  it('writes exactly the text that was kept, for the digest that was shown, and chooses nothing', async () => {
    const { agent, id, digest } = await proposed();
    const before = await readFile(path.join(dir, 'config.json'), 'utf8').catch(() => null);
    const wrong = await asOwner('POST', `/v1/themes/proposals/${id}/accept`, { digest: 'sha256:0000' });
    expect(wrong.status).toBe(409);
    expect(await readdir(dir)).not.toContain('themes');
    const accepted = await asOwner('POST', `/v1/themes/proposals/${id}/accept`, { digest });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body).toMatchObject({ file: 'harbor.json', theme: { id: 'harbor', name: 'Harbor', base: 'nord' } });
    expect(accepted.body.themes.map((t: { id: string }) => t.id)).toEqual(['harbor']);
    expect(Buffer.compare(await readFile(path.join(dir, 'themes', 'harbor.json')), Buffer.from(HARBOR, 'utf8'))).toBe(0);
    // Nothing was chosen: the settings file is as it was.
    expect(await readFile(path.join(dir, 'config.json'), 'utf8').catch(() => null)).toBe(before);
    expect(waiting()).toEqual([]);
    expect(hub.state.themeProposals.decided).toEqual([expect.objectContaining({ proposalId: id, outcome: 'accepted', by: { kind: 'owner', sessionId: null } })]);
    // The session reads what became of it; the theme is one there is now.
    expect((await asSession(agent, 'GET', `/v1/sessions/${agent.id}/theme-proposals`)).body.items).toEqual([expect.objectContaining({ id, state: 'accepted' })]);
    expect((await asSession(agent, 'GET', `/v1/sessions/${agent.id}/themes`)).body.items.map((t: { id: string }) => t.id)).toContain('harbor');
    expect((await asOwner('POST', `/v1/themes/proposals/${id}/accept`, { digest })).status).toBe(404);
    expect(typed).toEqual([]);
  });

  it('never writes over a file that is there, or through a link', async () => {
    const { id, digest } = await proposed();
    await mkdir(path.join(dir, 'themes'));
    await writeFile(path.join(dir, 'themes', 'harbor.json'), 'mine');
    const there = await asOwner('POST', `/v1/themes/proposals/${id}/accept`, { digest });
    expect(there.status).toBe(409);
    expect(there.body.error.message).toContain('There is already a file named harbor.json');
    expect(await readFile(path.join(dir, 'themes', 'harbor.json'), 'utf8')).toBe('mine');
    expect(waiting().map((one) => one.id)).toEqual([id]);

    await rm(path.join(dir, 'themes'), { recursive: true });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'aubergine-outside-'));
    await symlink(outside, path.join(dir, 'themes'));
    const linked = await asOwner('POST', `/v1/themes/proposals/${id}/accept`, { digest });
    expect(linked.status).toBe(409);
    expect(linked.body.error.message).toMatch(/^Nothing was written: .*link/);
    expect(await readdir(outside)).toEqual([]);
    await rm(path.join(dir, 'themes'));
    await mkdir(path.join(dir, 'themes'));
    await symlink(path.join(outside, 'x.json'), path.join(dir, 'themes', 'harbor.json'));
    expect((await asOwner('POST', `/v1/themes/proposals/${id}/accept`, { digest })).status).toBe(409);
    expect(await readdir(outside)).toEqual([]);
    await rm(outside, { recursive: true, force: true });
  });

  it('declines: nothing of it is kept but that, and from the command line it is on record', async () => {
    const { agent, id } = await proposed();
    expect((await asOwnerCli('DELETE', `/v1/themes/proposals/${id}`)).status).toBe(204);
    expect(waiting()).toEqual([]);
    expect(JSON.stringify(hub.state)).not.toContain('#5fb3b3');
    expect(hub.state.themeProposals.decided).toEqual([expect.objectContaining({ proposalId: id, outcome: 'declined', by: { kind: 'owner-cli', sessionId: null } })]);
    expect((await asSession(agent, 'GET', `/v1/sessions/${agent.id}/theme-proposals`)).body.items).toEqual([expect.objectContaining({ id, state: 'declined', name: 'Harbor' })]);
    expect((await asOwner('DELETE', `/v1/themes/proposals/${id}`)).status).toBe(404);
    expect(await readdir(dir)).not.toContain('themes');
    for (let i = 0; i < 50; i += 1) {
      const activity = await asOwner('GET', '/v1/activity');
      if (JSON.stringify(activity.body).includes('themes.manage')) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('The decline from the command line is not in the activity log');
  });
});
