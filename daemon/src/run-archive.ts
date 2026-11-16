import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ArchivedRun } from '@aubergine/shared';
import { BadCursorError } from './public-api';

export interface ArchiveQuery {
  sessionId?: string | undefined;
  workflowId?: string | undefined;
  status?: 'finished' | 'stopped' | undefined;
  limit: number;
  cursor?: string | undefined;
}

/**
 * Where runs go when they are over. The state holds only runs still going;
 * this only ever grows, and is read a page at a time. Callers know only this
 * interface, so the record can move from a file to a database without
 * touching them.
 */
export interface RunArchive {
  append(entry: ArchivedRun): Promise<void>;
  /** Newest first. `cursor` is the `nextCursor` of the page before. */
  read(query: ArchiveQuery): Promise<{ items: ArchivedRun[]; nextCursor: string | null }>;
  get(runId: string): Promise<ArchivedRun | null>;
  has(runId: string): Promise<boolean>;
}

/** One page of entries that are already newest first. The cursor names the last run given. */
function pageOf(entries: readonly ArchivedRun[], query: ArchiveQuery): { items: ArchivedRun[]; nextCursor: string | null } {
  let start = 0;
  if (query.cursor !== undefined) {
    let after: unknown;
    try {
      after = (JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as { after?: unknown }).after;
    } catch {
      throw new BadCursorError('The cursor is not one this server gave out');
    }
    if (typeof after !== 'string') throw new BadCursorError('The cursor is not one this server gave out');
    // Entries are only ever added at the newer end, so what follows a known run stays what follows it.
    const index = entries.findIndex((entry) => entry.run.id === after);
    start = index < 0 ? 0 : index + 1;
  }
  const items: ArchivedRun[] = [];
  let index = start;
  for (; index < entries.length && items.length < query.limit; index += 1) {
    const entry = entries[index] as ArchivedRun;
    if (query.sessionId !== undefined && entry.run.sessionId !== query.sessionId) continue;
    if (query.workflowId !== undefined && entry.run.workflowId !== query.workflowId) continue;
    if (query.status !== undefined && entry.run.status !== query.status) continue;
    items.push(entry);
  }
  const last = entries[index - 1];
  return { items, nextCursor: index < entries.length && last ? Buffer.from(JSON.stringify({ after: last.run.id })).toString('base64url') : null };
}

/** Keeps entries in memory. For tests, and for a server started without a data folder. */
export class MemoryRunArchive implements RunArchive {
  /** Newest first. */
  protected entries: ArchivedRun[] = [];
  protected readonly ids = new Set<string>();

  async append(entry: ArchivedRun): Promise<void> {
    this.add(entry);
  }

  protected add(entry: ArchivedRun): boolean {
    if (this.ids.has(entry.run.id)) return false;
    this.ids.add(entry.run.id);
    this.entries.unshift(entry);
    return true;
  }

  async read(query: ArchiveQuery): Promise<{ items: ArchivedRun[]; nextCursor: string | null }> {
    return pageOf(this.entries, query);
  }

  async get(runId: string): Promise<ArchivedRun | null> {
    return this.ids.has(runId) ? (this.entries.find((entry) => entry.run.id === runId) ?? null) : null;
  }

  async has(runId: string): Promise<boolean> {
    return this.ids.has(runId);
  }
}

export const RUN_ARCHIVE_FILE = 'runs.log';

/**
 * One JSON line per run that is over, appended to `runs.log` in the data
 * folder. Each line can be read by itself: it carries the name of the
 * workflow and of its elements as they were. The file is read once, when
 * first asked; after that the entries are at hand and a new one is one
 * appended line.
 */
export class FileRunArchive extends MemoryRunArchive {
  readonly file: string;
  private loaded: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    dir: string,
    private readonly onError: (error: unknown) => void = () => {},
  ) {
    super();
    this.file = path.join(dir, RUN_ARCHIVE_FILE);
  }

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      const text = await readFile(this.file, 'utf8').catch(() => '');
      const found: ArchivedRun[] = [];
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          found.push(ArchivedRun.parse(JSON.parse(line)));
        } catch {
          // A line cut short by a crash: skip it, keep the rest.
        }
      }
      for (const entry of found) this.add(entry);
      // A line without an end would glue itself to the next one.
      if (text !== '' && !text.endsWith('\n')) await appendFile(this.file, '\n');
    })();
    return this.loaded;
  }

  override async append(entry: ArchivedRun): Promise<void> {
    await this.load();
    if (!this.add(entry)) return;
    const line = `${JSON.stringify(ArchivedRun.parse(entry))}\n`;
    // One write at a time, in order.
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        await appendFile(this.file, line, { mode: 0o600 });
      })
      .catch((error: unknown) => {
        this.onError(error);
      });
    return this.queue;
  }

  override async read(query: ArchiveQuery): Promise<{ items: ArchivedRun[]; nextCursor: string | null }> {
    await this.load();
    return super.read(query);
  }

  override async get(runId: string): Promise<ArchivedRun | null> {
    await this.load();
    return super.get(runId);
  }

  override async has(runId: string): Promise<boolean> {
    await this.load();
    return super.has(runId);
  }
}
