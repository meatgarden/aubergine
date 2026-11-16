import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { ActivityEntry } from '@aubergine/shared';

/**
 * The record of what API tokens did. Callers know only this interface, so
 * the record can move from a file to a database without touching them.
 */
/** An entry as it is handed in: what is left out takes its default. */
export type ActivityInput = z.input<typeof ActivityEntry>;

/** Which entries to read: of one token, about one session, or all. */
export interface ActivityFilter {
  tokenId?: string | undefined;
  sessionId?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export interface ActivityLog {
  /** Adds one entry. Never rejects: failing to record must not fail the call it records. */
  append(entry: ActivityInput): Promise<void>;
  /** Entries, newest first, optionally of one token. `cursor` is the `nextCursor` of the page before. */
  read(query: ActivityFilter): Promise<{ items: ActivityEntry[]; nextCursor: string | null }>;
}

export class BadActivityCursorError extends Error {}

function pageOf(entries: ActivityEntry[], query: ActivityFilter): { items: ActivityEntry[]; nextCursor: string | null } {
  const wanted = entries.filter((entry) => (query.tokenId === undefined || entry.tokenId === query.tokenId) && (query.sessionId === undefined || entry.resource.sessionId === query.sessionId || entry.fromSessionId === query.sessionId));
  let start = 0;
  if (query.cursor !== undefined) {
    // The cursor names the time of the last entry seen; older entries follow it. Entries only ever get added at the new end.
    let before: unknown;
    try {
      before = (JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as { before?: unknown; skip?: unknown });
    } catch {
      throw new BadActivityCursorError('The cursor is not one this server gave out');
    }
    const { before: at, skip } = before as { before?: unknown; skip?: unknown };
    if (typeof at !== 'string' || typeof skip !== 'number') throw new BadActivityCursorError('The cursor is not one this server gave out');
    // Skip everything newer than that time, and the entries at that very time already given.
    start = wanted.findIndex((entry) => entry.at <= at);
    start = start < 0 ? wanted.length : start + skip;
  }
  const items = wanted.slice(start, start + query.limit);
  const last = items.at(-1);
  if (!last || start + query.limit >= wanted.length) return { items, nextCursor: null };
  // How many entries share the last one's time, up to and including it, so the next page starts right after.
  const firstAtThatTime = wanted.findIndex((entry) => entry.at <= last.at);
  const skip = start + items.length - firstAtThatTime;
  return { items, nextCursor: Buffer.from(JSON.stringify({ before: last.at, skip })).toString('base64url') };
}

/** Keeps entries in memory. For tests, and for a server started without a data folder. */
export class MemoryActivityLog implements ActivityLog {
  readonly entries: ActivityEntry[] = [];

  async append(entry: ActivityInput): Promise<void> {
    this.entries.push(ActivityEntry.parse(entry));
  }

  async read(query: ActivityFilter): Promise<{ items: ActivityEntry[]; nextCursor: string | null }> {
    return pageOf([...this.entries].reverse(), query);
  }
}

export const ACTIVITY_FILE = 'activity.log';

/**
 * One JSON line per call, appended to `activity.log` in the data folder. It
 * is kept apart from the state file: it grows with use, and losing it loses
 * no state. When the file reaches half the cap it becomes `activity.log.1`,
 * replacing the one before, so the two together never exceed the cap.
 */
export class FileActivityLog implements ActivityLog {
  readonly file: string;
  private size: number | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    dir: string,
    private readonly maxBytes: number,
    private readonly onError: (error: unknown) => void = () => {},
  ) {
    this.file = path.join(dir, ACTIVITY_FILE);
  }

  append(entry: ActivityInput): Promise<void> {
    const line = `${JSON.stringify(ActivityEntry.parse(entry))}\n`;
    // One write at a time, in order, so that lines never interleave and rotation sees a settled file.
    this.queue = this.queue
      .then(() => this.write(line))
      .catch((error: unknown) => {
        this.onError(error);
      });
    return this.queue;
  }

  private async write(line: string): Promise<void> {
    if (this.size === null) {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      this.size = await stat(this.file).then(
        (s) => s.size,
        () => 0,
      );
      // A line cut short by a crash has no end. Give it one, so that the next entry starts a line of its own.
      if (this.size > 0 && !(await readFile(this.file, 'utf8')).endsWith('\n')) {
        await appendFile(this.file, '\n');
        this.size += 1;
      }
    }
    if (this.size > 0 && this.size + line.length > this.maxBytes / 2) {
      await rename(this.file, `${this.file}.1`);
      this.size = 0;
    }
    await appendFile(this.file, line, { mode: 0o600 });
    this.size += Buffer.byteLength(line);
  }

  async read(query: ActivityFilter): Promise<{ items: ActivityEntry[]; nextCursor: string | null }> {
    await this.queue;
    const entries: ActivityEntry[] = [];
    for (const file of [`${this.file}.1`, this.file]) {
      const text = await readFile(file, 'utf8').catch(() => '');
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          entries.push(ActivityEntry.parse(JSON.parse(line)));
        } catch {
          // A line that was cut short by a crash: skip it, keep the rest.
        }
      }
    }
    return pageOf(entries.reverse(), query);
  }
}
