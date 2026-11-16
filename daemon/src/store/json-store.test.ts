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
      projectId: state.project.id,
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
    recap: null, takesMessages: false, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null },
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
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
    expect(state.project.workspaceId).toBe(state.workspace.id);
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
    expect(raw.version).toBe(9);
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
    expect(main).toMatchObject({ name: 'Main', projectId: state.project.id, order: 0, color: 'none', labels: {} });
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
    expect(raw.version).toBe(9);
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
    expect(raw.version).toBe(9);
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
    expect(raw.version).toBe(9);
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
    expect(raw.version).toBe(9);
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
    expect(raw.version).toBe(9);
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
    expect(raw.version).toBe(9);
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v6.backup`, 'utf8')).toBe(fixture);
  });

  it('loads a file from before shelf versions: what each shelf element says is its version 1, and a copy is marked as from a version nobody recorded', async () => {
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
    expect(raw.version).toBe(9);
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
    expect(state.shelf).toEqual(before.shelf);
    expect(state.workflows).toEqual(before.workflows);
    expect(state.sessions.length).toBe(before.sessions.length);

    await store.save(state);
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    expect(raw.version).toBe(9);
    expect(raw.library).toEqual({ sources: [], installed: [], requests: [] });
    expect(await new JsonStore(dir).load()).toEqual(state);
    expect(await readFile(`${store.file}.v8.backup`, 'utf8')).toBe(fixture);
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
