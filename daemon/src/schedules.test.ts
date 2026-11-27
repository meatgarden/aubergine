import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, KICKOFF_LINE, NO_ATTENTION, NO_STATUS, newId, queueSettingsOf, type ChangeEvent, type ForYou, type QueueState, type Schedule, type ScheduleRow, type Scope, type Session, type Task } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { createClient } from '@aubergine/client';
import { SESSION_ENV } from '@aubergine/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USAGE } from './cli/commands';
import { SCHEDULE_ADD_EXAMPLE, parseScheduleCommand, runScheduleCommand } from './cli/schedule';
import { MemoryActivityLog } from './activity';
import { sessionToken } from './auth';
import { FileRunArchive } from './run-archive';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { WAKE_EVERY_MS, type ScheduleClock } from './schedules';
import { FileTaskArchive } from './task-archive';
import { loadOrCreateToken } from './token';
import { Viewers } from './viewers';

/**
 * Schedules, through the routes against a real server and a real state
 * file. Time is passed in: the clock and the timer are a stand-in that the
 * test moves, and no test waits on the real clock for a schedule. Shells are
 * a stand-in that keeps every line that would have been typed.
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
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-schedules-'));
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

const schedulesNow = (): readonly Schedule[] => hub.state.schedules.items;
const scheduleNow = (id: string): Schedule => schedulesNow().find((s) => s.id === id) as Schedule;
const fromSchedule = (): Task[] => queueNow().tasks.filter((task) => task.source.kind === 'schedule').sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
const record = () => activity.entries.filter((entry) => entry.caller === 'schedule').map((entry) => [entry.action, entry.route, entry.status]);
const EVERY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

async function element(name = 'Morning list', more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/elements', { name, instructions: 'Gather what is open for today: {{task}}', produces: 'checklist', ...more });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
}
/** A schedule for every day at 08:30 that runs the morning list on a terminal. */
async function schedule(on: Session, more: object = {}): Promise<ScheduleRow> {
  const made = await asOwner('POST', '/v1/schedules', { name: 'My morning list', time: '08:30', days: EVERY, what: { kind: 'element', elementId: await element() }, where: { kind: 'session', sessionId: on.id }, task: 'the secret words of the task', ...more });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as ScheduleRow;
}
const working = (task: Task | undefined): boolean => task !== undefined && taskNow(task.id)?.state === 'working';

