import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  GRANTABLE_SCOPES,
  NO_ATTENTION,
  NO_STATUS,
  RunDetail,
  RunList,
  WorkflowDetail,
  kickoffLine,
  newId,
  paths,
  previewRun,
  type ArchivedRun,
  type ChangeEvent,
  type Scope,
  type Session,
} from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { FileRunArchive, RUN_ARCHIVE_FILE } from './run-archive';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * Workflows and runs through the routes, against a real server and a real
 * state file. No shell is needed for any of it: the sessions here are records
 * the test makes, and the runtime is a stand-in that notes what would have
 * been typed.
 */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let origin: string;
/** What the server typed into terminals: [session, line]. */
let typed: [string, string][] = [];
let events: ChangeEvent[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  typeLine: async (id: string, line: string) => {
    typed.push([id, line]);
  },
} as unknown as SessionRuntime;

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  events = [];
  hub.subscribe((event) => events.push(event));
  const settings = new SettingsFile(dir);
  await settings.reload();
  sessions = new Sessions(hub, runtime, {});
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: path.join(dir, 'no-web-build'),
    runArchive: new FileRunArchive(dir),
    version: '9.8.7',
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}

async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-workflows-'));
  ownerToken = await loadOrCreateToken(dir);
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
/** The way the page calls: the cookie and the page's own Origin. */
const asOwner = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer> =>
  send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, ...headers }, method, url, body);
/** The way a program calls: a bearer credential and nothing else. */
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);

async function makeToken(name: string, scopes: Scope[]): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, reviewWorkflowChanges: false });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}

/** A session as a record only: enough for everything a run needs of one. */
function fakeSession(name: string, more: Partial<Session> = {}): Session {
  const session: Session = {
    id: newId(),
    projectId: hub.state.project.id,
    name,
    createdAt: new Date().toISOString(),
    state: 'open',
    cwd: null,
    command: null,
    note: '',
    status: NO_STATUS,
    attention: NO_ATTENTION,
    noteLog: [],
    agent: null,
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
    parkedFrom: null,
    ...more,
  };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}

const THREE = {
  name: 'Three steps',
  standing: 'Keep it small.',
  elements: [
    { name: 'Plan', instructions: 'Plan {{task}}.', doneWhen: 'There is a plan.' },
    { name: 'Build', instructions: 'Build it.', doneWhen: 'It builds.' },
    { name: 'Check', instructions: 'Check it.', doneWhen: 'Checks pass.' },
  ],
};

async function makeWorkflow(body: object = THREE): Promise<WorkflowDetail> {
  const made = await asOwner('POST', '/v1/workflows', body);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return WorkflowDetail.parse(made.body);
}

async function startRun(workflowId: string, sessionId: string, more: object = {}): Promise<RunDetail> {
  const started = await asOwner('POST', `/v1/sessions/${sessionId}/runs`, { workflowId, inputs: { task: 'the login bug' }, ...more });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  return RunDetail.parse(started.body);
}

const ownReport = (session: Session, body: object): Promise<Answer> => call(sessionToken(ownerToken, session.id), 'POST', `/v1/sessions/${session.id}/run/report`, body);

