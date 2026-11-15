import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, applyEvent, newId, type AppState, type ChangeEvent } from '@aubergine/shared';
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
      parkedFrom: null,
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
    expect(raw.version).toBe(2);
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
    expect(raw.version).toBe(2);
    expect(raw.layout).toBeUndefined();
    expect(await new JsonStore(dir).load()).toEqual(state);

    // The older file is kept beside the new one, and a later load does not replace it.
    const backup = `${store.file}.v1.backup`;
    expect(JSON.parse(await readFile(backup, 'utf8')).version).toBe(1);
    expect(JSON.parse(await readFile(backup, 'utf8')).layout).toBeDefined();
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
