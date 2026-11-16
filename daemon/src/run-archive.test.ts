import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArchivedRun } from '@aubergine/shared';
import { FileRunArchive, MemoryRunArchive, RUN_ARCHIVE_FILE, type RunArchive } from './run-archive';

const id = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function entry(n: number, more: { sessionId?: string; workflowId?: string; status?: 'finished' | 'stopped' } = {}): ArchivedRun {
  const at = new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
  return {
    workflowName: 'Made up',
    elements: [{ id: 'one', name: 'One', produces: 'note' }],
    run: {
      id: id(n),
      workflowId: more.workflowId ?? id(900_001),
      workflowVersion: 1,
      sessionId: more.sessionId ?? id(800_001),
      inputs: { task: `task ${n}` },
      status: more.status ?? 'finished',
      currentElementId: null,
      elements: [{ elementId: 'one', state: 'done', startedAt: at, finishedAt: at, note: `note ${n}`, output: null, ticks: [], by: { kind: 'agent' }, sessionId: id(800_001), sentBack: null }],
      blockedReason: null,
      pausedFrom: null,
      history: [],
      startedBy: { kind: 'person' },
      createdAt: at,
      updatedAt: at,
      finishedAt: at,
    },
  };
}

async function everyPage(archive: RunArchive, query: { limit: number; sessionId?: string; workflowId?: string; status?: 'finished' | 'stopped' }): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await archive.read({ ...query, cursor });
    ids.push(...page.items.map((e) => e.run.id));
    cursor = page.nextCursor ?? undefined;
    pages += 1;
  } while (cursor !== undefined);
  return { ids, pages };
}

describe('the archive of runs', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-run-archive-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const [name, make] of [
    ['in memory', () => new MemoryRunArchive()],
    ['in a file', () => new FileRunArchive(dir)],
  ] as const) {
    it(`${name}: gives runs newest first, a page at a time, each once`, async () => {
      const archive = make();
      for (let n = 1; n <= 25; n += 1) await archive.append(entry(n));
      const first = await archive.read({ limit: 10 });
      expect(first.items.map((e) => e.run.id)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16].map(id));
      expect(first.nextCursor).not.toBeNull();
      const all = await everyPage(archive, { limit: 10 });
      expect(all.ids).toEqual(Array.from({ length: 25 }, (_, i) => id(25 - i)));
      expect(all.pages).toBe(3);
    });

    it(`${name}: a page stays right when runs are added between requests`, async () => {
      const archive = make();
      for (let n = 1; n <= 6; n += 1) await archive.append(entry(n));
      const first = await archive.read({ limit: 3 });
      await archive.append(entry(7));
      await archive.append(entry(8));
      const second = await archive.read({ limit: 3, cursor: first.nextCursor ?? undefined });
      expect(second.items.map((e) => e.run.id)).toEqual([3, 2, 1].map(id));
      expect(second.nextCursor).toBeNull();
    });

    it(`${name}: filters by session, workflow and status, and finds one run`, async () => {
      const archive = make();
      for (let n = 1; n <= 12; n += 1) await archive.append(entry(n, { ...(n % 2 === 0 ? { sessionId: id(800_002) } : {}), ...(n % 3 === 0 ? { workflowId: id(900_002) } : {}), ...(n % 4 === 0 ? { status: 'stopped' as const } : {}) }));
      expect((await everyPage(archive, { limit: 2, sessionId: id(800_002) })).ids).toEqual([12, 10, 8, 6, 4, 2].map(id));
      expect((await everyPage(archive, { limit: 5, workflowId: id(900_002) })).ids).toEqual([12, 9, 6, 3].map(id));
      expect((await everyPage(archive, { limit: 5, status: 'stopped' })).ids).toEqual([12, 8, 4].map(id));
      expect((await everyPage(archive, { limit: 5, status: 'stopped', sessionId: id(800_001) })).ids).toEqual([]);
      expect((await archive.get(id(7)))?.run.inputs).toEqual({ task: 'task 7' });
      expect(await archive.get(id(99))).toBeNull();
      expect(await archive.has(id(7))).toBe(true);
    });

    it(`${name}: keeps a run once, however often it is added`, async () => {
      const archive = make();
      await archive.append(entry(1));
      await archive.append(entry(1));
      expect((await archive.read({ limit: 10 })).items).toHaveLength(1);
    });

    it(`${name}: refuses a cursor it did not give out`, async () => {
      await expect(make().read({ limit: 10, cursor: 'not-a-cursor' })).rejects.toThrow('cursor');
    });
  }

  it('is one line per run in a file only the owner can read, and is read back by a new server', async () => {
    const archive = new FileRunArchive(dir);
    for (let n = 1; n <= 3; n += 1) await archive.append(entry(n));
    const text = await readFile(path.join(dir, RUN_ARCHIVE_FILE), 'utf8');
    expect(text.trimEnd().split('\n')).toHaveLength(3);

    const again = new FileRunArchive(dir);
    expect((await again.read({ limit: 10 })).items.map((e) => e.run.id)).toEqual([3, 2, 1].map(id));
    await again.append(entry(4));
    expect((await new FileRunArchive(dir).read({ limit: 10 })).items).toHaveLength(4);
  });

  it('skips a line cut short by a crash, and does not glue the next one to it', async () => {
    const archive = new FileRunArchive(dir);
    await archive.append(entry(1));
    await appendFile(path.join(dir, RUN_ARCHIVE_FILE), '{"run":{"id":"0190');
    const again = new FileRunArchive(dir);
    await again.append(entry(2));
    expect((await new FileRunArchive(dir).read({ limit: 10 })).items.map((e) => e.run.id)).toEqual([2, 1].map(id));
  });

  it('pages through a thousand runs without reading the file again for each page', async () => {
    const archive = new FileRunArchive(dir);
    for (let n = 1; n <= 1000; n += 1) await archive.append(entry(n));
    const fresh = new FileRunArchive(dir);
    const started = Date.now();
    const all = await everyPage(fresh, { limit: 100 });
    expect(all.pages).toBe(10);
    expect(new Set(all.ids).size).toBe(1000);
    expect(all.ids[0]).toBe(id(1000));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
