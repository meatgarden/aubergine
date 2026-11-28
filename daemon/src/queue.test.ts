import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ASKS_WAITING_MAX, GRANTABLE_SCOPES, KICKOFF_LINE, NO_ATTENTION, NO_STATUS, PROPOSALS_WAITING_MAX, RULE_RATE_PER_MINUTE, newId, sessionsWaiting, type ChangeEvent, type ForYou, type QueueState, type Scope, type Session, type Task } from '@aubergine/shared';
import { createClient } from '@aubergine/client';
import { SESSION_ENV } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { USAGE } from './cli/commands';
import { parseAskCommand, parseRuleCommand, parseTaskCommand, parseTodoCommand, runQueueCommand, type QueueCommand } from './cli/queue';
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
import { FileTaskArchive, TASK_ARCHIVE_FILE } from './task-archive';
import { loadOrCreateToken } from './token';
import { Viewers } from './viewers';

/**
 * The queue of tasks, the owner's list and the rules, through the routes
 * against a real server and a real state file. Shells are a stand-in that
 * keeps every line that would have been typed; a page is a stand-in that
 * keeps every notification it was asked to show.
 */

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
  create: async (options: { id: string }) => ({ id: options.id, cwd: null, command: null, activityAt: null }),
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
  viewers = new Viewers();
  viewers.add((message) => void (message.type === 'notify' && notified.push(message.body)));
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir), taskArchive: new FileTaskArchive(dir), activity, viewers });
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
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-queue-'));
  ownerToken = await loadOrCreateToken(dir);
  // The walk below makes more calls with one token than the usual limit allows in a minute.
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  typed = [];
  notified = [];
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
/** What the agent in a terminal does: it reports its one element done. */
const finish = async (session: Session): Promise<void> => {
  expect((await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done', note: 'Did it.' })).status).toBe(200);
};
async function until(done: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await done())) {
    if (Date.now() > end) throw new Error('Waited too long');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const forYouNow = async (): Promise<ForYou> => (await asOwner('GET', '/v1/for-you')).body as ForYou;

describe('the queue', () => {
  it('starts tasks only when the owner says, at most as many as the limit, each by the existing start; a finished one waits to be looked at', async () => {
    const one = agent('one');
    const two = agent('two');
    agent('three');
    expect((await asOwner('PUT', '/v1/queue', { limit: 2 })).body).toMatchObject({ limit: 2, hold: false, automatic: false });
    const first = await add('Fix the retry', { details: 'It gives up too early.' });
    const second = await add('Write the notes');
    const third = await add('Tidy the tests');
    expect([first, second, third].map((t) => [t.state, t.addedBy.kind, t.source.kind])).toEqual([['queued', 'person', 'hand'], ['queued', 'person', 'hand'], ['queued', 'person', 'hand']]);
    // Adding started nothing.
    expect(typed).toEqual([]);
    expect(hub.state.runs).toEqual([]);

    expect((await startNext()).body).toMatchObject({ says: 'Started “Fix the retry”.', started: [{ taskId: first.id, sessionId: one.id, ok: true }] });
    expect((await startNext()).body.started).toMatchObject([{ taskId: second.id, sessionId: two.id, ok: true }]);
    expect([first, second, third].map((t) => taskNow(t.id).state)).toEqual(['working', 'working', 'queued']);
    // Nothing was typed but the fixed sentence, once for each.
    expect(typed).toEqual([[one.id, KICKOFF_LINE], [two.id, KICKOFF_LINE]]);
    // What the agent reads is the task: the title and the details.
    expect((await asSession(one, 'GET', `/v1/sessions/${one.id}/run`)).body.text).toContain('Fix the retry\n\nIt gives up too early.');
    // The limit is two: a third press starts nothing, and says why.
    const full = await startNext();
    expect(full.body).toEqual({ started: [], says: '2 tasks are at work, and the limit is 2. Nothing was started.' });
    expect((await asOwner('GET', '/v1/queue')).body.summary).toBe('2 working, 1 next');

    await finish(one);
    await until(() => taskNow(first.id).state === 'done');
    // It is on the owner's list to look at, and the third did not start by itself.
    expect((await forYouNow()).items.filter((item) => item.taskId === first.id).map((item) => [item.kind, item.sentence])).toEqual([['task-done', 'The task “Fix the retry” is done.']]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(taskNow(third.id).state).toBe('queued');
    expect(typed.length).toBe(2);
    // The owner says so: it starts, on the terminal that is free now.
    expect((await startNext()).body.started).toMatchObject([{ taskId: third.id, ok: true }]);
    expect(taskNow(third.id).state).toBe('working');

    // Looked at: it is put away, and can still be read.
    expect((await asOwner('POST', `/v1/tasks/${first.id}/clear`)).status).toBe(200);
    expect(queueNow().tasks.map((t) => t.id)).not.toContain(first.id);
    expect((await asOwner('GET', `/v1/tasks/${first.id}`)).body).toMatchObject({ state: 'done', title: 'Fix the retry' });
    expect((await asOwner('GET', '/v1/tasks?state=ended')).body.items.map((t: Task) => t.id)).toEqual([first.id]);
    expect(await readFile(path.join(dir, TASK_ARCHIVE_FILE), 'utf8')).toContain(first.id);
  });

  it('follows the run: blocked needs the owner, stopped is failed with a sentence, and nothing is tried again unless the owner says', async () => {
    const one = agent('one');
    const task = await add('Deploy');
    await startNext();
    await asSession(one, 'POST', `/v1/sessions/${one.id}/run/report`, { type: 'blocked', reason: 'I need the staging password.' });
    await until(() => taskNow(task.id).state === 'needs-owner');
    expect(taskNow(task.id).reason).toBe('Blocked: I need the staging password.');
    await asOwner('POST', `/v1/runs/${taskNow(task.id).runId}/report`, { type: 'stop' });
    await until(() => taskNow(task.id).state === 'failed');
    expect(taskNow(task.id).reason).toBe('Its run was stopped before it finished.');
    expect((await forYouNow()).items.filter((item) => item.taskId === task.id).map((item) => item.kind)).toEqual(['task-failed']);
    // The terminal is free again and the task failed: nothing starts it again, by a press of Start next or by waiting.
    await asOwner('PUT', '/v1/queue', { automatic: true });
    expect((await startNext()).body.says).toBe('No task waits to be started.');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(taskNow(task.id).state).toBe('failed');
    expect(hub.state.runs).toEqual([]);
    await asOwner('PUT', '/v1/queue', { automatic: false });
    expect((await asOwner('POST', `/v1/tasks/${task.id}/again`)).body.state).toBe('queued');
    // A task for a terminal that does not exist cannot be added; one whose start fails says why.
    expect((await asOwner('POST', '/v1/tasks', { title: 'Nowhere', taker: { kind: 'session', sessionId: newId() } })).status).toBe(404);
    const plain = fakeSession('a plain shell');
    const never = await add('For a plain shell', { taker: { kind: 'session', sessionId: plain.id } });
    expect((await startNext(never.id)).body.says).toContain('The terminal it is meant for is not free: no agent is seen in front there');
    expect(taskNow(never.id).state).toBe('queued');
  });

  it('keeps the order the owner gives, and lets the owner change and withdraw what has not started', async () => {
    const [a, b, c] = [await add('A'), await add('B'), await add('C')];
    expect((await asOwner('PUT', '/v1/tasks/order', { taskIds: [c.id, a.id] })).status).toBe(200);
    expect((await asOwner('GET', '/v1/tasks')).body.items.map((t: Task) => t.title)).toEqual(['C', 'A', 'B']);
    expect((await asOwner('PATCH', `/v1/tasks/${b.id}`, { details: 'More.' })).body).toMatchObject({ title: 'B', details: 'More.', state: 'queued' });
    expect((await asOwner('POST', `/v1/tasks/${a.id}/withdraw`)).body.state).toBe('withdrawn');
    expect(queueNow().tasks.map((t) => t.title).sort()).toEqual(['B', 'C']);
    agent('one');
    expect((await startNext()).body.says).toBe('Started “C”.');
    expect((await asOwner('PATCH', `/v1/tasks/${c.id}`, { details: 'Too late.' })).status).toBe(409);
    expect((await asOwner('POST', `/v1/tasks/${c.id}/withdraw`)).status).toBe(409);
  });
});

describe('proposals', () => {
  it('from a session or a program wait for the owner and start nothing; a token made with review off queues; each is bounded', async () => {
    const worker = agent('worker');
    const proposed = await asSession(worker, 'POST', `/v1/sessions/${worker.id}/tasks`, { title: 'Add a test for the retry', details: 'There is none.' });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(201);
    expect(proposed.body).toMatchObject({ state: 'proposed', addedBy: { kind: 'agent', name: 'worker', sessionId: worker.id }, source: { kind: 'api' } });
    // It is on the owner's list, and nothing started.
    expect((await forYouNow()).items.filter((item) => item.kind === 'proposal').map((item) => [item.sentence, item.from])).toEqual([['Proposed for the queue: Add a test for the retry', 'the agent in “worker”, through the API']]);
    expect((await startNext()).body).toEqual({ started: [], says: 'No task waits to be started.' });
    await asOwner('PUT', '/v1/queue', { automatic: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(hub.state.runs).toEqual([]);
    expect(typed).toEqual([]);
    await asOwner('PUT', '/v1/queue', { automatic: false });

    // A session says what and why, not where it runs or who takes it; and it cannot speak for another session.
    expect((await asSession(worker, 'POST', `/v1/sessions/${worker.id}/tasks`, { title: 'x', taker: { kind: 'session', sessionId: worker.id }, folder: '/tmp' })).body).toMatchObject({ taker: { kind: 'any' }, folder: null });
    const other = agent('other');
    expect((await asSession(worker, 'POST', `/v1/sessions/${other.id}/tasks`, { title: 'x' })).status).toBe(403);
    // Past its bound it is refused, with a sentence to act on.
    for (let n = 2; n < PROPOSALS_WAITING_MAX; n += 1) expect((await asSession(worker, 'POST', `/v1/sessions/${worker.id}/tasks`, { title: `More ${n}` })).status).toBe(201);
    const over = await asSession(worker, 'POST', `/v1/sessions/${worker.id}/tasks`, { title: 'One too many' });
    expect(over.status).toBe(409);
    expect(over.body.error.message).toContain(`${PROPOSALS_WAITING_MAX} tasks you proposed already wait for the owner's yes`);
    // Another session has a bound of its own.
    expect((await asSession(other, 'POST', `/v1/sessions/${other.id}/tasks`, { title: 'Mine' })).status).toBe(201);

    // Tokens: without the scope, refused; with it, a proposal; with review switched off, queued.
    expect((await call(await makeToken('reader', ['read']), 'POST', '/v1/tasks', { title: 'x' })).status).toBe(403);
    const program = await makeToken('ci', ['read', 'tasks:write']);
    const fromProgram = await call(program, 'POST', '/v1/tasks', { title: 'Bump the version' });
    expect(fromProgram.body).toMatchObject({ state: 'proposed', addedBy: { kind: 'token', name: 'ci' }, source: { kind: 'api' } });
    const trusted = await makeToken('trusted', ['read', 'tasks:write'], { reviewWorkflowChanges: false });
    expect((await call(trusted, 'POST', '/v1/tasks', { title: 'Queued at once' })).body.state).toBe('queued');
    // A program withdraws what it added, and nothing else.
    expect((await call(program, 'POST', `/v1/tasks/${proposed.body.id}/withdraw`)).status).toBe(409);
    expect((await call(program, 'POST', `/v1/tasks/${fromProgram.body.id}/withdraw`)).body.state).toBe('withdrawn');

    // The owner's yes and no.
    expect((await asOwner('POST', `/v1/tasks/${proposed.body.id}/accept`)).body.state).toBe('queued');
    expect((await asOwner('POST', `/v1/tasks/${proposed.body.id}/accept`)).status).toBe(409);
    const declined = queueNow().tasks.find((t) => t.title === 'Mine') as Task;
    expect((await asOwner('POST', `/v1/tasks/${declined.id}/decline`)).body).toMatchObject({ state: 'withdrawn', reason: 'Declined.' });
    // A record is kept of what was declined.
    expect((await asOwner('GET', `/v1/tasks/${declined.id}`)).body).toMatchObject({ title: 'Mine', state: 'withdrawn', reason: 'Declined.', addedBy: { kind: 'agent', name: 'other' } });
  });

  it('what is asked of the owner in writing is on the list until the owner marks it done, and is bounded per session and per token', async () => {
    const worker = agent('worker');
    const asked = await asSession(worker, 'POST', `/v1/sessions/${worker.id}/asks`, { text: 'Rotate the staging key.\nIt expires on Friday.' });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    expect((await forYouNow()).items.filter((item) => item.written)).toMatchObject([{ kind: 'ask', sentence: 'Rotate the staging key.\nIt expires on Friday.', from: 'the agent in “worker”, through the API', askId: asked.body.id }]);
    // Nothing was typed and nothing started.
    expect(typed).toEqual([]);
    for (let n = 1; n < ASKS_WAITING_MAX; n += 1) expect((await asSession(worker, 'POST', `/v1/sessions/${worker.id}/asks`, { text: `And ${n}` })).status).toBe(201);
    const over = await asSession(worker, 'POST', `/v1/sessions/${worker.id}/asks`, { text: 'One too many' });
    expect(over.status).toBe(409);
    expect(over.body.error.message).toContain('still wait, and that is as many as may');
    // What it reads back is its own, and every task by title only.
    await add('A task of the owner', { details: 'PRIVATE-DETAILS-7731' });
    const own = await asSession(worker, 'GET', `/v1/sessions/${worker.id}/queue`);
    expect(own.body.asks).toHaveLength(ASKS_WAITING_MAX);
    expect(own.body.tasks).toEqual([expect.objectContaining({ title: 'A task of the owner', state: 'queued', mine: false })]);
    expect(JSON.stringify(own.body)).not.toContain('PRIVATE-DETAILS-7731');
    const other = agent('other');
    expect((await asSession(other, 'GET', `/v1/sessions/${other.id}/queue`)).body.asks).toEqual([]);
    expect((await asSession(other, 'GET', `/v1/sessions/${worker.id}/queue`)).status).toBe(403);
    // A session does not read the owner's list or the tasks in full.
    for (const url of ['/v1/for-you', '/v1/tasks', '/v1/queue', '/v1/rules']) expect((await asSession(worker, 'GET', url)).status, url).toBe(403);
    // The owner writes one too, and marks things done.
    const mine = await asOwner('POST', '/v1/asks', { text: 'Renew the certificate' });
    expect(mine.body).toMatchObject({ addedBy: { kind: 'person' }, source: { kind: 'hand' } });
    expect((await asOwner('POST', `/v1/asks/${asked.body.id}/done`)).status).toBe(200);
    expect((await asOwner('POST', `/v1/asks/${mine.body.id}/dismiss`)).status).toBe(200);
    expect(queueNow().asks.map((a) => a.id)).not.toContain(asked.body.id);
    expect((await asOwner('POST', `/v1/asks/${asked.body.id}/done`)).status).toBe(404);
  });
});

describe('what stays the owner\'s', () => {
  it('no token of any scope and no session can accept, decline, reorder, change the limit, hold, automatic starting or a rule; and nothing starts through any route', async () => {
    const worker = agent('worker');
    const free = agent('free');
    const proposed = (await asSession(worker, 'POST', `/v1/sessions/${worker.id}/tasks`, { title: 'Proposed' })).body as Task;
    const [a, b] = [await add('A'), await add('B')];
    const ask = (await asOwner('POST', '/v1/asks', { text: 'Mine' })).body;
    await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'notify' } });
    const rule = queueNow().rules[0]!;
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });
    const before = JSON.stringify(queueNow());
    typed = [];
    // Everything that could change what was decided, and nothing that a token may rightly do (add a task of its own, ask).
    const bodies: (object | undefined)[] = [undefined, {}, { taskIds: [b.id, a.id] }, { limit: 9, hold: true, automatic: true }, { automatic: true }, { taskId: a.id }, { event: 'task.failed', action: { kind: 'notify' } }, { details: 'changed', taker: { kind: 'session', sessionId: free.id } }, { type: 'accept' }];
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') continue;
      // Ending a session or revoking is another matter, and what a token with the scope may do.
      const ids: Record<string, string> = route.method === 'DELETE' ? { ruleId: rule.id } : { taskId: route.url.endsWith('/withdraw') ? a.id : proposed.id, askId: ask.id, ruleId: rule.id, sessionId: worker.id };
      const url = route.url.replace(/:([A-Za-z]+)/g, (_all, name: string) => ids[name] ?? newId());
      for (const body of bodies) {
        if ((route.method === 'GET' || route.method === 'DELETE') && body !== undefined) continue;
        for (const secret of [everything, sessionToken(ownerToken, worker.id), sessionToken(ownerToken, free.id)]) {
          const answer = await call(secret, route.method, url, body);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(429);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(700);
    expect(JSON.stringify(queueNow())).toBe(before);
    // Nothing started: no run, nothing typed for a task.
    expect(hub.state.runs).toEqual([]);
    expect(typed.filter(([, line]) => line === KICKOFF_LINE)).toEqual([]);
    // Named plainly.
    for (const secret of [everything, sessionToken(ownerToken, worker.id)]) {
      for (const [method, url, body] of [
        ['POST', `/v1/tasks/${proposed.id}/accept`, undefined],
        ['POST', `/v1/tasks/${proposed.id}/decline`, undefined],
        ['PUT', '/v1/tasks/order', { taskIds: [b.id, a.id] }],
        ['POST', '/v1/tasks/start', {}],
        ['PUT', '/v1/queue', { limit: 9 }],
        ['PUT', '/v1/queue', { hold: true }],
        ['PUT', '/v1/queue', { automatic: true }],
        ['GET', '/v1/rules', undefined],
        ['POST', '/v1/rules', { event: 'task.done', action: { kind: 'notify' } }],
        ['DELETE', `/v1/rules/${rule.id}`, undefined],
        ['POST', `/v1/asks/${ask.id}/done`, undefined],
        ['PATCH', `/v1/tasks/${a.id}`, { details: 'x' }],
        ['POST', `/v1/tasks/${a.id}/clear`, undefined],
        ['POST', `/v1/tasks/${a.id}/again`, undefined],
      ] as const) expect((await call(secret, method, url, body)).status, `${method} ${url}`).toBe(403);
    }
  });
});

describe('starting by itself', () => {
  it('is off unless the owner switched it on: nothing starts through adding, a restart or waiting', async () => {
    agent('one');
    await add('A');
    await add('B');
    await stop();
    await start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(queueNow().tasks.map((t) => t.state)).toEqual(['queued', 'queued']);
    expect(hub.state.runs).toEqual([]);
    expect(typed).toEqual([]);
  });

  it('when on, starts exactly one task when a place frees, and none while held', async () => {
    const one = agent('one');
    const two = agent('two');
    await asOwner('PUT', '/v1/queue', { limit: 1, automatic: true });
    const [a, b, c] = [await add('A'), await add('B'), await add('C')];
    // One place: one starts, on the event of its being added.
    await until(() => taskNow(a.id).state === 'working');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect([a, b, c].map((t) => taskNow(t.id).state)).toEqual(['working', 'queued', 'queued']);
    // The place frees: exactly one more starts, though two terminals are free and two tasks wait.
    events = [];
    await finish(one);
    await until(() => taskNow(b.id).state === 'working');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect([a, b, c].map((t) => taskNow(t.id).state)).toEqual(['done', 'working', 'queued']);
    expect(events.filter((event) => event.type === 'run.started')).toHaveLength(1);
    // Held: the next place frees and nothing starts. What is running is not touched.
    await asOwner('PUT', '/v1/queue', { hold: true });
    const holder = hub.state.sessions.find((s) => s.id === taskNow(b.id).sessionId) as Session;
    expect([one.id, two.id]).toContain(holder.id);
    await finish(holder);
    await until(() => taskNow(b.id).state === 'done');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(taskNow(c.id).state).toBe('queued');
    expect((await startNext()).status).toBe(409);
    // The hold is taken off: that is an event, and the task starts.
    await asOwner('PUT', '/v1/queue', { hold: false });
    await until(() => taskNow(c.id).state === 'working');
  });

  it('when on, also starts when an agent becomes free without a run ending; and while off the same changes start nothing', async () => {
    // Off: a task waits, and every change that could free an agent comes and goes.
    const waiting = await add('Waits for an agent');
    const plain = fakeSession('becomes an agent');
    const busy = agent('at work', { attention: { ...NO_ATTENTION, state: 'working', at: new Date().toISOString() } });
    const free = (session: Session): void => hub.emit({ type: 'session.attention', sessionId: session.id, attention: NO_ATTENTION });
    free(busy);
    agent('a new agent terminal');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(taskNow(waiting.id).state).toBe('queued');
    expect(hub.state.runs).toEqual([]);
    expect(typed).toEqual([]);
    // On: what is free now is used at once, by the change of the setting.
    await asOwner('PUT', '/v1/queue', { automatic: true, limit: 5 });
    await until(() => taskNow(waiting.id).state === 'working');
    const second = await add('Second');
    await until(() => taskNow(second.id).state === 'working');
    // Nobody is free now: the next task waits.
    const third = await add('Third', { taker: { kind: 'session', sessionId: plain.id } });
    const fourth = await add('Fourth');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect([third, fourth].map((t) => taskNow(t.id).state)).toEqual(['queued', 'queued']);
    // An agent is seen in front of the plain terminal: no run ended, and the task meant for it starts.
    events = [];
    hub.emit({ type: 'session.agent', sessionId: plain.id, agent: { kind: 'claude-code', conversationId: null, program: 'the-agent' } });
    hub.emit({ type: 'session.activity', sessionId: plain.id, cwd: null, command: 'the-agent' });
    await until(() => taskNow(third.id).state === 'working');
    expect(events.some((event) => event.type === 'run.finished')).toBe(false);
    // A new agent terminal appears: the last one starts on it.
    const fresh = agent('fresh');
    await until(() => taskNow(fourth.id).state === 'working');
    expect(taskNow(fourth.id).sessionId).toBe(fresh.id);
  });
});

describe('rules', () => {
  const rulesNow = () => activity.entries.filter((entry) => entry.caller === 'rule').map((entry) => [entry.action, entry.route, entry.status, entry.outcome]);

  it('are the owner\'s: a rule fires once for one event, notifies only the open page, and every firing is written down', async () => {
    const one = agent('one');
    expect((await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'explode' } })).status).toBe(400);
    const made = await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'notify' } });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.rules.map((r: { says: string }) => r.says)).toEqual(['When a task is done, notify me in the open page.']);
    expect(made.body.actions.map((a: { kind: string }) => a.kind)).toEqual(['notify', 'run-element']);
    const task = await add('Ship it');
    await startNext();
    expect(notified).toEqual([]);
    await finish(one);
    await until(() => notified.length > 0);
    expect(notified).toEqual(['The task “Ship it” is done']);
    await until(() => rulesNow().length > 0);
    expect(rulesNow()).toEqual([['rule.notify', 'task.done', 200, 'ok']]);
    // Nothing else that happens to the same task fires it again: looked at, put away.
    await asOwner('POST', `/v1/tasks/${task.id}/clear`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(notified).toHaveLength(1);
    // Nothing of the task is in the record of the firing.
    expect(JSON.stringify(activity.entries)).not.toContain('Ship it');
    // Removed: it fires no more.
    expect((await asOwner('DELETE', `/v1/rules/${made.body.rules[0].id}`)).status).toBe(204);
    await add('Again');
    await startNext();
    await finish(one);
    await until(() => queueNow().tasks.some((t) => t.title === 'Again' && t.state === 'done'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(notified).toHaveLength(1);
  });

  it('are bounded in rate: what comes too fast is dropped, and that is written down too', async () => {
    await asOwner('POST', '/v1/rules', { event: 'ask.added', action: { kind: 'notify' } });
    for (let n = 0; n < RULE_RATE_PER_MINUTE + 3; n += 1) await asOwner('POST', '/v1/asks', { text: `Thing ${n}` });
    await until(() => rulesNow().length === RULE_RATE_PER_MINUTE + 3);
    expect(notified).toHaveLength(RULE_RATE_PER_MINUTE);
    expect(rulesNow().filter(([, , status]) => status === 429)).toHaveLength(3);
    expect(rulesNow().filter(([, , , outcome]) => outcome === 'limited')).toHaveLength(3);
  });

  it('cannot set themselves off: what comes about because of a run a rule started fires no rule', async () => {
    const helper = agent('helper');
    const element = await asOwner('POST', '/v1/elements', { name: 'Tell the calendar', instructions: 'Put this in the calendar: {{task}}' });
    expect(element.status, JSON.stringify(element.body)).toBe(201);
    // When something is asked of the owner, an element runs on the helper. And the helper, doing it, asks something.
    const made = await asOwner('POST', '/v1/rules', { event: 'ask.added', action: { kind: 'run-element', elementId: element.body.id, on: { kind: 'session', sessionId: helper.id } } });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.rules[0].says).toBe('When something is asked of you, run “Tell the calendar” on “helper”.');
    expect((await asOwner('POST', '/v1/rules', { event: 'ask.added', action: { kind: 'run-element', elementId: newId(), on: { kind: 'session', sessionId: helper.id } } })).status).toBe(400);

    await asOwner('POST', '/v1/asks', { text: 'Book the room' });
    await until(() => hub.state.runs.length === 1);
    const run = hub.state.runs[0]!;
    expect(run.sessionId).toBe(helper.id);
    expect(run.inputs.task).toBe('You wrote: Book the room');
    expect(queueNow().ruleRuns).toEqual([run.id]);
    expect(typed).toEqual([[helper.id, KICKOFF_LINE]]);
    // The agent on that run asks, and proposes: marked by the server as coming from a rule's run, whatever it says itself.
    const asked = await asSession(helper, 'POST', `/v1/sessions/${helper.id}/asks`, { text: 'Which room?' });
    expect(asked.body.source).toEqual({ kind: 'api', viaRule: true });
    const proposed = await asSession(helper, 'POST', `/v1/sessions/${helper.id}/tasks`, { title: 'Book it' });
    expect(proposed.body.source).toEqual({ kind: 'api', viaRule: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    // No second run, no second firing.
    expect(hub.state.runs).toHaveLength(1);
    expect(rulesNow()).toEqual([['rule.run-element', 'ask.added', 200, 'ok']]);
    // A program cannot take the mark off, or put it on.
    const program = await makeToken('ci', ['read', 'tasks:write']);
    expect((await call(program, 'POST', '/v1/asks', { text: 'x', source: { kind: 'api', viaRule: true } })).body.source).toEqual({ kind: 'api' });
    // When that run is over, the mark goes with it.
    await finish(helper);
    await until(() => queueNow().ruleRuns.length === 0);
  });
});

