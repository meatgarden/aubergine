import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, NO_ATTENTION, NO_STATUS, boardOf, dueSchedules, forYou, newId, nextToStart, queueSettingsOf, stateOf, visibleIn, type AppState, type ChangeEvent, type ForYou, type ProjectRow, type QueueState, type Scope, type Session, type Task } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { createClient } from '@aubergine/client';
import { PROJECT_HEADER, SESSION_ENV } from '@aubergine/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USAGE } from './cli/commands';
import { INSIDE_ITS_OWN, PROJECT_NEW_EXAMPLE, parseProjectCommand, runProjectCommand, takeProject } from './cli/project';
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
 * Several projects in one server, through the routes against a real server
 * and a real state file: what belongs to one, what is shared, what a token
 * limited to one sees of another, moving a canvas, archiving, and the two
 * questions (is this project kept here, does this terminal run here) that
 * everything asks before it starts, reads or writes. Shells are a stand-in;
 * the clock of schedules is one the test moves.
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
  has: async () => true,
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
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir), taskArchive: new FileTaskArchive(dir), activity, viewers, scheduleClock: clock, scheduleZone: ZONE });
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
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-projects-'));
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
    recap: null, takesMessages: false, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null, ...more };
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

const state = (): AppState => hub.state;
const EVERY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const record = () => activity.entries.filter((entry) => entry.caller === 'schedule').map((entry) => entry.action);

