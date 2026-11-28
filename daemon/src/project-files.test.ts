import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, NO_ATTENTION, NO_STATUS, PROJECT_FILE_MAX_CHARS, RULES_MAX, newId, readProjectFile, type AppState, type ChangeEvent, type ForYou, type ProjectFile, type ProjectFileReading, type QueueState, type Scope, type Session, type Task } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryActivityLog } from './activity';
import { sessionToken } from './auth';
import { FileRunArchive } from './run-archive';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import type { ScheduleClock } from './schedules';
import { FileTaskArchive } from './task-archive';
import { loadOrCreateToken } from './token';
import { Viewers } from './viewers';

/**
 * A project as a file, through the routes against a real server and a real
 * state file: written out on one server and read in on another (a second
 * data folder), what a file never holds, hostile files, that nothing is made
 * before the owner accepts exactly the text that was shown, that nothing is
 * started that the owner did not start, and templates.
 */

/** Schedules here are written in a made-up owner's zone, four hours behind universal time in June. */
const ZONE = 'America/New_York';

interface Wake {
  due: number;
  then: () => void;
}
/** The stand-in clock: it stands still until the test moves it, and counts every time the timer was set. */
interface StandInClock extends ScheduleClock {
  at: number;
  set: number[];
  pending: Wake[];
}
const clock: StandInClock = {
  at: 0,
  set: [],
  pending: [],
  now: () => clock.at,
  wake: (ms, then) => {
    clock.set.push(ms);
    const wake = { due: clock.at + ms, then };
    clock.pending.push(wake);
    return () => void (clock.pending = clock.pending.filter((w) => w !== wake));
  },
};
const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
/** Moves the clock to a moment, waking the timer at each time it asked for on the way. */
async function moveTo(iso: string): Promise<void> {
  const target = Date.parse(iso);
  for (;;) {
    const next = [...clock.pending].sort((a, b) => a.due - b.due)[0];
    if (!next || next.due > target) break;
    clock.pending = clock.pending.filter((w) => w !== next);
    clock.at = next.due;
    next.then();
    await turn();
  }
  clock.at = target;
  await turn();
}

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
let typed: [string, string][] = [];
let viewers: Viewers;
let notified: string[] = [];
const activity = new MemoryActivityLog();
let events: ChangeEvent[] = [];

/** What every new shell was started with. */
let created: object[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => [],
  // A terminal that was made without a shell has none until one is started for it.
  has: async (id: string) => hub.state.sessions.find((session) => session.id === id)?.state !== 'exited' || created.some((shell) => (shell as { id?: string }).id === id),
  kill: async () => {},
  // The program an agent's record names is in front.
  foreground: async () => 'the-agent',
  typeLine: async (id: string, line: string) => {
    typed.push([id, line]);
  },
  create: async (options: { id: string }) => {
    created.push(options);
    return { id: options.id, cwd: null, command: null, activityAt: null };
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
  // The line that would start an agent, stood in for: the program and what it is given, as they would be typed.
  const sessions = new Sessions(hub, runtime, { agentLaunchLine: async (_agent, args) => `the-agent ${args.map((arg) => JSON.stringify(arg)).join(' ')}` });
  viewers = new Viewers();
  viewers.add((message) => void (message.type === 'notify' && notified.push(message.body)));
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir), taskArchive: new FileTaskArchive(dir), activity, viewers, scheduleClock: clock, scheduleZone: ZONE, templatesDir: path.join(dir, 'templates') });
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
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-project-files-'));
  ownerToken = await loadOrCreateToken(dir);
  // The walk below makes more calls with one token than the usual limit allows in a minute.
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  typed = [];
  created = [];
  notified = [];
  // Monday the 15th of June 2026, 08:00 on the owner's clock.
  clock.at = Date.parse('2026-06-15T12:00:00.000Z');
  clock.set = [];
  clock.pending = [];
  activity.entries.length = 0;
  await start();
});
afterEach(async () => {
  await stop();
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
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
const asSession = (session: Session, method: string, url: string, body?: unknown): Promise<Answer> => call(sessionToken(ownerToken, session.id), method, url, body);

async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, ...more });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}

function fakeSession(name: string, more: Partial<Session> = {}): Session {
  const session: Session = { id: newId(), projectId: hub.state.projects[0]!.id, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], fields: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null, ...more };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}