describe('rules that hear a terminal', () => {
  const rulesNow = () => activity.entries.filter((entry) => entry.caller === 'rule').map((entry) => [entry.action, entry.route, entry.status, entry.outcome, entry.resource.sessionId]);
  const MARKER = 'MARKER-7f3a';
  /** What its agent says of itself, through the session's own route. */
  const says = async (session: Session, state: string, message?: string): Promise<void> => {
    expect((await asSession(session, 'PUT', `/v1/sessions/${session.id}/attention`, { state, ...(message ? { message } : {}) })).status).toBe(200);
  };
  /** What the shell integration reports of a command that ended: the command line is what the terminal showed. */
  let minute = 0;
  const commandEnded = (session: Session, exit: number): void => {
    minute += 1;
    hub.emit({ type: 'session.status', sessionId: session.id, status: { ...NO_STATUS, state: 'idle', commandLine: `curl ${MARKER}`, lastExit: exit, lastFinishedAt: `2026-03-10T10:${String(minute).padStart(2, '0')}:00.000Z` } });
  };
  const sameReportAgain = (session: Session): void => hub.emit({ type: 'session.status', sessionId: session.id, status: { ...hub.state.sessions.find((s) => s.id === session.id)!.status, unread: true } });
  const quiet = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 150));
  const hearAll = async (more: object = {}): Promise<void> => {
    for (const event of ['terminal.waiting', 'terminal.finished', 'command.failed']) expect((await asOwner('POST', '/v1/rules', { event, action: { kind: 'notify' }, ...more })).status).toBe(201);
  };

  it('fire once for one happening, not again while it lasts, and again once it ended and began again; nothing a terminal showed is in what they say or in the record', async () => {
    const login = agent('Fix login');
    const tests = fakeSession('Tests');
    await hearAll();
    expect((await asOwner('GET', '/v1/rules')).body.rules.map((r: { says: string }) => r.says)).toEqual(['When a terminal starts waiting for you, notify me in the open page.', 'When an agent in a terminal finished, notify me in the open page.', 'When a command failed in a terminal, notify me in the open page.']);

    // It starts waiting: once. Still waiting, in other words: nothing more.
    await says(login, 'waiting', `Which branch? ${MARKER}`);
    await until(() => notified.length === 1);
    await says(login, 'waiting', `Well? ${MARKER}`);
    await quiet();
    expect(notified).toEqual(['The terminal “Fix login” is waiting for you']);
    // It stopped waiting and waits again: a second happening.
    await says(login, 'working');
    await says(login, 'waiting', MARKER);
    await until(() => notified.length === 2);
    expect(notified[1]).toBe('The terminal “Fix login” is waiting for you');

    // Its agent finishes: once, however often it says so; and again after it worked again.
    await says(login, 'done', `All green. ${MARKER}`);
    await until(() => notified.length === 3);
    await says(login, 'done', `Still green. ${MARKER}`);
    await quiet();
    expect(notified.slice(2)).toEqual(['The terminal “Fix login” finished']);
    await says(login, 'working');
    await says(login, 'done');
    await until(() => notified.length === 4);
    expect(notified[3]).toBe('The terminal “Fix login” finished');

    // A command that ends well is nothing. One that fails is told once, whatever is reported of that prompt afterwards; the next failure is another.
    commandEnded(tests, 0);
    await quiet();
    expect(notified).toHaveLength(4);
    commandEnded(tests, 2);
    await until(() => notified.length === 5);
    sameReportAgain(tests);
    sameReportAgain(tests);
    await quiet();
    expect(notified.slice(4)).toEqual(['A command failed in the terminal “Tests”']);
    commandEnded(tests, 1);
    await until(() => notified.length === 6);

    // The record of each firing: the rule, the event, the terminal, how it ended.
    await until(() => rulesNow().length === 6);
    expect(rulesNow()).toEqual([
      ['rule.notify', 'terminal.waiting', 200, 'ok', login.id],
      ['rule.notify', 'terminal.waiting', 200, 'ok', login.id],
      ['rule.notify', 'terminal.finished', 200, 'ok', login.id],
      ['rule.notify', 'terminal.finished', 200, 'ok', login.id],
      ['rule.notify', 'command.failed', 200, 'ok', tests.id],
      ['rule.notify', 'command.failed', 200, 'ok', tests.id],
    ]);
    // Nothing the terminals showed: not the command that failed, not what the agent said, not an exit code.
    expect(JSON.stringify([notified, activity.entries])).not.toContain(MARKER);
    expect(JSON.stringify([notified, activity.entries])).not.toContain('curl');
    expect(JSON.stringify(activity.entries)).not.toContain('Fix login');
    expect(notified.join(' ')).not.toMatch(/exit|\d/);
  });

  it('make no difference of people only, and a step they run is told the same fixed words on the terminal the rule names', async () => {
    const closed = agent('Closed', { peopleOnly: true });
    const helper = agent('helper');
    const element = await asOwner('POST', '/v1/elements', { name: 'Look into it', instructions: 'Look into this: {{task}}' });
    expect((await asOwner('POST', '/v1/rules', { event: 'command.failed', action: { kind: 'run-element', elementId: element.body.id, on: { kind: 'session', sessionId: helper.id } } })).body.rules[0].says).toBe('When a command failed in a terminal, run “Look into it” on “helper”.');
    commandEnded(closed, 3);
    await until(() => hub.state.runs.length === 1);
    // On the terminal the rule names, never on the one that was heard; and told that a command failed, not which.
    expect(hub.state.runs[0]).toMatchObject({ sessionId: helper.id, inputs: { task: 'A command failed in the terminal “Closed”' } });
    expect(typed).toEqual([[helper.id, KICKOFF_LINE]]);
    expect(JSON.stringify([hub.state.runs, hub.state.queue, activity.entries])).not.toContain(MARKER);
  });

  it('cannot set themselves off: a terminal on a run a rule started is not heard, nor afterwards until it was given something new', async () => {
    const helper = agent('helper');
    const other = agent('other');
    const element = await asOwner('POST', '/v1/elements', { name: 'Tell the calendar', instructions: 'Put this in the calendar: {{task}}' });
    // Whenever any agent finishes, a step runs on the helper. The helper finishing must not start it again.
    await asOwner('POST', '/v1/rules', { event: 'terminal.finished', action: { kind: 'run-element', elementId: element.body.id, on: { kind: 'session', sessionId: helper.id } } });
    await hearAll();
    await says(other, 'done');
    await until(() => hub.state.runs.length === 1);
    const run = hub.state.runs[0]!;
    await until(() => queueNow().ruleRuns.includes(run.id) && notified.length === 1);
    expect(notified).toEqual(['The terminal “other” finished']);
    await until(() => rulesNow().length === 2);

    // On that run the helper asks, has a command fail, and says it finished: none of it is heard.
    await says(helper, 'working');
    await says(helper, 'waiting', 'May I?');
    await says(helper, 'working');
    commandEnded(helper, 1);
    await says(helper, 'done');
    await quiet();
    expect(notified).toHaveLength(1);
    expect(hub.state.runs.map((r) => r.id)).toEqual([run.id]);

    // The run is over and the mark gone. The agent then ends its turn: still because of that run, still not heard.
    await says(helper, 'working');
    await finish(helper);
    await until(() => queueNow().ruleRuns.length === 0 && hub.state.runs.length === 0);
    await says(helper, 'done');
    await says(helper, 'waiting', 'Anything else?');
    commandEnded(helper, 1);
    await says(helper, 'done');
    await quiet();
    expect(notified).toHaveLength(1);
    expect(hub.state.runs).toEqual([]);
    expect(rulesNow()).toHaveLength(2);

    // It is given something new (it no longer waits or says finished): from now on it is heard like any other.
    await says(helper, 'working');
    await says(helper, 'waiting', 'Which room?');
    await until(() => notified.length === 2);
    expect(notified[1]).toBe('The terminal “helper” is waiting for you');
  });

  it('are per project: a rule hears the terminals of its own project, and an archived project says nothing', async () => {
    const mine = agent('mine');
    const made = await asOwner('POST', '/v1/projects', { name: 'Second' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const second = made.body.id as string;
    const canvasId = hub.state.canvases.find((c) => c.projectId === second)!.id;
    const theirs: Session = { ...mine, id: newId(), name: 'theirs', projectId: second };
    hub.emit({ type: 'session.created', session: theirs, canvasId, node: { id: newId(), sessionId: theirs.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
    // The first project's rules hear nothing of the second's terminal.
    await hearAll();
    await says(theirs, 'waiting', 'Hello?');
    await says(theirs, 'done');
    commandEnded(theirs, 1);
    await quiet();
    expect(notified).toEqual([]);
    expect(rulesNow()).toEqual([]);
    // The second project's own rule hears it, and not the first's terminal.
    expect((await asOwner('POST', '/v1/rules', { projectId: second, event: 'terminal.waiting', action: { kind: 'notify' } })).status).toBe(201);
    await says(theirs, 'waiting', 'Hello?');
    await until(() => notified.length === 1);
    await says(mine, 'waiting');
    await until(() => notified.length === 2);
    await until(() => rulesNow().length === 2);
    expect(notified).toEqual(['The terminal “theirs” is waiting for you', 'The terminal “mine” is waiting for you']);
    // Archived: its terminal may still change, and nothing is said or recorded.
    expect((await asOwner('POST', `/v1/projects/${second}/archive`, { sessions: 'park' })).body.state).toBe('archived');
    hub.emit({ type: 'session.attention', sessionId: theirs.id, attention: NO_ATTENTION });
    hub.emit({ type: 'session.attention', sessionId: theirs.id, attention: { state: 'waiting', message: null, at: new Date().toISOString() } });
    await quiet();
    expect(notified).toHaveLength(2);
    expect(rulesNow()).toHaveLength(2);
  });

  it('are bounded in rate like every rule, and a rule that is off hears nothing', async () => {
    const made = await asOwner('POST', '/v1/rules', { event: 'terminal.waiting', action: { kind: 'notify' } });
    const terminals = Array.from({ length: RULE_RATE_PER_MINUTE + 3 }, (_, n) => agent(`Agent ${String.fromCharCode(97 + n)}`));
    for (const terminal of terminals) await says(terminal, 'waiting');
    await until(() => rulesNow().length === RULE_RATE_PER_MINUTE + 3);
    expect(notified).toHaveLength(RULE_RATE_PER_MINUTE);
    expect(rulesNow().filter(([, , status, outcome]) => status === 429 && outcome === 'limited')).toHaveLength(3);
    // Switched off, it is kept and hears nothing.
    await asOwner('PATCH', `/v1/rules/${made.body.rules[0].id}`, { on: false });
    await says(terminals[0]!, 'working');
    await says(terminals[0]!, 'waiting');
    await quiet();
    expect(rulesNow()).toHaveLength(RULE_RATE_PER_MINUTE + 3);
  });

  it('do not take a terminal that already waits when the server starts for one that starts to wait', async () => {
    const one = agent('one');
    await hearAll();
    await says(one, 'waiting');
    commandEnded(one, 1);
    await until(() => notified.length === 2);
    await stop();
    await start();
    // The same state is reported again after the start: no happening.
    hub.emit({ type: 'session.attention', sessionId: one.id, attention: hub.state.sessions.find((s) => s.id === one.id)!.attention });
    sameReportAgain(one);
    await quiet();
    expect(notified).toHaveLength(2);
  });
});

describe('the owner\'s list', () => {
  it('gathers one of every kind, the count of terminals that wait is the toolbar\'s, and a token that reads sees it and nothing it could not already read', async () => {
    // A terminal with a question, one that finished, one with a blocked run, one whose run waits for approval.
    const asks = agent('asks');
    await asSession(asks, 'PUT', `/v1/sessions/${asks.id}/attention`, { state: 'waiting', message: 'May I delete the old logs?' });
    const finished = agent('finished');
    await asSession(finished, 'PUT', `/v1/sessions/${finished.id}/attention`, { state: 'done' });
    const blocked = agent('blocked');
    const flow = await asOwner('POST', '/v1/workflows', { name: 'Careful', elements: [{ id: 'do', name: 'Do', instructions: 'Do {{task}}.', produces: 'checklist' }, { id: 'look', kind: 'approval', name: 'Look', ask: 'Fine?' }, { id: 'end', name: 'End', instructions: 'End.' }] });
    await asOwner('POST', '/v1/runs', { workflowId: flow.body.id, sessionId: blocked.id, inputs: { task: 'x' } });
    await asSession(blocked, 'POST', `/v1/sessions/${blocked.id}/run/report`, { type: 'blocked', reason: 'No access.' });
    const approves = agent('approves');
    await asOwner('POST', '/v1/runs', { workflowId: flow.body.id, sessionId: approves.id, inputs: { task: 'y' } });
    // It hands in a list on the way, and then waits for approval.
    await asSession(approves, 'POST', `/v1/sessions/${approves.id}/run/report`, { type: 'done', output: { items: [{ text: 'Rename the flag' }, { text: 'Remove the old test' }] } });
    // A draft, a proposal, something asked, a task that is done and one that failed, a working copy whose terminal is gone.
    const writer = agent('writer');
    await asSession(writer, 'POST', `/v1/sessions/${writer.id}/drafts`, { element: { name: 'A drafted step', instructions: 'Do it.' } });
    await asSession(writer, 'POST', `/v1/sessions/${writer.id}/tasks`, { title: 'A proposed task' });
    await asSession(writer, 'POST', `/v1/sessions/${writer.id}/asks`, { text: 'Renew the certificate' });
    const done = await add('Done task', { taker: { kind: 'session', sessionId: writer.id } });
    await startNext(done.id);
    await finish(writer);
    await until(() => taskNow(done.id).state === 'done');
    const failed = await add('Failed task', { taker: { kind: 'session', sessionId: writer.id } });
    await startNext(failed.id);
    await asOwner('POST', `/v1/runs/${taskNow(failed.id).runId}/report`, { type: 'stop' });
    await until(() => taskNow(failed.id).state === 'failed');
    hub.emit({ type: 'environment.changed', environment: { id: newId(), projectId: hub.state.projects[0]!.id, kind: 'working-copy', title: 'In its own working copy', words: 'Kept apart.', sessionId: null, sessionName: 'gone', projectFolder: '/home/someone/project', folder: '/home/someone/data/copies/gone-0a1b2c', startFolder: '/home/someone/data/copies/gone-0a1b2c', branch: 'aubergine/gone-0a1b2c', startCommit: 'a'.repeat(40), createdAt: new Date().toISOString(), changes: null, broken: null } });

    const list = await forYouNow();
    expect(list.items.map((item) => item.kind)).toEqual(['approval', 'blocked', 'question', 'proposal', 'ask', 'task-failed', 'task-done', 'draft', 'checklist', 'finished', 'finished', 'copy']);
    const of = (kind: string) => list.items.find((item) => item.kind === kind)!;
    expect(of('approval')).toMatchObject({ from: 'approves', waits: true, written: false, act: expect.stringMatching(/^run:/) });
    expect(of('blocked').sentence).toBe('blocked: No access.');
    // The sentence stands by itself; the row has who and what apart, and the one thing to do with it from its kind.
    expect(of('question')).toMatchObject({ sentence: 'asks: May I delete the old logs?', who: 'asks', what: 'May I delete the old logs?', action: 'Go to terminal', act: `session:${asks.id}` });
    expect(of('checklist')).toMatchObject({ sentence: 'approves handed in a list (Do, Careful): 2 of 2 left to tick.', who: 'approves', what: 'Careful, Do: 2 of 2 left to tick', action: 'Open list', from: 'approves', elementId: 'do' });
    expect(of('copy').sentence).toContain('The terminal of “gone” is gone');
    expect(of('ask')).toMatchObject({ written: true, sentence: 'Renew the certificate' });
    // Only what was written is ticked off; everything else goes when the thing is done.
    expect(list.items.filter((item) => item.written).map((item) => item.kind)).toEqual(['ask']);

    // One source of truth: the terminals that wait are the waiting queue, and the count is its length.
    const queue = sessionsWaiting(hub.state.sessions, hub.state.runs);
    expect(list.waiting).toBe(queue.length);
    expect(list.items.filter((item) => item.waits).map((item) => item.sessionId).sort()).toEqual(queue.map((w) => w.session.id).sort());
    // The terminal whose task finished says so itself as well, as any terminal whose run finishes does.
    expect(queue.map((w) => w.session.name).sort()).toEqual(['approves', 'asks', 'blocked', 'finished', 'writer']);

    // A token that reads gets the same list. Whatever in it names a terminal, a run or a working copy is something it reads elsewhere too.
    const reader = await makeToken('reader', ['read']);
    const theirs = await call(reader, 'GET', '/v1/for-you');
    expect(theirs.status).toBe(200);
    expect(theirs.body.items).toEqual(list.items);
    const elsewhere = JSON.stringify([(await call(reader, 'GET', '/v1/sessions')).body, (await call(reader, 'GET', '/v1/runs')).body, (await call(reader, 'GET', '/v1/environments')).body, (await call(reader, 'GET', '/v1/drafts')).body, (await call(reader, 'GET', '/v1/tasks')).body]);
    for (const item of list.items) for (const id of [item.sessionId, item.runId, item.environmentId, item.taskId]) if (id) expect(elsewhere, `${item.kind} ${id}`).toContain(id);
    expect((await call(await makeToken('adder', ['tasks:write']), 'GET', '/v1/for-you')).status).toBe(403);

    // Approved: the item goes by itself, and the terminal no longer waits.
    await asOwner('POST', `/v1/runs/${of('approval').runId}/approve`, {});
    expect((await forYouNow()).items.map((item) => item.kind)).not.toContain('approval');
  });

  it('survives a restart with its tasks, what was asked, its rules and how it starts', async () => {
    const one = agent('one');
    await asOwner('PUT', '/v1/queue', { limit: 5, hold: true });
    await asOwner('PUT', '/v1/queue', { hold: false });
    const task = await add('Lasting');
    await startNext();
    await asOwner('POST', '/v1/asks', { text: 'Still here' });
    await asOwner('POST', '/v1/rules', { event: 'task.failed', action: { kind: 'notify' } });
    const before = JSON.stringify(queueNow());
    await stop();
    // The file says version 15.
    expect(JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8')).version).toBe(15);
    await start();
    expect(JSON.stringify(queueNow())).toBe(before);
    expect(taskNow(task.id)).toMatchObject({ state: 'working', sessionId: one.id });
    await finish(one);
    await until(() => taskNow(task.id).state === 'done');
  });
});

describe('the commands', () => {
  /** A command as typed: by the owner outside any terminal of a canvas, or inside one, with that terminal's own credential. */
  const typed_ = async (command: QueueCommand, inside?: Session): Promise<{ code: number; out: string }> => {
    const printed: string[] = [];
    const clientOrigin = `http://127.0.0.1:${port}`;
    const owner = createClient({ baseUrl: clientOrigin, headers: { origin: clientOrigin, cookie: `${cookieName(port)}=${ownerToken}` } });
    const env = inside ? { [SESSION_ENV.url]: clientOrigin, [SESSION_ENV.sessionId]: inside.id, [SESSION_ENV.token]: sessionToken(ownerToken, inside.id) } : {};
    const code = await runQueueCommand(command, { owner: (work) => work(owner), env, print: (text) => printed.push(text) });
    return { code, out: printed.join('\n') };
  };
  const task = (words: string[], inside?: Session) => typed_(parseTaskCommand(words), inside);

  it('add, list, start, move and decide as the owner; inside a canvas terminal a task is a proposal, asking is asking, and what only the owner decides does nothing', async () => {
    const one = agent('one');
    expect((await task(['add', 'Fix the retry', '--details', 'It gives up too early.', '--label', 'api'])).out).toContain('Added “Fix the retry” to the queue.');
    await task(['add', 'Second', '--to', 'one']);
    await task(['add', 'Third']);
    expect(queueNow().tasks.map((t) => [t.title, t.state, t.taker.kind, t.labels])).toEqual([['Fix the retry', 'queued', 'any', ['api']], ['Second', 'queued', 'session', []], ['Third', 'queued', 'any', []]]);
    expect((await task(['move', 'Third', '--first'])).code).toBe(0);
    expect((await task(['move', 'Fix the retry', '--before', 'Third'])).code).toBe(0);
    const list = await task(['list']);
    expect(list.out).toContain('0 working, 3 next. At most 3 at once; nothing starts by itself.');
    expect(list.out.indexOf('Fix the retry')).toBeLessThan(list.out.indexOf('Third'));
    expect(list.out.indexOf('Third')).toBeLessThan(list.out.indexOf('Second'));
    expect((await task(['show', 'Fix the retry'])).out).toContain('added by you, written by hand');
    expect((await task(['start'])).out).toBe('Started “Fix the retry”.');
    expect(typed).toEqual([[one.id, KICKOFF_LINE]]);

    // Inside a canvas terminal.
    const worker = agent('worker');
    const proposed = await task(['add', 'Proposed here', '--details', 'why', '--to', 'one'], worker);
    expect(proposed.out).toContain('Where a task runs, by which workflow and who takes it are for your owner to say');
    expect(proposed.out).toContain("It waits for your owner's yes and starts nothing until then.");
    expect(queueNow().tasks.find((t) => t.title === 'Proposed here')).toMatchObject({ state: 'proposed', taker: { kind: 'any' }, addedBy: { kind: 'agent', name: 'worker' } });
    expect((await typed_(parseAskCommand(['Which', 'region?']), worker)).out).toContain("It is on your owner's list, and it is not done until they act.");
    expect(queueNow().asks.map((a) => [a.text, a.addedBy.name])).toEqual([['Which region?', 'worker']]);
    const mine = await task(['list'], worker);
    expect(mine.out).toContain('Proposed here  (proposed by you)');
    expect((await typed_(parseTodoCommand([]), worker)).out).toContain('Which region?');
    // What only the owner decides: said, and nothing done.
    const before = JSON.stringify(queueNow());
    for (const command of [parseTaskCommand(['accept', 'Proposed here']), parseTaskCommand(['decline', 'Proposed here']), parseTaskCommand(['start']), parseTaskCommand(['move', 'Third', '--last']), parseTaskCommand(['clear', 'x']), parseTodoCommand(['done', 'Which']), parseRuleCommand(['add', '--when', 'task.done', '--notify']), parseRuleCommand(['list']), parseRuleCommand(['remove', '1'])]) {
      const answer = await typed_(command, worker);
      expect(answer.code, JSON.stringify(command)).toBe(1);
      expect(answer.out).toContain('This command does nothing inside a canvas terminal');
    }
    expect(JSON.stringify(queueNow())).toBe(before);
    await expect(typed_(parseAskCommand(['x']))).rejects.toThrow(/only works inside an Aubergine session/);

    // The owner's side of it.
    expect((await typed_(parseTodoCommand([]))).out).toContain('Asked of you: Which region?');
    expect((await task(['accept', 'Proposed here'])).out).toBe('“Proposed here”: It waits to be started.');
    expect((await typed_(parseTodoCommand(['done', 'Which region?']))).out).toBe('Done: Which region?');
    expect((await typed_(parseTodoCommand(['add', 'Renew the certificate']))).out).toBe('Written on your list.');
    expect((await typed_(parseRuleCommand(['add', '--when', 'task.done', '--notify']))).out).toContain('Written: When a task is done, notify me in the open page.');
    expect((await typed_(parseRuleCommand(['list']))).out).toContain('1. When a task is done, notify me in the open page.');
    expect((await typed_(parseRuleCommand(['remove', '1']))).out).toBe('Removed.');
    expect(queueNow().rules).toEqual([]);
    expect(() => parseRuleCommand(['add', '--when', 'task.done'])).toThrow(/needs what to do/);
    expect(() => parseRuleCommand(['add', '--when', 'task.done', '--run', 'x'])).toThrow(/needs where/);
    // A wrong option, a wrong event, a stray word: each answer gives the right form and one that works.
    for (const wrong of [['add', '--when', 'task.done', '--notfy'], ['add', '--when', 'task.finished', '--notify'], ['add', '--notify'], ['add', '--when', 'task.done', '--notify', 'please'], ['add', '--on', 'task.done', '--notify']]) {
      expect(() => parseRuleCommand(wrong), wrong.join(' ')).toThrow(/The form is:\n {2}aubergine rule add --when <event> \(--notify \| --run <shelf element> \(--on <terminal> \| --new <canvas>\)\)\nwhere <event> is one of: task\.done, .*\nFor example:\n {2}aubergine rule add --when task\.done --notify$/s);
    }
    expect(() => parseRuleCommand(['add', '--when', 'task.done', '--notfy'])).toThrow(/^rule add does not know --notfy\./);
    expect(USAGE).toContain('For example: aubergine rule add --when task.done --notify');
    expect(() => parseTaskCommand(['add'])).toThrow(/needs a title/);
    expect(() => parseTaskCommand(['move', 'x'])).toThrow(/where to/);
  });
});
