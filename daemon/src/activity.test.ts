import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityEntry } from '@aubergine/shared';
import { ACTIVITY_FILE, BadActivityCursorError, FileActivityLog, MemoryActivityLog, type ActivityLog } from './activity';

const TOKEN_A = '01900000-0000-7000-8000-0000000000a1';
const TOKEN_B = '01900000-0000-7000-8000-0000000000b1';

const entry = (n: number, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
  at: new Date(Date.parse('2026-03-01T10:00:00.000Z') + n * 1000).toISOString(),
  caller: 'token',
  fromSessionId: null,
  tokenId: TOKEN_A,
  tokenName: 'build bot',
  action: 'canvases.read',
  resource: {},
  method: 'GET',
  route: '/v1/canvases',
  status: 200,
  outcome: 'ok',
  ...extra,
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-activity-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

for (const [name, make] of [
  ['in memory', (): ActivityLog => new MemoryActivityLog()],
  ['in a file', (): ActivityLog => new FileActivityLog(dir, 1024 * 1024)],
] as const) {
  describe(`the activity log, ${name}`, () => {
    it('gives the newest first, a page at a time, without skipping or repeating', async () => {
      const log = make();
      for (let n = 0; n < 25; n++) await log.append(entry(n, { status: 200 + n }));
      const seen: number[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await log.read({ limit: 10, cursor });
        seen.push(...page.items.map((e) => e.status));
        cursor = page.nextCursor ?? undefined;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen).toEqual(Array.from({ length: 25 }, (_, i) => 224 - i));
    });

    it('keeps its place when entries are added between pages, and when several share a time', async () => {
      const log = make();
      for (let n = 0; n < 6; n++) await log.append(entry(Math.floor(n / 3), { status: 300 + n }));
      const first = await log.read({ limit: 4 });
      expect(first.items.map((e) => e.status)).toEqual([305, 304, 303, 302]);
      await log.append(entry(9, { status: 399 }));
      const second = await log.read({ limit: 4, cursor: first.nextCursor ?? undefined });
      expect(second.items.map((e) => e.status)).toEqual([301, 300]);
      expect(second.nextCursor).toBeNull();
    });

    it('filters by token', async () => {
      const log = make();
      await log.append(entry(1));
      await log.append(entry(2, { tokenId: TOKEN_B, tokenName: 'reader' }));
      await log.append(entry(3));
      expect((await log.read({ limit: 10, tokenId: TOKEN_B })).items.map((e) => e.tokenName)).toEqual(['reader']);
      expect((await log.read({ limit: 10, tokenId: TOKEN_A })).items).toHaveLength(2);
      expect((await log.read({ limit: 10 })).items).toHaveLength(3);
    });

    it('refuses a cursor it did not give out', async () => {
      const log = make();
      await log.append(entry(1));
      await expect(log.read({ limit: 10, cursor: 'nonsense' })).rejects.toThrow(BadActivityCursorError);
    });
  });
}

describe('the activity log file', () => {
  it('is one JSON line per call, readable by the owner only', async () => {
    const log = new FileActivityLog(dir, 1024 * 1024);
    await log.append(entry(1, { resource: { canvasId: 'c1' }, outcome: 'denied', status: 403 }));
    await log.append(entry(2));
    const text = await readFile(path.join(dir, ACTIVITY_FILE), 'utf8');
    const lines = text.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(entry(1, { resource: { canvasId: 'c1' }, outcome: 'denied', status: 403 }));
    expect((await stat(path.join(dir, ACTIVITY_FILE))).mode & 0o077).toBe(0);
  });

  it('never grows past its cap: the older half is dropped', async () => {
    const cap = 8 * 1024;
    const log = new FileActivityLog(dir, cap);
    for (let n = 0; n < 400; n++) await log.append(entry(n, { status: n }));
    const files = (await readdir(dir)).sort();
    expect(files).toEqual([ACTIVITY_FILE, `${ACTIVITY_FILE}.1`]);
    let total = 0;
    for (const file of files) total += (await stat(path.join(dir, file))).size;
    expect(total).toBeLessThanOrEqual(cap);
    // The newest entries are all there, in order, across the two files; the oldest are gone.
    const { items } = await log.read({ limit: 500 });
    expect(items[0]?.status).toBe(399);
    expect(items.map((e) => e.status)).toEqual(Array.from({ length: items.length }, (_, i) => 399 - i));
    expect(items.length).toBeLessThan(400);
    expect(items.length).toBeGreaterThan(10);
  });

  it('carries on after a restart, and past a line that was cut short', async () => {
    await new FileActivityLog(dir, 1024 * 1024).append(entry(1));
    await writeFile(path.join(dir, ACTIVITY_FILE), `${JSON.stringify(entry(1))}\n{"at":"2026-03-01T10:0`, 'utf8');
    const again = new FileActivityLog(dir, 1024 * 1024);
    await again.append(entry(3));
    expect((await again.read({ limit: 10 })).items.map((e) => e.at)).toEqual([entry(3).at, entry(1).at]);
  });

  it('writes entries in the order they were given, when many arrive at once', async () => {
    const log = new FileActivityLog(dir, 1024 * 1024);
    await Promise.all(Array.from({ length: 50 }, (_, n) => log.append(entry(n, { status: n }))));
    expect((await log.read({ limit: 100 })).items.map((e) => e.status)).toEqual(Array.from({ length: 50 }, (_, i) => 49 - i));
  });

  it('does not fail the caller when the entry cannot be written', async () => {
    const errors: unknown[] = [];
    const log = new FileActivityLog(path.join(dir, 'file-not-folder'), 1024, (error) => errors.push(error));
    await writeFile(path.join(dir, 'file-not-folder'), 'in the way');
    await expect(log.append(entry(1))).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});
