import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArchivedRun, DraftRecord } from '@aubergine/shared';
import { DRAFT_LOG_FILE, FileDraftLog, MemoryDraftLog, withoutWithdrawn, type DraftLog } from './draft-log';
import { FileRunArchive, MemoryRunArchive, RUN_ARCHIVE_FILE, type RunArchive } from './run-archive';

const SESSION_A = '01900000-0000-7000-8000-0000000000a1';
const SESSION_B = '01900000-0000-7000-8000-0000000000b1';
const id = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const run = (n: number, sessionId: string | null): ArchivedRun =>
  ({
    run: { id: id(n), workflowId: id(900), workflowVersion: 1, sessionId, inputs: {}, status: 'finished', currentElementId: null, elements: [], blockedReason: null, pausedFrom: null, startedBy: { kind: 'person' }, createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z', finishedAt: '2026-03-01T10:00:00.000Z' },
    workflowName: `Run ${n}`,
    elements: [],
  }) as ArchivedRun;
const record = (n: number, sessionId: string, outcome: DraftRecord['outcome'] = 'discarded'): DraftRecord => ({ at: '2026-03-01T10:00:00.000Z', draftId: id(n), kind: 'element', proposedBy: { kind: 'session', sessionId }, revisions: 1, outcome, by: { kind: 'owner', sessionId: null } });

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-withdraw-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

for (const [name, make] of [
  ['in memory', (): RunArchive => new MemoryRunArchive()],
  ['in a file', (): RunArchive => new FileRunArchive(dir)],
] as const) {
  describe(`withdrawing runs from the archive, ${name}`, () => {
    it('takes out the runs of those sessions and no others, for every way of reading', async () => {
      const archive = make();
      await archive.append(run(1, SESSION_A));
      await archive.append(run(2, SESSION_B));
      await archive.append(run(3, SESSION_A));
      await archive.append(run(4, null));
      await archive.withdraw(new Set([SESSION_A]));
      expect((await archive.read({ limit: 10 })).items.map((e) => e.workflowName)).toEqual(['Run 4', 'Run 2']);
      expect(await archive.get(id(1))).toBeNull();
      expect(await archive.has(id(3))).toBe(false);
      expect(await archive.has(id(2))).toBe(true);
      // Gone for good: it is not taken in again, and cannot be changed back into being there.
      await archive.append(run(1, SESSION_A));
      await archive.amend(run(3, SESSION_A));
      expect((await archive.read({ limit: 10 })).items).toHaveLength(2);
      // Withdrawing again, or for a session with nothing, changes nothing.
      await archive.withdraw(new Set([SESSION_A, id(77)]));
      expect((await archive.read({ limit: 10 })).items).toHaveLength(2);
    });
  });
}

describe('the archive file', () => {
  it('only grows when runs are withdrawn, and reads the same after a restart', async () => {
    const archive = new FileRunArchive(dir);
    await archive.append(run(1, SESSION_A));
    await archive.append(run(2, SESSION_B));
    const before = await readFile(path.join(dir, RUN_ARCHIVE_FILE), 'utf8');
    await archive.withdraw(new Set([SESSION_A]));
    const after = await readFile(path.join(dir, RUN_ARCHIVE_FILE), 'utf8');
    expect(after.startsWith(before)).toBe(true);
    expect(after.split('\n').filter(Boolean)).toHaveLength(3);
    expect(JSON.parse(after.split('\n')[2] as string)).toMatchObject({ withdrawn: true, run: { id: id(1) } });
    const again = new FileRunArchive(dir);
    expect((await again.read({ limit: 10 })).items.map((e) => e.run.id)).toEqual([id(2)]);
    expect(await again.has(id(1))).toBe(false);
  });
});

for (const [name, make] of [
  ['in memory', (): DraftLog => new MemoryDraftLog()],
  ['in a file', (): DraftLog => new FileDraftLog(dir)],
] as const) {
  describe(`withdrawing records of drafts, ${name}`, () => {
    it('leaves out every record of a draft those sessions proposed, and keeps the rest', async () => {
      const log = make();
      await log.append(record(1, SESSION_A, 'accepted'));
      await log.append(record(2, SESSION_B));
      await log.append(record(3, SESSION_A));
      await log.append({ ...record(4, SESSION_A), proposedBy: { kind: 'person' } });
      await log.withdraw(new Set([SESSION_A]));
      expect((await log.read()).map((r) => r.draftId)).toEqual([id(4), id(2)]);
      await log.withdraw(new Set([SESSION_A]));
      expect(await log.read()).toHaveLength(2);
    });
  });
}

describe('the record of drafts as a file', () => {
  it('only grows when records are withdrawn', async () => {
    const log = new FileDraftLog(dir);
    await log.append(record(1, SESSION_A));
    const before = await readFile(path.join(dir, DRAFT_LOG_FILE), 'utf8');
    await log.withdraw(new Set([SESSION_A]));
    const after = await readFile(path.join(dir, DRAFT_LOG_FILE), 'utf8');
    expect(after.startsWith(before)).toBe(true);
    expect(after.split('\n').filter(Boolean)).toHaveLength(2);
    expect(await new FileDraftLog(dir).read()).toEqual([]);
  });

  it('is read without the withdrawn, whatever the order of the lines', () => {
    expect(withoutWithdrawn([record(1, SESSION_A, 'withdrawn'), record(1, SESSION_A), record(2, SESSION_B)]).map((r) => r.draftId)).toEqual([id(2)]);
  });
});
