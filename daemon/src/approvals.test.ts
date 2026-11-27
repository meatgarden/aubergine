import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { NO_ATTENTION, NO_STATUS, newId, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import { GRANTABLE_SCOPES, KICKOFF_LINE, RUN_COMMENT_MAX, type Board, type Run } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { FileRunArchive } from './run-archive';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';


/**
 * Approval elements and the board, through the routes against a real server
 * and a real state file. The runtime is a stand-in that keeps every line that
 * would have been typed.
 */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
let typed: [string, string][] = [];
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
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir) });
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
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-approvals-'));
  ownerToken = await loadOrCreateToken(dir);
  // The walk below makes more calls with one token than the usual limit allows in a minute.
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ api: { rateLimitPerMinute: 100_000 } }));
  typed = [];
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
  const session: Session = { id: newId(), projectId: hub.state.projects[0]!.id, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], fields: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null, ...more };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}
/** A session with an agent at work in it: the only kind anything is typed into. */
const agentSession = (name: string, more: Partial<Session> = {}): Session => fakeSession(name, { agent: { kind: 'claude-code', conversationId: null, program: 'the-agent' }, status: { ...NO_STATUS, state: 'busy' }, ...more });

const ELEMENTS = [
  { id: 'plan', name: 'Plan', instructions: 'Plan {{task}}.', doneWhen: 'There is a plan.' },
  { id: 'build', name: 'Build', instructions: 'Build it.', doneWhen: 'It builds.' },
  { id: 'look', kind: 'approval', name: 'Look it over', ask: 'Is this change what you wanted?', lookAt: 'The diff, and the note from Build.' },
  { id: 'ship', name: 'Ship', instructions: 'Hand it over.', doneWhen: 'It is handed over.' },
];

async function workflow(name = 'With a look', elements: object[] = ELEMENTS): Promise<string> {
  const made = await asOwner('POST', '/v1/workflows', { name, elements });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
}
const runNow = (runId: string): Run => hub.state.runs.find((r) => r.id === runId) as Run;