/** A second project, with the one canvas it starts with. */
async function project(name: string, more: object = {}): Promise<ProjectRow & { canvasId: string }> {
  const made = await asOwner('POST', '/v1/projects', { name, ...more });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const canvasId = state().canvases.find((c) => c.projectId === made.body.id)!.id;
  return { ...made.body, canvasId };
}
/** A terminal with a free agent in front, on a canvas: it is of that canvas's project. */
function agentOn(canvasId: string, name: string, more: Partial<Session> = {}): Session {
  const projectId = state().canvases.find((c) => c.id === canvasId)!.projectId;
  const session: Session = { ...agent(`temporary ${name}`), ...more };
  // Made on the first canvas by the helper above; put where it belongs.
  hub.emit({ type: 'session.closed', sessionId: session.id });
  const moved: Session = { ...session, id: newId(), name, projectId };
  hub.emit({ type: 'session.created', session: moved, canvasId, node: { id: newId(), sessionId: moved.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return moved;
}
const first = (): { id: string; canvasId: string } => ({ id: state().projects[0]!.id, canvasId: state().canvases.find((c) => c.projectId === state().projects[0]!.id)!.id });
async function element(name: string, projectId?: string): Promise<string> {
  const made = await asOwner('POST', '/v1/elements', { name, instructions: `Do this: {{task}}`, ...(projectId ? { projectId } : {}) });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
}
const all = (value: unknown): string => JSON.stringify(value);
/** What the agent in a terminal does with a plain element: it reports it done. */
const done = async (session: Session): Promise<void> => {
  expect((await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done', note: 'Did it.' })).status).toBe(200);
};
void finish;
void forYouNow;

describe('two projects', () => {
  it('what is in one is in no listing and no pure function asked about the other, and how one starts its tasks does not touch the other', async () => {
    const a = first();
    const b = await project('Second');
    const inA = agentOn(a.canvasId, 'worker in A');
    agentOn(b.canvasId, 'worker in B');
    // In A: a task that runs, a task that waits, a proposal, a rule, a schedule, something written.
    const running = await add('A runs this');
    expect((await startNext()).body.says).toBe('Started “A runs this”.');
    const waiting = await add('A waits with this');
    const proposed = await asSession(inA, 'POST', `/v1/sessions/${inA.id}/tasks`, { title: 'A proposes this' });
    expect(proposed.body).toMatchObject({ state: 'proposed', projectId: a.id });
    await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'notify' } });
    await asOwner('POST', '/v1/schedules', { name: 'A schedule', time: '08:30', days: EVERY, what: { kind: 'element', elementId: await element('Shared step') }, where: { kind: 'session', sessionId: inA.id } });
    await asOwner('POST', '/v1/asks', { text: 'A wrote this' });
    await asOwner('PUT', '/v1/queue', { limit: 1, hold: true, automatic: true });
    const runId = taskNow(running.id).runId as string;

    // Every listing asked about B is empty of all of it.
    const forB = `projectId=${b.id}`;
    for (const url of [`/v1/tasks?${forB}`, `/v1/rules?${forB}`, `/v1/schedules?${forB}`, `/v1/runs?${forB}`, `/v1/for-you?${forB}`, `/v1/board?${forB}`, `/v1/sessions?${forB}`, `/v1/canvases?${forB}`, `/v1/environments?${forB}`]) {
      const answer = await asOwner('GET', url);
      expect(answer.status, url).toBe(200);
      for (const of of [running.id, waiting.id, proposed.body.id, runId, inA.id, a.canvasId, 'A runs this', 'A waits with this', 'A proposes this', 'A schedule', 'A wrote this', 'worker in A']) expect(all(answer.body), `${url} holds ${of}`).not.toContain(of);
    }
    expect((await asOwner('GET', `/v1/sessions?${forB}`)).body.items.map((s: Session) => s.name)).toEqual(['worker in B']);
    // Asked about A, and about every project, they are there.
    expect((await asOwner('GET', `/v1/tasks?projectId=${a.id}`)).body.items).toHaveLength(3);
    expect((await asOwner('GET', '/v1/tasks?projectId=all')).body.items).toHaveLength(3);
    expect((await asOwner('GET', '/v1/tasks')).body.items).toHaveLength(3);

    // The pure functions, asked about B.
    const s = state();
    const viewOfB = stateOf(s, b.id);
    expect(viewOfB.queue.tasks).toEqual([]);
    expect(viewOfB.queue.rules).toEqual([]);
    expect(viewOfB.schedules.items).toEqual([]);
    expect(viewOfB.runs).toEqual([]);
    expect(forYou(s, Date.now(), [], b.id).items).toEqual([]);
    expect(forYou(s, Date.now(), [], a.id).items.length).toBeGreaterThan(0);
    expect(forYou(s, Date.now(), []).items.every((item) => item.projectId === a.id)).toBe(true);
    expect(boardOf({ runs: s.runs, workflows: s.workflows, sessions: s.sessions, canvases: s.canvases, ended: [], now: Date.now(), quietAfterSeconds: 300, filters: { projectId: b.id } }).counts.total).toBe(0);
    expect(boardOf({ runs: s.runs, workflows: s.workflows, sessions: s.sessions, canvases: s.canvases, ended: [], now: Date.now(), quietAfterSeconds: 300, filters: { projectId: a.id } }).counts.total).toBe(1);
    expect(dueSchedules(viewOfB.schedules.items, null, Date.parse('2026-06-16T12:31:00.000Z'), ZONE)).toEqual([]);
    expect(nextToStart(viewOfB.queue.tasks, [], s.runs, 3, false)).toEqual([]);

    // A's limit, hold and automatic are A's: B has what every project starts with, and its tasks start by its own.
    expect(queueSettingsOf(queueNow(), a.id)).toEqual({ limit: 1, hold: true, automatic: true });
    expect((await asOwner('GET', `/v1/queue?${forB}`)).body).toMatchObject({ projectId: b.id, limit: 3, hold: false, automatic: false, summary: '0 working, 0 next' });
    const inBTask = await asOwner('POST', '/v1/tasks', { title: 'B does this', projectId: b.id });
    expect(inBTask.body).toMatchObject({ projectId: b.id, state: 'queued' });
    // A is held and full; B starts.
    expect((await asOwner('POST', '/v1/tasks/start', { projectId: b.id })).body.says).toBe('Started “B does this”.');
    expect((await asOwner('POST', '/v1/tasks/start', {})).status).toBe(409);
    expect(taskNow(waiting.id).state).toBe('queued');
    // B's task went to B's terminal, never to A's.
    expect(state().sessions.find((x) => x.id === taskNow(inBTask.body.id).sessionId)?.name).toBe('worker in B');
    // A session reads its own project's queue and nothing of the other's.
    const own = await asSession(inA, 'GET', `/v1/sessions/${inA.id}/queue`);
    expect(own.body.tasks.map((t: { title: string }) => t.title).sort()).toEqual(['A proposes this', 'A runs this', 'A waits with this']);
    expect(all(own.body)).not.toContain('B does this');
  });

  it('a schedule and a rule of one never start or notify anything in the other; an archived project fires nothing and says nothing', async () => {
    const a = first();
    const b = await project('Second');
    const inA = agentOn(a.canvasId, 'worker in A');
    const inB = agentOn(b.canvasId, 'worker in B');
    await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'notify' } });
    const scheduled = await asOwner('POST', '/v1/schedules', { name: 'Morning in A', time: '08:30', days: EVERY, what: { kind: 'element', elementId: await element('Morning list') }, where: { kind: 'session', sessionId: inA.id } });
    expect(scheduled.body).toMatchObject({ projectId: a.id });
    // A schedule of A cannot name a terminal of B, nor a rule of A an element run on B's terminal.
    expect((await asOwner('POST', '/v1/schedules', { name: 'Across', time: '08:30', days: EVERY, what: scheduled.body.what, where: { kind: 'session', sessionId: inB.id } })).status).toBe(400);
    expect((await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'run-element', elementId: scheduled.body.what.elementId, on: { kind: 'session', sessionId: inB.id } } })).status).toBe(400);
    // A task done in B: A's rule says nothing.
    const inBTask = (await asOwner('POST', '/v1/tasks', { title: 'B does this', projectId: b.id })).body as Task;
    await asOwner('POST', '/v1/tasks/start', { projectId: b.id });
    expect((await asSession(inB, 'POST', `/v1/sessions/${inB.id}/run/report`, { type: 'done', note: 'Did it.' })).status).toBe(200);
    await until(() => taskNow(inBTask.id).state === 'done');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(notified).toEqual([]);
    // A's schedule fires into A, on A's terminal; B has no task of it.
    await moveTo('2026-06-15T12:31:00.000Z');
    await until(() => queueNow().tasks.some((t) => t.source.kind === 'schedule' && t.state === 'working'));
    const fired = queueNow().tasks.find((t) => t.source.kind === 'schedule') as Task;
    expect(fired).toMatchObject({ projectId: a.id, sessionId: inA.id });
    expect(queueNow().tasks.filter((t) => t.projectId === b.id).map((t) => t.title)).toEqual(['B does this']);
    await done(inA);
    await until(() => taskNow(fired.id).state === 'done');
    await until(() => notified.length === 1);
    expect(notified[0]).toContain('Morning in A');

    // B gets a schedule of its own and is archived: its time comes and goes for days, with no task, no record and no word.
    const inBSchedule = await asOwner('POST', '/v1/schedules', { projectId: b.id, name: 'Morning in B', time: '08:30', days: EVERY, what: scheduled.body.what, where: { kind: 'session', sessionId: inB.id } });
    expect(inBSchedule.status, all(inBSchedule.body)).toBe(201);
    expect((await asOwner('POST', `/v1/projects/${b.id}/archive`, { sessions: 'park' })).body.state).toBe('archived');
    const before = record().length;
    for (const day of ['16', '17', '18']) await moveTo(`2026-06-${day}T12:31:00.000Z`);
    expect(queueNow().tasks.filter((t) => t.projectId === b.id).map((t) => t.title)).toEqual(['B does this']);
    expect(state().schedules.items.find((x) => x.id === inBSchedule.body.id)).toMatchObject({ last: null, problem: null });
    expect(record().length - before).toBe(3); // A's three mornings, and nothing of B's
    expect((await asOwner('GET', '/v1/for-you?projectId=all')).body.items.filter((item: { kind: string }) => item.kind === 'schedule')).toEqual([]);
    // Nothing is started in it by hand either.
    expect((await asOwner('POST', '/v1/tasks/start', { projectId: b.id })).status).toBe(409);
    expect((await asOwner('POST', `/v1/schedules/${inBSchedule.body.id}/run`)).status).toBe(409);
    // Reopened: the mornings it slept through are not run late; the next one is.
    expect((await asOwner('POST', `/v1/projects/${b.id}/reopen`)).body.state).toBe('open');
    await moveTo('2026-06-18T20:00:00.000Z');
    expect(queueNow().tasks.filter((t) => t.projectId === b.id)).toHaveLength(1);
  });
});