/** A terminal where an agent is seen in front and is free: the only kind a task is given to. */
const agent = (name: string, more: Partial<Session> = {}): Session => fakeSession(name, { agent: { kind: 'claude-code', conversationId: null, program: 'the-agent' }, command: 'the-agent', status: { ...NO_STATUS, state: 'busy' }, ...more });
const queueNow = (): QueueState => hub.state.queue;
const taskNow = (id: string): Task => queueNow().tasks.find((t) => t.id === id) as Task;
const add = async (title: string, more: object = {}): Promise<Task> => {
  const answer = await asOwner('POST', '/v1/tasks', { title, ...more });
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  return answer.body as Task;
};
const startNext = async (taskId?: string): Promise<{ status: number; body: any }> => asOwner('POST', '/v1/tasks/start', taskId ? { taskId } : {}); // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
/** What the agent in a terminal does: it hands in its list. */
const finish = async (session: Session): Promise<void> => {
  expect((await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done', output: { items: [{ text: 'Answer the letter' }] } })).status).toBe(200);
};
async function until(done: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await done())) {
    if (Date.now() > end) throw new Error('Waited too long');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const forYouNow = async (): Promise<ForYou> => (await asOwner('GET', '/v1/for-you')).body as ForYou;

import { createClient } from '@aubergine/client';
import { SESSION_ENV } from '@aubergine/shared';
import { parseProjectCommand, runProjectCommand } from './cli/project';
import { digestOf } from './project-files';

void [taskNow, add, startNext, finish, until, forYouNow];
const state = (): AppState => hub.state;
const all = (value: unknown): string => JSON.stringify(value);
const used: string[] = [];
afterEach(async () => {
  for (const folder of used.splice(0)) await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});
/** Another server, with a data folder of its own: where a teammate reads the file in. */
async function anotherServer(): Promise<void> {
  await stop();
  used.push(dir);
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-project-files-other-'));
  ownerToken = await loadOrCreateToken(dir);
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  created = [];
  typed = [];
  await start();
}
const EVERY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const first = (): { id: string; canvasId: string } => ({ id: state().projects[0]!.id, canvasId: state().canvases.find((c) => c.projectId === state().projects[0]!.id)!.id });
const exportOf = async (projectId: string, query = ''): Promise<{ text: string; digest: string; fileName: string; leftOut: string[] }> => {
  const answer = await asOwner('GET', `/v1/projects/${projectId}/file${query}`);
  expect(answer.status, all(answer.body)).toBe(200);
  return answer.body;
};
const reading = async (text: string): Promise<ProjectFileReading> => {
  const answer = await asOwner('POST', '/v1/project-files/read', { text });
  expect(answer.status, all(answer.body)).toBe(200);
  return answer.body;
};
const takeIn = (text: string, more: object = {}) => asOwner('POST', '/v1/project-files/import', { text, digest: digestOf(text), ...more });
/** A file with the least a file needs, and whatever a test adds or breaks. */
const fileWith = (more: object = {}): string => JSON.stringify({ aubergine: 'project', format: 1, name: 'From a file', canvases: [{ ref: 'c1', name: 'Main', nodes: [{ x: 0, y: 0, width: 640, height: 400, terminal: { ref: 't1', name: 'one' } }] }], ...more });
/** What a server holds, as the test compares it before and after something that must make nothing. */
const holds = (): string => all([state().projects, state().canvases.map((c) => [c.id, c.layout]), state().sessions.map((s) => s.id), state().workflows.map((w) => w.id), state().shelf.map((e) => e.id), state().queue.rules, state().schedules.items]);

/** A project full of everything: what belongs in a file, and what must never be in one. */
async function fullProject(): Promise<{ projectId: string; folder: string; secret: string }> {
  const folder = path.join(dir, 'made-up work folder');
  await mkdir(path.join(folder, 'docs'), { recursive: true });
  const made = await asOwner('POST', '/v1/projects', { name: 'Garden site', color: 'green', defaultFolder: folder, folders: [path.join(folder, 'docs')] });
  expect(made.status, all(made.body)).toBe(201);
  const projectId = made.body.id as string;
  const main = state().canvases.find((c) => c.projectId === projectId)!.id;
  await asOwner('PATCH', `/v1/canvases/${main}`, { color: 'purple', name: 'Build' });
  const second = (await asOwner('POST', '/v1/canvases', { projectId, name: 'Notes' })).body.id as string;
  expect((await asOwner('POST', `/v1/canvases/${main}/frames`, { label: 'Agents', x: 10, y: 10, width: 900, height: 500 })).status).toBe(201);
  // Terminals: an agent's, a plain one in a subfolder, one on the second canvas.
  const place = (canvasId: string, name: string, more: Partial<Session>, x: number): Session => {
    const session: Session = { ...agent(`temporary ${name}`), ...more };
    hub.emit({ type: 'session.closed', sessionId: session.id });
    const here: Session = { ...session, id: newId(), name, projectId };
    hub.emit({ type: 'session.created', session: here, canvasId, node: { id: newId(), sessionId: here.id, x, y: 40, width: 700, height: 420, color: 'blue' } });
    return here;
  };
  const builder = place(main, 'builder', { cwd: folder, tags: ['agent'], note: '# Pinned\nKeep the tests green.' }, 40);
  place(main, 'shell', { agent: null, command: 'zsh', cwd: path.join(folder, 'docs', 'guide'), note: '' }, 800);
  place(second, 'writer', { agent: null, command: 'zsh', cwd: '/somewhere/else/entirely', note: 'Outside every folder of the project.' }, 40);
  // What it owns of the shared kinds, and a shared element its schedule runs.
  await asOwner('PUT', '/v1/sharing', { kind: 'workflow', default: 'project' });
  const flow = await asOwner('POST', '/v1/workflows', { projectId, name: 'Build and look', elements: [{ name: 'Build', instructions: 'Build {{task}}.' }, { name: 'Look', kind: 'approval', ask: 'Fine?' }] });
  expect(flow.body.projectId).toBe(projectId);
  const shared = await asOwner('POST', '/v1/elements', { name: 'Morning list', instructions: 'Gather: {{task}}', produces: 'checklist', needs: [{ kind: 'mcp', name: 'chat' }] });
  expect(shared.body.projectId).toBeNull();
  await asOwner('POST', '/v1/elements', { name: 'Not used by the project', instructions: 'This one stays behind.' });
  expect((await asOwner('POST', '/v1/schedules', { projectId, name: 'Every morning', time: '08:30', days: EVERY, what: { kind: 'element', elementId: shared.body.id }, where: { kind: 'session', sessionId: builder.id }, task: 'what is open' })).status).toBe(201);
  expect((await asOwner('POST', '/v1/schedules', { projectId, name: 'Weekly build', time: '09:00', days: ['mon'], what: { kind: 'workflow', workflowId: flow.body.id }, where: { kind: 'new', canvasId: main }, task: 'the weekly build' })).status).toBe(201);
  await asOwner('POST', '/v1/rules', { projectId, event: 'task.done', action: { kind: 'notify' } });
  await asOwner('POST', '/v1/rules', { projectId, event: 'task.failed', action: { kind: 'run-element', elementId: shared.body.id, on: { kind: 'session', sessionId: builder.id } } });
  // What must never be in a file: tasks, what was written, a run and its note, the note log, a token, a working copy, an attention message.
  await asOwner('POST', '/v1/tasks', { projectId, title: 'A secret task title', details: 'secret task details' });
  await asOwner('POST', '/v1/asks', { projectId, text: 'A secret thing written on the list' });
  await asOwner('POST', `/v1/sessions/${builder.id}/notes`, { text: 'A secret entry in the note log' });
  expect((await asOwner('PATCH', `/v1/sessions/${builder.id}`, { fields: [{ label: 'Ticket', value: 'a secret field value' }] })).status).toBe(200);
  const run = await asOwner('POST', '/v1/runs', { workflowId: flow.body.id, sessionId: builder.id, inputs: { task: 'a secret run input' } });
  expect(run.status, all(run.body)).toBe(201);
  await asSession(builder, 'POST', `/v1/sessions/${builder.id}/run/report`, { type: 'done', note: 'A secret note of a run' });
  hub.emit({ type: 'session.attention', sessionId: builder.id, attention: { state: 'waiting', message: 'A secret question', at: new Date().toISOString() } });
  hub.emit({ type: 'environment.changed', environment: { id: newId(), projectId, kind: 'working-copy', title: 'In its own working copy', words: 'Kept apart.', sessionId: builder.id, sessionName: 'builder', projectFolder: folder, folder: path.join(dir, 'copies', 'secret-copy'), startFolder: path.join(dir, 'copies', 'secret-copy'), branch: 'aubergine/secret-branch', startCommit: 'c'.repeat(40), createdAt: new Date().toISOString(), changes: null, broken: null } });
  const secret = await makeToken('a secret token name', ['read'], { projects: { kind: 'projects', projectIds: [projectId] } });
  return { projectId, folder, secret };
}

describe('a project written to a file', () => {
  it('never holds what ran, a credential, a setting, a path or an ID of this computer', async () => {
    const { projectId, folder, secret } = await fullProject();
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 }, agents: { claudeCommand: 'a-secret-launcher --flag' }, desktop: { command: 'a-secret-terminal {file}' } }));
    const { text, leftOut } = await exportOf(projectId);
    const s = state();
    // By what was said: nothing that ran, nothing written on the list, no log, no token, no setting.
    for (const never of ['secret', 'Secret', 'aubergine/', 'copies', 'launcher', 'a-secret-terminal', ownerToken, secret, 'Not used by the project', 'tokens', 'noteLog', 'attention', 'status', 'peopleOnly', '"home"', '"host"', 'recap', 'lastInputAt', 'conversationId', 'commandLine', 'fields', 'Ticket']) expect(text.includes(never), `the file holds “${never}”`).toBe(false);
    // By where it was written: no path of this computer, not the data folder, not the user's name or home.
    for (const never of [dir, folder, os.homedir(), os.userInfo().username, os.tmpdir(), '/somewhere/else', '/Users/', '/home/', 'made-up work folder/']) expect(text.includes(never), `the file holds the path “${never}”`).toBe(false);
    // By what is this server's: no ID of anything here.
    const ids = [...s.projects, ...s.canvases, ...s.sessions, ...s.workflows, ...s.shelf, ...s.queue.rules, ...s.queue.tasks, ...s.queue.asks, ...s.schedules.items, ...s.runs, ...s.environments, ...s.tokens, ...s.canvases.flatMap((c) => [...c.layout.nodes, ...c.layout.frames])].map((thing) => thing.id);
    expect(ids.length).toBeGreaterThan(20);
    for (const id of [...ids, s.workspace.id, s.organization.id, hub.epoch]) expect(text.includes(id), `the file holds the ID ${id}`).toBe(false);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}/);
    // What it does hold: the shape and the instructions.
    const file = JSON.parse(text) as ProjectFile;
    expect(file).toMatchObject({ aubergine: 'project', format: 1, template: false, name: 'Garden site', color: 'green' });
    expect(file.places).toEqual([{ name: 'docs', hint: 'docs', default: false }, { name: 'main', hint: 'made-up work folder', default: true }]);
    expect(file.canvases.map((c) => [c.name, c.color, c.frames.length, c.nodes.map((n) => [n.terminal.name, n.terminal.place, n.terminal.subfolder, n.terminal.agent, n.terminal.environment])])).toEqual([
      ['Build', 'purple', 1, [['builder', 'main', '', 'claude-code', 'working-copy'], ['shell', 'docs', 'guide', null, null]]],
      ['Notes', 'none', 0, [['writer', null, '', null, null]]],
    ]);
    expect(file.canvases[0]?.nodes[0]?.terminal.note).toBe('# Pinned\nKeep the tests green.');
    // The workflow it owns, the shared element its schedule and rule run (marked as shared), and nothing else of the shelf.
    expect(file.workflows.map((w) => [w.shared, (w.file as unknown as { workflow: { name: string } }).workflow.name])).toEqual([[false, 'Build and look']]);
    expect(file.elements.map((e) => [e.shared, e.element.name])).toEqual([[true, 'Morning list']]);
    expect(file.schedules.map((x) => [x.name, x.time, Object.keys(x.what)[0], Object.keys(x.where)[0]])).toEqual([['Every morning', '08:30', 'element', 'terminal'], ['Weekly build', '09:00', 'workflow', 'canvas']]);
    expect(file.rules.map((r) => r.action.kind)).toEqual(['notify', 'run-element']);
    expect(leftOut).toEqual([]);
    expect(readProjectFile(text).ok).toBe(true);
  });

  it('is the owner\'s alone, names a project kept here, and says what it left out', async () => {
    const a = first();
    const worker = agent('worker');
    await asOwner('POST', `/api/v1/sessions/${agent('parked one').id}/park`);
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reach: { kind: 'all' }, reviewWorkflowChanges: false });
    for (const secret of [everything, sessionToken(ownerToken, worker.id)]) {
      expect((await call(secret, 'GET', `/v1/projects/${a.id}/file`)).status).toBe(403);
      expect((await call(secret, 'POST', `/v1/projects/${a.id}/template`, {})).status).toBe(403);
      expect((await call(secret, 'GET', '/v1/project-templates')).status).toBe(403);
    }
    expect((await exportOf(a.id)).leftOut).toEqual(['1 parked terminal is on no canvas and not in the file.']);
    expect((await asOwner('GET', `/v1/projects/${newId()}/file`)).status).toBe(404);
    // A project whose record another server owns is not written out here.
    hub.emit({ type: 'project.changed', project: { ...state().projects[0]!, home: { kind: 'elsewhere' } } });
    const refused = await asOwner('GET', `/v1/projects/${a.id}/file`);
    expect([refused.status, refused.body.error.message]).toEqual([409, 'This project is not kept on this server: it cannot be written to a file here.']);
  });
});