describe('workflows', () => {
  it('are created, read, listed, copied and removed', async () => {
    const made = await makeWorkflow();
    expect(made).toMatchObject({ name: 'Three steps', version: 1, elements: ['Plan', 'Build', 'Check'], origin: { kind: 'local' } });
    // Elements were given IDs from their names, and one input, the task.
    expect(made.current.elements.map((e) => e.id)).toEqual(['plan', 'build', 'check']);
    expect(made.current.inputs.map((i) => i.key)).toEqual(['task']);

    expect((await asOwner('GET', `/v1/workflows/${made.id}`)).body).toEqual(made);
    const copy = await asOwner('POST', `/v1/workflows/${made.id}/copy`);
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ name: 'Three steps copy', version: 1 });
    expect(copy.body.id).not.toBe(made.id);
    expect(copy.body.current.elements).toEqual(made.current.elements);

    const list = await asOwner('GET', '/v1/workflows');
    expect(list.body.items.map((w: { name: string }) => w.name)).toEqual(['Three steps', 'Three steps copy']);
    // A list does not carry the text.
    expect(list.body.items[0]).not.toHaveProperty('current');

    expect((await asOwner('DELETE', `/v1/workflows/${copy.body.id}`)).status).toBe(204);
    expect((await asOwner('GET', `/v1/workflows/${copy.body.id}`)).status).toBe(404);
    expect((await asOwner('GET', '/v1/workflows')).body.items).toHaveLength(1);
  });

  it('makes nothing more when a create is repeated with the same key', async () => {
    const first = await asOwner('POST', '/v1/workflows', THREE, { 'idempotency-key': 'once' });
    const second = await asOwner('POST', '/v1/workflows', THREE, { 'idempotency-key': 'once' });
    expect(second.body.id).toBe(first.body.id);
    expect(hub.state.workflows).toHaveLength(1);
  });

  it('saves a change as a new version, and leaves the old ones as they were', async () => {
    const made = await makeWorkflow();
    const elements = made.current.elements.map((e) => (e.id === 'build' ? { ...e, instructions: 'Build it, with tests.' } : e));
    const changed = await asOwner('PATCH', `/v1/workflows/${made.id}`, { elements: [...elements, { name: 'Tidy up', instructions: 'Remove what is left over.' }] });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ version: 2, elements: ['Plan', 'Build', 'Check', 'Tidy up'] });
    expect(changed.body.current.elements.map((e: { id: string }) => e.id)).toEqual(['plan', 'build', 'check', 'tidy-up']);

    const versions = await asOwner('GET', `/v1/workflows/${made.id}/versions`);
    expect(versions.body.items.map((v: { number: number }) => v.number)).toEqual([2, 1]);
    expect(versions.body.items[1].elements[1].instructions).toBe('Build it.');
    expect(versions.body.items[0].elements[1].instructions).toBe('Build it, with tests.');

    // Sending what is already there changes nothing; labels alone do not make a version.
    expect((await asOwner('PATCH', `/v1/workflows/${made.id}`, { name: 'Three steps' })).body.version).toBe(2);
    const labelled = await asOwner('PATCH', `/v1/workflows/${made.id}`, { labels: { team: 'web' } });
    expect(labelled.body).toMatchObject({ version: 2, labels: { team: 'web' } });
    // What is left out of a change stays as it was: nothing is emptied.
    await asOwner('PATCH', `/v1/workflows/${made.id}`, { description: 'What it is for.' });
    const partly = await asOwner('PATCH', `/v1/workflows/${made.id}`, { doneNothing: true, name: 'Three steps' });
    expect(partly.body).toMatchObject({ description: 'What it is for.', labels: { team: 'web' } });
    expect(partly.body.current.standing).toBe('Keep it small.');
    const before = partly.body.version as number;
    // A new name is a new version, and the list shows it.
    expect((await asOwner('PATCH', `/v1/workflows/${made.id}`, { name: 'Renamed' })).body).toMatchObject({ version: before + 1, name: 'Renamed', description: 'What it is for.', labels: { team: 'web' } });
  });

  it('refuses what is not a workflow, in words', async () => {
    const bad = async (body: object): Promise<string> => {
      const answer = await asOwner('POST', '/v1/workflows', body);
      expect(answer.status).toBe(400);
      return answer.body.error.message as string;
    };
    await bad({ name: 'No elements', elements: [] });
    await bad({ elements: THREE.elements });
    expect(await bad({ name: 'x', elements: [{ name: 'Empty', instructions: '  ' }] })).toContain('"Empty" has no instructions');
    expect(await bad({ name: 'x', elements: [{ id: 'a', name: 'A', instructions: 'x' }, { id: 'a', name: 'B', instructions: 'y' }] })).toContain('Two elements have the ID "a"');
    expect(await bad({ name: 'x', elements: [{ name: 'A', kind: 'mystery', instructions: 'x' }] })).toContain('a kind this version does not know');
    expect(hub.state.workflows).toEqual([]);
  });

  it('holds workflows to the limits in the settings', async () => {
    await stop();
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ workflows: { maxElements: 2, maxElementChars: 100 } }));
    await start();
    const tooMany = await asOwner('POST', '/v1/workflows', THREE);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.message).toContain('at most 2 are allowed');
    const tooLong = await asOwner('POST', '/v1/workflows', { name: 'x', elements: [{ name: 'A', instructions: 'x'.repeat(101) }] });
    expect(tooLong.body.error.message).toContain('at most 100 are allowed');
    expect((await asOwner('POST', '/v1/workflows', { name: 'x', elements: THREE.elements.slice(0, 2) })).status).toBe(201);
  });

  it('come from templates, as ordinary workflows that can be changed', async () => {
    const templates = await asOwner('GET', '/v1/workflow-templates');
    expect(templates.body.items.map((t: { name: string }) => t.name)).toEqual(['plan-build-check', 'fix-a-bug', 'review-a-change', 'specify-design-build']);

    const used = await asOwner('POST', '/v1/workflow-templates/fix-a-bug/use');
    expect(used.status).toBe(201);
    expect(used.body).toMatchObject({ name: 'Fix a bug', origin: { kind: 'template', name: 'fix-a-bug' }, elements: ['Reproduce', 'Find the cause', 'Fix', 'Test', 'Summarise'] });
    // A second one from the same template gets a name of its own.
    expect((await asOwner('POST', '/v1/workflow-templates/fix-a-bug/use')).body.name).toBe('Fix a bug 2');
    expect((await asOwner('POST', '/v1/workflow-templates/fix-a-bug/use', { name: 'Hotfix' })).body.name).toBe('Hotfix');
    expect((await asOwner('POST', '/v1/workflow-templates/no-such/use')).status).toBe(404);

    const changed = await asOwner('PATCH', `/v1/workflows/${used.body.id}`, { standing: 'Ask before deleting anything.' });
    expect(changed.body).toMatchObject({ version: 2 });
    expect(changed.body.current.standing).toBe('Ask before deleting anything.');
  });

  it('are open to tokens by scope: read to read, workflows:write to change, runs:write to run', async () => {
    const made = await makeWorkflow();
    const session = fakeSession('one');
    const read = await makeToken('reader', ['read']);
    const author = await makeToken('author', ['workflows:write']);
    const runner = await makeToken('runner', ['runs:write']);

    expect((await call(read, 'GET', '/v1/workflows')).status).toBe(200);
    expect((await call(read, 'GET', `/v1/workflows/${made.id}`)).status).toBe(200);
    expect((await call(read, 'GET', '/v1/workflow-templates')).status).toBe(200);
    expect((await call(read, 'POST', '/v1/workflows', THREE)).status).toBe(403);
    expect((await call(read, 'POST', '/v1/runs', { workflowId: made.id, sessionId: session.id, inputs: { task: 'x' } })).status).toBe(403);

    expect((await call(author, 'POST', '/v1/workflows', { ...THREE, name: 'By token' })).status).toBe(201);
    expect((await call(author, 'PATCH', `/v1/workflows/${made.id}`, { description: 'changed' })).status).toBe(200);
    // Writing workflows is not reading them, and not running them.
    expect((await call(author, 'GET', '/v1/workflows')).status).toBe(403);
    expect((await call(author, 'POST', '/v1/runs', { workflowId: made.id, sessionId: session.id, inputs: { task: 'x' } })).status).toBe(403);

    expect((await call(runner, 'POST', '/v1/workflows', THREE)).status).toBe(403);
    const started = await call(runner, 'POST', '/v1/runs', { workflowId: made.id, sessionId: session.id, inputs: { task: 'x' } });
    expect(started.status).toBe(201);
    expect(started.body.run.startedBy).toEqual({ kind: 'token', name: 'runner' });
    const moved = await call(runner, 'POST', `/v1/runs/${started.body.run.id}/report`, { type: 'done', elementId: 'plan', note: 'by a program' });
    expect(moved.status).toBe(200);
    expect(moved.body.run.elements[0].by).toEqual({ kind: 'token', name: 'runner' });
    expect((await call(read, 'GET', `/v1/runs/${started.body.run.id}`)).body.position).toBe('Build · 2 of 3');
  });
});

