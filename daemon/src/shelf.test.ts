import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { NO_ATTENTION, NO_STATUS, newId, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import { Element, GRANTABLE_SCOPES, SHELF_VERSIONS_KEPT, copyStatus, copyWords, elementHash, sourceOf, threeTexts, type ShelfElement, type ShelfVersion } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { FileRunArchive } from './run-archive';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * Drafts, the shelf, running one element and ticking a checklist, through
 * the routes against a real server and a real state file. Sessions are
 * records; the runtime is a stand-in that notes every line that would have
 * been typed into a terminal, which is what the safety tests look at.
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
} as unknown as SessionRuntime;

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  events = [];
  hub.subscribe((event) => events.push(event));
  const settings = new SettingsFile(dir);
  const sessions = new Sessions(hub, runtime, {});
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir) });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}
async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-shelf-'));
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
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}` }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
const asSession = (session: Session, method: string, url: string, body?: unknown): Promise<Answer> => call(sessionToken(ownerToken, session.id), method, url, body);

async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, ...more });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}

function fakeSession(name: string, more: Partial<Session> = {}): Session {
  const session: Session = { id: newId(), projectId: hub.state.project.id, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, ...more };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}
/** A session with an agent at work in it: the only kind anything is typed into. */
const agentSession = (name: string): Session => fakeSession(name, { agent: { kind: 'claude-code', conversationId: null, program: 'the-agent' }, status: { ...NO_STATUS, state: 'busy' } });


/**
 * The life of a shelf element, through the routes: versions, what a copy in a
 * workflow knows about its source, the owner's decision about a newer
 * version, where an element is used, retiring, and removal.
 */

const TIDY = { name: 'Tidy up', instructions: 'Remove what is not needed.', doneWhen: 'Nothing is left over.' };
const elementsOf = async (workflowId: string): Promise<any[]> => (await asOwner('GET', `/v1/workflows/${workflowId}`)).body.current.elements; // eslint-disable-line @typescript-eslint/no-explicit-any -- checked field by field
const shelfItem = (id: string): ShelfElement => hub.state.shelf.find((e) => e.id === id)!;
const statusOf = async (workflowId: string, elementId: string): Promise<string> => copyStatus((await elementsOf(workflowId)).find((e) => e.id === elementId), hub.state.shelf).state;

/** A shelf element, and a workflow holding a copy of it made as the editor makes one. */
async function shelfAndCopy(): Promise<{ shelfId: string; workflowId: string }> {
  const item = (await asOwner('POST', '/v1/elements', TIDY)).body as ShelfElement;
  const workflow = await asOwner('POST', '/v1/workflows', {
    name: 'Ship a change',
    elements: [
      { name: 'Build', instructions: 'Build it.', doneWhen: 'It builds.' },
      { ...TIDY, id: 'tidy', origin: { kind: 'shelf', shelfId: item.id }, source: sourceOf(item) },
    ],
  });
  expect(workflow.status).toBe(201);
  return { shelfId: item.id, workflowId: workflow.body.id as string };
}

describe('versions on the shelf', () => {
  it('a new element is version 1; a change adds a version with who, when and a line on what changed; nothing saved for nothing', async () => {
    const made = await asOwner('POST', '/v1/elements', TIDY);
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ version: 1, state: 'current', replacedBy: null });
    expect(made.body.versions).toHaveLength(1);
    expect(made.body.versions[0]).toMatchObject({ version: 1, by: { kind: 'person' }, note: '' });
    const id = made.body.id as string;

    const changed = await asOwner('PATCH', `/v1/elements/${id}`, { instructions: 'Remove what is not needed, and say what you removed.', note: 'Asks for a list of what was removed' });
    expect(changed.body.version).toBe(2);
    // Only what was sent changed; the rest is as it was.
    expect(changed.body.element).toMatchObject({ name: 'Tidy up', doneWhen: 'Nothing is left over.', instructions: 'Remove what is not needed, and say what you removed.' });
    // The same again, and a change of nothing but the note: no version.
    expect((await asOwner('PATCH', `/v1/elements/${id}`, { instructions: 'Remove what is not needed, and say what you removed.' })).body.version).toBe(2);
    expect((await asOwner('PATCH', `/v1/elements/${id}`, { note: 'only a note' })).body.version).toBe(2);

    const versions = await asOwner('GET', `/v1/elements/${id}/versions`);
    expect(versions.body.items.map((v: ShelfVersion) => [v.version, v.note, v.by.kind, v.element.instructions])).toEqual([
      [2, 'Asks for a list of what was removed', 'person', 'Remove what is not needed, and say what you removed.'],
      [1, '', 'person', 'Remove what is not needed.'],
    ]);
    // A note is one line of plain text.
    expect((await asOwner('PATCH', `/v1/elements/${id}`, { name: 'x', note: 'two\nlines' })).status).toBe(400);
    expect((await asOwner('GET', `/v1/elements/${newId()}/versions`)).status).toBe(404);
  });

  it('keeps the newest thirty, and any a copy in a workflow was made from', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    for (let n = 2; n <= SHELF_VERSIONS_KEPT + 5; n += 1) expect((await asOwner('PATCH', `/v1/elements/${shelfId}`, { instructions: `Remove what is not needed. Pass ${n}.` })).body.version).toBe(n);
    const kept = shelfItem(shelfId).versions.map((v) => v.version);
    expect(kept).toEqual([1, ...Array.from({ length: SHELF_VERSIONS_KEPT }, (_, i) => i + 6)]);
    // The copy was made from version 1, which is why that one is still there to compare with.
    expect(await statusOf(workflowId, 'tidy')).toBe('behind');
  });

  it('a token with review on cannot change the shelf; one without can, and the version says which program it was', async () => {
    const id = ((await asOwner('POST', '/v1/elements', TIDY)).body as ShelfElement).id;
    const reviewed = await makeToken('reviewed', ['read', 'workflows:write']);
    const trusted = await makeToken('release bot', ['read', 'workflows:write'], { reviewWorkflowChanges: false });
    expect((await call(reviewed, 'PATCH', `/v1/elements/${id}`, { instructions: 'By a program.' })).status).toBe(403);
    expect(shelfItem(id).version).toBe(1);
    expect((await call(reviewed, 'GET', `/v1/elements/${id}/versions`)).status).toBe(200);
    expect((await call(reviewed, 'GET', `/v1/elements/${id}/usage`)).status).toBe(200);
    const byProgram = await call(trusted, 'PATCH', `/v1/elements/${id}`, { instructions: 'By a program.', note: 'tightened' });
    expect(byProgram.status).toBe(200);
    expect(byProgram.body.versions.at(-1)).toMatchObject({ version: 2, by: { kind: 'token', name: 'release bot' }, note: 'tightened' });
  });
});

describe('a copy in a workflow', () => {
  it('is unchanged, then changed here, then behind, then both; and the owner sees which', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    expect(await statusOf(workflowId, 'tidy')).toBe('unchanged');
    expect(await statusOf(workflowId, (await elementsOf(workflowId))[0].id)).toBe('none');

    // Changed in the workflow.
    const elements = await elementsOf(workflowId);
    await asOwner('PATCH', `/v1/workflows/${workflowId}`, { elements: elements.map((e) => (e.id === 'tidy' ? { ...e, instructions: 'My own way of tidying.' } : e)) });
    expect(await statusOf(workflowId, 'tidy')).toBe('changed');
    // And the shelf moves on.
    await asOwner('PATCH', `/v1/elements/${shelfId}`, { instructions: 'Remove what is not needed. Then run the tests.', note: 'runs the tests' });
    expect(await statusOf(workflowId, 'tidy')).toBe('both');
    // A second workflow whose copy nobody touched is only behind.
    const other = await asOwner('POST', '/v1/workflows', { name: 'Other', elements: [{ ...TIDY, id: 'tidy', source: { shelfId, version: 1, hash: elementHash(Element.parse({ id: 'x', ...TIDY })) } }] });
    expect(await statusOf(other.body.id, 'tidy')).toBe('behind');

    const usage = await asOwner('GET', `/v1/elements/${shelfId}/usage`);
    expect(usage.body.uses.map((u: { workflowName: string; copies: { state: string; copiedVersion: number }[]; inVersions: number[] }) => [u.workflowName, u.copies.map((c) => [c.state, c.copiedVersion]), u.inVersions])).toEqual([
      ['Other', [['behind', 1]], [1]],
      ['Ship a change', [['both', 1]], [1, 2]],
    ]);
  });

  it('takes the newer version when its owner says so: a new version of the workflow, the same element ID, and a run that is going is not touched', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    const session = agentSession('at work');
    const run = await asOwner('POST', '/v1/runs', { workflowId, sessionId: session.id, inputs: { task: 'x' }, kickoff: false });
    expect(run.status).toBe(201);
    await asOwner('PATCH', `/v1/elements/${shelfId}`, { instructions: 'Remove what is not needed. Then run the tests.' });
    expect(await statusOf(workflowId, 'tidy')).toBe('behind');

    const taken = await asOwner('POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision: 'take' });
    expect(taken.status).toBe(200);
    expect(taken.body.version).toBe(2);
    const tidy = taken.body.current.elements.find((e: { id: string }) => e.id === 'tidy');
    expect(tidy).toMatchObject({ id: 'tidy', instructions: 'Remove what is not needed. Then run the tests.', source: { shelfId, version: 2 } });
    expect(await statusOf(workflowId, 'tidy')).toBe('unchanged');
    // The run points at the version it started on, and still says what that version said.
    const going = hub.state.runs.find((r) => r.id === run.body.run.id)!;
    expect(going.workflowVersion).toBe(1);
    expect(hub.state.workflows.find((w) => w.id === workflowId)!.versions.find((v) => v.number === 1)!.elements.find((e) => e.id === 'tidy')!.instructions).toBe('Remove what is not needed.');
    // Nothing newer is waiting: deciding again changes nothing and saves nothing.
    expect((await asOwner('POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision: 'take' })).body.version).toBe(2);
  });

  it('with changes of its own: the owner picks one text or the other, and nothing is merged', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    const mine = 'My own way of tidying.';
    const theirs = 'Remove what is not needed. Then run the tests.';
    const elements = await elementsOf(workflowId);
    await asOwner('PATCH', `/v1/workflows/${workflowId}`, { elements: elements.map((e) => (e.id === 'tidy' ? { ...e, instructions: mine } : e)) });
    await asOwner('PATCH', `/v1/elements/${shelfId}`, { instructions: theirs });
    expect(await statusOf(workflowId, 'tidy')).toBe('both');
    // The three texts are all there to be shown.
    const copy = (await elementsOf(workflowId)).find((e) => e.id === 'tidy');
    const texts = threeTexts(copy, shelfItem(shelfId));
    expect([texts.copied?.instructions, texts.mine.instructions, texts.shelf.instructions]).toEqual(['Remove what is not needed.', mine, theirs]);

    // Keeping one's own: every word stays, the newer version counts as seen.
    const kept = await asOwner('POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision: 'keep' });
    expect(kept.body.current.elements.find((e: { id: string }) => e.id === 'tidy').instructions).toBe(mine);
    expect(await statusOf(workflowId, 'tidy')).toBe('changed');
    // The shelf moves on again, and this time its text is taken.
    await asOwner('PATCH', `/v1/elements/${shelfId}`, { instructions: `${theirs} And say so.` });
    expect(await statusOf(workflowId, 'tidy')).toBe('both');
    const taken = await asOwner('POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision: 'take' });
    expect(taken.body.current.elements.find((e: { id: string }) => e.id === 'tidy').instructions).toBe(`${theirs} And say so.`);
    expect(await statusOf(workflowId, 'tidy')).toBe('unchanged');
    for (const version of hub.state.workflows.find((w) => w.id === workflowId)!.versions) {
      expect(['Remove what is not needed.', mine, `${theirs} And say so.`]).toContain(version.elements.find((e) => e.id === 'tidy')!.instructions);
    }
    // Refused for an element that is no copy, for one that is not there, and for a body that picks neither.
    const first = (await elementsOf(workflowId))[0].id as string;
    expect((await asOwner('POST', `/v1/workflows/${workflowId}/elements/${first}/shelf-update`, { decision: 'take' })).status).toBe(409);
    expect((await asOwner('POST', `/v1/workflows/${workflowId}/elements/nothing/shelf-update`, { decision: 'take' })).status).toBe(404);
    expect((await asOwner('POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision: 'merge' })).status).toBe(400);
  });

  it('is never brought up to date by a token or by a draft, and neither can say where an element came from', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    await asOwner('PATCH', `/v1/elements/${shelfId}`, { instructions: 'Remove what is not needed. Then run the tests.' });
    const latest = sourceOf(shelfItem(shelfId));
    const before = (await elementsOf(workflowId)).find((e) => e.id === 'tidy').source;
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });

    for (const decision of ['take', 'keep']) expect((await call(everything, 'POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision })).status).toBe(403);
    // It may edit the workflow, that is its scope; what it sends as a source mark is not taken.
    const elements = await elementsOf(workflowId);
    const sent = await call(everything, 'PATCH', `/v1/workflows/${workflowId}`, { elements: [...elements.map((e) => (e.id === 'tidy' ? { ...e, source: latest } : { ...e, source: latest })), { name: 'Added by a program', instructions: 'x', doneWhen: 'y', source: latest }] });
    expect(sent.status).toBe(200);
    expect(sent.body.current.elements.map((e: { source: unknown }) => e.source)).toEqual([null, before, null]);
    expect(await statusOf(workflowId, 'tidy')).toBe('behind');
    const made = await call(everything, 'POST', '/v1/workflows', { name: 'By a program', elements: [{ ...TIDY, source: latest }] });
    expect(made.body.current.elements[0].source).toBeNull();

    // A draft that revises the workflow: accepted by the owner, and the copy is still a copy from version 1.
    const draft = await call(everything, 'POST', '/v1/drafts', { revisesWorkflowId: workflowId, workflow: { name: 'Ship a change', elements: (await elementsOf(workflowId)).map((e) => ({ ...e, source: latest })) } });
    expect(draft.status).toBe(201);
    expect((await asOwner('POST', `/v1/drafts/${draft.body.draft.id}/accept`, {})).status).toBe(200);
    expect((await elementsOf(workflowId)).find((e) => e.id === 'tidy').source).toEqual(before);
    // And a new workflow from a draft has no source marks at all.
    const fresh = await call(everything, 'POST', '/v1/drafts', { workflow: { name: 'From a draft', elements: [{ ...TIDY, source: latest }] } });
    const accepted = await asOwner('POST', `/v1/drafts/${fresh.body.draft.id}/accept`, {});
    expect((await elementsOf(accepted.body.workflowId))[0].source).toBeNull();
    // The owner's own save keeps what the owner sends: the editor's marks are the owner's.
    const byOwner = await asOwner('POST', '/v1/workflows', { name: 'By the owner', elements: [{ ...TIDY, source: latest }] });
    expect(byOwner.body.current.elements[0].source).toEqual(latest);
  });
});

describe('retiring, bringing back and removing', () => {
  it('a retired element is kept and still works where it is used; it is not run by itself; it may name what to use', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    const better = ((await asOwner('POST', '/v1/elements', { ...TIDY, name: 'Tidy up, carefully' })).body as ShelfElement).id;
    const session = agentSession('runner');

    expect((await asOwner('POST', `/v1/elements/${shelfId}/retire`, { replacedBy: shelfId })).status).toBe(400);
    const retired = await asOwner('POST', `/v1/elements/${shelfId}/retire`, { replacedBy: better });
    expect(retired.body).toMatchObject({ state: 'retired', replacedBy: better, version: 1 });
    // Still listed, with its state, for whoever shows the shelf; and its copy is as it was.
    expect((await asOwner('GET', '/v1/elements')).body.items.map((e: ShelfElement) => [e.element.name, e.state])).toEqual([
      ['Tidy up', 'retired'],
      ['Tidy up, carefully', 'current'],
    ]);
    const copy = (await elementsOf(workflowId)).find((e) => e.id === 'tidy');
    expect(copyStatus(copy, hub.state.shelf)).toMatchObject({ state: 'unchanged', retired: true, replacedBy: { id: better } });
    // The workflow that holds a copy runs as before; the retired element by itself does not.
    expect((await asOwner('POST', '/v1/runs', { workflowId, sessionId: session.id, inputs: { task: 'x' }, kickoff: false })).status).toBe(201);
    const alone = await asOwner('POST', `/v1/elements/${shelfId}/run`, { sessionId: agentSession('other').id, inputs: {}, kickoff: false });
    expect(alone.status).toBe(409);
    expect(alone.body.error.message).toBe('"Tidy up" is retired and is not run by itself. Use "Tidy up, carefully".');
    // One retired element cannot stand in for another.
    expect((await asOwner('POST', `/v1/elements/${better}/retire`, { replacedBy: shelfId })).status).toBe(409);

    const back = await asOwner('POST', `/v1/elements/${shelfId}/restore`);
    expect(back.body).toMatchObject({ state: 'current', replacedBy: null });
    expect((await asOwner('POST', `/v1/elements/${shelfId}/run`, { sessionId: agentSession('third').id, inputs: {}, kickoff: false })).status).toBe(201);
    // Retiring with no body at all, and with nothing named.
    expect((await asOwner('POST', `/v1/elements/${shelfId}/retire`)).body).toMatchObject({ state: 'retired', replacedBy: null });
  });

  it('are the owner\'s: no token retires, brings back or decides, whatever its scopes', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });
    for (const [method, url, body] of [
      ['POST', `/v1/elements/${shelfId}/retire`, {}],
      ['POST', `/v1/elements/${shelfId}/restore`, undefined],
      ['POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision: 'take' }],
    ] as const) {
      expect((await call(everything, method, url, body)).status, url).toBe(403);
      expect((await asSession(agentSession('a session'), method, url, body)).status, url).toBe(403);
    }
    expect(shelfItem(shelfId).state).toBe('current');
  });

  it('removing an element that is used leaves the copies as they are, saying their source was removed', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    const old = ((await asOwner('POST', '/v1/elements', { ...TIDY, name: 'Old way' })).body as ShelfElement).id;
    await asOwner('POST', `/v1/elements/${old}/retire`, { replacedBy: shelfId });
    const before = JSON.stringify((await elementsOf(workflowId)).find((e) => e.id === 'tidy'));
    // Whoever removes it can be told first where it is used.
    expect((await asOwner('GET', `/v1/elements/${shelfId}/usage`)).body.uses).toHaveLength(1);

    expect((await asOwner('DELETE', `/v1/elements/${shelfId}`)).status).toBe(204);
    expect(JSON.stringify((await elementsOf(workflowId)).find((e) => e.id === 'tidy'))).toBe(before);
    const status = copyStatus((await elementsOf(workflowId)).find((e) => e.id === 'tidy'), hub.state.shelf);
    expect(status.state).toBe('gone');
    expect(copyWords(status)).toMatch(/whose source is not on the shelf/);
    // Nothing to take any more, and the retired one no longer names it.
    expect((await asOwner('POST', `/v1/workflows/${workflowId}/elements/tidy/shelf-update`, { decision: 'take' })).status).toBe(409);
    expect(shelfItem(old)).toMatchObject({ state: 'retired', replacedBy: null });
    expect((await asOwner('GET', `/v1/elements/${shelfId}/usage`)).status).toBe(404);
  });
});

describe('through a restart', () => {
  it('versions, states and the marks of copies are there again', async () => {
    const { shelfId, workflowId } = await shelfAndCopy();
    await asOwner('PATCH', `/v1/elements/${shelfId}`, { instructions: 'Remove what is not needed. Then run the tests.', note: 'second' });
    await asOwner('POST', `/v1/elements/${shelfId}/retire`, {});
    await stop();
    await start();
    expect(shelfItem(shelfId)).toMatchObject({ version: 2, state: 'retired' });
    expect(shelfItem(shelfId).versions.map((v) => [v.version, v.note])).toEqual([
      [1, ''],
      [2, 'second'],
    ]);
    expect(await statusOf(workflowId, 'tidy')).toBe('behind');
  });
});
