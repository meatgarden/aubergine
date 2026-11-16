import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { DemoStatus, GRANTABLE_SCOPES, SESSION_ENV } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { pathWithCommand, writeCommandLauncher } from './command-path';
import { DRAFT_LOG_FILE, FileDraftLog } from './draft-log';
import { FileRunArchive, RUN_ARCHIVE_FILE } from './run-archive';
import { TmuxRuntime, shellEnvironment } from './runtime/tmux-runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { ZshIntegration } from './shell/integration';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p));

/**
 * The demo, whole: a real server, real terminals, the real stand-in scripts
 * running the real `aubergine` command. Nothing is stood in for here: the
 * stand-ins are the thing under test.
 */
describe.runIf(ZSH)('aubergine demo', () => {
  const socket = testSocketName('demo');
  const runtime = new TmuxRuntime({ socket });
  let dir: string;
  let data: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let sessions: Sessions;
  let port = 0;
  let ownerToken: string;

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-demo-')));
    data = path.join(dir, 'data');
    const userDir = path.join(dir, 'user');
    await mkdir(data);
    await mkdir(userDir);
    await writeFile(path.join(userDir, '.zshrc'), "PROMPT='ready> '\nunset HISTFILE\n");
    ownerToken = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    const settings = new SettingsFile(data);
    await settings.reload();
    const commandFolder = await writeCommandLauncher(data);
    sessions = new Sessions(hub, runtime, {
      integration: new ZshIntegration(path.join(data, 'shell'), userDir),
      shell: () => ZSH as string,
      defaultFolder: () => dir,
      sessionEnv: (sessionId) => ({
        [SESSION_ENV.url]: `http://127.0.0.1:${port}`,
        [SESSION_ENV.sessionId]: sessionId,
        [SESSION_ENV.token]: sessionToken(ownerToken, sessionId),
        [SESSION_ENV.bin]: commandFolder,
        PATH: pathWithCommand(shellEnvironment(process.env).PATH ?? '', commandFolder),
        // The stand-ins' pretend work, kept short.
        AUBERGINE_DEMO_PAUSE: '0.1',
      }),
    });
    app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(data), draftLog: new FileDraftLog(data), demoFolder: path.join(data, 'demo') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, socket);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  /* eslint-disable @typescript-eslint/no-explicit-any -- test answers are checked field by field */
  async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<{ status: number; body: any }> {
    const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
  }
  const asOwner = (method: string, url: string, body?: unknown): Promise<{ status: number; body: any }> => send({ origin: `http://127.0.0.1:${port}`, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
  async function until(what: string, check: () => Promise<boolean> | boolean, timeoutMs = 45_000): Promise<void> {
    const started = Date.now();
    while (!(await check())) {
      if (Date.now() - started > timeoutMs) throw new Error(`Waited in vain for ${what}`);
      await sleep(50);
    }
  }
  const demoNow = async (): Promise<DemoStatus> => DemoStatus.parse((await asOwner('GET', '/api/v1/demo')).body);
  const screen = async (sessionId: string): Promise<string> => (await asOwner('GET', `/v1/sessions/${sessionId}/screen`)).body.text as string;
  const session = (id: string | undefined) => hub.state.sessions.find((s) => s.id === id);
  async function makeDemo(): Promise<DemoStatus> {
    const made = await asOwner('POST', '/api/v1/demo');
    expect(made.status).toBe(201);
    await until('the scene to settle', async () => (await demoNow()).ready);
    return demoNow();
  }
  /** The state file with what changes by itself taken out: times, and what a shell reports about itself from moment to moment. */
  async function stateWithoutTimes(): Promise<unknown> {
    await sessions.refresh();
    await hub.flush();
    const strip = (value: unknown): unknown => {
      if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ? '(a time)' : value;
      if (Array.isArray(value)) return value.map(strip);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => !['status', 'lastOutputAt', 'lastInputAt', 'command'].includes(key))
            .map(([key, inner]) => [key, strip(inner)]),
        );
      }
      return value;
    };
    return strip(JSON.parse(await readFile(path.join(data, 'state.json'), 'utf8')));
  }

  it('makes a scene in which each of the six things is really there', async () => {
    const before = hub.state.canvases.map((c) => c.id);
    const demo = await makeDemo();
    expect(demo.present).toBe(true);
    const canvas = hub.state.canvases.find((c) => c.id === demo.canvasId)!;
    expect(canvas.name).toBe('Demo');
    expect(hub.state.canvases.map((c) => c.id)).toEqual([...before, canvas.id]);
    expect(Object.keys(demo.sessions).sort()).toEqual(['checklist', 'fixing', 'parked', 'shell', 'waiting']);
    // Four on the canvas, one parked; every stand-in says in its title that it is one.
    expect(canvas.layout.nodes.map((n) => n.sessionId).sort()).toEqual([demo.sessions.shell, demo.sessions.fixing, demo.sessions.waiting, demo.sessions.checklist].sort());
    for (const part of ['fixing', 'waiting', 'checklist'] as const) expect(session(demo.sessions[part])?.name).toMatch(/^Stand-in agent · /);
    // Everything runs in the demo's own folder.
    for (const id of Object.values(demo.sessions)) expect(session(id)?.cwd).toBe(path.join(data, 'demo', 'project'));

    // 1. A plain shell with a few lines of output already there.
    await until('the shell to print', async () => (await screen(demo.sessions.shell!)).includes('2 passed, 1 failed'));
    expect(await screen(demo.sessions.shell!)).toContain('login redirects twice');
    expect(await screen(demo.sessions.shell!)).toContain('README.md');

    // 2. A stand-in part-way through "Fix a bug": the first element done by it, the second lit.
    const run = (await asOwner('GET', `/v1/runs/${demo.runId}`)).body;
    expect(run.workflowName).toBe('Fix a bug (demo)');
    expect(run.run).toMatchObject({ status: 'running', sessionId: demo.sessions.fixing, currentElementId: 'find-the-cause' });
    expect(run.run.elements[0]).toMatchObject({ state: 'done', by: { kind: 'agent' }, note: 'Reproduced it: test/login.test.js fails, two redirects.' });
    expect(run.position).toBe('Find the cause · 2 of 5');
    // It says what it is, first thing (further up than the screen shows by now).
    expect((await asOwner('GET', `/v1/sessions/${demo.sessions.fixing}/output?lines=60`)).body.text).toContain('STAND-IN AGENT: a script from Aubergine\'s demo, not a real agent.');
    expect(session(demo.sessions.fixing)?.noteLog.map((n) => n.text)).toContain('Reproduced: signing in sends the browser round twice before the home page.');

    // 3. A stand-in that is waiting with a question: an entry in the waiting queue.
    expect(session(demo.sessions.waiting)?.attention).toMatchObject({ state: 'waiting', message: 'Which branch should I fix it on: main or release?' });

    // 4. A checklist handed in from a run of one element: over, and there to tick.
    const list = (await asOwner('GET', `/v1/runs/${demo.checklistRunId}`)).body;
    expect(list.run).toMatchObject({ status: 'finished', sessionId: demo.sessions.checklist });
    expect(list.run.elements[0].output.items.map((i: { text: string }) => i.text)).toEqual(['Follow the redirect only once after signing in', 'Add a test for signing in with an expired session', 'Say in the README which Node version the tests need']);
    const ticked = await asOwner('POST', `/v1/runs/${demo.checklistRunId}/ticks`, { elementId: 'list-what-is-left', item: 0, ticked: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body.run.elements[0].ticks).toHaveLength(1);

    // 5. A draft element waiting for review, proposed by a stand-in.
    const draft = (await asOwner('GET', `/v1/drafts/${demo.draftId}`)).body.draft;
    expect(draft).toMatchObject({ kind: 'element', status: 'waiting', proposedBy: { kind: 'session', sessionId: demo.sessions.checklist }, element: { name: 'Check the sign-in page by hand' } });

    // 6. A parked terminal, its shell still running.
    expect(session(demo.sessions.parked)).toMatchObject({ state: 'parked', name: 'Parked · yesterday’s logs' });
    expect(await runtime.has(demo.sessions.parked!)).toBe(true);

    // Nothing was added to the owner's workflows or shelf: the runs are of workflows made for them alone.
    expect((await asOwner('GET', '/v1/workflows')).body.items).toEqual([]);
    expect((await asOwner('GET', '/v1/elements')).body.items).toEqual([]);
    expect(hub.state.tokens).toEqual([]);
  });

  it('does not make two: asked again, and asked twice at once, it is the same demo', async () => {
    const first = await demoNow();
    const sessionsBefore = hub.state.sessions.length;
    const [again, also] = await Promise.all([asOwner('POST', '/api/v1/demo'), asOwner('POST', '/api/v1/demo')]);
    expect(again.body.canvasId).toBe(first.canvasId);
    expect(also.body.canvasId).toBe(first.canvasId);
    expect(hub.state.canvases.filter((c) => c.name === 'Demo')).toHaveLength(1);
    expect(hub.state.sessions.length).toBe(sessionsBefore);
  });

  it('has stand-ins that react: an answer is carried on with, and "done" moves the run', async () => {
    const demo = await demoNow();
    // Answer the one that is waiting, in its terminal.
    expect((await asOwner('POST', `/v1/sessions/${demo.sessions.waiting}/input`, { text: 'release', enter: true })).status).toBe(200);
    await until('the answer to be noted', () => session(demo.sessions.waiting)?.noteLog.some((n) => n.text === 'Answered: release') ?? false);
    await until('it to report that it has finished', () => session(demo.sessions.waiting)?.attention.state === 'done');
    expect(session(demo.sessions.waiting)?.noteLog.at(-1)?.text).toBe('Finished: Fixed on the branch you chose. The tests pass.');
    expect(await screen(demo.sessions.waiting!)).toContain('Fixing it on "release"');

    // "Done" pressed on the run, as the button does: the strip moves on.
    const moved = await asOwner('POST', `/v1/runs/${demo.runId}/report`, { type: 'done', elementId: 'find-the-cause', note: 'Looked at it myself.' });
    expect(moved.body).toMatchObject({ run: { currentElementId: 'fix' } });
    // Enter in the stand-in's terminal: it finishes the next element itself.
    expect((await asOwner('POST', `/v1/sessions/${demo.sessions.fixing}/input`, { keys: ['Enter'] })).status).toBe(200);
    await until('the stand-in to report the next element', () => hub.state.runs.find((r) => r.id === demo.runId)?.currentElementId === 'test');
    expect(hub.state.runs.find((r) => r.id === demo.runId)?.elements[2]).toMatchObject({ state: 'done', by: { kind: 'agent' }, note: 'Done by the stand-in agent.' });
  });

  it('is the owner\'s alone: no token and no session can make or remove it', async () => {
    const strongest = (await asOwner('POST', '/v1/tokens', { name: 'every scope', scopes: [...GRANTABLE_SCOPES], reach: { kind: 'all' } })).body;
    const own = sessionToken(ownerToken, hub.state.sessions[0]!.id);
    for (const credential of [strongest.secret as string, own]) {
      for (const method of ['GET', 'POST', 'DELETE']) {
        const refused = await send({ authorization: `Bearer ${credential}` }, method, '/api/v1/demo');
        expect([401, 403]).toContain(refused.status);
      }
    }
    expect((await demoNow()).present).toBe(true);
    await asOwner('DELETE', `/v1/tokens/${strongest.token.id}`);
  });

  it('is removed whole, and leaves the state exactly as it was before it, with other canvases, sessions and work present', async () => {
    // Start from nothing of the demo.
    expect((await asOwner('DELETE', '/api/v1/demo')).body.present).toBe(false);
    await hub.flush();
    expect(hub.state.tokens.every((t) => t.revokedAt !== null)).toBe(true);

    // The owner's own things: a second canvas, terminals on both, a parked one, a workflow with a run going, a shelf element, a draft.
    const main = hub.state.canvases[0]!.id;
    const second = (await asOwner('POST', '/v1/canvases', { name: 'My work' })).body.id as string;
    const mine = (await asOwner('POST', `/v1/canvases/${main}/sessions`, { name: 'mine' })).body.session.id as string;
    const other = (await asOwner('POST', `/v1/canvases/${second}/sessions`, { name: 'other', tags: ['demo'] })).body.session.id as string;
    const set = (await asOwner('POST', `/v1/canvases/${second}/sessions`, { name: 'set aside' })).body.session.id as string;
    await asOwner('POST', `/v1/sessions/${set}/park`);
    const workflow = (await asOwner('POST', '/v1/workflows', { name: 'Fix a bug', inputs: [], elements: [{ name: 'One', instructions: 'Do one.' }, { name: 'Two', instructions: 'Do two.' }] })).body;
    expect(workflow).toMatchObject({ name: 'Fix a bug' });
    const startedMine = await asOwner('POST', `/v1/sessions/${mine}/runs`, { workflowId: workflow.id });
    expect(startedMine.body).toMatchObject({ run: { status: 'running' } });
    const myRun = startedMine.body.run.id as string;
    await asOwner('POST', '/v1/elements', { name: 'Check the sign-in page by hand', instructions: 'Mine, with the same name as the demo\'s.' });
    await asOwner('POST', '/v1/drafts', { element: { name: 'My own draft', instructions: 'Mine.' } });
    await until('their shells', async () => (await screen(mine)).includes('ready>') && (await screen(other)).includes('ready>'));
    // And a past of their own: a run that is over, and a draft they decided on.
    const pastRun = (await asOwner('POST', `/v1/sessions/${other}/runs`, { workflowId: workflow.id })).body.run.id as string;
    await asOwner('POST', `/v1/runs/${pastRun}/report`, { type: 'stop' });
    const decided = (await asOwner('POST', '/v1/drafts', { element: { name: 'Decided before the demo', instructions: 'Mine.' } })).body.draft.id as string;
    await asOwner('DELETE', `/v1/drafts/${decided}`);
    const endedRuns = async (): Promise<string[]> => ((await asOwner('GET', '/v1/runs?status=ended&limit=200')).body.items as { run: { id: string } }[]).map((item) => item.run.id);
    const draftRecords = async (): Promise<string[]> => ((await asOwner('GET', '/v1/draft-records?limit=200')).body.items as { draftId: string; outcome: string }[]).map((item) => `${item.draftId} ${item.outcome}`);
    const linesOf = async (file: string): Promise<number> => (await readFile(path.join(data, file), 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
    const pastBefore = { runs: await endedRuns(), records: await draftRecords() };
    expect(pastBefore.runs).toContain(pastRun);
    expect(pastBefore.records).toContain(`${decided} discarded`);
    const grownBefore = { runs: await linesOf(RUN_ARCHIVE_FILE), drafts: await linesOf(DRAFT_LOG_FILE) };

    const before = await stateWithoutTimes();
    const demo = await makeDemo();
    expect(await stateWithoutTimes()).not.toEqual(before);
    // Use it a little, so that there is more to take away.
    await asOwner('POST', `/v1/runs/${demo.checklistRunId}/ticks`, { elementId: 'list-what-is-left', item: 1, ticked: true });
    await asOwner('POST', `/v1/sessions/${demo.sessions.waiting}/input`, { text: 'main', enter: true });
    await until('the answer', () => session(demo.sessions.waiting)?.noteLog.some((n) => n.text === 'Answered: main') ?? false);
    // Accept what the stand-in proposed, as the tour invites: it goes on the shelf. And finish a second run on a demo terminal.
    const accepted = await asOwner('POST', `/v1/drafts/${demo.draftId}/accept`, {});
    expect(accepted.status).toBe(200);
    expect(hub.state.shelf.map((item) => item.element.name).filter((name) => name === 'Check the sign-in page by hand')).toHaveLength(2);
    const extra = (await asOwner('POST', `/v1/sessions/${demo.sessions.shell}/runs`, { workflowId: workflow.id })).body.run.id as string;
    await asOwner('POST', `/v1/runs/${extra}/report`, { type: 'stop' });
    // While the demo is there its traces are listed, as anything's would be.
    expect(await endedRuns()).toEqual(expect.arrayContaining([demo.checklistRunId, extra]));
    expect((await draftRecords()).some((record) => record === `${demo.draftId} accepted`)).toBe(true);

    const removed = await asOwner('DELETE', '/api/v1/demo');
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ present: false, ready: false, canvasId: null, sessions: {}, runId: null, checklistRunId: null, draftId: null });

    expect(await stateWithoutTimes()).toEqual(before);
    // The owner's run is still going, their terminals still run, and the demo's are gone, shells and all.
    expect(hub.state.runs.map((r) => r.id)).toEqual([myRun]);
    for (const id of [mine, other, set]) expect(await runtime.has(id)).toBe(true);
    for (const id of Object.values(demo.sessions)) expect(await runtime.has(id)).toBe(false);
    expect(existsSync(path.join(data, 'demo'))).toBe(false);
    // Nothing of the demo is in the lists of what is over: not its runs, not what became of its draft. The owner's own past is as it was.
    expect(await endedRuns()).toEqual(pastBefore.runs);
    expect(await draftRecords()).toEqual(pastBefore.records);
    expect((await asOwner('GET', `/v1/runs/${demo.checklistRunId}`)).status).toBe(404);
    // Read afresh from the files, as after a restart, it is the same.
    expect((await new FileRunArchive(data).read({ limit: 200 })).items.map((item) => item.run.id)).toEqual(pastBefore.runs);
    expect((await new FileDraftLog(data).read()).map((record) => `${record.draftId} ${record.outcome}`)).toEqual(pastBefore.records);
    // And nothing was deleted to get there: both files only grew.
    expect(await linesOf(RUN_ARCHIVE_FILE)).toBeGreaterThan(grownBefore.runs);
    expect(await linesOf(DRAFT_LOG_FILE)).toBeGreaterThan(grownBefore.drafts);
    // Removing it again changes nothing.
    expect((await asOwner('DELETE', '/api/v1/demo')).status).toBe(200);
    expect(await stateWithoutTimes()).toEqual(before);
  });

  it('keeps a terminal of the owner\'s that was put on the demo canvas: it moves to another canvas, still running', async () => {
    const demo = await makeDemo();
    const main = hub.state.canvases[0]!.id;
    const guest = (await asOwner('POST', `/v1/canvases/${demo.canvasId}/sessions`, { name: 'my own, on the demo canvas' })).body.session.id as string;
    await until('its shell', async () => (await screen(guest)).includes('ready>'));
    expect((await asOwner('DELETE', '/api/v1/demo')).status).toBe(200);
    expect(session(guest)?.state).toBe('open');
    expect(await runtime.has(guest)).toBe(true);
    expect(hub.state.canvases.find((c) => c.id === main)?.layout.nodes.map((n) => n.sessionId)).toContain(guest);
    expect(hub.state.canvases.some((c) => c.name === 'Demo')).toBe(false);
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