describe('a schedule', () => {
  it('fires once at its time, not again that day, and again the next day; switched off it does not fire', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    expect(made).toMatchObject({ says: 'Every day at 08:30, run “Morning list” on “worker”.', next: '2026-06-15T12:30:00.000Z', nextSays: 'Next today at 08:30.', lastSays: 'It has not run yet.', on: true });
    await moveTo('2026-06-15T12:29:30.000Z');
    expect(queueNow().tasks).toEqual([]);
    await moveTo('2026-06-15T12:31:00.000Z');
    expect(fromSchedule()).toHaveLength(1);
    const first = fromSchedule()[0] as Task;
    expect(first).toMatchObject({ title: 'My morning list', unattended: true, source: { kind: 'schedule', scheduleId: made.id, name: 'My morning list' }, addedBy: { kind: 'person' }, taker: { kind: 'session', sessionId: worker.id } });
    // It starts without anyone pressing Start next, though automatic starting is off: the owner said when.
    expect(queueSettingsOf(queueNow(), hub.state.projects[0]!.id).automatic).toBe(false);
    await until(() => working(first));
    expect(typed).toEqual([[worker.id, KICKOFF_LINE]]);
    expect(scheduleNow(made.id).last).toMatchObject({ result: 'fired', due: '2026-06-15T12:30:00.000Z', taskId: first.id });
    await finish(worker);
    await until(() => taskNow(first.id).state === 'done');
    // The rest of the day, minute by minute: nothing more.
    await moveTo('2026-06-16T12:29:30.000Z');
    expect(fromSchedule()).toHaveLength(1);
    // The next day: once more.
    await moveTo('2026-06-16T12:40:00.000Z');
    expect(fromSchedule()).toHaveLength(2);
    const second = fromSchedule()[1] as Task;
    await until(() => working(second));
    await finish(worker);
    await until(() => taskNow(second.id).state === 'done');
    expect((await asOwner('GET', '/v1/schedules')).body.items[0]).toMatchObject({ lastSays: 'Ran today at 08:30.', nextSays: 'Next tomorrow at 08:30.' });
    // Switched off: its time comes and goes.
    expect((await asOwner('PATCH', `/v1/schedules/${made.id}`, { on: false })).body).toMatchObject({ on: false, next: null, nextSays: 'Switched off.' });
    await moveTo('2026-06-17T13:00:00.000Z');
    expect(fromSchedule()).toHaveLength(2);
    // Switched on after its time today: not for today; tomorrow again.
    await asOwner('PATCH', `/v1/schedules/${made.id}`, { on: true });
    await moveTo('2026-06-18T12:00:00.000Z');
    expect(fromSchedule()).toHaveLength(2);
    await moveTo('2026-06-18T12:31:00.000Z');
    expect(fromSchedule()).toHaveLength(3);
    // Every firing is written down, with which schedule and which time, and nothing of what the task says.
    expect(record()).toEqual([
      ['schedule.fired', '2026-06-15T12:30:00.000Z', 200],
      ['schedule.fired', '2026-06-16T12:30:00.000Z', 200],
      ['schedule.fired', '2026-06-18T12:30:00.000Z', 200],
    ]);
    expect(JSON.stringify(activity.entries)).not.toContain('secret words');
    expect(JSON.stringify(activity.entries)).not.toContain('My morning list');
  });

  it('changed after its time today does not fire for today', async () => {
    const worker = agent('worker');
    const made = await schedule(worker, { time: '07:00' });
    // Made at 08:00 for 07:00: not today.
    await moveTo('2026-06-15T12:10:00.000Z');
    expect(fromSchedule()).toEqual([]);
    // Moved to 08:05 at 08:10: not today either.
    expect((await asOwner('PATCH', `/v1/schedules/${made.id}`, { time: '08:05' })).body).toMatchObject({ time: '08:05', name: 'My morning list', nextSays: 'Next tomorrow at 08:05.' });
    await moveTo('2026-06-15T23:00:00.000Z');
    expect(fromSchedule()).toEqual([]);
    await moveTo('2026-06-16T12:06:00.000Z');
    expect(fromSchedule()).toHaveLength(1);
  });

  it('waits as a queued task while new starts are held, and starts when the hold is lifted', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    await asOwner('PUT', '/v1/queue', { hold: true });
    await moveTo('2026-06-15T12:31:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fromSchedule().map((t) => t.state)).toEqual(['queued']);
    expect(hub.state.runs).toEqual([]);
    expect(typed).toEqual([]);
    expect((await asOwner('GET', '/v1/tasks')).body.items[0]).toMatchObject({ state: 'queued', source: { kind: 'schedule', scheduleId: made.id } });
    await asOwner('PUT', '/v1/queue', { hold: false });
    await until(() => working(fromSchedule()[0]));
  });

  it('keeps the limit: with every place taken it waits, and starts when one frees; an ordinary task beside it does not', async () => {
    const [busy, worker] = [agent('busy'), agent('worker')];
    agent('spare');
    await asOwner('PUT', '/v1/queue', { limit: 1 });
    const ordinary = await add('Ordinary');
    expect((await startNext()).body.says).toBe('Started “Ordinary”.');
    expect(taskNow(ordinary.id).sessionId).toBe(busy.id);
    const waits = await add('Waits for a press');
    await schedule(worker);
    await moveTo('2026-06-15T12:31:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fromSchedule().map((t) => t.state)).toEqual(['queued']);
    expect(hub.state.runs).toHaveLength(1);
    // The place frees: the schedule's task starts by itself; the ordinary one still waits for the owner.
    expect((await asSession(busy, 'POST', `/v1/sessions/${busy.id}/run/report`, { type: 'done', note: 'Did it.' })).status).toBe(200);
    await until(() => working(fromSchedule()[0]));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(taskNow(waits.id).state).toBe('queued');
    expect(hub.state.runs).toHaveLength(1);
  });

  it('whose earlier firing is still at work is skipped, once, and says so', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    await moveTo('2026-06-15T12:31:00.000Z');
    await until(() => working(fromSchedule()[0]));
    // A day later it is still at work.
    await moveTo('2026-06-16T12:31:00.000Z');
    expect(fromSchedule()).toHaveLength(1);
    expect(scheduleNow(made.id).last).toMatchObject({ result: 'skipped', due: '2026-06-16T12:30:00.000Z', reason: 'Its earlier task is not over: it is working.' });
    expect((await asOwner('GET', '/v1/schedules')).body.items[0].lastSays).toBe('Skipped today at 08:30: Its earlier task is not over: it is working.');
    await moveTo('2026-06-16T20:00:00.000Z');
    expect(record()).toEqual([
      ['schedule.fired', '2026-06-15T12:30:00.000Z', 200],
      ['schedule.skipped', '2026-06-16T12:30:00.000Z', 409],
    ]);
    // Running it by hand is refused for the same reason.
    const now = await asOwner('POST', `/v1/schedules/${made.id}/run`);
    expect(now.status).toBe(409);
    expect(now.body.error.message).toBe('Its earlier task is not over: it is working.');
    // Over: the next time fires again.
    await finish(worker);
    await until(() => fromSchedule()[0]?.state === 'done');
    await moveTo('2026-06-17T12:31:00.000Z');
    expect(fromSchedule()).toHaveLength(2);
  });
});