describe('a rule that hears a terminal', () => {
  it('is written into a file and read in from one, switched off like every rule', async () => {
    const projectId = state().projects[0]!.id;
    for (const event of ['terminal.waiting', 'terminal.finished', 'command.failed']) expect((await asOwner('POST', '/v1/rules', { projectId, event, action: { kind: 'notify' } })).status).toBe(201);
    const { text } = await exportOf(projectId);
    expect((JSON.parse(text) as ProjectFile).rules.map((r) => r.event)).toEqual(['terminal.waiting', 'terminal.finished', 'command.failed']);
    expect((await reading(text)).counts.rules).toBe(3);
    const taken = await takeIn(text, { name: 'Read in again' });
    expect(taken.status, all(taken.body)).toBe(201);
    expect(state().queue.rules.filter((r) => r.projectId !== projectId).map((r) => [r.event, r.on])).toEqual([['terminal.waiting', false], ['terminal.finished', false], ['command.failed', false]]);
  });
});

describe('a file read in on another server', () => {
  it('gives the same canvases, layout, frames, notes, rules, schedules, workflows and steps, with new IDs and nothing pointing at the first server', async () => {
    const { projectId, folder } = await fullProject();
    const before = state();
    const oldIds = new Set([...before.projects, ...before.canvases, ...before.sessions, ...before.workflows, ...before.shelf, ...before.queue.rules, ...before.schedules.items].map((thing) => thing.id));
    const shape = (s: AppState, of: string) => ({
      canvases: s.canvases.filter((c) => c.projectId === of).sort((x, y) => x.order - y.order).map((c) => ({ name: c.name, color: c.color, frames: c.layout.frames.map(({ id: _id, ...frame }) => frame), nodes: c.layout.nodes.map(({ id: _id, sessionId, ...node }) => ({ ...node, terminal: (({ name, tags, note }) => ({ name, tags, note }))(s.sessions.find((x) => x.id === sessionId)!) })) })),
      workflows: s.workflows.filter((w) => w.listed && w.name === 'Build and look').map((w) => w.versions.at(-1)!.elements.map((e) => [e.name, e.kind, e.instructions, e.ask])),
      elements: s.shelf.filter((e) => e.element.name === 'Morning list').map((e) => [e.element.name, e.element.instructions, e.element.produces, e.element.needs]),
      rules: s.queue.rules.filter((r) => r.projectId === of).map((r) => [r.event, r.action.kind]),
      schedules: s.schedules.items.filter((x) => x.projectId === of).map((x) => [x.name, x.time, x.days, x.what.kind, x.where.kind, x.task]),
    });
    const was = shape(before, projectId);
    const { text } = await exportOf(projectId);

    await anotherServer();
    expect(state().projects).toHaveLength(1);
    // The teammate reads it first: everything an agent would be told, what will be made, where its places are to go.
    const read = await reading(text);
    expect(read).toMatchObject({ name: 'Garden site', nameTaken: false, template: false, counts: { canvases: 2, terminals: 3, agents: 1, frames: 1, notes: 2, workflows: 1, elements: 1, rules: 2, schedules: 2 }, agents: ['builder'], shared: ['Morning list'], sharedDefault: 'shared' });
    expect(read.places).toEqual([{ name: 'docs', hint: 'docs', default: false, terminals: 1 }, { name: 'main', hint: 'made-up work folder', default: true, terminals: 1 }]);
    expect(read.texts.map((t) => t.title)).toEqual(['The workflow “Build and look”', 'The step “Morning list”', 'The task of the schedule “Every morning”', 'The task of the schedule “Weekly build”']);
    expect(read.texts[0]?.text).toContain('Build (task).');
    expect(read.texts[1]?.text).toContain('Gather: (task)');
    expect(read.needs).toEqual([{ of: 'Morning list', needs: ['mcp: chat'] }]);
    expect(read.says.join(' ')).toContain('No shell is started unless you tick “Start the terminals”.');
    expect(read.says.join(' ')).toContain('no agent is started');
    expect(read.says.join(' ')).toContain('2 schedules arrive switched off.');
    expect(state().projects).toHaveLength(1);
    // Where its places are on this computer: one said, one left unset.
    const here = path.join(dir, 'their own folder');
    await mkdir(here, { recursive: true });
    const taken = await takeIn(text, { places: { main: here, docs: null } });
    expect(taken.status, all(taken.body)).toBe(201);
    expect(taken.body.says).toBe('Made “Garden site”: 2 canvases, 3 terminals, none started. Its schedules and rules are switched off. 2 terminals have no place and will start in your home folder.');
    const after = state();
    const made = after.projects.find((p) => p.name === 'Garden site')!;
    expect(made).toMatchObject({ color: 'green', state: 'open', home: { kind: 'local' }, folders: [here], defaultFolder: here });
    // The same shape.
    expect(shape(after, made.id)).toEqual(was);
    // New IDs for everything, and nothing of the first server anywhere in this one's state.
    const text2 = all(after);
    for (const id of oldIds) expect(text2.includes(id), `the second server holds the first server's ID ${id}`).toBe(false);
    expect(text2).not.toContain(folder);
    expect(text2).not.toContain('made-up work folder');
    // Where each terminal will start: in the place the owner said, or nowhere in particular.
    expect(Object.fromEntries(after.sessions.filter((s) => s.projectId === made.id).map((s) => [s.name, [s.cwd, s.state, s.agent, s.meantFor]]))).toEqual({
      builder: [here, 'exited', null, { agent: 'claude-code', environment: 'working-copy', placeUnset: false }],
      shell: [null, 'exited', null, { agent: null, environment: null, placeUnset: true }],
      writer: [null, 'exited', null, { agent: null, environment: null, placeUnset: true }],
    });
    // What the file called shared is shared here; what the project owned is the new project's own.
    expect(after.shelf.find((e) => e.element.name === 'Morning list')?.projectId).toBeNull();
    expect(after.workflows.find((w) => w.name === 'Build and look')?.projectId).toBe(made.id);
    // Rules and schedules point at the things that were made here, and are off.
    const builder = after.sessions.find((s) => s.name === 'builder')!;
    expect(after.schedules.items.map((x) => [x.name, x.on, x.where.kind === 'session' ? x.where.sessionId === builder.id : after.canvases.some((c) => c.id === (x.where as { canvasId: string }).canvasId && c.projectId === made.id)])).toEqual([['Every morning', false, true], ['Weekly build', false, true]]);
    expect(after.queue.rules.map((r) => r.on)).toEqual([false, false]);
    expect((after.queue.rules[1]?.action as unknown as { on: { sessionId: string } }).on.sessionId).toBe(builder.id);
    // Nothing that ran came along: no task, nothing written, no run, no token, no working copy.
    expect([after.queue.tasks, after.queue.asks, after.runs, after.environments, after.tokens]).toEqual([[], [], [], [], []]);
    expect(after.sessions.every((s) => s.noteLog.length === 0 && s.attention.state === NO_ATTENTION.state)).toBe(true);
  });

  it('starts no shell unless that is ticked, and never an agent; schedules arrive off; a restart and a wait start nothing', async () => {
    const { projectId } = await fullProject();
    const { text } = await exportOf(projectId);
    await anotherServer();
    expect((await takeIn(text)).status).toBe(201);
    expect(created).toEqual([]);
    expect(typed).toEqual([]);
    // Days pass, the mornings of its schedules among them; the server is stopped and started.
    await moveTo('2026-06-17T13:00:00.000Z');
    await stop();
    await start();
    await moveTo('2026-06-18T13:00:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(created).toEqual([]);
    expect(typed).toEqual([]);
    expect(state().runs).toEqual([]);
    expect(state().queue.tasks).toEqual([]);
    expect(state().sessions.filter((s) => s.name !== undefined).every((s) => s.state === 'exited')).toBe(true);
    expect(state().schedules.items.every((x) => !x.on && x.last === null)).toBe(true);
    // A rule that is off hears nothing; switched on, it does.
    const made = state().projects.find((p) => p.name === 'Garden site')!;
    const rule = state().queue.rules[0]!;
    const one = (await asOwner('POST', '/v1/tasks', { projectId: made.id, title: 'One' })).body as Task;
    void one;
    expect((await asOwner('PATCH', `/v1/rules/${rule.id}`, { on: true })).body.rules.find((r: { id: string }) => r.id === rule.id).on).toBe(true);
    // The owner starts one terminal: a plain shell, in its place. It was an agent's; no agent is started with it.
    const builder = state().sessions.find((s) => s.name === 'builder')!;
    expect((await asOwner('POST', `/api/v1/sessions/${builder.id}/restart`)).status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ id: builder.id });
    expect(typed).toEqual([]);
    expect(state().sessions.find((s) => s.id === builder.id)).toMatchObject({ state: 'open', agent: null });
    expect(state().sessions.find((s) => s.id === builder.id)?.meantFor).toBeUndefined();

    // Ticked: a fresh shell in each terminal, and still no agent.
    const again = await takeIn(text, { name: 'Garden site, started', start: true });
    expect(again.status, all(again.body)).toBe(201);
    expect(again.body).toMatchObject({ started: 3, says: expect.stringContaining('3 terminals, 3 started') });
    expect(created).toHaveLength(4);
    expect(typed).toEqual([]);
    expect(state().sessions.filter((s) => s.projectId === again.body.project.id).map((s) => [s.state, s.agent])).toEqual([['open', null], ['open', null], ['open', null]]);
  });
});

