import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyEvent, newId, type CanvasState, type ChangeEvent } from '@aubergine/shared';
import { JsonStore } from './json-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-store-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function withSession(state: CanvasState, name: string): CanvasState {
  const sessionId = newId();
  const event: ChangeEvent = {
    type: 'session.created',
    session: {
      id: sessionId,
      projectId: state.project.id,
      name,
      createdAt: new Date().toISOString(),
    },
    node: { id: newId(), sessionId, x: 0, y: 0, width: 720, height: 440 },
  };
  return applyEvent(state, event);
}

describe('JsonStore', () => {
  it('starts with a default organization, workspace and project', async () => {
    const state = await new JsonStore(dir).load();
    expect(state.sessions).toEqual([]);
    expect(state.layout.nodes).toEqual([]);
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
    expect(raw.version).toBe(1);
    expect(Object.keys(raw.sessions[0]).sort()).toEqual(['createdAt', 'id', 'name', 'projectId']);
    expect(raw.layout.nodes[0].sessionId).toBe(raw.sessions[0].id);
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

  it('drops layout nodes whose session no longer exists', async () => {
    const store = new JsonStore(dir);
    const state = withSession(await store.load(), 'one');
    await store.save({ ...state, sessions: [] });
    expect((await new JsonStore(dir).load()).layout.nodes).toEqual([]);
  });
});