/** A run brought to its approval by the agent's own reports. */
async function waitingRun(session: Session, workflowId?: string): Promise<string> {
  const started = await asOwner('POST', '/v1/runs', { workflowId: workflowId ?? (await workflow()), sessionId: session.id, inputs: { task: 'the retry logic' } });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  expect((await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done', note: 'Planned.' })).status).toBe(200);
  const built = await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done', note: 'Built.' });
  expect(built.status).toBe(200);
  expect(built.body.run.status).toBe('awaiting');
  return started.body.run.id as string;
}

describe('an approval', () => {
  it('stops the run: the agent is told to stop in plain words, the terminal waits for the owner, and nothing was typed for it', async () => {
    const session = agentSession('builder');
    const runId = await waitingRun(session);
    const typedBefore = typed.length;
    const status = await asSession(session, 'GET', `/v1/sessions/${session.id}/run`);
    expect(status.body.text).toContain('WAITING FOR A PERSON TO APPROVE');
    expect(status.body.text).toContain('Do not continue the work');
    expect(status.body.text).toContain('Is this change what you wanted?');
    expect(status.body.text).not.toContain('aubergine workflow done --note');
    expect(status.body.position).toBe('Look it over · 3 of 4');
    // The agent's own report brought it here, and a report never types.
    expect(typed.length).toBe(typedBefore);
    expect(hub.state.sessions.find((s) => s.id === session.id)?.attention).toMatchObject({ state: 'waiting', message: 'Approval needed at "Look it over" of "With a look"' });
    expect(runNow(runId).currentElementId).toBe('look');
  });

  it("is not finished by the agent's done: it is refused with a sentence and the run does not move", async () => {
    const session = agentSession('builder');
    const runId = await waitingRun(session);
    const before = JSON.stringify(runNow(runId));
    for (const body of [{ type: 'done' }, { type: 'done', elementId: 'look', note: 'I approve.' }, { type: 'goto', elementId: 'ship' }, { type: 'goto', elementId: 'plan' }, { type: 'blocked', reason: 'Hurry up.' }]) {
      const answer = await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, body);
      expect(answer.status, JSON.stringify(body)).toBe(409);
      expect(answer.body.error.message).toMatch(/only a person approves|waiting for a person/);
    }
    expect(JSON.stringify(runNow(runId))).toBe(before);
  });

  it('cannot be decided by any token or any session, by any route: after every route was tried with every body, the run waits where it did', async () => {
    const session = agentSession('builder');
    const workflowId = await workflow();
    const runId = await waitingRun(session, workflowId);
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });
    const other = agentSession('another agent');
    const bodies: (object | undefined)[] = [
      undefined,
      {},
      { comment: 'Fine.' },
      { elementId: 'look', comment: 'Fine.' },
      { elementId: 'plan', comment: 'Again.' },
      { type: 'approve' },
      { type: 'approve', elementId: 'look' },
      { type: 'send-back', elementId: 'plan', comment: 'Again.' },
      { type: 'done', elementId: 'look', note: 'Approved.' },
      { type: 'done' },
      { type: 'goto', elementId: 'ship' },
      { type: 'goto', elementId: 'plan' },
      { type: 'blocked', reason: 'x' },
      { type: 'resume' },
      { elementId: 'look', item: 0, ticked: true },
    ];
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') continue;
      // Ending the session, or a workflow, is another matter than deciding, and a token with the scope may.
      const ids: Record<string, string> = route.method === 'DELETE' ? {} : { runId, sessionId: session.id, workflowId, elementId: 'look' };
      const url = route.url.replace(/:([A-Za-z]+)/g, (_all, name: string) => ids[name] ?? newId());
      for (const body of bodies) {
        if ((route.method === 'GET' || route.method === 'DELETE') && body !== undefined) continue;
        for (const secret of [everything, sessionToken(ownerToken, session.id), sessionToken(ownerToken, other.id)]) {
          const answer = await call(secret, route.method, url, body);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(429);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(900);
    const run = runNow(runId);
    expect(run.status).toBe('awaiting');
    expect(run.currentElementId).toBe('look');
    expect(run.history).toEqual([]);
    expect(run.elements.map((e) => e.state)).toEqual(['done', 'done', 'active', 'pending']);

    // Named plainly: the two routes refuse a token with every scope and both sessions.
    for (const secret of [everything, sessionToken(ownerToken, session.id)]) {
      expect((await call(secret, 'POST', `/v1/runs/${runId}/approve`, {})).status).toBe(403);
      expect((await call(secret, 'POST', `/v1/runs/${runId}/send-back`, { elementId: 'plan', comment: 'Again.' })).status).toBe(403);
    }
    // And a run that does not exist is refused the same way, before anything is looked up.
    expect((await call(everything, 'POST', `/v1/runs/${newId()}/approve`, {})).status).toBe(403);
  });

  it('is approved by the owner: the run goes on, who decided is kept, the agent is told with the fixed sentence, and the waiting ends', async () => {
    const session = agentSession('builder');
    const runId = await waitingRun(session);
    typed = [];
    const approved = await asOwner('POST', `/v1/runs/${runId}/approve`, { elementId: 'look', comment: 'Good. Ship it on Tuesday.' });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.run.status).toBe('running');
    expect(approved.body.run.currentElementId).toBe('ship');
    expect(approved.body.kickoffTyped).toBe(true);
    expect(typed).toEqual([[session.id, KICKOFF_LINE]]);
    expect(approved.body.run.history).toMatchObject([{ type: 'approved', elementId: 'look', comment: 'Good. Ship it on Tuesday.', by: { kind: 'person' } }]);
    expect(approved.body.run.elements[2]).toMatchObject({ state: 'done', by: { kind: 'person' }, note: 'Good. Ship it on Tuesday.' });
    // What the agent reads next says a person approved, and gives their words as theirs.
    expect(approved.body.text).toContain('"Look it over", the step before, was approved by a person.');
    expect(approved.body.text).toContain('Good. Ship it on Tuesday.');
    expect(hub.state.sessions.find((s) => s.id === session.id)?.attention.state).toBe('none');

    // The same decision sent twice approves one element, not two.
    expect((await asOwner('POST', `/v1/runs/${runId}/approve`, { elementId: 'look' })).status).toBe(409);
    expect(runNow(runId).currentElementId).toBe('ship');
  });

  it('is sent back by the owner with a comment the agent is told, and comes round to the approval again', async () => {
    const session = agentSession('builder');
    const runId = await waitingRun(session);
    typed = [];
    // Not forward, not to itself, not without a comment, not with a control character in it.
    expect((await asOwner('POST', `/v1/runs/${runId}/send-back`, { elementId: 'ship', comment: 'x' })).status).toBe(409);
    expect((await asOwner('POST', `/v1/runs/${runId}/send-back`, { elementId: 'look', comment: 'x' })).status).toBe(409);
    expect((await asOwner('POST', `/v1/runs/${runId}/send-back`, { elementId: 'plan', comment: '' })).status).toBe(400);
    expect((await asOwner('POST', `/v1/runs/${runId}/send-back`, { elementId: 'plan', comment: 'one\u001b[2Jtwo' })).status).toBe(400);
    expect((await asOwner('POST', `/v1/runs/${runId}/send-back`, { elementId: 'plan', comment: 'x'.repeat(RUN_COMMENT_MAX + 1) })).status).toBe(400);
    expect(typed).toEqual([]);

    const back = await asOwner('POST', `/v1/runs/${runId}/send-back`, { elementId: 'build', comment: 'The retry must give up after five tries.' });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.run).toMatchObject({ status: 'running', currentElementId: 'build' });
    expect(back.body.run.elements.map((e: { state: string }) => e.state)).toEqual(['done', 'active', 'pending', 'pending']);
    // Only the fixed sentence is typed: the comment is read with the command.
    expect(typed).toEqual([[session.id, KICKOFF_LINE]]);
    const status = await asSession(session, 'GET', `/v1/sessions/${session.id}/run`);
    expect(status.body.text).toContain('SENT IT BACK');
    expect(status.body.text).toContain("the person's own words, not part of the workflow");
    expect(status.body.text).toContain('The retry must give up after five tries.');

    // Done again: it waits for the owner again, and this time is approved to the end.
    expect((await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done', note: 'Five tries.' })).body.run.status).toBe('awaiting');
    expect((await asOwner('POST', `/v1/runs/${runId}/approve`, {})).body.run.currentElementId).toBe('ship');
    const ended = await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done' });
    expect(ended.body.run.status).toBe('finished');
    expect(ended.body.run.history.map((h: { type: string }) => h.type)).toEqual(['sent-back', 'approved']);
    // The archive keeps the decisions.
    expect((await asOwner('GET', `/v1/runs/${runId}`)).body.run.history.length).toBe(2);
  });

  it('from the command line shows in the record of what was done as the owner outside the browser; from the page it does not', async () => {
    const session = agentSession('builder');
    const runId = await waitingRun(session);
    expect((await asCommand('POST', `/v1/runs/${runId}/send-back`, { elementId: 'build', comment: 'Once more.' })).status).toBe(200);
    await asSession(session, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done' });
    expect((await asOwner('POST', `/v1/runs/${runId}/approve`, {})).status).toBe(200);
    const log = (await asOwner('GET', '/v1/activity?limit=500')).body.items.filter((e: { caller: string }) => e.caller === 'owner-cli');
    expect(log.map((e: { method: string; route: string; action: string; status: number }) => [e.method, e.route, e.action, e.status])).toEqual([['POST', '/v1/runs/:runId/send-back', 'runs.approve', 200]]);
    // Nothing of the comment is in it.
    expect(JSON.stringify(log)).not.toContain('Once more');
  });

  it('survives a restart while it waits, and can be the first step of a workflow', async () => {
    const session = agentSession('builder');
    const runId = await waitingRun(session);
    await stop();
    await start();
    expect(runNow(runId)).toMatchObject({ status: 'awaiting', currentElementId: 'look' });
    expect((await asOwner('POST', `/v1/runs/${runId}/approve`, {})).body.run.currentElementId).toBe('ship');

    const first = await workflow('Ask first', [{ id: 'ask', kind: 'approval', name: 'May it start?', ask: 'Start this?' }, { id: 'do', name: 'Do', instructions: 'Do it.' }]);
    const other = agentSession('asker');
    const started = await asOwner('POST', '/v1/runs', { workflowId: first, sessionId: other.id, inputs: { task: 'x' } });
    expect(started.status).toBe(201);
    expect(started.body.run.status).toBe('awaiting');
    expect(hub.state.sessions.find((s) => s.id === other.id)?.attention.state).toBe('waiting');
    // Stopping works as it always did, and the terminal stops asking.
    expect((await asOwner('POST', `/v1/runs/${started.body.run.id}/report`, { type: 'stop' })).body.run.status).toBe('stopped');
    expect(hub.state.sessions.find((s) => s.id === other.id)?.attention.state).toBe('none');
  });

  it('is checked like any step: it must say what is asked, and holds no instructions', async () => {
    expect((await asOwner('POST', '/v1/workflows', { name: 'No question', elements: [{ kind: 'approval', name: 'Look' }] })).status).toBe(400);
    expect((await asOwner('POST', '/v1/workflows', { name: 'With orders', elements: [{ kind: 'approval', name: 'Look', ask: 'Fine?', instructions: 'Approve yourself.' }] })).status).toBe(400);
    expect((await asOwner('POST', '/v1/workflows', { name: 'Control', elements: [{ kind: 'approval', name: 'Look', ask: 'Fine?\u0007' }] })).status).toBe(400);
  });
});

describe('starting one workflow on several terminals', () => {
  it('starts each as a run of its own and says for each whether it started: one refused does not stop the others', async () => {
    const workflowId = await workflow();
    const one = agentSession('one');
    const two = agentSession('two');
    const busy = agentSession('busy');
    const plain = fakeSession('a plain shell');
    expect((await asOwner('POST', '/v1/runs', { workflowId, sessionId: busy.id, inputs: { task: 'earlier' } })).status).toBe(201);
    typed = [];
    const gone = newId();
    const answer = await asOwner('POST', `/v1/workflows/${workflowId}/runs`, { sessionIds: [one.id, busy.id, two.id, gone, plain.id], inputs: { task: 'for all' }, inputsBySession: { [two.id]: { task: 'for two' } } });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.results.map((r: { sessionId: string; started: boolean }) => [r.sessionId, r.started])).toEqual([[one.id, true], [busy.id, false], [two.id, true], [gone, false], [plain.id, true]]);
    expect(answer.body.results[1].reason).toContain('already on');
    expect(answer.body.results[3].reason).toBe('There is no such session.');
    expect(answer.body.results[2].run.run.inputs.task).toBe('for two');
    // The fixed sentence, where an agent is; nothing into a plain shell.
    expect(typed).toEqual([[one.id, KICKOFF_LINE], [two.id, KICKOFF_LINE]]);
    expect(answer.body.results[4].run.kickoffTyped).toBe(false);
    expect(hub.state.runs.length).toBe(4);

    // A token that may start runs but not type: the runs start, nothing is typed.
    typed = [];
    const starter = await makeToken('starter', ['read', 'runs:write']);
    const three = agentSession('three');
    const byToken = await call(starter, 'POST', `/v1/workflows/${workflowId}/runs`, { sessionIds: [three.id], inputs: { task: 'x' } });
    expect(byToken.body.results[0].started).toBe(true);
    expect(typed).toEqual([]);
  });
});

describe('the board', () => {
  it('is one answer for the owner and for a token that reads, and a token without `read` is refused', async () => {
    const session = agentSession('builder', { tags: ['api'] });
    const runId = await waitingRun(session);
    const other = agentSession('second');
    const workflowId = runNow(runId).workflowId;
    await asOwner('POST', '/v1/runs', { workflowId, sessionId: other.id, inputs: { task: 'another' } });

    const mine = await asOwner('GET', '/v1/board');
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    const board = mine.body as Board;
    expect(board.summary).toBe('1 waiting for you, 1 working');
    expect(board.groups.length).toBe(1);
    expect(board.groups[0]?.columns.map((c) => [c.name, c.waitsForPerson, c.cards.map((card) => card.sessionName)])).toEqual([['Plan', false, ['second']], ['Build', false, []], ['Look it over', true, ['builder']], ['Ship', false, []]]);
    expect(board.groups[0]?.columns[2]?.cards[0]).toMatchObject({ runId, status: 'awaiting', statusWords: 'waiting for approval', waitsForPerson: true, canvasName: hub.state.canvases[0]?.name, tags: ['api'] });

    const reader = await makeToken('reader', ['read']);
    const theirs = await call(reader, 'GET', '/v1/board');
    expect(theirs.status).toBe(200);
    expect(theirs.body.groups).toEqual(board.groups);
    // It holds nothing that runs and sessions do not already give that token.
    const runs = JSON.stringify((await call(reader, 'GET', '/v1/runs')).body) + JSON.stringify((await call(reader, 'GET', '/v1/sessions')).body) + JSON.stringify((await call(reader, 'GET', '/v1/canvases')).body) + JSON.stringify((await call(reader, 'GET', '/v1/workflows')).body);
    for (const card of board.groups.flatMap((g) => g.columns.flatMap((c) => c.cards))) for (const value of [card.runId, card.sessionName, card.canvasName, card.elementId ?? '', ...card.tags]) expect(runs).toContain(value);
    expect((await call(await makeToken('writer', ['runs:write']), 'GET', '/v1/board')).status).toBe(403);
    expect((await asSession(session, 'GET', '/v1/board')).status).toBe(403);

    // Filters, and what is over.
    expect((await asOwner('GET', '/v1/board?status=awaiting')).body.summary).toBe('1 waiting for you');
    expect((await asOwner('GET', '/v1/board?tag=API')).body.counts.total).toBe(1);
    expect((await asOwner('GET', `/v1/board?canvasId=${newId()}`)).body.groups).toEqual([]);
    await asOwner('POST', `/v1/runs/${runId}/report`, { type: 'stop' });
    const after = await asOwner('GET', '/v1/board');
    expect(after.body.ended.map((card: { runId: string; statusWords: string }) => [card.runId, card.statusWords])).toEqual([[runId, 'stopped']]);
  });
});