describe('what is shared, and what is a project\'s own', () => {
  it('visibleIn: shared, its own, another\'s', () => {
    expect(visibleIn({ projectId: null }, 'a')).toBe(true);
    expect(visibleIn({}, 'a')).toBe(true);
    expect(visibleIn({ projectId: 'a' }, 'a')).toBe(true);
    expect(visibleIn({ projectId: 'b' }, 'a')).toBe(false);
    // Asked about every project, everything is seen.
    expect(visibleIn({ projectId: 'b' }, null)).toBe(true);
  });

  it('a new run does not start from a workflow of another project; a run that is going survives its workflow being moved', async () => {
    const a = first();
    const b = await project('Second');
    const inA = agentOn(a.canvasId, 'worker in A');
    const inB = agentOn(b.canvasId, 'worker in B');
    const flow = await asOwner('POST', '/v1/workflows', { name: 'Two steps', elements: [{ id: 'one', name: 'One', instructions: 'First.' }, { id: 'two', name: 'Two', instructions: 'Second.' }] });
    expect(flow.body.projectId).toBeNull();
    // Shared: it runs in both.
    const runInB = await asOwner('POST', '/v1/runs', { workflowId: flow.body.id, sessionId: inB.id, inputs: { task: 'x' } });
    expect(runInB.status, all(runInB.body)).toBe(201);
    expect(runInB.body.run.projectId).toBe(b.id);
    // Made A's own on the sharing page.
    const moved = await asOwner('POST', '/v1/sharing/move', { kind: 'workflow', id: flow.body.id, projectId: a.id });
    expect(moved.status, all(moved.body)).toBe(200);
    expect(moved.body.kinds.find((k: { kind: string }) => k.kind === 'workflow').things).toEqual([{ id: flow.body.id, name: 'Two steps', projectId: a.id }]);
    // It is in A's list and not in B's.
    expect((await asOwner('GET', `/v1/workflows?projectId=${a.id}`)).body.items.map((w: { name: string }) => w.name)).toEqual(['Two steps']);
    expect((await asOwner('GET', `/v1/workflows?projectId=${b.id}`)).body.items).toEqual([]);
    // The run in B that was going keeps going, to its end.
    expect((await asSession(inB, 'POST', `/v1/sessions/${inB.id}/run/report`, { type: 'done', note: 'One.' })).status).toBe(200);
    expect((await asSession(inB, 'POST', `/v1/sessions/${inB.id}/run/report`, { type: 'done', note: 'Two.' })).body.run.status).toBe('finished');
    // A new one does not start in B, by a run, by a task, or by a run on several; it does in A.
    expect((await asOwner('POST', '/v1/runs', { workflowId: flow.body.id, sessionId: inB.id, inputs: { task: 'x' } })).status).toBe(404);
    expect((await asOwner('POST', '/v1/tasks', { title: 'Through a task', projectId: b.id, workflowId: flow.body.id })).status).toBe(404);
    expect((await asOwner('POST', '/v1/runs', { workflowId: flow.body.id, sessionId: inA.id, inputs: { task: 'x' } })).status).toBe(201);
    // Shared again: it starts in B again.
    await asOwner('POST', '/v1/sharing/move', { kind: 'workflow', id: flow.body.id, projectId: null });
    expect((await asOwner('POST', '/v1/runs', { workflowId: flow.body.id, sessionId: inB.id, inputs: { task: 'x' } })).status).toBe(201);
  });

  it('a schedule whose step stops being visible to its project does not fire, and says so once', async () => {
    const a = first();
    const b = await project('Second');
    const inB = agentOn(b.canvasId, 'worker in B');
    const elementId = await element('Morning list');
    const made = await asOwner('POST', '/v1/schedules', { projectId: b.id, name: 'Morning in B', time: '08:30', days: EVERY, what: { kind: 'element', elementId }, where: { kind: 'session', sessionId: inB.id } });
    expect(made.status, all(made.body)).toBe(201);
    await asOwner('POST', '/v1/rules', { projectId: b.id, event: 'schedule.failed', action: { kind: 'notify' } });
    expect((await asOwner('POST', '/v1/sharing/move', { kind: 'element', id: elementId, projectId: a.id })).status).toBe(200);
    for (const day of ['15', '16', '17']) await moveTo(`2026-06-${day}T12:31:00.000Z`);
    expect(queueNow().tasks).toEqual([]);
    const items = (await asOwner('GET', `/v1/for-you?projectId=${b.id}`)).body.items.filter((item: { kind: string }) => item.kind === 'schedule');
    expect(items.map((item: { sentence: string; projectId: string }) => [item.sentence, item.projectId])).toEqual([['The schedule “Morning in B” could not run: The step it runs now belongs to another project.', b.id]]);
    // Not on A's list; and B's rule heard of it once.
    expect((await asOwner('GET', `/v1/for-you?projectId=${a.id}`)).body.items.filter((item: { kind: string }) => item.kind === 'schedule')).toEqual([]);
    await until(() => notified.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(notified).toHaveLength(1);
    // The shelf of B no longer lists it, and it cannot be run there by itself.
    expect((await asOwner('GET', `/v1/elements?projectId=${b.id}`)).body.items).toEqual([]);
    expect((await asOwner('POST', `/v1/elements/${elementId}/run`, { sessionId: inB.id, inputs: { task: 'x' } })).status).toBe(404);
  });

  it('the sharing page: a default per kind for new things, each thing movable, kinds by registration, and settings said to be the server\'s', async () => {
    const a = first();
    const b = await project('Second');
    const page = await asOwner('GET', '/v1/sharing');
    expect(page.body.kinds.map((k: { kind: string; default: string }) => [k.kind, k.default])).toEqual([['workflow', 'shared'], ['element', 'shared'], ['source', 'shared'], ['installed', 'shared'], ['token', 'shared']]);
    expect(page.body.perServer).toContain('Settings are for the whole server');
    // New things of a kind are made the project's own from now on: made in B, they are B's.
    expect((await asOwner('PUT', '/v1/sharing', { kind: 'element', default: 'project' })).body.kinds.find((k: { kind: string }) => k.kind === 'element').default).toBe('project');
    const own = await asOwner('POST', '/v1/elements', { name: 'Only in B', instructions: 'x', projectId: b.id });
    expect(own.body.projectId).toBe(b.id);
    expect((await asOwner('POST', '/v1/elements', { name: 'Only in A', instructions: 'x' })).body.projectId).toBe(a.id);
    // Workflows are still shared when made.
    expect((await asOwner('POST', '/v1/workflows', { name: 'Everywhere', elements: [{ name: 'One', instructions: 'x' }] })).body.projectId).toBeNull();
    expect((await asOwner('PUT', '/v1/sharing', { kind: 'no-such-kind', default: 'project' })).status).toBe(400);
    expect((await asOwner('POST', '/v1/sharing/move', { kind: 'element', id: newId(), projectId: null })).status).toBe(404);
    expect((await asOwner('POST', '/v1/sharing/move', { kind: 'element', id: own.body.id, projectId: newId() })).status).toBe(404);
  });
});

describe('a token limited to one project', () => {
  it('sees nothing of another: no route answers with an ID or a name of its', async () => {
    const a = first();
    const b = await project('Bravo secret project', { defaultFolder: '/bravo-folder' });
    const inA = agentOn(a.canvasId, 'worker in A');
    const inB = agentOn(b.canvasId, 'bravo terminal');
    // In B: one of everything that is a project's own, and one thing of each shared kind made B's own.
    const flowB = (await asOwner('POST', '/v1/workflows', { name: 'bravo workflow', elements: [{ name: 'bravo step', instructions: 'x' }] })).body;
    const elementB = await element('bravo step');
    await asOwner('POST', '/v1/sharing/move', { kind: 'workflow', id: flowB.id, projectId: b.id });
    await asOwner('POST', '/v1/sharing/move', { kind: 'element', id: elementB, projectId: b.id });
    const taskB = (await asOwner('POST', '/v1/tasks', { projectId: b.id, title: 'bravo task', details: 'bravo details' })).body as Task;
    const queuedB = (await asOwner('POST', '/v1/tasks', { projectId: b.id, title: 'bravo waiting task' })).body as Task;
    expect((await asOwner('POST', '/v1/tasks/start', { taskId: taskB.id })).body.started).toMatchObject([{ ok: true }]);
    const runB = taskNow(taskB.id).runId as string;
    const proposedB = (await asSession(inB, 'POST', `/v1/sessions/${inB.id}/tasks`, { title: 'bravo proposal' })).body as Task;
    const askB = (await asOwner('POST', '/v1/asks', { projectId: b.id, text: 'bravo asked' })).body;
    const ruleB = (await asOwner('POST', '/v1/rules', { projectId: b.id, event: 'task.done', action: { kind: 'notify' } })).body.rules[0];
    const scheduleB = (await asOwner('POST', '/v1/schedules', { projectId: b.id, name: 'bravo schedule', time: '08:30', days: EVERY, what: { kind: 'element', elementId: elementB }, where: { kind: 'session', sessionId: inB.id }, on: false })).body;
    hub.emit({ type: 'environment.changed', environment: { id: newId(), projectId: b.id, kind: 'working-copy', title: 'In its own working copy', words: 'Kept apart.', sessionId: inB.id, sessionName: 'bravo terminal', projectFolder: '/bravo-folder', folder: '/bravo-copy', startFolder: '/bravo-copy', branch: 'aubergine/bravo', startCommit: 'b'.repeat(40), createdAt: new Date().toISOString(), changes: null, broken: null } });
    expect((await asOwner('PATCH', `/v1/sessions/${inB.id}`, { note: 'bravo note' })).status).toBe(200);
    // In A: a little, so that the token has something to see.
    const taskA = await add('alpha task');
    const flowShared = (await asOwner('POST', '/v1/workflows', { name: 'shared workflow', elements: [{ name: 'One', instructions: 'x' }] })).body;

    const limited = await makeToken('limited to A', [...GRANTABLE_SCOPES], { reach: { kind: 'all' }, projects: { kind: 'projects', projectIds: [a.id] }, reviewWorkflowChanges: false });
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reach: { kind: 'all' }, reviewWorkflowChanges: false });
    // Everything of B that could show: IDs of its things, and names only it has.
    const ofB = [b.id, b.canvasId, inB.id, taskB.id, queuedB.id, proposedB.id, runB, askB.id, ruleB.id, scheduleB.id, flowB.id, elementB, state().environments[0]!.id, 'bravo', 'Bravo'];
    // The walk is honest only if a token that reaches every project does see them.
    const seenByAll = all((await call(everything, 'GET', '/v1/sessions?projectId=all')).body) + all((await call(everything, 'GET', '/v1/tasks?projectId=all')).body) + all((await call(everything, 'GET', '/v1/projects')).body);
    for (const of of [b.id, inB.id, taskB.id, 'bravo terminal', 'bravo task', 'Bravo secret project']) expect(seenByAll).toContain(of);

    // Every route, read and written, with its own things named, with B's things named, and with B named as the project.
    const idsOfB: Record<string, string> = { sessionId: inB.id, canvasId: b.canvasId, taskId: queuedB.id, askId: askB.id, ruleId: ruleB.id, scheduleId: scheduleB.id, runId: runB, workflowId: flowB.id, elementId: elementB, projectId: b.id, environmentId: state().environments[0]!.id };
    const idsOfA: Record<string, string> = { sessionId: inA.id, canvasId: a.canvasId, taskId: taskA.id, workflowId: flowShared.id, projectId: a.id };
    const bodies: (object | undefined)[] = [undefined, {}, { projectId: b.id }, { sessionId: inB.id, workflowId: flowB.id, inputs: { task: 'x' } }, { title: 'x', taker: { kind: 'session', sessionId: inB.id } }, { title: 'x', workflowId: flowB.id }, { canvasId: b.canvasId, name: 'x' }, { text: 'x', projectId: b.id }];
    let tried = 0;
    let within = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events' || route.method === 'DELETE') continue;
      for (const ids of [idsOfA, idsOfB]) {
        const url = route.url.replace(/:([A-Za-z]+)/g, (_all, name: string) => ids[name] ?? newId());
        for (const query of ['', `?projectId=${b.id}`, '?projectId=all', `?projectId=${a.id}`, `?canvasId=${b.canvasId}`, `?sessionId=${inB.id}`]) {
          for (const body of bodies) {
            if (route.method === 'GET' && body !== undefined) continue;
            if (route.method !== 'GET' && query !== '') continue;
            const answer = await call(limited, route.method, `${url}${query}`, body);
            expect(answer.status, `${route.method} ${url}${query}`).not.toBe(500);
            const text = all(answer.body);
            for (const of of ofB) expect(text.includes(of), `${route.method} ${route.url}${query} ${all(body)} answered ${answer.status} holding “${of}”: ${text.slice(0, 300)}`).toBe(false);
            tried += 1;
            if (answer.status < 300) within += 1;
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(1500);
    // It was not simply refused everything: what is A's and what is shared it reads.
    expect(within).toBeGreaterThan(100);
    expect((await call(limited, 'GET', '/v1/projects')).body.items.map((p: ProjectRow) => p.id)).toEqual([a.id]);
    expect((await call(limited, 'GET', '/v1/sessions')).body.items.map((s: Session) => s.name)).toContain('worker in A');
    expect((await call(limited, 'GET', '/v1/workflows')).body.items.map((w: { name: string }) => w.name)).toContain('shared workflow');
    // A thing of B named in its address is, to it, not there; and so is B named as the project.
    for (const url of [`/v1/sessions/${inB.id}`, `/v1/canvases/${b.canvasId}`, `/v1/tasks/${queuedB.id}`, `/v1/runs/${runB}`, `/v1/projects/${b.id}`, `/v1/workflows/${flowB.id}`, `/v1/tasks?projectId=${b.id}`]) expect((await call(limited, 'GET', url)).status, url).toBe(404);
    // Nothing of B was changed by any of it.
    expect(state().queue.tasks.filter((t) => t.projectId === b.id).map((t) => [t.title, t.state]).sort()).toEqual([['bravo proposal', 'proposed'], ['bravo task', 'working'], ['bravo waiting task', 'queued']]);
    expect(state().sessions.find((s) => s.id === inB.id)).toMatchObject({ name: 'bravo terminal', note: 'bravo note' });
    expect(state().runs.filter((r) => r.projectId === b.id)).toHaveLength(1);
  });

  it('hears nothing of another project on the stream of changes', async () => {
    const a = first();
    const b = await project('Bravo secret project');
    const inB = agentOn(b.canvasId, 'bravo terminal');
    const limited = await makeToken('limited to A', ['read'], { projects: { kind: 'projects', projectIds: [a.id] } });
    const response = await fetch(`${origin}/v1/events`, { headers: { authorization: `Bearer ${limited}` } });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let heard = '';
    const listen = (async () => {
      for (;;) {
        const { done: over, value } = await reader.read();
        if (over) return;
        heard += new TextDecoder().decode(value);
      }
    })();
    await until(() => heard.includes('connected'));
    // In B: a task added, started, its terminal renamed, the task withdrawn (a change that names only an ID), a canvas made.
    const taskB = (await asOwner('POST', '/v1/tasks', { projectId: b.id, title: 'bravo task' })).body as Task;
    const gone = (await asOwner('POST', '/v1/tasks', { projectId: b.id, title: 'bravo task that goes' })).body as Task;
    await asOwner('POST', `/v1/tasks/${gone.id}/withdraw`);
    await asOwner('POST', '/v1/tasks/start', { taskId: taskB.id });
    await asOwner('PATCH', `/v1/sessions/${inB.id}`, { name: 'bravo renamed' });
    await asOwner('POST', '/v1/canvases', { projectId: b.id, name: 'bravo canvas' });
    await asOwner('POST', '/v1/projects', { name: 'Bravo the third' });
    // In A: something it does hear, last, so that the test knows the others had their turn.
    const taskA = await add('alpha task');
    await until(() => heard.includes(taskA.id));
    await reader.cancel();
    await listen.catch(() => {});
    for (const of of [b.id, b.canvasId, inB.id, taskB.id, gone.id, 'bravo', 'Bravo']) expect(heard.includes(of), `the stream held “${of}”: ${heard.split('\n').filter((line) => line.includes(of)).map((line) => line.slice(0, 260)).join(' | ')}`).toBe(false);
    expect(heard).toContain('alpha task');
  });

  it('no token and no session can make, change, archive, reopen or remove a project, move a canvas, or change what is shared', async () => {
    const a = first();
    const b = await project('Second');
    const worker = agentOn(a.canvasId, 'worker');
    const flow = (await asOwner('POST', '/v1/workflows', { name: 'A workflow', elements: [{ name: 'One', instructions: 'x' }] })).body;
    await asOwner('POST', '/v1/canvases', { name: 'Spare' });
    const spare = state().canvases.find((c) => c.name === 'Spare')!.id;
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reach: { kind: 'all' }, reviewWorkflowChanges: false });
    const before = all([state().projects, state().sharing, state().canvases.map((c) => [c.id, c.projectId]), state().workflows.map((w) => w.projectId)]);
    for (const secret of [everything, sessionToken(ownerToken, worker.id)]) {
      for (const [method, url, body] of [
        ['POST', '/v1/projects', { name: 'Theirs' }],
        ['PATCH', `/v1/projects/${b.id}`, { name: 'Renamed' }],
        ['POST', `/v1/projects/${b.id}/archive`, { sessions: 'end' }],
        ['POST', `/v1/projects/${b.id}/reopen`, undefined],
        ['DELETE', `/v1/projects/${b.id}`, undefined],
        ['POST', `/v1/canvases/${spare}/project`, { projectId: b.id }],
        ['GET', '/v1/sharing', undefined],
        ['PUT', '/v1/sharing', { kind: 'workflow', default: 'project' }],
        ['POST', '/v1/sharing/move', { kind: 'workflow', id: flow.id, projectId: b.id }],
      ] as const) expect((await call(secret, method, url, body)).status, `${method} ${url}`).toBe(403);
    }
    expect(all([state().projects, state().sharing, state().canvases.map((c) => [c.id, c.projectId]), state().workflows.map((w) => w.projectId)])).toBe(before);
    // A caller cannot say where a project is kept or where a terminal runs.
    const made = await asOwner('POST', '/v1/projects', { name: 'Third', home: { kind: 'elsewhere' } });
    expect(made.body.home).toEqual({ kind: 'local' });
    expect((await asOwner('PATCH', `/v1/projects/${made.body.id}`, { home: { kind: 'elsewhere' }, state: 'archived', color: 'blue' })).body).toMatchObject({ home: { kind: 'local' }, state: 'open', color: 'blue' });
    const session = await asOwner('POST', '/api/v1/sessions', { host: { kind: 'elsewhere' }, projectId: b.id, canvasId: a.canvasId });
    expect(session.body.session).toMatchObject({ host: { kind: 'local' }, projectId: a.id });
    // A session reads the project it is in, and no other.
    expect((await asSession(worker, 'GET', `/v1/sessions/${worker.id}/project`)).body).toMatchObject({ id: a.id });
    expect((await asSession(worker, 'GET', '/v1/projects')).status).toBe(403);
  });
});