describe('nothing is made', () => {
  it('without the owner accepting exactly the text that was shown: a stale digest is refused, and so is every token and every session', async () => {
    const worker = agent('worker');
    const text = fileWith();
    const read = await reading(text);
    const before = holds();
    // The text changed after it was read: refused, by the digest.
    const changed = fileWith({ name: 'Changed since it was read' });
    const stale = await asOwner('POST', '/v1/project-files/import', { text: changed, digest: read.digest });
    expect([stale.status, stale.body.error.message]).toEqual([409, 'This is not the text that was read: read the file again before it is taken in. Nothing was made.']);
    expect((await asOwner('POST', '/v1/project-files/import', { text, digest: 'sha256:0000' })).status).toBe(409);
    expect((await asOwner('POST', '/v1/project-files/import', { text })).status).toBe(400);
    // No token of any scope and no session, by any route.
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reach: { kind: 'all' }, reviewWorkflowChanges: false });
    const bodies: (object | undefined)[] = [undefined, {}, { text }, { text, digest: read.digest }, { text, digest: read.digest, start: true, name: 'Theirs' }, { notes: true }];
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events' || route.method === 'DELETE') continue;
      const url = route.url.replace(/:([A-Za-z]+)/g, (_all, name: string) => (name === 'sessionId' ? worker.id : name === 'projectId' ? state().projects[0]!.id : name === 'templateId' ? 'app:feature-work' : newId()));
      for (const body of bodies) {
        if (route.method === 'GET' && body !== undefined) continue;
        for (const secret of [everything, sessionToken(ownerToken, worker.id)]) {
          const answer = await call(secret, route.method, url, body);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
          if (route.url.includes('project-files') || route.url.includes('project-templates') || route.url.endsWith('/projects/:projectId/file') || route.url.endsWith('/template')) expect(answer.status, `${route.method} ${route.url}`).toBe(403);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(600);
    expect(state().projects).toHaveLength(1);
    expect(state().projects[0]?.name).not.toBe('Theirs');
    expect(await readdir(path.join(dir, 'templates')).catch(() => [])).toEqual([]);
    // Reading is not making.
    expect(state().canvases.filter((c) => c.projectId !== state().projects[0]!.id)).toEqual([]);
    void before;
    // The owner, with the digest of exactly that text: made.
    expect((await asOwner('POST', '/v1/project-files/import', { text, digest: read.digest })).status).toBe(201);
    expect(state().projects.map((p) => p.name)).toContain('From a file');
  });

  it('from a hostile file: each is refused with a sentence', async () => {
    const before = holds();
    const node = (terminal: object) => ({ x: 0, y: 0, width: 640, height: 400, terminal: { ref: 't1', name: 'one', ...terminal } });
    const canvas = (more: object = {}) => ({ ref: 'c1', name: 'Main', nodes: [node({})], ...more });
    const hostile: [string, string, RegExp][] = [
      ['not JSON', '{ not json', /not JSON/],
      ['not a project file', JSON.stringify({ aubergine: 'workflow', format: 1 }), /not an Aubergine project file/],
      ['a later format', fileWith({ format: 2 }), /This file is in format 2, and this version reads format 1\. Update Aubergine to read it\./],
      ['a path as a place', fileWith({ places: [{ name: '/etc' }] }), /places\.0\.name/],
      ['a place that climbs', fileWith({ places: [{ name: '..' }] }), /places\.0\.name/],
      ['a hint that is a path', fileWith({ places: [{ name: 'main', hint: '../../etc/passwd' }] }), /A hint is one name, not a path/],
      ['.. in a subfolder', fileWith({ places: [{ name: 'main' }], canvases: [canvas({ nodes: [node({ place: 'main', subfolder: 'docs/../../..' })] })] }), /never upward/],
      ['an absolute subfolder', fileWith({ places: [{ name: 'main' }], canvases: [canvas({ nodes: [node({ place: 'main', subfolder: '/etc' })] })] }), /not from the root/],
      ['a home subfolder', fileWith({ places: [{ name: 'main' }], canvases: [canvas({ nodes: [node({ place: 'main', subfolder: '~/.ssh' })] })] }), /not from the root/],
      ['a backslash climb', fileWith({ places: [{ name: 'main' }], canvases: [canvas({ nodes: [node({ place: 'main', subfolder: 'a\\..\\..' })] })] }), /never upward/],
      ['a name with a control character', fileWith({ name: 'Bad\u001b[31mname' }), /at name/],
      ['a terminal name that reverses direction', fileWith({ canvases: [canvas({ nodes: [node({ name: 'abc‮def' })] })] }), /canvases\.0\.nodes\.0\.terminal\.name/],
      ['a note with a control character', fileWith({ canvases: [canvas({ nodes: [node({ note: 'x\u0007y' })] })] }), /A note is plain text/],
      ['a place that is not listed', fileWith({ canvases: [canvas({ nodes: [node({ place: 'nowhere' })] })] }), /starts in a place, “nowhere”, that the file does not list/],
      ['two things with one reference', fileWith({ canvases: [canvas(), { ref: 'c1', name: 'Again', nodes: [] }] }), /Two things in this file have the reference c1/],
      ['a terminal and a step with one reference', fileWith({ elements: [{ ref: 't1', element: { id: 'x', name: 'X', instructions: 'x' } }] }), /Two things in this file have the reference t1/],
      ['a rule naming a step that is not there', fileWith({ rules: [{ event: 'task.done', action: { kind: 'run-element', element: 'e9', on: { terminal: 't1' } } }] }), /A rule runs a step that is not in the file/],
      ['a rule on a terminal that is not there', fileWith({ elements: [{ ref: 'e1', element: { id: 'x', name: 'X', instructions: 'x' } }], rules: [{ event: 'task.done', action: { kind: 'run-element', element: 'e1', on: { terminal: 't9' } } }] }), /A rule names a terminal that is not in the file/],
      ['a schedule running what is not there', fileWith({ schedules: [{ name: 'S', time: '08:30', days: ['mon'], what: { workflow: 'w9' }, where: { canvas: 'c1' } }] }), /The schedule “S” runs something that is not in the file/],
      ['a rule that does something else', fileWith({ rules: [{ event: 'task.done', action: { kind: 'call-an-address', url: 'http://example.invalid' } }] }), /rules\.0\.action/],
      ['too many canvases', fileWith({ canvases: Array.from({ length: 51 }, (_, n) => ({ ref: `c${n}`, name: `C${n}`, nodes: [] })) }), /at canvases/],
      ['too many terminals', fileWith({ canvases: [0, 1].map((c) => ({ ref: `c${c}`, name: `C${c}`, nodes: Array.from({ length: 160 }, (_, n) => ({ x: 0, y: 0, width: 640, height: 400, terminal: { ref: `t${c * 200 + n}`, name: `T${n}` } })) })) }), /This file has 320 terminals, and a project file may have 300/],
      ['too many rules', fileWith({ rules: Array.from({ length: 51 }, () => ({ event: 'task.done', action: { kind: 'notify' } })) }), /at rules/],
      ['too large', fileWith({ description: 'x'.repeat(10) }) + ' '.repeat(PROJECT_FILE_MAX_CHARS), /larger than a project file may be/],
      ['no canvas', fileWith({ canvases: [] }), /at canvases/],
      ['a workflow that is not one', fileWith({ workflows: [{ ref: 'w1', file: { aubergine: 'workflow', format: 1, workflow: { name: 'W', elements: 'none' } } }] }), /A workflow in this file cannot be read/],
    ];
    for (const [what, text, sentence] of hostile) {
      const read = await asOwner('POST', '/v1/project-files/read', { text });
      expect(read.status, `${what}: ${all(read.body).slice(0, 200)}`).toBe(400);
      expect(read.body.error.message, what).toMatch(sentence);
      // And taken in with its own digest, as if it had been shown: refused the same, and nothing made.
      const taken = await takeIn(text);
      expect(taken.status, `${what}, taken in`).toBeGreaterThanOrEqual(400);
      expect(holds(), what).toBe(before);
    }
    // A place the owner names that is not a folder here, a place the file does not have, and a name that is taken.
    const good = fileWith({ places: [{ name: 'main' }], canvases: [canvas({ nodes: [node({ place: 'main', subfolder: 'docs' })] })] });
    for (const [more, sentence] of [
      [{ places: { main: path.join(dir, 'no such folder') } }, /is not a folder on this computer/],
      [{ places: { main: path.join(dir, 'config.json') } }, /is not a folder on this computer/],
      [{ places: { main: 'relative/folder' } }, /./],
      [{ places: { other: dir } }, /The file has no place named “other”/],
      [{ name: state().projects[0]!.name }, /There is already a project named/],
    ] as const) {
      const taken = await takeIn(good, more);
      expect(taken.status, all(more)).toBeGreaterThanOrEqual(400);
      expect(taken.body.error.message).toMatch(sentence);
      expect(holds()).toBe(before);
    }
    // The owner's folder and the file's subfolder: below the folder the owner named, and that is where it will start.
    expect((await takeIn(good, { places: { main: dir } })).status).toBe(201);
    expect(state().sessions.at(-1)?.cwd).toBe(path.join(dir, 'docs'));
  });

  it('when the last part of making it fails: the step leaves nothing, and nobody hears of any of it', async () => {
    // As many rules as there may be are here already: a file that brings one more fails where its rules are made,
    // after its project, canvases, terminals and elements were.
    for (let n = 0; n < RULES_MAX; n += 1) hub.emit({ type: 'rule.changed', rule: { id: newId(), projectId: state().projects[0]!.id, on: true, event: 'task.done', action: { kind: 'notify' }, createdAt: new Date().toISOString() } });
    await hub.flush();
    const before = holds();
    const saved = await readFile(path.join(dir, 'state.json'), 'utf8');
    events = [];
    const text = fileWith({ elements: [{ ref: 'e1', element: { id: 'x', name: 'Brought along', instructions: 'x' } }], rules: [{ event: 'task.done', action: { kind: 'notify' } }] });
    const taken = await takeIn(text);
    expect([taken.status, taken.body.error.message]).toEqual([409, `With this file there would be more than ${RULES_MAX} rules. Nothing was made.`]);
    expect(holds()).toBe(before);
    expect(events).toEqual([]);
    expect(state().shelf.map((e) => e.element.name)).not.toContain('Brought along');
    await hub.flush();
    expect(await readFile(path.join(dir, 'state.json'), 'utf8')).toBe(saved);
    // The same step, when nothing fails, is heard whole: its changes in order, numbered one after the other.
    hub.emit({ type: 'rule.removed', ruleId: state().queue.rules[0]!.id });
    const heard: number[] = [];
    const stopListening = hub.subscribe((_event, revision) => heard.push(revision));
    expect((await takeIn(text)).status).toBe(201);
    stopListening();
    expect(heard.length).toBeGreaterThan(4);
    expect(heard).toEqual(heard.map((_, index) => (heard[0] as number) + index));
  });
});