describe('runs', () => {
  it('walk a workflow to finished, one small event per report, and leave for the archive', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const run = await startRun(workflow.id, session.id);
    expect(run).toMatchObject({ position: 'Plan · 1 of 3', workflowName: 'Three steps', kickoff: kickoffLine() });
    expect(run.run).toMatchObject({ status: 'running', currentElementId: 'plan', workflowVersion: 1, sessionId: session.id, startedBy: { kind: 'person' } });
    expect(hub.state.runs).toHaveLength(1);

    events = [];
    const second = await ownReport(session, { type: 'done', note: 'Planned it.' });
    expect(second.status).toBe(200);
    expect(second.body.position).toBe('Build · 2 of 3');
    // What comes back is what to do next, with what the element before handed over.
    expect(second.body.text).toContain('Element 2 of 3: Build');
    expect(second.body.text).toContain('Planned it.');
    // One report, one event, about this one run.
    expect(events.map((e) => e.type)).toEqual(['run.moved']);

    expect((await ownReport(session, { type: 'done', elementId: 'build', note: 'Built it.' })).body.position).toBe('Check · 3 of 3');
    events = [];
    const last = await ownReport(session, { type: 'done', elementId: 'check', note: 'All green.' });
    expect(last.status).toBe(200);
    expect(last.body.run.status).toBe('finished');
    expect(last.body.text).toContain('This run is finished');
    expect(events.map((e) => e.type)).toEqual(['run.finished', 'session.attention', 'session.note.appended']);

    // It left the state, and is in the archive, readable by its ID.
    expect(hub.state.runs).toEqual([]);
    const archived = await asOwner('GET', `/v1/runs/${run.run.id}`);
    expect(archived.body.run).toMatchObject({ status: 'finished', currentElementId: null });
    expect(archived.body.run.elements.map((e: { note: string; by: unknown }) => [e.note, e.by])).toEqual([
      ['Planned it.', { kind: 'agent' }],
      ['Built it.', { kind: 'agent' }],
      ['All green.', { kind: 'agent' }],
    ]);
    expect((await asOwner('GET', '/v1/runs')).body.items).toEqual([]);
    expect((await asOwner('GET', '/v1/runs?status=ended')).body.items.map((r: ArchivedRun) => r.run.id)).toEqual([run.run.id]);
    expect((await asOwner('GET', '/v1/runs?status=finished')).body.items).toHaveLength(1);
    expect((await asOwner('GET', '/v1/runs?status=stopped')).body.items).toHaveLength(0);

    // The session's notes have the summary, and the session asks for the owner.
    const after = hub.state.sessions.find((s) => s.id === session.id)!;
    expect(after.noteLog.at(-1)).toMatchObject({ kind: 'event', text: 'Workflow "Three steps" finished.\n- Plan: Planned it.\n- Build: Built it.\n- Check: All green.' });
    expect(after.attention).toMatchObject({ state: 'done', message: 'Workflow "Three steps" finished after "Check"' });

    // Nothing more can be reported on it, and the session is on no run.
    expect((await asOwner('POST', `/v1/runs/${run.run.id}/report`, { type: 'resume' })).status).toBe(409);
    expect((await ownReport(session, { type: 'done' })).status).toBe(404);
  });

  it('refuse the same done twice, so a repeat cannot skip an element', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    await startRun(workflow.id, session.id);
    expect((await ownReport(session, { type: 'done', elementId: 'plan' })).status).toBe(200);
    events = [];
    const again = await ownReport(session, { type: 'done', elementId: 'plan' });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'conflict' });
    expect(again.body.error.message).toContain('"Plan" is not the current element');
    expect(events).toEqual([]);
    expect(hub.state.runs[0]).toMatchObject({ currentElementId: 'build' });
  });

  it('put a blocked run in front of the owner, naming the element, and take it back when it moves on', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const run = await startRun(workflow.id, session.id);
    const blocked = await ownReport(session, { type: 'blocked', reason: 'I need the staging password' });
    expect(blocked.body.run).toMatchObject({ status: 'blocked', blockedReason: 'I need the staging password' });
    expect(hub.state.sessions.find((s) => s.id === session.id)?.attention).toMatchObject({ state: 'waiting', message: 'Blocked on "Plan": I need the staging password' });

    // A person moves it on with the buttons.
    const moved = await asOwner('POST', `/v1/runs/${run.run.id}/report`, { type: 'goto', elementId: 'build' });
    expect(moved.body.run).toMatchObject({ status: 'running', currentElementId: 'build', blockedReason: null });
    expect(moved.body.run.elements[0]).toMatchObject({ state: 'skipped', by: { kind: 'person' } });
    expect(hub.state.sessions.find((s) => s.id === session.id)?.attention.state).toBe('none');
  });

  it('pause, resume and stop from the buttons; a stopped run is archived as stopped', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const run = await startRun(workflow.id, session.id);
    const report = (body: object): Promise<Answer> => asOwner('POST', `/v1/runs/${run.run.id}/report`, body);
    expect((await report({ type: 'pause' })).body.run.status).toBe('paused');
    // The agent is told so, and its done is refused meanwhile.
    expect((await call(sessionToken(ownerToken, session.id), 'GET', `/v1/sessions/${session.id}/run`)).body.text).toContain('PAUSED');
    expect((await ownReport(session, { type: 'done' })).status).toBe(409);
    expect((await report({ type: 'resume' })).body.run.status).toBe('running');
    expect((await report({ type: 'stop' })).body.run.status).toBe('stopped');
    expect(hub.state.runs).toEqual([]);
    expect((await asOwner('GET', '/v1/runs?status=stopped')).body.items).toHaveLength(1);
    expect(hub.state.sessions.find((s) => s.id === session.id)?.noteLog.at(-1)?.text).toContain('stopped');
  });

  it('keep a session to one run at a time, unless told to replace it', async () => {
    const first = await makeWorkflow();
    const second = await makeWorkflow({ ...THREE, name: 'Another' });
    const session = fakeSession('worker');
    const run = await startRun(first.id, session.id);
    const refused = await asOwner('POST', `/v1/sessions/${session.id}/runs`, { workflowId: second.id, inputs: { task: 'x' } });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('already on "Three steps"');

    const replaced = await startRun(second.id, session.id, { replace: true });
    expect(replaced.workflowName).toBe('Another');
    expect(hub.state.runs.map((r) => r.id)).toEqual([replaced.run.id]);
    expect((await asOwner('GET', `/v1/runs/${run.run.id}`)).body.run.status).toBe('stopped');
  });

  it('ask for the inputs the workflow declares', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const missing = await asOwner('POST', `/v1/sessions/${session.id}/runs`, { workflowId: workflow.id, inputs: {} });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toContain('"Task" is needed');
    const unknown = await asOwner('POST', `/v1/sessions/${session.id}/runs`, { workflowId: workflow.id, inputs: { task: 'x', colour: 'red' } });
    expect(unknown.body.error.message).toContain('no input named "colour"');
    expect((await asOwner('POST', `/v1/sessions/${newId()}/runs`, { workflowId: workflow.id, inputs: { task: 'x' } })).status).toBe(404);
    expect((await asOwner('POST', `/v1/sessions/${session.id}/runs`, { workflowId: newId(), inputs: { task: 'x' } })).status).toBe(404);
    expect(hub.state.runs).toEqual([]);
  });

  it('can wait without a session, queued, and start when given one', async () => {
    const workflow = await makeWorkflow();
    const queued = await asOwner('POST', '/v1/runs', { workflowId: workflow.id, inputs: { task: 'later' } });
    expect(queued.status).toBe(201);
    expect(queued.body.run).toMatchObject({ status: 'queued', sessionId: null, currentElementId: null });
    expect(queued.body.position).toBe('queued');
    expect((await asOwner('GET', '/v1/runs?status=queued')).body.items).toHaveLength(1);
    expect((await asOwner('GET', '/v1/runs?status=running')).body.items).toHaveLength(0);

    const session = fakeSession('worker');
    const assigned = await asOwner('POST', `/v1/runs/${queued.body.run.id}/report`, { type: 'assign', sessionId: session.id });
    expect(assigned.body.run).toMatchObject({ status: 'running', sessionId: session.id, currentElementId: 'plan' });
    // A session cannot be given a second run that way either.
    const other = await asOwner('POST', '/v1/runs', { workflowId: workflow.id, inputs: { task: 'more' } });
    expect((await asOwner('POST', `/v1/runs/${other.body.run.id}/report`, { type: 'assign', sessionId: session.id })).status).toBe(409);
  });

  it('are listed by session, workflow and status', async () => {
    const a = await makeWorkflow();
    const b = await makeWorkflow({ ...THREE, name: 'Another' });
    const one = fakeSession('one');
    const two = fakeSession('two');
    const three = fakeSession('three');
    await startRun(a.id, one.id);
    await startRun(a.id, two.id);
    const third = await startRun(b.id, three.id);
    await asOwner('POST', `/v1/runs/${third.run.id}/report`, { type: 'pause' });

    const names = async (query: string): Promise<string[]> => RunList.parse((await asOwner('GET', `/v1/runs${query}`)).body).items.map((r) => `${r.workflowName}/${r.run.status}`);
    expect(await names('')).toHaveLength(3);
    expect(await names(`?workflowId=${a.id}`)).toEqual(['Three steps/running', 'Three steps/running']);
    expect(await names(`?sessionId=${three.id}`)).toEqual(['Another/paused']);
    expect(await names('?status=paused')).toEqual(['Another/paused']);
    expect(await names(`?status=paused&workflowId=${a.id}`)).toEqual([]);
    const page = await asOwner('GET', '/v1/runs?limit=2');
    expect(page.body.items).toHaveLength(2);
    expect((await asOwner('GET', `/v1/runs?limit=2&cursor=${page.body.nextCursor}`)).body.items).toHaveLength(1);
  });

  it('end with the session when it is ended for good', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const run = await startRun(workflow.id, session.id);
    await sessions.close(session.id);
    await expect.poll(() => hub.state.runs.length).toBe(0);
    expect((await asOwner('GET', `/v1/runs/${run.run.id}`)).body.run.status).toBe('stopped');
  });

  it('keep a workflow from being removed while one is going', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const run = await startRun(workflow.id, session.id);
    const refused = await asOwner('DELETE', `/v1/workflows/${workflow.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('still going');
    await asOwner('POST', `/v1/runs/${run.run.id}/report`, { type: 'stop' });
    expect((await asOwner('DELETE', `/v1/workflows/${workflow.id}`)).status).toBe(204);
    // What is over can still be read, with the names it had.
    const archived = await asOwner('GET', `/v1/runs/${run.run.id}`);
    expect(archived.body).toMatchObject({ workflowName: 'Three steps', elements: [{ id: 'plan', name: 'Plan' }, { id: 'build', name: 'Build' }, { id: 'check', name: 'Check' }] });
  });
});

describe('editing a workflow while a run is going', () => {
  it('does not move the run or change what it is told; the next run gets the new version', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const run = await startRun(workflow.id, session.id);
    await ownReport(session, { type: 'done', elementId: 'plan', note: 'planned' });
    const before = (await asOwner('GET', `/v1/runs/${run.run.id}`)).body;

    events = [];
    // Everything about it changes: the name, the order, the texts, an element gone, one new.
    const changed = await asOwner('PATCH', `/v1/workflows/${workflow.id}`, {
      name: 'Rewritten',
      standing: 'New rules.',
      elements: [
        { name: 'Research', instructions: 'Look around first.' },
        { id: 'check', name: 'Check', instructions: 'Check it twice.' },
        { id: 'plan', name: 'Plan', instructions: 'Plan differently.' },
      ],
    });
    expect(changed.body.version).toBe(2);
    expect(events.map((e) => e.type)).toEqual(['workflow.changed']);

    const after = (await asOwner('GET', `/v1/runs/${run.run.id}`)).body;
    expect(after).toEqual(before);
    expect(after.run).toMatchObject({ workflowVersion: 1, currentElementId: 'build' });
    expect(after.workflowName).toBe('Three steps');
    expect(after.text).toContain('Build it.');
    expect(after.text).toContain('Keep it small.');

    // It goes on through the version it started on, to the end.
    expect((await ownReport(session, { type: 'done', elementId: 'build' })).body.position).toBe('Check · 3 of 3');
    expect((await ownReport(session, { type: 'done', elementId: 'check' })).body.run.status).toBe('finished');

    const next = await startRun(workflow.id, session.id);
    expect(next.run.workflowVersion).toBe(2);
    expect(next.position).toBe('Research · 1 of 3');
    expect(next.text).toContain('New rules.');
  });

  it('keeps the version a run is on, however many versions follow', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    await startRun(workflow.id, session.id);
    for (let n = 0; n < 40; n += 1) await asOwner('PATCH', `/v1/workflows/${workflow.id}`, { description: `edit ${n}` });
    const kept = hub.state.workflows[0]!.versions.map((v) => v.number);
    expect(kept).toContain(1);
    expect(kept.at(-1)).toBe(41);
    expect(kept.length).toBeLessThanOrEqual(31);
    expect((await ownReport(session, { type: 'done', elementId: 'plan' })).status).toBe(200);
  });
});

describe('what a session token reaches', () => {
  it('is its own run and nothing else about workflows', async () => {
    const workflow = await makeWorkflow();
    const mine = fakeSession('mine');
    const theirs = fakeSession('theirs');
    const myRun = await startRun(workflow.id, mine.id);
    const theirRun = await startRun(workflow.id, theirs.id);
    const secret = sessionToken(ownerToken, mine.id);

    // Its own run, by its own session's address.
    const own = await call(secret, 'GET', `/v1/sessions/${mine.id}/run`);
    expect(own.status).toBe(200);
    expect(own.body.run.id).toBe(myRun.run.id);
    expect((await call(secret, 'POST', `/v1/sessions/${mine.id}/run/report`, { type: 'done', elementId: 'plan' })).status).toBe(200);

    // Another session's run: not by that session's address, and not by the run's ID.
    expect((await call(secret, 'GET', `/v1/sessions/${theirs.id}/run`)).status).toBe(403);
    expect((await call(secret, 'POST', `/v1/sessions/${theirs.id}/run/report`, { type: 'stop' })).status).toBe(403);
    expect((await call(secret, 'GET', `/v1/runs/${theirRun.run.id}`)).status).toBe(403);
    expect((await call(secret, 'POST', `/v1/runs/${theirRun.run.id}/report`, { type: 'stop' })).status).toBe(403);
    // Not even its own run by ID: that address is for callers who may see every run.
    expect((await call(secret, 'GET', `/v1/runs/${myRun.run.id}`)).status).toBe(403);
    expect((await call(secret, 'POST', `/v1/runs/${myRun.run.id}/report`, { type: 'pause' })).status).toBe(403);

    // No lists, no workflows, no starting of runs, also not for itself.
    for (const [method, url, body] of [
      ['GET', '/v1/runs', undefined],
      ['GET', '/v1/runs?status=ended', undefined],
      ['GET', '/v1/workflows', undefined],
      ['GET', `/v1/workflows/${workflow.id}`, undefined],
      ['GET', `/v1/workflows/${workflow.id}/versions`, undefined],
      ['GET', '/v1/workflow-templates', undefined],
      ['POST', '/v1/workflows', THREE],
      ['PATCH', `/v1/workflows/${workflow.id}`, { name: 'x' }],
      ['DELETE', `/v1/workflows/${workflow.id}`, undefined],
      ['POST', `/v1/workflows/${workflow.id}/copy`, {}],
      ['POST', '/v1/workflow-templates/fix-a-bug/use', {}],
      ['POST', '/v1/runs', { workflowId: workflow.id, sessionId: mine.id, inputs: { task: 'x' } }],
      ['POST', `/v1/sessions/${mine.id}/runs`, { workflowId: workflow.id, inputs: { task: 'x' }, replace: true }],
    ] as const) {
      expect((await call(secret, method, url, body)).status, `${method} ${url}`).toBe(403);
    }

    // Nothing of theirs moved.
    expect(hub.state.runs.find((r) => r.id === theirRun.run.id)).toMatchObject({ status: 'running', currentElementId: 'plan' });
    expect(hub.state.workflows).toHaveLength(1);
  });

  it('is told there is no run, when there is none', async () => {
    const session = fakeSession('idle');
    const secret = sessionToken(ownerToken, session.id);
    const none = await call(secret, 'GET', `/v1/sessions/${session.id}/run`);
    expect(none.status).toBe(404);
    expect(none.body.error.message).toBe('This session is on no workflow');
    expect((await call(secret, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'done' })).status).toBe(404);
  });

  it('with the scopes, a token reaches any session\'s run by the same addresses', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    await startRun(workflow.id, session.id);
    const read = await makeToken('reader', ['read']);
    const runner = await makeToken('runner', ['runs:write']);
    expect((await call(read, 'GET', `/v1/sessions/${session.id}/run`)).status).toBe(200);
    expect((await call(read, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'pause' })).status).toBe(403);
    expect((await call(runner, 'POST', `/v1/sessions/${session.id}/run/report`, { type: 'pause' })).status).toBe(200);
    expect((await call(runner, 'GET', `/v1/sessions/${session.id}/run`)).status).toBe(403);
  });
});

describe('telling the agent', () => {
  it('types the kickoff line for the owner where an agent is running, and nowhere else', async () => {
    const workflow = await makeWorkflow();
    const withAgent = fakeSession('agent', { agent: { kind: 'claude-code', conversationId: null }, status: { ...NO_STATUS, state: 'busy' } });
    const plainShell = fakeSession('shell');
    const idleAgent = fakeSession('idle', { agent: { kind: 'claude-code', conversationId: null }, status: { ...NO_STATUS, state: 'idle' } });

    const started = await startRun(workflow.id, withAgent.id);
    expect(started.kickoffTyped).toBe(true);
    expect(typed).toEqual([[withAgent.id, kickoffLine()]]);

    // In a plain shell the line would be run as a command: nothing is typed, and a person moves the run.
    expect((await startRun(workflow.id, plainShell.id)).kickoffTyped).toBe(false);
    expect((await startRun(workflow.id, idleAgent.id)).kickoffTyped).toBe(false);
    expect(typed).toHaveLength(1);

    // Asked not to: nothing typed.
    await asOwner('POST', `/v1/runs/${started.run.id}/report`, { type: 'stop' });
    expect((await startRun(workflow.id, withAgent.id, { kickoff: false })).kickoffTyped).toBe(false);
    expect(typed).toHaveLength(1);
  });

  it('never types for an API token: it is given the line instead', async () => {
    const workflow = await makeWorkflow();
    const withAgent = fakeSession('agent', { agent: { kind: 'claude-code', conversationId: null }, status: { ...NO_STATUS, state: 'busy' } });
    const runner = await makeToken('runner', ['runs:write', 'sessions:write', 'read']);
    const started = await call(runner, 'POST', `/v1/sessions/${withAgent.id}/runs`, { workflowId: workflow.id, inputs: { task: 'x' }, kickoff: true });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ kickoffTyped: false, kickoff: kickoffLine() });
    expect(typed).toEqual([]);
  });

  it('gives the same text to the preview, the run and the session asking for its status', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('worker');
    const run = await startRun(workflow.id, session.id);
    const version = hub.state.workflows[0]!.versions[0]!;
    const status = await call(sessionToken(ownerToken, session.id), 'GET', `/v1/sessions/${session.id}/run`);
    expect(run.text).toBe(previewRun(version, { task: 'the login bug' }));
    expect(status.body.text).toBe(run.text);

    await ownReport(session, { type: 'done', elementId: 'plan' });
    const second = await call(sessionToken(ownerToken, session.id), 'GET', `/v1/sessions/${session.id}/run`);
    expect(second.body.text).toBe(previewRun(version, { task: 'the login bug' }, 'build'));
  });

  it('starts a resumed agent with the kickoff line when the session is on a run', async () => {
    const workflow = await makeWorkflow();
    const conversationId = '5f0c0f6e-1d2b-4c3a-9e8f-7a6b5c4d3e2f';
    const launched: string[][] = [];
    await stop();
    // The same server, with a way to start agents.
    const store = new JsonStore(dir);
    hub = new StateHub(await store.load(), store);
    const settings = new SettingsFile(dir);
    sessions = new Sessions(hub, runtime, {
      agentLaunchLine: async (_agent, args) => {
        launched.push([...args]);
        return 'agent';
      },
    });
    app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir) });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
    origin = `http://127.0.0.1:${port}`;

    const session = fakeSession('agent', { agent: { kind: 'claude-code', conversationId } });
    expect((await asOwner('POST', paths.resumeAgent(session.id))).status).toBe(200);
    expect(launched.at(-1)).toEqual(['--resume', conversationId]);

    await startRun(workflow.id, session.id);
    expect((await asOwner('POST', paths.resumeAgent(session.id))).status).toBe(200);
    expect(launched.at(-1)).toEqual(['--resume', conversationId, kickoffLine()]);
  });
});