describe('moving, archiving and removing', () => {
  it('a canvas moves with its terminals, their runs and working copies and the tasks that wait for them, and nothing else', async () => {
    const a = first();
    const b = await project('Second');
    await asOwner('POST', '/v1/canvases', { name: 'Moves' });
    const moves = state().canvases.find((c) => c.name === 'Moves')!.id;
    const stays = agentOn(a.canvasId, 'stays');
    const goes = agentOn(moves, 'goes');
    const parkedFromIt = agentOn(moves, 'parked from it');
    await asOwner('POST', `/api/v1/sessions/${parkedFromIt.id}/park`);
    const onGoes = await add('For the one that goes', { taker: { kind: 'session', sessionId: goes.id } });
    const onStays = await add('For the one that stays', { taker: { kind: 'session', sessionId: stays.id } });
    const forAny = await add('For any free agent');
    expect((await startNext(onGoes.id)).body.started).toMatchObject([{ ok: true }]);
    const again = await add('Waits for the one that goes', { taker: { kind: 'session', sessionId: goes.id } });
    hub.emit({ type: 'environment.changed', environment: { id: newId(), projectId: a.id, kind: 'working-copy', title: 'In its own working copy', words: 'Kept apart.', sessionId: goes.id, sessionName: 'goes', projectFolder: '/made-up', folder: '/made-up-copy', startFolder: '/made-up-copy', branch: 'aubergine/goes', startCommit: 'a'.repeat(40), createdAt: new Date().toISOString(), changes: null, broken: null } });
    await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'notify' } });
    await asOwner('POST', '/v1/asks', { text: 'Written in A' });

    const moved = await asOwner('POST', `/v1/canvases/${moves}/project`, { projectId: b.id });
    expect(moved.status, all(moved.body)).toBe(200);
    const s = state();
    expect(s.canvases.find((c) => c.id === moves)?.projectId).toBe(b.id);
    expect(Object.fromEntries(s.sessions.map((x) => [x.name, x.projectId]))).toEqual({ stays: a.id, goes: b.id, 'parked from it': b.id });
    expect(s.runs.map((r) => [r.sessionId, r.projectId])).toEqual([[goes.id, b.id]]);
    expect(s.environments.map((e) => e.projectId)).toEqual([b.id]);
    expect(Object.fromEntries(s.queue.tasks.map((t) => [t.title, t.projectId]))).toEqual({ 'For the one that goes': b.id, 'Waits for the one that goes': b.id, 'For the one that stays': a.id, 'For any free agent': a.id });
    // Nothing else moved: the rule, what was written, the other canvas.
    expect(s.queue.rules.map((r) => r.projectId)).toEqual([a.id]);
    expect(s.queue.asks.map((x) => x.projectId)).toEqual([a.id]);
    expect(s.canvases.find((c) => c.id === a.canvasId)?.projectId).toBe(a.id);
    void onStays;
    void forAny;
    void again;
    // The parked terminal comes back onto a canvas of its new project.
    expect((await asOwner('POST', `/api/v1/sessions/${parkedFromIt.id}/restore`, {})).status).toBe(200);
    expect(state().canvases.find((c) => c.layout.nodes.some((n) => n.sessionId === parkedFromIt.id))?.projectId).toBe(b.id);
    // A terminal does not hop to a canvas of another project by itself; the last canvas of a project does not move; nor to an archived project.
    expect((await asOwner('POST', `/v1/sessions/${stays.id}/move`, { canvasId: moves })).status).toBe(404);
    expect((await asOwner('POST', `/v1/canvases/${a.canvasId}/project`, { projectId: b.id })).status).toBe(409);
    expect((await asOwner('POST', `/v1/canvases/${moves}/project`, { projectId: newId() })).status).toBe(404);
  });

  it('archiving asks what becomes of running terminals; reopening restores; removing needs it empty; the last open project stays', async () => {
    const a = first();
    const b = await project('Second');
    const inB = agentOn(b.canvasId, 'worker in B');
    const parked = agentOn(b.canvasId, 'parked in B');
    await asOwner('POST', `/api/v1/sessions/${parked.id}/park`);
    // With a terminal running: refused without a choice, in the words closing a canvas uses.
    const refused = await asOwner('POST', `/v1/projects/${b.id}/archive`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe('This project still has sessions: say whether to park them or end them');
    expect(state().projects.find((p) => p.id === b.id)?.state).toBe('open');
    // Parked: they keep running, off their canvases; the project is out of the open ones and makes nothing.
    expect((await asOwner('POST', `/v1/projects/${b.id}/archive`, { sessions: 'park' })).body).toMatchObject({ state: 'archived', sessions: 2 });
    expect(state().sessions.filter((s) => s.projectId === b.id).map((s) => s.state)).toEqual(['parked', 'parked']);
    expect((await asOwner('POST', '/v1/canvases', { projectId: b.id, name: 'In an archived project' })).status).toBe(409);
    expect((await asOwner('POST', '/api/v1/sessions', { canvasId: b.canvasId })).status).toBe(409);
    expect((await asOwner('GET', '/v1/projects')).body.items.map((p: ProjectRow) => [p.name, p.state])).toEqual([[state().projects.find((p) => p.id === a.id)!.name, 'open'], ['Second', 'archived']]);
    // Not removed while it holds anything; the answer says what.
    const held = await asOwner('DELETE', `/v1/projects/${b.id}`);
    expect(held.status).toBe(409);
    expect(held.body.error.message).toBe('This project is not empty: it still has 2 terminals. Remove or move them first.');
    // Reopened: back among the open ones, its terminals restorable.
    expect((await asOwner('POST', `/v1/projects/${b.id}/reopen`)).body.state).toBe('open');
    expect((await asOwner('POST', `/api/v1/sessions/${inB.id}/restore`, {})).status).toBe(200);
    // An open project is not removed. Archived with its terminals ended, it is empty and goes, with its canvas.
    expect((await asOwner('DELETE', `/v1/projects/${b.id}`)).status).toBe(409);
    expect((await asOwner('POST', `/v1/projects/${b.id}/archive`, { sessions: 'end' })).body).toMatchObject({ state: 'archived', sessions: 0 });
    await until(() => state().sessions.every((s) => s.projectId !== b.id || s.state === 'exited'));
    for (const session of state().sessions.filter((s) => s.projectId === b.id)) await asOwner('DELETE', `/api/v1/sessions/${session.id}`);
    expect((await asOwner('DELETE', `/v1/projects/${b.id}`)).status).toBe(204);
    expect(state().projects.map((p) => p.id)).toEqual([a.id]);
    expect(state().canvases.every((c) => c.projectId === a.id)).toBe(true);
    // The last open project is neither archived nor removed.
    const last = await asOwner('POST', `/v1/projects/${a.id}/archive`, { sessions: 'park' });
    expect(last.status).toBe(409);
    expect(last.body.error.message).toBe('The last open project cannot be archived.');
    expect((await asOwner('DELETE', `/v1/projects/${a.id}`)).status).toBe(409);
    // Fifty projects and no more; and no two of one name.
    expect((await asOwner('POST', '/v1/projects', { name: state().projects[0]!.name })).status).toBe(409);
  });

  it('a new terminal, a task for a new terminal and a schedule start in the project\'s default folder where they name none', async () => {
    const folder = dir;
    const b = await project('With a folder', { defaultFolder: folder });
    expect(b).toMatchObject({ defaultFolder: folder, folders: [folder] });
    const made = await asOwner('POST', '/api/v1/sessions', { canvasId: b.canvasId });
    expect(made.status, all(made.body)).toBe(201);
    expect(created.at(-1)).toMatchObject({ cwd: folder });
    const task = await asOwner('POST', '/v1/tasks', { projectId: b.id, title: 'In a terminal of its own', taker: { kind: 'new', canvasId: b.canvasId }, environment: 'full' });
    expect((await asOwner('POST', '/v1/tasks/start', { taskId: task.body.id })).body.started).toMatchObject([{ ok: true }]);
    expect(created.at(-1)).toMatchObject({ cwd: folder });
    // One that names its own keeps it.
    await asOwner('POST', '/api/v1/sessions', { canvasId: b.canvasId, cwd: os.tmpdir() });
    expect(created.at(-1)).toMatchObject({ cwd: os.tmpdir() });
  });
});