describe('a time that passed while the server was stopped', () => {
  it('fires once on the next start, marked late with how late', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    await stop();
    // Three of its times pass: the 15th, 16th and 17th. It starts again at 09:10 on the 17th.
    clock.pending = [];
    clock.at = Date.parse('2026-06-17T13:10:00.000Z');
    await start();
    await until(() => fromSchedule().length > 0);
    await until(() => working(fromSchedule()[0]));
    expect(fromSchedule()).toHaveLength(1);
    expect(fromSchedule()[0]?.source).toMatchObject({ kind: 'schedule', lateMinutes: 40 });
    expect(scheduleNow(made.id).last).toMatchObject({ result: 'late', lateMinutes: 40, due: '2026-06-17T12:30:00.000Z' });
    expect((await asOwner('GET', '/v1/schedules')).body.items[0].lastSays).toBe('Ran 40 minutes late, for today at 08:30.');
    expect((await asOwner('GET', '/v1/tasks')).body.items[0]).toMatchObject({ source: { lateMinutes: 40 } });
    await moveTo('2026-06-17T20:00:00.000Z');
    expect(fromSchedule()).toHaveLength(1);
    expect(record()).toEqual([['schedule.late', '2026-06-17T12:30:00.000Z', 200]]);
  });

  it('does not fire when it is older than the bound, and its row says it was missed', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    await asOwner('POST', '/v1/rules', { event: 'schedule.failed', action: { kind: 'notify' } });
    await stop();
    clock.pending = [];
    // 15:00 on the 17th: six and a half hours after its time, and the bound is six.
    clock.at = Date.parse('2026-06-17T19:00:00.000Z');
    await start();
    await until(() => scheduleNow(made.id).last !== null);
    expect(scheduleNow(made.id).last).toMatchObject({ result: 'missed', due: '2026-06-17T12:30:00.000Z', taskId: null });
    expect(scheduleNow(made.id).last?.reason).toBe('Nothing was looking at that time (the server was stopped, or the computer asleep), and it was 6 hours 30 minutes ago: more than the 6 hours within which a time still runs late.');
    await moveTo('2026-06-18T12:00:00.000Z');
    expect(queueNow().tasks).toEqual([]);
    expect(hub.state.runs).toEqual([]);
    expect(record()).toEqual([['schedule.missed', '2026-06-17T12:30:00.000Z', 410]]);
    // A rule for it heard of it, once. A missed time is not on the owner's list.
    await until(() => notified.length > 0);
    expect(notified).toEqual([`The schedule “My morning list” was missed: ${scheduleNow(made.id).last?.reason}`.slice(0, 500)]);
    expect((await forYouNow()).items.filter((item) => item.kind === 'schedule')).toEqual([]);
    // Its next time runs as usual.
    await moveTo('2026-06-18T12:31:00.000Z');
    expect(fromSchedule()).toHaveLength(1);
    void worker;
  });

  it('the bound is the owner\'s setting', async () => {
    await stop();
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 }, schedules: { lateWithinHours: 1 } }));
    await start();
    const made = await schedule(agent('worker'));
    await stop();
    clock.pending = [];
    clock.at = Date.parse('2026-06-15T14:00:00.000Z');
    await start();
    await until(() => scheduleNow(made.id).last !== null);
    expect(scheduleNow(made.id).last).toMatchObject({ result: 'missed' });
  });
});