describe('a restart of the server', () => {
  it('keeps workflows, and runs where they stood, on the version they started on', async () => {
    const workflow = await makeWorkflow();
    const other = await makeWorkflow({ ...THREE, name: 'Another', elements: THREE.elements.slice(0, 2) });
    const one = fakeSession('one');
    const two = fakeSession('two');
    const first = await startRun(workflow.id, one.id);
    await ownReport(one, { type: 'done', elementId: 'plan', note: 'planned before the restart' });
    const second = await startRun(other.id, two.id);
    await asOwner('PATCH', `/v1/workflows/${workflow.id}`, { description: 'edited meanwhile' });
    const before = (await asOwner('GET', `/v1/runs/${first.run.id}`)).body;

    await stop();
    await start();

    expect(hub.state.workflows.map((w) => w.name).sort()).toEqual(['Another', 'Three steps']);
    expect(hub.state.runs.map((r) => r.id).sort()).toEqual([first.run.id, second.run.id].sort());
    expect((await asOwner('GET', `/v1/runs/${first.run.id}`)).body).toEqual(before);
    expect(before.run).toMatchObject({ workflowVersion: 1, currentElementId: 'build' });
    expect((await asOwner('GET', `/v1/runs/${second.run.id}`)).body.position).toBe('Plan · 1 of 2');

    // And they go on.
    const next = await ownReport(one, { type: 'done', elementId: 'build' });
    expect(next.body.position).toBe('Check · 3 of 3');
    expect(next.body.text).not.toContain('planned before the restart');
    expect((await ownReport(one, { type: 'done', elementId: 'check' })).body.run.status).toBe('finished');

    await stop();
    await start();
    // The finished one is in the archive after another restart, not in the state.
    expect(hub.state.runs.map((r) => r.id)).toEqual([second.run.id]);
    expect((await asOwner('GET', `/v1/runs/${first.run.id}`)).body.run.status).toBe('finished');
  });

  it('writes the state file with live runs only', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('one');
    const run = await startRun(workflow.id, session.id);
    await asOwner('POST', `/v1/runs/${run.run.id}/report`, { type: 'stop' });
    await startRun(workflow.id, session.id);
    await hub.flush();
    const file = JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'));
    expect(file.version).toBe(5);
    expect(file.workflows).toHaveLength(1);
    expect(file.runs).toHaveLength(1);
    expect(file.runs[0].status).toBe('running');
    expect((await stat(path.join(dir, RUN_ARCHIVE_FILE))).mode & 0o777).toBe(0o600);
  });

  it('treats a run the archive already has as over, if the server stopped between the two writes', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('one');
    const run = await startRun(workflow.id, session.id);
    const live = hub.state.runs[0]!;
    await stop();
    // The archive got the run; the state file never heard.
    await new FileRunArchive(dir).append({ run: { ...live, status: 'stopped', finishedAt: new Date().toISOString() }, workflowName: 'Three steps', elements: [] });
    await start();
    expect(hub.state.runs).toEqual([]);
    expect((await asOwner('GET', `/v1/runs/${run.run.id}`)).body.run.status).toBe('stopped');
    // The session is free for another run.
    expect((await startRun(workflow.id, session.id)).run.status).toBe('running');
  });
});

