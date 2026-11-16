import { appendFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DraftRecord } from '@aubergine/shared';
import { DRAFT_LOG_FILE, FileDraftLog, MemoryDraftLog } from './draft-log';

const id = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const record = (n: number, more: Partial<DraftRecord> = {}): DraftRecord => ({
  at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
  draftId: id(n),
  kind: 'element',
  proposedBy: { kind: 'session', sessionId: id(900) },
  revisions: 1,
  outcome: 'accepted',
  by: { kind: 'owner', sessionId: null },
  ...more,
});

describe('the record of what became of drafts', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-draft-log-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('gives the newest first, in memory and in a file, and a new server reads what the last one wrote', async () => {
    for (const log of [new MemoryDraftLog(), new FileDraftLog(dir)]) {
      for (let n = 1; n <= 3; n += 1) await log.append(record(n, n === 2 ? { outcome: 'discarded', by: { kind: 'owner-cli', sessionId: id(900) } } : {}));
      expect((await log.read()).map((r) => [r.draftId, r.outcome, r.by.kind])).toEqual([
        [id(3), 'accepted', 'owner'],
        [id(2), 'discarded', 'owner-cli'],
        [id(1), 'accepted', 'owner'],
      ]);
    }
    expect((await new FileDraftLog(dir).read()).map((r) => r.draftId)).toEqual([id(3), id(2), id(1)]);
  });

  it('is one line per decision, in a file only the owner can read, and holds nothing of what a draft said', async () => {
    const log = new FileDraftLog(dir);
    await log.append(record(1));
    const file = path.join(dir, DRAFT_LOG_FILE);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(Object.keys(JSON.parse((await readFile(file, 'utf8')).trim())).sort()).toEqual(['at', 'by', 'draftId', 'kind', 'outcome', 'proposedBy', 'revisions']);
  });

  it('skips a line cut short by a crash, and does not glue the next one to it', async () => {
    const log = new FileDraftLog(dir);
    await log.append(record(1));
    await appendFile(path.join(dir, DRAFT_LOG_FILE), '{"at":"2026');
    await new FileDraftLog(dir).append(record(2));
    expect((await new FileDraftLog(dir).read()).map((r) => r.draftId)).toEqual([id(2), id(1)]);
  });

  it('starts a new file when the old one is full, keeping the one before', async () => {
    const log = new FileDraftLog(dir, () => {}, 600);
    for (let n = 1; n <= 6; n += 1) await log.append(record(n));
    const kept = (await log.read()).map((r) => r.draftId);
    expect(kept[0]).toBe(id(6));
    expect(kept.length).toBeLessThan(6);
    expect(kept.length).toBeGreaterThan(1);
  });
});