describe('kept here, running here', () => {
  it('everything that would start, read or write asks first, and for a project or a terminal that is elsewhere answers in a sentence and touches nothing', async () => {
    const a = first();
    const b = await project('Elsewhere');
    const local = agentOn(a.canvasId, 'runs here');
    // A project whose record another server owns, and a terminal whose shell runs on another machine. Neither can be
    // made through any route today; they are put into the state here to see that every place that matters asks.
    hub.emit({ type: 'project.changed', project: { ...state().projects.find((p) => p.id === b.id)!, home: { kind: 'elsewhere' } } });
    const remote = agentOn(a.canvasId, 'runs elsewhere', { host: { kind: 'elsewhere' } });
    const elementId = await element('Morning list');
    const flow = (await asOwner('POST', '/v1/workflows', { name: 'One step', elements: [{ name: 'One', instructions: 'x' }] })).body;
    const program = await makeToken('program', [...GRANTABLE_SCOPES], { reach: { kind: 'all' }, reviewWorkflowChanges: false });
    typed = [];
    created = [];
    const NOT_HERE = 'This terminal does not run on this computer: it cannot be read, typed into or started from here.';
    const NOT_KEPT = 'This project is not kept on this server';

    // The project that is kept elsewhere: no terminal is started for it, no task of it is started, its record is not changed, its schedules are not looked at.
    const session = await asOwner('POST', '/api/v1/sessions', { canvasId: b.canvasId });
    expect([session.status, session.body.error.message]).toEqual([409, `${NOT_KEPT}: a terminal cannot be started for it here.`]);
    const task = (await asOwner('POST', '/v1/tasks', { projectId: b.id, title: 'For elsewhere', taker: { kind: 'new', canvasId: b.canvasId } })).body as Task;
    const start = await asOwner('POST', '/v1/tasks/start', { taskId: task.id });
    expect([start.status, start.body.error.message]).toEqual([409, `${NOT_KEPT}: nothing can be started for it here.`]);
    await asOwner('PUT', '/v1/queue', { projectId: b.id, automatic: true });
    const change = await asOwner('PATCH', `/v1/projects/${b.id}`, { name: 'Renamed here' });
    expect([change.status, change.body.error.message]).toEqual([409, `${NOT_KEPT}: it cannot be changed here.`]);
    const scheduled = await asOwner('POST', '/v1/schedules', { projectId: b.id, name: 'Morning elsewhere', time: '08:30', days: EVERY, what: { kind: 'element', elementId }, where: { kind: 'new', canvasId: b.canvasId } });
    expect(scheduled.status, all(scheduled.body)).toBe(201);
    await moveTo('2026-06-16T12:31:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(state().schedules.items[0]).toMatchObject({ last: null });
    expect(taskNow(task.id).state).toBe('queued');
    expect(created).toEqual([]);

    // The terminal that runs elsewhere: not read, not typed into, not searched, nothing started on it, no window opened, its folder not read.
    for (const [method, url, body] of [
      ['GET', `/v1/sessions/${remote.id}/screen`, undefined],
      ['GET', `/v1/sessions/${remote.id}/output`, undefined],
      ['POST', `/v1/sessions/${remote.id}/input`, { text: 'echo hello', enter: true }],
      ['POST', `/v1/sessions/${remote.id}/run`, { command: 'echo hello' }],
      ['POST', '/v1/runs', { workflowId: flow.id, sessionId: remote.id, inputs: { task: 'x' } }],
      ['POST', `/v1/elements/${elementId}/run`, { sessionId: remote.id, inputs: { task: 'x' } }],
      ['POST', `/v1/sessions/${remote.id}/desktop`, undefined],
      ['GET', `/v1/sessions/${remote.id}/repository-workflows`, undefined],
    ] as const) {
      const answer = await asOwner(method, url, body);
      expect([answer.status, answer.body?.error?.message], `${method} ${url}`).toEqual([409, NOT_HERE]);
      expect((await call(program, method, url, body)).status, `${method} ${url} by a token`).not.toBe(500);
    }
    expect((await asOwner('GET', '/v1/terminals/search?q=ready')).body.hits ?? []).toEqual([]);
    // A task is never given to it, though an agent is seen in front of it and is free: the one that runs here takes it.
    const forAny = await add('For any free agent');
    const forIt = await add('For the one elsewhere', { taker: { kind: 'session', sessionId: remote.id } });
    expect((await startNext()).body.says).toBe('Started “For any free agent”.');
    expect(taskNow(forAny.id).sessionId).toBe(local.id);
    expect((await startNext(forIt.id)).body.started).toEqual([]);
    expect(taskNow(forIt.id).state).toBe('queued');
    // Nothing was typed into it and no shell was made for anything of either.
    expect(typed.filter(([id]) => id === remote.id)).toEqual([]);
    expect(typed.map(([id]) => id)).toEqual([local.id]);
    expect(created).toEqual([]);
    // The two questions themselves.
    expect(state().sessions.find((s) => s.id === local.id)?.host).toBeUndefined();
    expect(state().projects.find((p) => p.id === a.id)?.home).toEqual({ kind: 'local' });
  });
});

describe('the commands', () => {
  let chosen: string | null = null;
  /** A command as typed by the owner outside any canvas terminal, or inside one. `meant`: the project the command line means, as it sends it. */
  const typed_ = async (words: string[], inside?: Session): Promise<{ code: number; out: string }> => {
    const printed: string[] = [];
    const owner = createClient({ baseUrl: origin, headers: { origin, cookie: `${cookieName(port)}=${ownerToken}` } });
    const env = inside ? { [SESSION_ENV.url]: origin, [SESSION_ENV.sessionId]: inside.id, [SESSION_ENV.token]: sessionToken(ownerToken, inside.id) } : {};
    const code = await runProjectCommand(parseProjectCommand(words), { owner: (work) => work(owner), env, print: (text) => printed.push(text), remember: async (id) => void (chosen = id), remembered: async () => chosen, expandFolder: (folder) => folder, ask: async () => 'n', readFile: async () => '', writeNew: async () => {} });
    return { code, out: printed.join('\n') };
  };

  it('list, new, use, rename, move-canvas, archive, reopen and remove as the owner; inside a canvas terminal only the list', async () => {
    chosen = null;
    const a = first();
    const worker = agentOn(a.canvasId, 'worker');
    expect((await typed_(['new', 'Garden site', '--folder', dir, '--color', 'green'])).out).toContain(`Made the project “Garden site”, with one empty canvas. New terminals in it start in ${dir}.`);
    const garden = state().projects.find((p) => p.name === 'Garden site')!;
    expect(garden).toMatchObject({ color: 'green', defaultFolder: dir, folders: [dir], state: 'open', home: { kind: 'local' } });
    const list = await typed_(['list']);
    expect(list.out).toContain(`1. ${state().projects[0]!.name}  1 canvas, 1 running, 0 waiting for you`);
    expect(list.out).toContain(`2. Garden site  1 canvas, 0 running, 0 waiting for you  in ${dir}`);
    expect((await typed_(['use', 'Garden site'])).out).toContain('Commands that name no project mean “Garden site” from now on.');
    expect(chosen).toBe(garden.id);
    expect((await typed_(['list'])).out).toContain('2. Garden site  (the one commands mean)');
    expect((await typed_(['rename', '2', '--to', 'Garden'])).out).toBe('It is called “Garden” now.');
    // A canvas moves across by name.
    await asOwner('POST', '/v1/canvases', { name: 'Spare' });
    expect((await typed_(['move-canvas', 'Spare', '--to', 'Garden'])).out).toBe('“Spare” is in “Garden” now, with its terminals, their runs and what they work in.');
    expect(state().canvases.find((c) => c.name === 'Spare')?.projectId).toBe(garden.id);
    // Archived: forgotten as the one commands mean. Reopened, archived again, removed when empty.
    expect((await typed_(['archive', 'Garden'])).out).toContain('“Garden” is archived: it is out of the switcher and starts nothing.');
    expect(chosen).toBeNull();
    await expect(typed_(['use', 'Garden'])).rejects.toThrow(/is archived. Reopen it first/);
    expect((await typed_(['reopen', 'Garden'])).out).toBe('“Garden” is open again.');
    expect((await typed_(['archive', 'Garden', '--end'])).code).toBe(0);
    expect((await typed_(['remove', 'Garden'])).out).toBe('Removed “Garden” for good.');
    expect(state().projects.map((p) => p.name)).not.toContain('Garden');
    void worker;
  });

  it('says the right form, and the option is taken from the commands that take it', () => {
    expect(takeProject(['task', 'list', '--project', 'Garden site'])).toEqual({ project: 'Garden site', rest: ['task', 'list'] });
    expect(takeProject(['new', '--project', 'Garden', 'api'])).toEqual({ project: 'Garden', rest: ['new', 'api'] });
    expect(takeProject(['list'])).toEqual({ project: null, rest: ['list'] });
    // A command that does not take it is left as it was typed, and says so itself.
    expect(takeProject(['attach', 'x', '--project', 'Garden'])).toEqual({ project: null, rest: ['attach', 'x', '--project', 'Garden'] });
    expect(() => takeProject(['task', 'list', '--project'])).toThrow(/--project needs/);
    expect(() => parseProjectCommand(['new'])).toThrow(new RegExp(`project new needs a name. For example:\\n {2}${PROJECT_NEW_EXAMPLE.replace(/[~/"]/g, '.')}`));
    expect(() => parseProjectCommand(['new', 'x', '--color', 'no-such-color'])).toThrow(/--color takes a named color/);
    expect(() => parseProjectCommand(['archive', 'x', '--park', '--end'])).toThrow(/not both/);
    expect(() => parseProjectCommand(['move-canvas', 'Main'])).toThrow(/needs a canvas and where it goes/);
    expect(() => parseProjectCommand(['delete', 'x'])).toThrow(/It knows: list, new, rename, use, archive, reopen, remove, move-canvas, export, import, templates/);
    expect(parseProjectCommand(['archive', 'Garden', 'site', '--end'])).toEqual({ action: 'archive', query: 'Garden site', sessions: 'end' });
    expect(USAGE).toContain(`For example: ${PROJECT_NEW_EXAMPLE}`);
    expect(INSIDE_ITS_OWN).toContain('no option changes it');
  });

  it('a command line that means a project says so in a header: lists and new things are that project\'s', async () => {
    const a = first();
    const b = await project('Second');
    const meaning = (projectId: string, method: string, url: string, body?: unknown) => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, [PROJECT_HEADER]: projectId }, method, url, body);
    const made = await meaning(b.id, 'POST', '/v1/tasks', { title: 'Meant for B' });
    expect(made.body).toMatchObject({ projectId: b.id });
    expect((await meaning(b.id, 'GET', '/v1/tasks')).body.items.map((t: Task) => t.title)).toEqual(['Meant for B']);
    expect((await meaning(a.id, 'GET', '/v1/tasks')).body.items).toEqual([]);
    // A new terminal that names no canvas goes onto a canvas of that project.
    const session = await meaning(b.id, 'POST', '/api/v1/sessions', {});
    expect(session.body.session.projectId).toBe(b.id);
    // What the request itself names wins over the header.
    expect((await meaning(b.id, 'GET', `/v1/tasks?projectId=${a.id}`)).body.items).toEqual([]);
    expect((await meaning(newId(), 'GET', '/v1/tasks')).status).toBe(404);
    // Inside a canvas terminal, project commands that change anything do nothing; the list is its own project.
    const worker = agentOn(a.canvasId, 'worker');
    const inside = await typed_(['new', 'Theirs'], worker);
    expect(inside).toMatchObject({ code: 1 });
    expect(inside.out).toContain('This command does nothing inside a canvas terminal.');
    expect(state().projects.map((p) => p.name)).not.toContain('Theirs');
  });
});