describe('at scale: a thousand runs over, thirty going', () => {
  it('moves one run with one event, keeps the state to the live ones, and pages the rest', async () => {
    const workflow = await makeWorkflow();
    const version = hub.state.workflows[0]!.versions[0]!;
    await stop();

    // A thousand runs that are over, as the archive keeps them.
    const archive = new FileRunArchive(dir);
    const at = (n: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
    for (let n = 0; n < 1000; n += 1) {
      await archive.append({
        workflowName: version.name,
        elements: version.elements.map((e) => ({ id: e.id, name: e.name, produces: e.produces })),
        run: {
          id: newId(),
          workflowId: workflow.id,
          workflowVersion: 1,
          sessionId: null,
          inputs: { task: `old task ${n}` },
          status: n % 10 === 0 ? 'stopped' : 'finished',
          currentElementId: null,
          elements: version.elements.map((e) => ({ elementId: e.id, state: 'done' as const, startedAt: at(n), finishedAt: at(n), note: `note ${n}`, output: null, ticks: [], by: { kind: 'agent' as const }, sessionId: null })),
          blockedReason: null,
          pausedFrom: null,
          startedBy: { kind: 'person' },
          createdAt: at(n),
          updatedAt: at(n),
          finishedAt: at(n),
        },
      });
    }
    await start();

    const workers = Array.from({ length: 30 }, (_, n) => fakeSession(`worker ${n}`));
    for (const worker of workers) await startRun(workflow.id, worker.id);
    expect(hub.state.runs).toHaveLength(30);

    // Every one of the thirty reports at once.
    events = [];
    const started = Date.now();
    const answers = await Promise.all(workers.map((worker) => ownReport(worker, { type: 'done', elementId: 'plan', note: `plan by ${worker.name}` })));
    const took = Date.now() - started;
    expect(answers.map((a) => a.status)).toEqual(Array(30).fill(200));
    // Thirty reports, thirty events, each carrying one run: nothing rescans or resends the rest.
    expect(events.map((e) => e.type)).toEqual(Array(30).fill('run.moved'));
    expect(new Set(events.map((e) => (e.type === 'run.moved' ? e.run.id : ''))).size).toBe(30);
    for (const event of events) expect(JSON.stringify(event).length).toBeLessThan(2500);
    expect(hub.state.runs.every((r) => r.currentElementId === 'build')).toBe(true);
    expect(took).toBeLessThan(3000);

    // What a browser is given holds the thirty, and none of the thousand.
    const state = await asOwner('GET', paths.state);
    expect(state.body.state.runs).toHaveLength(30);
    expect(JSON.stringify(state.body)).not.toContain('old task');
    await hub.flush();
    expect(await readFile(path.join(dir, 'state.json'), 'utf8')).not.toContain('old task');

    // The thousand are read a page at a time.
    const first = await asOwner('GET', '/v1/runs?status=ended&limit=100');
    expect(first.body.items).toHaveLength(100);
    expect(first.body.items[0].run.inputs.task).toBe('old task 999');
    let seen = first.body.items.length;
    let cursor: string | null = first.body.nextCursor;
    let pages = 1;
    while (cursor) {
      const page: Answer = await asOwner('GET', `/v1/runs?status=ended&limit=100&cursor=${cursor}`);
      seen += page.body.items.length;
      cursor = page.body.nextCursor;
      pages += 1;
    }
    expect([seen, pages]).toEqual([1000, 10]);
    const stopped = await asOwner('GET', '/v1/runs?status=stopped&limit=500');
    expect(stopped.body.items).toHaveLength(100);

    // One of the thirty finishes: it joins the archive, and twenty-nine stay.
    await ownReport(workers[0]!, { type: 'done', elementId: 'build' });
    await ownReport(workers[0]!, { type: 'done', elementId: 'check' });
    expect(hub.state.runs).toHaveLength(29);
    expect((await asOwner('GET', '/v1/runs?status=ended&limit=1')).body.items[0].run.sessionId).toBe(workers[0]!.id);
  });
});

describe('the state a browser gets', () => {
  it('has workflows, live runs and the quiet threshold', async () => {
    const workflow = await makeWorkflow();
    const session = fakeSession('one');
    await startRun(workflow.id, session.id);
    const state = await asOwner('GET', paths.state);
    expect(state.body.state.workflows.map((w: { name: string }) => w.name)).toEqual(['Three steps']);
    expect(state.body.state.runs).toHaveLength(1);
    expect(state.body.settings.workflows.quietAfterSeconds).toBe(300);
    expect(GRANTABLE_SCOPES).toContain('runs:write');
  });
});