describe('templates', () => {
  it('two come with the app; a project is saved as one without its notes unless they are kept; a name that clashes is asked again, not overwritten', async () => {
    const list = await asOwner('GET', '/v1/project-templates');
    expect(list.body.templates.map((t: { id: string; name: string; from: string }) => [t.id, t.name, t.from])).toEqual([['app:feature-work', 'Feature work', 'app'], ['app:morning-list', 'Morning list', 'app']]);
    // The ones that come with the app read as project files, say what they are for, and can be made as they are.
    for (const [id, counts] of [['app:feature-work', { canvases: 1, terminals: 3, agents: 2, workflows: 1, elements: 1, rules: 1, schedules: 0 }], ['app:morning-list', { canvases: 1, terminals: 1, agents: 1, workflows: 0, elements: 1, rules: 1, schedules: 1 }]] as const) {
      const { text } = (await asOwner('GET', `/v1/project-templates/${id}`)).body as { text: string };
      const read = await reading(text);
      expect(read).toMatchObject({ template: true, nameTaken: false, counts });
      expect(read.description.length).toBeGreaterThan(40);
      expect(text).not.toMatch(/\/Users\/|\/home\/|[0-9a-f]{8}-[0-9a-f]{4}-7/);
      // Its places left unset: made all the same, and its terminals say they have none.
      const made = await takeIn(text);
      expect(made.status, all(made.body)).toBe(201);
      expect(state().sessions.filter((s) => s.projectId === made.body.project.id).every((s) => s.cwd === null && s.state === 'exited' && s.meantFor?.placeUnset === true)).toBe(true);
      // The same name again: asked again, and what is there is not touched.
      const before = holds();
      expect((await reading(text)).nameTaken).toBe(true);
      const clash = await takeIn(text);
      expect([clash.status, clash.body.error.message]).toEqual([409, `There is already a project named “${read.name}”. Choose another name; nothing was made.`]);
      expect(holds()).toBe(before);
      expect((await takeIn(text, { name: `${read.name} two` })).status).toBe(201);
    }
    expect(created).toEqual([]);
    expect(state().schedules.items.every((x) => !x.on)).toBe(true);
    expect((await asOwner('GET', '/v1/project-templates/app:no-such-one')).status).toBe(404);
    expect((await asOwner('GET', '/v1/project-templates/..%2F..%2Fstate')).status).toBeGreaterThanOrEqual(400);

    // Saved as a template: in the data folder, a template, without the pinned notes.
    const { projectId } = await fullProject();
    const saved = await asOwner('POST', `/v1/projects/${projectId}/template`, { description: 'How a garden site is set up.' });
    expect(saved.status, all(saved.body)).toBe(201);
    expect(saved.body).toMatchObject({ id: 'yours:garden-site', name: 'Garden site', from: 'yours', description: 'How a garden site is set up.', canvases: 2, terminals: 3 });
    expect(await readdir(path.join(dir, 'templates'))).toEqual(['garden-site.json']);
    const own = (await asOwner('GET', '/v1/project-templates/yours:garden-site')).body.text as string;
    expect(JSON.parse(own)).toMatchObject({ template: true, description: 'How a garden site is set up.' });
    expect(own).not.toContain('Keep the tests green');
    expect(own).not.toContain(dir);
    // With the notes kept, they are in it.
    expect((await asOwner('POST', `/v1/projects/${projectId}/template`, { notes: true })).status).toBe(201);
    expect((await asOwner('GET', '/v1/project-templates/yours:garden-site')).body.text).toContain('Keep the tests green');
    expect((await asOwner('GET', '/v1/project-templates')).body.templates.map((t: { id: string }) => t.id)).toEqual(['app:feature-work', 'app:morning-list', 'yours:garden-site']);
  });

  it('fields a file holds that this version does not know are written out again', async () => {
    const text = fileWith({ somethingNewer: { kept: true }, anotherField: [1, 2] });
    const made = await takeIn(text);
    expect(made.status, all(made.body)).toBe(201);
    const out = JSON.parse((await exportOf(made.body.project.id)).text);
    expect(out.somethingNewer).toEqual({ kept: true });
    expect(out.anotherField).toEqual([1, 2]);
    expect(out).toMatchObject({ aubergine: 'project', format: 1, name: 'From a file' });
  });
});