describe('what stays the owner\'s', () => {
  it('no token of any scope and no session can make, change, switch, remove or run a schedule', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    const elementId = (made.what as { elementId: string }).elementId;
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });
    const before = JSON.stringify(hub.state.schedules);
    const body = { name: 'Theirs', time: '09:00', days: ['mon'], what: { kind: 'element', elementId }, where: { kind: 'session', sessionId: worker.id } };
    for (const secret of [everything, sessionToken(ownerToken, worker.id)]) {
      for (const [method, url, sent] of [
        ['POST', '/v1/schedules', body],
        ['PATCH', `/v1/schedules/${made.id}`, { on: false }],
        ['PATCH', `/v1/schedules/${made.id}`, { time: '08:01' }],
        ['DELETE', `/v1/schedules/${made.id}`, undefined],
        ['POST', `/v1/schedules/${made.id}/run`, undefined],
        ['POST', `/v1/schedules/${made.id}/run`, {}],
      ] as const) expect((await call(secret, method, url, sent)).status, `${method} ${url}`).toBe(403);
    }
    // Every route there is, with bodies that would make or change one.
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events' || !route.url.includes('schedule')) continue;
      const url = route.url.replace(/:([A-Za-z]+)/g, () => made.id);
      for (const sent of [undefined, {}, body, { on: false }]) {
        if ((route.method === 'GET' || route.method === 'DELETE') && sent !== undefined) continue;
        for (const secret of [everything, sessionToken(ownerToken, worker.id)]) {
          const answer = await call(secret, route.method, url, sent);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(20);
    expect(JSON.stringify(hub.state.schedules)).toBe(before);
    expect(queueNow().tasks).toEqual([]);
    expect(typed).toEqual([]);
    // Reading the list is reading: a token with `read` may, a session and a token without it may not.
    const reader = await makeToken('reader', ['read']);
    expect((await call(reader, 'GET', '/v1/schedules')).body.items.map((row: ScheduleRow) => row.name)).toEqual(['My morning list']);
    expect((await call(await makeToken('writer', ['tasks:write']), 'GET', '/v1/schedules')).status).toBe(403);
    expect((await asSession(worker, 'GET', '/v1/schedules')).status).toBe(403);
  });

  it('what a scheduled run\'s agent adds fires no rule, and it can make no schedule', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    await asOwner('POST', '/v1/rules', { event: 'ask.added', action: { kind: 'notify' } });
    await asOwner('POST', '/v1/rules', { event: 'task.needs-owner', action: { kind: 'notify' } });
    await moveTo('2026-06-15T12:31:00.000Z');
    await until(() => working(fromSchedule()[0]));
    const run = hub.state.runs[0]!;
    // The server marked the run, as it marks one a rule started.
    await until(() => queueNow().ruleRuns.includes(run.id));
    // Its agent asks the owner something and proposes a task: both arrive, marked, and no rule fires.
    const asked = await asSession(worker, 'POST', `/v1/sessions/${worker.id}/asks`, { text: 'Which calendar?' });
    expect(asked.body.source).toMatchObject({ viaRule: true });
    const proposed = await asSession(worker, 'POST', `/v1/sessions/${worker.id}/tasks`, { title: 'Run me every minute', source: { kind: 'schedule', name: 'Theirs' } });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(201);
    expect(proposed.body).toMatchObject({ state: 'proposed', unattended: false, elementId: null });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(notified).toEqual([]);
    expect(activity.entries.filter((entry) => entry.caller === 'rule')).toEqual([]);
    // It cannot make a schedule, nor run the one it came from again.
    expect((await asSession(worker, 'POST', '/v1/schedules', { name: 'Again', time: '08:31', days: EVERY, what: made.what, where: made.where })).status).toBe(403);
    expect((await asSession(worker, 'POST', `/v1/schedules/${made.id}/run`)).status).toBe(403);
    expect(schedulesNow()).toHaveLength(1);
    // A caller cannot say that a task was arranged beforehand.
    const forged = await asOwner('POST', '/v1/tasks', { title: 'Forged', unattended: true, elementId: newId() });
    expect(forged.body).toMatchObject({ unattended: false, elementId: null });
    // When the run is over the mark goes, and the same terminal asking sets the rule off again.
    await finish(worker);
    await until(() => !queueNow().ruleRuns.includes(run.id));
    await asSession(worker, 'POST', `/v1/sessions/${worker.id}/asks`, { text: 'And now?' });
    await until(() => notified.length === 1);
  });
});

