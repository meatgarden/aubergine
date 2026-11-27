import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, applyEvent, newId, type AppState, type ChangeEvent, copyStatus, usesOf } from '@aubergine/shared';
import { JsonStore } from './json-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-store-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function withSession(state: AppState, name: string): AppState {
  const sessionId = newId();
  const event: ChangeEvent = {
    type: 'session.created',
    canvasId: state.canvases[0]!.id,
    session: {
      id: sessionId,
      projectId: state.projects[0]!.id,
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
      parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null,
    lastInputAt: null,
    lastOutputAt: null,
    tags: [], fields: [],
    },
    node: { id: newId(), sessionId, x: 0, y: 0, width: 720, height: 440, color: 'none' },
  };
  return applyEvent(state, event);
}

describe('JsonStore', () => {
  it('starts with a default organization, workspace and project', async () => {
    const state = await new JsonStore(dir).load();
    expect(state.sessions).toEqual([]);
    expect(state.canvases.map((c) => [c.name, c.layout.nodes.length])).toEqual([['Main', 0]]);
    expect(state.projects[0]!.workspaceId).toBe(state.workspace.id);
    expect(state.workspace.organizationId).toBe(state.organization.id);
  });

  it('round-trips sessions and layout through a new store instance', async () => {
    const store = new JsonStore(dir);
    const state = withSession(withSession(await store.load(), 'one'), 'two');
    await store.save(state);
    expect(await new JsonStore(dir).load()).toEqual(state);
  });

  it('keeps layout in its own section, linked to sessions by ID', async () => {
    const store = new JsonStore(dir);
    const state = withSession(await store.load(), 'one');
    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.sessions[0]).not.toHaveProperty('x');
    expect(raw.sessions[0]).not.toHaveProperty('width');
    expect(raw.canvases[0].layout.nodes[0].sessionId).toBe(raw.sessions[0].id);
  });

  it('creates the data folder when it does not exist', async () => {
    const nested = path.join(dir, 'a', 'b');
    const store = new JsonStore(nested);
    await store.save(await store.load());
    expect(await readdir(nested)).toEqual(['state.json']);
  });

  it('leaves no temporary files and ends with the newest of many concurrent saves', async () => {
    const store = new JsonStore(dir);
    let state = await store.load();
    const saves: Promise<void>[] = [];
    for (let i = 0; i < 25; i++) {
      state = withSession(state, `s${i}`);
      saves.push(store.save(state));
    }
    await Promise.all(saves);
    expect(await readdir(dir)).toEqual(['state.json']);
    expect((await new JsonStore(dir).load()).sessions).toHaveLength(25);
  });

  it('never leaves a half-written file behind', async () => {
    const store = new JsonStore(dir);
    let state = await store.load();
    const reads: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      state = withSession(state, `s${i}`);
      const save = store.save(state);
      reads.push(
        save.then(async () => {
          JSON.parse(await readFile(store.file, 'utf8'));
        }),
      );
    }
    await Promise.all(reads);
  });

  it('sets an unreadable file aside instead of overwriting it', async () => {
    const warnings: string[] = [];
    const store = new JsonStore(dir, (m) => warnings.push(m));
    await writeFile(store.file, '{ "version": 1, "sessions": [');
    const state = await store.load();
    expect(state.sessions).toEqual([]);
    expect(warnings).toHaveLength(1);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^state\.json\.unreadable-\d+$/);
  });

  it('rejects a file that does not match the schema', async () => {
    const store = new JsonStore(dir);
    await writeFile(store.file, JSON.stringify({ version: 1, sessions: [{ id: 'nope' }] }));
    expect((await store.load()).sessions).toEqual([]);
    expect((await readdir(dir))[0]).toMatch(/unreadable/);
  });

  it('reads a state file written before sessions had a state, folder or note', async () => {
    const store = new JsonStore(dir);
    const state = withSession(await store.load(), 'old');
    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    for (const key of ['state', 'cwd', 'command', 'note']) delete raw.sessions[0][key];
    await writeFile(store.file, JSON.stringify(raw));
    expect((await new JsonStore(dir).load()).sessions[0]).toMatchObject({ name: 'old', state: 'open', cwd: null, note: '' });
  });

  it('opens a state file from before canvases as one canvas named "Main", with everything in place', async () => {
    // A file as stage 3 wrote it: one layout, a parked session whose node is still in it,
    // an ended session, a frame, notes, and one node left over from a session that is gone.
    await copyFile(new URL('./fixtures/state-stage-3.json', import.meta.url), path.join(dir, 'state.json'));
    const store = new JsonStore(dir);
    const state = await store.load();

    expect(state.canvases).toHaveLength(1);
    const [main] = state.canvases;
    expect(main).toMatchObject({ name: 'Main', projectId: state.projects[0]!.id, order: 0, color: 'none', labels: {} });
    expect(main?.layout.frames.map((f) => f.label)).toEqual(['Backend']);
    // Open and ended sessions keep their nodes, exactly where they were.
    const byName = (name: string) => state.sessions.find((s) => s.name === name)!;
    expect(main?.layout.nodes.map((n) => [n.sessionId, n.x, n.y, n.color])).toEqual([
      [byName('api').id, 0, 0, 'blue'],
      [byName('web').id, 760, 0, 'none'],
      [byName('old build').id, 760, 480, 'none'],
    ]);
    // The parked session is on no canvas and remembers where it sat.
    expect(byName('logs')).toMatchObject({
      state: 'parked',
      parkedFrom: { canvasId: main?.id, rect: { x: 0, y: 480, width: 800, height: 500 }, color: 'green' },
    });
    // Nothing about the sessions themselves is lost.
    expect(byName('api')).toMatchObject({ note: '# API\nretry logic', attention: { state: 'waiting' }, agent: null });
    expect(byName('api').noteLog).toHaveLength(1);
    expect(byName('old build').state).toBe('exited');

    // Saving writes the current shape, which loads back the same.
    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.layout).toBeUndefined();
    expect(await new JsonStore(dir).load()).toEqual(state);

    // The older file is kept beside the new one, and a later load does not replace it.
    const backup = `${store.file}.v1.backup`;
    expect(JSON.parse(await readFile(backup, 'utf8')).version).toBe(1);
    expect(JSON.parse(await readFile(backup, 'utf8')).layout).toBeDefined();
  });

  it('loads a file from before API tokens with none, and keeps a copy of it', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-canvases-v2.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);

    const state = await store.load();
    expect(state.tokens).toEqual([]);
    expect(state.canvases.map((c) => [c.name, c.color, c.layout.nodes.length])).toEqual([
      ['Main', 'none', 1],
      ['Deploys', 'green', 1],
    ]);
    expect(state.canvases[1]?.labels).toEqual({ team: 'ops' });
    expect(state.sessions.find((s) => s.name === 'api')).toMatchObject({ note: 'retry logic', tags: ['backend'], lastInputAt: '2026-02-01T09:30:00.000Z' });

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.tokens).toEqual([]);
    expect(await new JsonStore(dir).load()).toEqual(state);
    // The file as it was, byte for byte, is beside the new one.
    expect(await readFile(`${store.file}.v2.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before workflows with none, and keeps a copy of it', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-tokens-v3.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);

    const state = await store.load();
    expect(state.workflows).toEqual([]);
    expect(state.runs).toEqual([]);
    // Everything that was there is still there.
    expect(state.tokens.map((t) => [t.name, t.scopes])).toEqual([['build script', ['read', 'sessions:write']]]);
    expect(state.canvases.map((c) => [c.name, c.layout.nodes.length])).toEqual([
      ['Main', 1],
      ['Deploys', 1],
    ]);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.workflows).toEqual([]);
    expect(raw.runs).toEqual([]);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v3.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before drafts and outputs: workflows and runs as they were, notes untouched', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-workflows-v4.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);

    const state = await store.load();
    expect(state.drafts).toEqual([]);
    expect(state.shelf).toEqual([]);
    // What was there reads as before, with what is new filled in as "nothing".
    expect(state.workflows.map((w) => [w.name, w.listed, w.versions.length])).toEqual([['Ship a change', true, 2]]);
    expect(state.workflows[0]?.versions[1]?.elements.map((e) => [e.id, e.needs, e.produces])).toEqual([
      ['plan', [], 'note'],
      ['build', [], 'note'],
    ]);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.elements.map((e) => [e.state, e.note, e.output, e.ticks])).toEqual([
      ['done', 'Planned: one file changes.', null, []],
      ['active', '', null, []],
    ]);
    expect(state.tokens.map((t) => [t.name, t.reviewWorkflowChanges])).toEqual([['build script', false]]);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v4.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before repository workflows, with nothing accepted, and keeps a copy of it', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-drafts-v5.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);

    const state = await store.load();
    expect(state.repositoryAccepted).toEqual([]);
    expect(state.drafts.map((d) => [d.kind, d.status, d.element?.name])).toEqual([['element', 'waiting', 'Collect my to-dos']]);
    expect(state.shelf.map((e) => e.element.name)).toEqual(['Tidy up']);
    expect(state.workflows).toHaveLength(1);
    expect(state.runs).toHaveLength(1);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.repositoryAccepted).toEqual([]);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v5.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before terminal access: sessions open to tokens as before, tokens reaching no terminal', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-repository-v6.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);

    const state = await store.load();
    expect(state.sessions.length).toBeGreaterThan(0);
    expect(state.sessions.map((s) => [s.peopleOnly, s.typedBy])).toEqual(state.sessions.map(() => [false, null]));
    expect(state.tokens.map((t) => [t.name, t.scopes, t.reach])).toEqual([['build script', ['read', 'sessions:write'], null]]);
    expect(state.repositoryAccepted.map((e) => e.file)).toEqual(['release.json']);
    expect(state.drafts).toHaveLength(1);
    expect(state.shelf).toHaveLength(1);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v6.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before shelf versions: what each saved step says is its version 1, and a copy is marked as from a version nobody recorded', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-terminal-access-v7.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const before = JSON.parse(fixture);

    const state = await store.load();
    const [item] = state.shelf;
    expect(state.shelf).toHaveLength(1);
    expect(item).toMatchObject({ version: 1, state: 'current', replacedBy: null });
    expect(item!.versions).toEqual([{ version: 1, element: item!.element, at: item!.updatedAt, by: { kind: 'person' }, note: '' }]);
    expect(item!.element.name).toBe(before.shelf[0].element.name);
    expect(item!.element.instructions).toBe(before.shelf[0].element.instructions);

    // Every kept version of the workflow: the copy says which shelf element, and that the version and the content as copied are not known.
    const workflow = state.workflows[0]!;
    for (const version of workflow.versions) {
      expect(version.elements.find((e) => e.id === 'from-the-shelf')?.source, `version ${version.number}`).toEqual({ shelfId: item!.id, version: null, hash: null });
    }
    const latest = workflow.versions.at(-1)!;
    expect(latest.elements.map((e) => [e.id, e.source?.shelfId ?? null])).toEqual([
      ['plan', null],
      ['build', null],
      ['from-the-shelf', item!.id],
      ['orphan', '01900000-0000-7000-8000-00000000dead'],
    ]);
    // What can be told: nothing about the one, and of the other that its source is not there. Neither is called behind.
    expect(copyStatus(latest.elements[2]!, state.shelf).state).toBe('unknown');
    expect(copyStatus(latest.elements[3]!, state.shelf).state).toBe('gone');
    expect(usesOf(item!.id, state.workflows, state.shelf)).toEqual([{ workflowId: workflow.id, workflowName: workflow.name, workflowVersion: latest.number, copies: [{ elementId: 'from-the-shelf', name: 'Tidy up', state: 'unknown', copiedVersion: null }], inVersions: workflow.versions.map((v) => v.number) }]);
    // What the elements say is as it was, word for word.
    expect(latest.elements.map((e) => [e.name, e.instructions])).toEqual(before.workflows[0].versions.at(-1).elements.map((e: { name: string; instructions: string }) => [e.name, e.instructions]));

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v7.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before the library: no sources, nothing installed, nothing waiting, and everything else as it was', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-shelf-v8.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const before = JSON.parse(fixture);

    const state = await store.load();
    expect(state.library).toEqual({ sources: [], installed: [], requests: [] });
    // Everything the file said is still said; elements have gained two empty fields since.
    expect(state.shelf).toMatchObject(before.shelf);
    // What was the one project's workflow is shared with every project now; nothing else about it changed.
    expect(state.workflows).toMatchObject(before.workflows.map((workflow: object) => ({ ...workflow, projectId: null })));
    expect(state.sessions.length).toBe(before.sessions.length);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.library).toEqual({ sources: [], installed: [], requests: [] });
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v8.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before approvals: its run keeps its status and gains an empty list of decisions, and the older file is kept', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-library-v9.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const before = JSON.parse(fixture);

    const state = await store.load();
    expect(state.runs.length).toBe(before.runs.length);
    expect(state.runs[0]?.status).toBe(before.runs[0].status);
    expect(state.runs[0]?.history).toEqual([]);
    expect(state.runs[0]?.elements.every((e) => e.sentBack === null)).toBe(true);
    expect(state.workflows.flatMap((w) => w.versions.flatMap((v) => v.elements.map((e) => [e.ask, e.lookAt])))).toSatisfy((pairs: string[][]) => pairs.every(([ask, lookAt]) => ask === '' && lookAt === ''));
    // A source stored under its address, cut short, loses that name; one the owner named keeps it.
    expect(state.library.sources.map((s) => [s.name, s.claims, s.address === before.library.sources.find((b: { id: string }) => b.id === s.id).address])).toEqual([['', null, true], ["The team's", null, true]]);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v9.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before working copies: nothing was prepared for any session, everything else is as it was, and the older file is kept', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-approvals-v10.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const before = JSON.parse(fixture);

    const state = await store.load();
    expect(state.environments).toEqual([]);
    expect(state.sessions.length).toBe(before.sessions.length);
    expect(state.runs).toMatchObject(before.runs);
    expect(state.library).toMatchObject(before.library);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.environments).toEqual([]);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v10.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before the queue: no tasks, nothing asked, no rules, three at once, nothing held and nothing starting by itself; the older file is kept', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-copies-v11.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const before = JSON.parse(fixture);

    const state = await store.load();
    expect(state.queue).toEqual({ tasks: [], asks: [], rules: [], settings: {}, ruleRuns: [] });
    expect(state.environments).toMatchObject(before.environments);
    expect(state.runs).toMatchObject(before.runs);
    expect(state.sessions.length).toBe(before.sessions.length);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.queue.settings).toEqual({});
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v11.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before schedules: none, never looked at; its tasks run no saved step and were not arranged beforehand; the older file is kept', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-queue-v12.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const before = JSON.parse(fixture);

    const state = await store.load();
    expect(state.schedules).toEqual({ items: [], checkedAt: null });
    expect(state.queue.tasks.map((task) => [task.title, task.state, task.elementId, task.unattended])).toEqual([
      ['Write the release notes', 'queued', null, false],
      ['Add a test for the retry', 'proposed', null, false],
    ]);
    expect(state.queue).toMatchObject({ settings: { [before.project.id]: { limit: 2, hold: true, automatic: false } }, asks: before.queue.asks, rules: before.queue.rules });
    expect(state.environments).toMatchObject(before.environments);
    expect(state.sessions.length).toBe(before.sessions.length);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.schedules).toEqual({ items: [], checkedAt: null });
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v12.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before projects: everything goes into the one project it has, which keeps its ID and its name; nothing is lost, renamed or duplicated', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-schedules-v13.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const before = JSON.parse(fixture);
    const one = before.project.id as string;

    const state = await store.load();
    // One project: the one there was, by its ID and by the name its owner gave it; open, kept by this server, with no folders yet.
    expect(state.projects).toEqual([{ ...before.project, color: 'none', order: 0, labels: {}, folders: [], defaultFolder: null, home: { kind: 'local' }, state: 'open' }]);
    expect(state.sharing).toEqual({});
    // Every kind of thing is there as often as it was, under the names it had.
    const ids = (things: { id: string }[]): string[] => things.map((thing) => thing.id).sort();
    const names = (things: { name?: string; title?: string }[]): (string | undefined)[] => things.map((thing) => thing.name ?? thing.title);
    for (const [now, was] of [
      [state.sessions, before.sessions],
      [state.canvases, before.canvases],
      [state.tokens, before.tokens],
      [state.workflows, before.workflows],
      [state.runs, before.runs],
      [state.drafts, before.drafts],
      [state.shelf, before.shelf],
      [state.library.sources, before.library.sources],
      [state.library.installed, before.library.installed],
      [state.environments, before.environments],
      [state.queue.tasks, before.queue.tasks],
      [state.queue.asks, before.queue.asks],
      [state.queue.rules, before.queue.rules],
      [state.schedules.items, before.schedules.items],
    ] as const) {
      expect(ids(now as { id: string }[])).toEqual(ids(was));
      expect(new Set(ids(now as { id: string }[])).size).toBe(was.length);
      expect(names(now as { name?: string }[])).toEqual(names(was));
    }
    expect(state.repositoryAccepted).toHaveLength(before.repositoryAccepted.length);
    // What belongs to a project says so: the one project.
    for (const thing of [...state.sessions, ...state.canvases, ...state.runs, ...state.environments, ...state.queue.tasks, ...state.queue.asks, ...state.queue.rules, ...state.schedules.items]) expect(thing.projectId).toBe(one);
    // How tasks are started is that project's.
    expect(state.queue.settings).toEqual({ [one]: { limit: before.queue.limit, hold: before.queue.hold, automatic: before.queue.automatic } });
    // What can be shared is shared with every project, and tokens reach every project.
    for (const thing of [...state.workflows, ...state.shelf, ...state.library.sources, ...state.library.installed, ...state.tokens]) expect(thing.projectId).toBeNull();
    for (const token of state.tokens) expect(token.projects).toEqual({ kind: 'all' });
    // The layout, a canvas's place among the tabs and what a terminal is called are as they were.
    expect(state.canvases.map((canvas) => [canvas.id, canvas.name, canvas.order, canvas.layout.nodes.length])).toEqual(before.canvases.map((canvas: { id: string; name: string; order: number; layout: { nodes: unknown[] } }) => [canvas.id, canvas.name, canvas.order, canvas.layout.nodes.length]));

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.project).toBeUndefined();
    expect(raw.projects).toHaveLength(1);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v13.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before devices with none, everything else as it was, and keeps a copy of it', async () => {
    const store = new JsonStore(dir);
    const fixture = await readFile(new URL('./fixtures/state-projects-v14.json', import.meta.url), 'utf8');
    await mkdir(dir, { recursive: true });
    await writeFile(store.file, fixture);
    const { version: _version, ...before } = JSON.parse(fixture);

    const state = await store.load();
    expect(state.devices).toEqual([]);
    // Fields came later still, with a default and no new version: each terminal of the file has none.
    expect(state.sessions.map((session) => session.fields)).toEqual(before.sessions.map(() => []));
    // So did a terminal's own color theme: each terminal of the file has none, and is drawn in the default.
    expect(state.sessions.map((session) => session.theme)).toEqual(before.sessions.map(() => null));
    const sessionsBefore = (before.sessions as object[]).map((session) => ({ ...session, fields: [], theme: null }));
    expect({ ...state, devices: undefined }).toEqual({ ...before, sessions: sessionsBefore, devices: undefined });

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(15);
    expect(raw.devices).toEqual([]);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v14.backup`, 'utf8')).toBe(fixture);
  });

  it('keeps a working copy whose session is no longer in the file, and says its session is gone', async () => {
    const store = new JsonStore(dir);
    const state = withSession(await store.load(), 'one');
    const sessionId = state.sessions[0]!.id;
    const copy = (id: string, of: string | null) => ({ id, projectId: state.projects[0]!.id, kind: 'working-copy', title: 'In its own working copy', words: 'Kept apart.', sessionId: of, sessionName: 'one', projectFolder: '/home/someone/project', folder: '/home/someone/data/copies/one-0a1b2c', startFolder: '/home/someone/data/copies/one-0a1b2c', branch: 'aubergine/one-0a1b2c', startCommit: 'a'.repeat(40), createdAt: '2026-05-01T10:00:00.000Z', changes: null, broken: null });
    await store.save({ ...state, environments: [copy(newId(), sessionId), copy(newId(), newId())] });
    const loaded = await new JsonStore(dir).load();
    expect(loaded.environments.map((e) => e.sessionId)).toEqual([sessionId, null]);
  });

  it('keeps a session on one canvas only, if a file ever says otherwise', async () => {
    const store = new JsonStore(dir);
    const state = withSession(await store.load(), 'one');
    const node = state.canvases[0]!.layout.nodes[0]!;
    const twice = { ...state, canvases: [state.canvases[0]!, { ...state.canvases[0]!, id: newId(), name: 'Copy', layout: { nodes: [{ ...node, id: newId() }], frames: [] } }] };
    await store.save(twice);
    const loaded = await new JsonStore(dir).load();
    expect(loaded.canvases.map((c) => c.layout.nodes.length)).toEqual([1, 0]);
  });

  it("drops layout nodes whose session no longer exists", async () => {
    const store = new JsonStore(dir);
    const state = withSession(await store.load(), 'one');
    await store.save({ ...state, sessions: [] });
    expect((await new JsonStore(dir).load()).canvases[0]?.layout.nodes).toEqual([]);
  });
});