describe('the commands', () => {
  let answers: string[] = [];
  const files = new Map<string, string>();
  const typed_ = async (words: string[], inside?: Session): Promise<{ code: number; out: string }> => {
    const printed: string[] = [];
    const owner = createClient({ baseUrl: origin, headers: { origin, cookie: `${cookieName(port)}=${ownerToken}` } });
    const env = inside ? { [SESSION_ENV.url]: origin, [SESSION_ENV.sessionId]: inside.id, [SESSION_ENV.token]: sessionToken(ownerToken, inside.id) } : {};
    const code = await runProjectCommand(parseProjectCommand(words), {
      owner: (work) => work(owner),
      env,
      print: (text) => printed.push(text),
      remember: async () => {},
      remembered: async () => null,
      expandFolder: (folder) => folder,
      ask: async (question) => (printed.push(question), answers.shift() ?? 'n'),
      readFile: async (file) => files.get(file) ?? '',
      writeNew: async (file, text) => {
        if (files.has(file)) throw new Error('That file is there already');
        files.set(file, text);
      },
    });
    return { code, out: printed.join('\n') };
  };

  it('export writes the file; import prints all it holds, asks, and makes nothing on a no; templates are listed and a project is made from one', async () => {
    const { projectId } = await fullProject();
    void projectId;
    const out = await typed_(['export', 'Garden site', 'garden.project.json']);
    expect(out.out).toContain('Written to garden.project.json. It is a copy of the project as it is now');
    const text = files.get('garden.project.json') as string;
    expect(JSON.parse(text)).toMatchObject({ aubergine: 'project', name: 'Garden site' });
    // Without a file name it is printed; a file that is there is not replaced.
    expect((await typed_(['export', 'Garden site'])).out).toContain('"aubergine": "project"');
    await expect(typed_(['export', 'Garden site', 'garden.project.json'])).rejects.toThrow('That file is there already');

    await anotherServer();
    files.set('garden.project.json', text);
    const here = path.join(dir, 'their folder');
    await mkdir(here, { recursive: true });
    // Read in: everything it holds is printed, then it asks. A no makes nothing.
    answers = ['n'];
    const refused = await typed_(['import', 'garden.project.json', '--place', `main=${here}`]);
    expect(refused.code).toBe(1);
    for (const said of ['A project file: “Garden site”', 'It makes 2 canvases and 3 terminals. No shell is started unless you tick', "Were an agent's: builder", '“Morning list” says it needs: mcp: chat', `The place “main” (it was a folder called “made-up work folder”), where 1 terminal starts: ${here}`, 'The place “docs” (it was a folder called “docs”), where 1 terminal starts: not set; they start in your home folder.', '── The workflow “Build and look” ──', 'Build (task).', '── The step “Morning list” ──', 'Make the project “Garden site” from exactly this, starting nothing? [y/N]', 'Nothing was made.']) expect(refused.out, said).toContain(said);
    expect(state().projects).toHaveLength(1);
    // A yes makes it, and starts nothing.
    answers = ['y'];
    const made = await typed_(['import', 'garden.project.json', '--place', `main=${here}`, '--name', 'Their garden']);
    expect(made.code).toBe(0);
    expect(made.out).toContain('Made “Their garden”: 2 canvases, 3 terminals, none started.');
    expect(created).toEqual([]);
    // A name that is taken is asked for, not overwritten; a place the file does not have is said.
    files.set('same.json', fileWith({ name: 'Their garden' }));
    await expect(typed_(['import', 'same.json'])).rejects.toThrow(/There is already a project named "Their garden"\. Give this one another name: --name/);
    await expect(typed_(['import', 'same.json', '--name', 'Other', '--place', 'nowhere=/tmp'])).rejects.toThrow(/The file has no place named "nowhere"/);
    // A file that is not one: the server's sentence.
    files.set('bad.json', '{ not json');
    expect((await typed_(['import', 'bad.json'])).out).toContain('This is not a project file: it is not JSON.');
    // Templates.
    const list = await typed_(['templates']);
    expect(list.out).toContain('Feature work  (comes with Aubergine; 1 canvas, 3 terminals)');
    expect(list.out).toContain('Morning list  (comes with Aubergine; 1 canvas, 1 terminal)');
    answers = ['yes'];
    const fromTemplate = await typed_(['new', 'My mornings', '--template', 'Morning list']);
    expect(fromTemplate.out).toContain('A template: “Morning list”');
    expect(fromTemplate.out).toContain('Made “My mornings”: 1 canvas, 1 terminal, none started. Its schedules and rules are switched off.');
    await expect(typed_(['new', 'X', '--template', 'No such template'])).rejects.toThrow(/No template matches/);
    // Inside a canvas terminal none of it does anything.
    const worker = agent('worker');
    for (const words of [['export', 'Their garden'], ['import', 'garden.project.json'], ['templates'], ['new', 'Y', '--template', 'Morning list']]) {
      const inside = await typed_(words, worker);
      expect(inside.code, words.join(' ')).toBe(1);
      expect(inside.out).toContain('This command does nothing inside a canvas terminal.');
    }
    expect(state().projects.map((p) => p.name).sort()).toEqual([state().projects[0]!.name, 'My mornings', 'Their garden'].sort());
  });

  it('say the right form', () => {
    expect(() => parseProjectCommand(['export'])).toThrow(/project export needs a project, and may name a file/);
    expect(() => parseProjectCommand(['import'])).toThrow(/project import needs one file/);
    expect(() => parseProjectCommand(['import', 'a.json', '--place', 'main'])).toThrow(/--place takes a name and a folder/);
    expect(() => parseProjectCommand(['new', 'X', '--place', 'main=/tmp'])).toThrow(/--place and --start go with --template/);
    expect(parseProjectCommand(['import', 'a.json', '--place', 'main=/a b', '--place', 'docs=/c', '--start'])).toEqual({ action: 'import', file: 'a.json', name: null, places: { main: '/a b', docs: '/c' }, start: true });
    expect(parseProjectCommand(['export', 'Garden', '--template'])).toEqual({ action: 'export', query: 'Garden', file: null, template: true });
  });
});