describe('a schedule that cannot run', () => {
  it('says why on its row and puts one item on the owner\'s list, not one a day', async () => {
    const worker = agent('worker');
    const other = agent('other');
    const made = await schedule(worker);
    await asOwner('POST', '/v1/rules', { event: 'schedule.failed', action: { kind: 'notify' } });
    // Its terminal is ended for good.
    hub.emit({ type: 'session.closed', sessionId: worker.id });
    for (const day of ['15', '16', '17']) await moveTo(`2026-06-${day}T12:31:00.000Z`);
    expect(queueNow().tasks).toEqual([]);
    expect(scheduleNow(made.id)).toMatchObject({ problem: 'The terminal it runs on is gone.', last: { result: 'could-not-run', due: '2026-06-17T12:30:00.000Z' } });
    const items = (await forYouNow()).items.filter((item) => item.kind === 'schedule');
    expect(items.map((item) => [item.id, item.title, item.sentence, item.act, item.written])).toEqual([[`schedule:${made.id}`, 'A schedule could not run', 'The schedule “My morning list” could not run: The terminal it runs on is gone.', `schedule:${made.id}`, false]]);
    // Each day is in the record; the rule heard of it once.
    expect(record().map(([action]) => action)).toEqual(['schedule.could-not-run', 'schedule.could-not-run', 'schedule.could-not-run']);
    await until(() => notified.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(notified).toEqual(['The schedule “My morning list” could not run: The terminal it runs on is gone.']);
    // Running it by hand says the same, and adds nothing.
    const now = await asOwner('POST', `/v1/schedules/${made.id}/run`);
    expect(now.body).toMatchObject({ taskId: null, says: '“My morning list” could not run: The terminal it runs on is gone.' });
    // Pointed at a terminal that is there, the item goes and it runs.
    expect((await asOwner('PATCH', `/v1/schedules/${made.id}`, { where: { kind: 'session', sessionId: other.id } })).body.problem).toBeNull();
    expect((await forYouNow()).items.filter((item) => item.kind === 'schedule')).toEqual([]);
    await moveTo('2026-06-18T12:31:00.000Z');
    await until(() => working(fromSchedule()[0]));
  });

  it('for a step that was retired or removed, and a canvas that was closed', async () => {
    const worker = agent('worker');
    const second = (await asOwner('POST', '/v1/canvases', { name: 'Second' })).body.id as string;
    const retired = await schedule(worker, { name: 'Retired' });
    const removed = await schedule(worker, { name: 'Removed', what: { kind: 'element', elementId: await element('Other list') } });
    const closed = await schedule(worker, { name: 'Closed', where: { kind: 'new', canvasId: second } });
    expect(closed.says).toBe('Every day at 08:30, run “Morning list” on a new agent terminal on “Second”.');
    expect((await asOwner('POST', `/v1/elements/${(retired.what as { elementId: string }).elementId}/retire`, {})).status).toBe(200);
    expect((await asOwner('DELETE', `/v1/elements/${(removed.what as { elementId: string }).elementId}`)).status).toBe(204);
    expect((await asOwner('DELETE', `/v1/canvases/${second}`, { sessions: 'park' })).status).toBeLessThan(300);
    await moveTo('2026-06-15T12:31:00.000Z');
    expect(queueNow().tasks).toEqual([]);
    expect(Object.fromEntries(schedulesNow().map((s) => [s.name, s.problem]))).toEqual({
      Retired: 'The step it runs, “Morning list”, was retired.',
      Removed: 'The step it runs is no longer among the saved steps.',
      Closed: 'The canvas its new terminal was to start on was closed.',
    });
    expect((await forYouNow()).items.filter((item) => item.kind === 'schedule')).toHaveLength(3);
    // One that names what is gone cannot be made, and one that cannot run can still be switched off or removed.
    expect((await asOwner('POST', '/v1/schedules', { name: 'Nowhere', time: '08:30', days: EVERY, what: { kind: 'element', elementId: newId() }, where: { kind: 'session', sessionId: worker.id } })).status).toBe(400);
    expect((await asOwner('PATCH', `/v1/schedules/${closed.id}`, { on: false })).status).toBe(200);
    expect((await asOwner('DELETE', `/v1/schedules/${removed.id}`)).status).toBe(204);
    expect((await forYouNow()).items.filter((item) => item.kind === 'schedule')).toHaveLength(1);
  });
});

describe('run now', () => {
  it('is the same path as a firing, marked as by hand; what it hands in names the schedule; a rule hears of the firing', async () => {
    const worker = agent('worker');
    const made = await schedule(worker);
    await asOwner('POST', '/v1/rules', { event: 'schedule.fired', action: { kind: 'notify' } });
    const ran = await asOwner('POST', `/v1/schedules/${made.id}/run`);
    expect(ran.status, JSON.stringify(ran.body)).toBe(200);
    expect(ran.body.says).toBe('“My morning list” is in the queue and starts when a place is free.');
    const task = taskNow(ran.body.taskId);
    expect(task).toMatchObject({ unattended: true, source: { kind: 'schedule', scheduleId: made.id, byHand: true } });
    expect(ran.body.schedule).toMatchObject({ last: { result: 'by-hand', due: null }, lastSays: 'Run by hand today at 08:00.' });
    await until(() => working(task));
    expect(typed).toEqual([[worker.id, KICKOFF_LINE]]);
    // The agent is told the schedule's name and its task, as the task of the element.
    const told = await asSession(worker, 'GET', `/v1/sessions/${worker.id}/run`);
    expect(JSON.stringify(told.body)).toContain('the secret words of the task');
    // It hands in a checklist: that is on the owner's list, and says which schedule it came from.
    expect((await asSession(worker, 'POST', `/v1/sessions/${worker.id}/run/report`, { type: 'done', output: { items: [{ text: 'Answer the letter' }, { text: 'Book the room' }] } })).status).toBe(200);
    await until(() => taskNow(task.id).state === 'done');
    const list = (await forYouNow()).items.filter((item) => item.kind === 'checklist');
    expect(list.map((item) => [item.sentence, item.from])).toEqual([['worker handed in a list (Morning list): 2 of 2 left to tick.', 'worker, from the schedule “My morning list”, run by hand']]);
    await until(() => notified.length > 0);
    expect(notified).toEqual(['The schedule “My morning list” fired, run by hand.']);
    expect(record()).toEqual([['schedule.by-hand', 'by hand', 200]]);
    // Its time of day is left as it was: it still fires at 08:30.
    await moveTo('2026-06-15T12:31:00.000Z');
    expect(fromSchedule()).toHaveLength(2);
  });

  it('on a new agent terminal: one is started on the canvas it names, told in its first prompt, and nothing is typed', async () => {
    const canvasId = hub.state.canvases[0]!.id;
    const made = await asOwner('POST', '/v1/schedules', { name: 'My morning list', time: '08:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'], what: { kind: 'element', elementId: await element() }, where: { kind: 'new', canvasId }, environment: 'full' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.says).toBe(`Weekdays at 08:30, run “Morning list” on a new agent terminal on “${hub.state.canvases[0]!.name}”.`);
    expect(hub.state.sessions).toEqual([]);
    await moveTo('2026-06-15T12:31:00.000Z');
    await until(() => working(fromSchedule()[0]));
    const task = fromSchedule()[0] as Task;
    const session = hub.state.sessions.find((s) => s.id === task.sessionId) as Session;
    expect(session).toMatchObject({ name: 'My morning list', state: 'open' });
    // It was started as an agent, with the one fixed sentence as its first prompt.
    expect(created).toHaveLength(1);
    expect(typed).toEqual([[session.id, `the-agent ${JSON.stringify(KICKOFF_LINE)}`]]);
    expect(hub.state.canvases[0]!.layout.nodes.map((node) => node.sessionId)).toEqual([session.id]);
    expect(hub.state.runs[0]).toMatchObject({ sessionId: session.id });
    // The fixed sentence was in its launch line, as for any new agent terminal: it is not typed a second time.
    expect(typed.filter(([, line]) => line === KICKOFF_LINE)).toEqual([]);
  });

  it('runs a workflow, and one that is switched off', async () => {
    const worker = agent('worker');
    const flow = await asOwner('POST', '/v1/workflows', { name: 'Two steps', inputs: [{ key: 'task', label: 'Task' }], elements: [{ id: 'a', name: 'First', instructions: 'Do {{task}}.' }, { id: 'b', name: 'Second', instructions: 'Check it.' }] });
    expect(flow.status, JSON.stringify(flow.body)).toBe(201);
    const made = await asOwner('POST', '/v1/schedules', { name: 'Weekly', time: '08:30', days: ['fri'], what: { kind: 'workflow', workflowId: flow.body.id }, where: { kind: 'session', sessionId: worker.id }, on: false });
    expect(made.body).toMatchObject({ says: 'Friday at 08:30, run “Two steps” on “worker”.', on: false });
    const ran = await asOwner('POST', `/v1/schedules/${made.body.id}/run`);
    await until(() => working(taskNow(ran.body.taskId)));
    expect(hub.state.runs[0]).toMatchObject({ workflowId: flow.body.id, sessionId: worker.id });
  });
});

describe('the timer', () => {
  it('is not set at all while there is no schedule, and starts nothing', async () => {
    agent('worker');
    await add('Waits');
    await moveTo('2026-06-17T12:00:00.000Z');
    await stop();
    await start();
    await moveTo('2026-06-19T12:00:00.000Z');
    expect(clock.set).toEqual([]);
    expect(clock.pending).toEqual([]);
    expect(hub.state.runs).toEqual([]);
    expect(typed).toEqual([]);
    expect(queueNow().tasks.map((t) => t.state)).toEqual(['queued']);
  });

  it('wakes once a minute while a schedule is on, never more often, and stops when none is', async () => {
    const worker = agent('worker');
    // One that is off sets nothing.
    const off = await schedule(worker, { name: 'Off', on: false });
    expect(clock.set).toEqual([]);
    const made = await schedule(worker, { time: '23:00' });
    expect(clock.set).toEqual([WAKE_EVERY_MS]);
    // Changes and a second schedule do not set a second timer.
    await asOwner('PATCH', `/v1/schedules/${made.id}`, { name: 'Renamed' });
    await schedule(worker, { name: 'Another', time: '23:30' });
    expect(clock.pending).toHaveLength(1);
    const wokeAt: number[] = [];
    const real = clock.wake;
    clock.wake = (ms, then) => real(ms, () => (wokeAt.push(clock.at), then()));
    try {
      await moveTo('2026-06-15T13:00:00.000Z');
    } finally {
      clock.wake = real;
    }
    // An hour: sixty wakes, each a whole minute after the one before.
    expect(wokeAt.length).toBeGreaterThanOrEqual(59);
    expect(wokeAt.length).toBeLessThanOrEqual(60);
    for (let n = 1; n < wokeAt.length; n += 1) expect((wokeAt[n] as number) - (wokeAt[n - 1] as number)).toBe(WAKE_EVERY_MS);
    expect(clock.set.every((ms) => ms === WAKE_EVERY_MS)).toBe(true);
    expect(clock.pending).toHaveLength(1);
    // Nothing was due in that hour: nothing was written, nothing started.
    expect(hub.state.schedules.checkedAt).toBeNull();
    expect(queueNow().tasks).toEqual([]);
    // The last one switched off or removed: the timer is taken away.
    for (const s of schedulesNow()) if (s.id !== off.id) await asOwner('DELETE', `/v1/schedules/${s.id}`);
    expect(clock.pending).toEqual([]);
    const set = clock.set.length;
    await moveTo('2026-06-16T13:00:00.000Z');
    expect(clock.set).toHaveLength(set);
  });

  it('there may be fifty schedules and no more', async () => {
    const worker = agent('worker');
    const elementId = await element();
    for (let n = 0; n < 50; n += 1) expect((await asOwner('POST', '/v1/schedules', { name: `Number ${n}`, time: '08:30', days: ['mon'], what: { kind: 'element', elementId }, where: { kind: 'session', sessionId: worker.id }, on: false })).status).toBe(201);
    const over = await asOwner('POST', '/v1/schedules', { name: 'One too many', time: '08:30', days: ['mon'], what: { kind: 'element', elementId }, where: { kind: 'session', sessionId: worker.id } });
    expect(over.status).toBe(409);
    // What is not a time of day, or more elaborate than one, is refused.
    for (const bad of [{ time: '8:30' }, { time: '24:00' }, { time: '*/5 * * * *' }, { days: [] }, { days: ['mon', 'mon'] }, { days: ['someday'] }, { every: 'minute' }]) {
      const answer = await asOwner('PATCH', `/v1/schedules/${schedulesNow()[0]!.id}`, bad);
      if ('every' in bad) expect(answer.body.time).toBe('08:30');
      else expect(answer.status, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe('the commands', () => {
  /** A command as typed: by the owner outside any terminal of a canvas, or inside one. */
  const typed_ = async (words: string[], inside?: Session): Promise<{ code: number; out: string }> => {
    const printed: string[] = [];
    const clientOrigin = `http://127.0.0.1:${port}`;
    const owner = createClient({ baseUrl: clientOrigin, headers: { origin: clientOrigin, cookie: `${cookieName(port)}=${ownerToken}` } });
    const env = inside ? { [SESSION_ENV.url]: clientOrigin, [SESSION_ENV.sessionId]: inside.id, [SESSION_ENV.token]: sessionToken(ownerToken, inside.id) } : {};
    const code = await runScheduleCommand(parseScheduleCommand(words), { owner: (work) => work(owner), env, print: (text) => printed.push(text) });
    return { code, out: printed.join('\n') };
  };

  it('add, list, change, off, on, run and remove as the owner; inside a canvas terminal they do nothing', async () => {
    const worker = agent('worker');
    await element();
    expect((await typed_(['list'])).out).toContain(`No schedules. To make one:\n  ${SCHEDULE_ADD_EXAMPLE}`);
    const made = await typed_(['add', 'My morning list', '--at', '08:30', '--days', 'weekdays', '--element', 'Morning list', '--on', 'worker', '--task', 'what is open today']);
    expect(made.out).toContain('Made “My morning list”: Weekdays at 08:30, run “Morning list” on “worker”. Next today at 08:30.');
    expect(made.out).toContain('To try it now: aubergine schedule run "My morning list"');
    expect(schedulesNow()[0]).toMatchObject({ name: 'My morning list', time: '08:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'], where: { kind: 'session', sessionId: worker.id }, task: 'what is open today', on: true });
    const list = await typed_(['list']);
    expect(list.out).toContain('1. My morning list  [');
    expect(list.out).toContain('     Weekdays at 08:30, run “Morning list” on “worker”.');
    expect(list.out).toContain('     Next today at 08:30. It has not run yet.');
    // Changed: only what was named changes.
    expect((await typed_(['change', 'My morning list', '--at', '09:15', '--days', 'mon,fri'])).out).toContain('Changed “My morning list”: Monday and Friday at 09:15, run “Morning list” on “worker”.');
    expect(schedulesNow()[0]).toMatchObject({ time: '09:15', days: ['mon', 'fri'], task: 'what is open today' });
    expect((await typed_(['off', '1'])).out).toBe('“My morning list” is switched off. Switched off.');
    expect((await typed_(['list'])).out).toContain('1. My morning list  (off)');
    expect((await typed_(['on', 'My morning list'])).out).toContain('is switched on. Next ');
    // Run now: through the queue.
    const ran = await typed_(['run', 'My morning list']);
    expect(ran).toEqual({ code: 0, out: '“My morning list” is in the queue and starts when a place is free.' });
    await until(() => working(fromSchedule()[0]));
    const again = await typed_(['run', 'My morning list']);
    expect(again).toEqual({ code: 1, out: 'Its earlier task is not over: it is working.' });

    // Inside a canvas terminal: nothing, with a sentence an agent can act on.
    const before = JSON.stringify(hub.state.schedules);
    for (const words of [['list'], ['add', 'Theirs', '--at', '08:30', '--days', 'weekdays', '--element', 'Morning list', '--on', 'worker'], ['change', '1', '--at', '10:00'], ['off', '1'], ['on', '1'], ['run', '1'], ['remove', '1']]) {
      const inside = await typed_(words, worker);
      expect(inside.code, words.join(' ')).toBe(1);
      expect(inside.out).toContain('This command does nothing inside a canvas terminal.');
    }
    expect(JSON.stringify(hub.state.schedules)).toBe(before);

    expect((await typed_(['remove', 'My morning list'])).out).toBe('Removed “My morning list”. A task it already added to the queue stays there.');
    expect(schedulesNow()).toEqual([]);
    expect(fromSchedule()).toHaveLength(1);
  });

  it('say the right form when something is missing or wrong, and the help has an example', () => {
    for (const wrong of [['add', 'x'], ['add', 'x', '--at', '08:30'], ['add', 'x', '--at', '08:30', '--days', 'weekdays'], ['add', 'x', '--at', '08:30', '--days', 'weekdays', '--element', 'e'], ['add', '--at', '08:30', '--days', 'weekdays', '--element', 'e', '--new', 'Main']]) {
      expect(() => parseScheduleCommand(wrong), wrong.join(' ')).toThrow(/The form is:\n {2}aubergine schedule add "<name>" --at <08:30> .*\nFor example:\n {2}aubergine schedule add "My morning list" --at 08:30 --days weekdays --element "Morning list" --new Main$/s);
    }
    expect(() => parseScheduleCommand(['add', 'x', '--every', '5m'])).toThrow(/schedule add does not know --every\. The form is:/);
    expect(() => parseScheduleCommand(['add', 'x', '--at', '8.30'])).toThrow(/--at takes a time of day like 08:30/);
    expect(() => parseScheduleCommand(['add', 'x', '--at', '08:30', '--days', 'sometimes'])).toThrow(/--days takes weekdays/);
    expect(() => parseScheduleCommand(['change', 'x'])).toThrow(/needs something to change/);
    expect(() => parseScheduleCommand(['run'])).toThrow(/needs a schedule/);
    expect(() => parseScheduleCommand(['pause', 'x'])).toThrow(/It knows: list, add, change, on, off, run, remove/);
    expect(parseScheduleCommand(['add', 'A', 'name', '--at', '08:30', '--days', 'every day', '--workflow', 'w', '--new', 'Main', '--off'])).toMatchObject({ action: 'add', off: true, fields: { name: 'A name', days: EVERY, workflow: 'w', onNew: 'Main' } });
    expect(USAGE).toContain(`For example: ${SCHEDULE_ADD_EXAMPLE}`);
  });
});
