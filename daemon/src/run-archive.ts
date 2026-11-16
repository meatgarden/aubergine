import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ArchiveLine, ArchivedRun } from '@aubergine/shared';
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
  /** Replaces what is kept about a run that is already here (its ticks changed). The record only grows: the newer line wins. */
  amend(entry: ArchivedRun): Promise<void>;
  /** Newest first. `cursor` is the `nextCursor` of the page before. */
  read(query: ArchiveQuery): Promise<{ items: ArchivedRun[]; nextCursor: string | null }>;
  get(runId: string): Promise<ArchivedRun | null>;
  has(runId: string): Promise<boolean>;
  /**
   * Takes back every run that was on one of these sessions: readers no longer see them. Nothing is deleted;
   * a later line says the run is withdrawn. Only the demo's removal calls this, for the sessions it made.
   */
  withdraw(sessionIds: ReadonlySet<string>): Promise<void>;
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
  /** Runs that were withdrawn: never shown, and not taken in again. */
  protected readonly gone = new Set<string>();

  async append(entry: ArchivedRun): Promise<void> {
    this.add(entry);
  }

  async amend(entry: ArchivedRun): Promise<void> {
    this.replace(entry);
  }

  /** Puts a newer record of a run in the place of the one that is there. False when the run is not here. */
  protected replace(entry: ArchivedRun): boolean {
    const index = this.ids.has(entry.run.id) ? this.entries.findIndex((e) => e.run.id === entry.run.id) : -1;
    if (index < 0) return false;
    this.entries[index] = entry;
    return true;
  }

  protected add(entry: ArchivedRun): boolean {
    if (this.ids.has(entry.run.id) || this.gone.has(entry.run.id)) return false;
    this.ids.add(entry.run.id);
    this.entries.unshift(entry);
    return true;
  }

  /** Takes a run out of what readers see. Gives back the entry that was there, or null. */
  protected drop(runId: string): ArchivedRun | null {
    this.gone.add(runId);
    if (!this.ids.has(runId)) return null;
    const index = this.entries.findIndex((e) => e.run.id === runId);
    const [entry] = index < 0 ? [] : this.entries.splice(index, 1);
    this.ids.delete(runId);
    return entry ?? null;
  }

  async withdraw(sessionIds: ReadonlySet<string>): Promise<void> {
    for (const entry of [...this.entries]) if (entry.run.sessionId !== null && sessionIds.has(entry.run.sessionId)) this.drop(entry.run.id);
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
      const found: ArchiveLine[] = [];
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          found.push(ArchiveLine.parse(JSON.parse(line)));
        } catch {
          // A line cut short by a crash: skip it, keep the rest.
        }
      }
      // A run may be here more than once: a later line is a newer record of it, and takes the place of the earlier.
      // A line that says a run is withdrawn takes it out for good.
      for (const { withdrawn, ...entry } of found) {
        if (withdrawn) this.drop(entry.run.id);
        else if (!this.add(entry)) this.replace(entry);
      }
      // A line without an end would glue itself to the next one.
      if (text !== '' && !text.endsWith('\n')) await appendFile(this.file, '\n');
    })();
    return this.loaded;
  }

  override async append(entry: ArchivedRun): Promise<void> {
    await this.load();
    if (!this.add(entry)) return;
    return this.write(`${JSON.stringify(ArchivedRun.parse(entry))}\n`);
  }

  override async amend(entry: ArchivedRun): Promise<void> {
    await this.load();
    if (!this.replace(entry)) return;
    await this.write(`${JSON.stringify(ArchivedRun.parse(entry))}\n`);
  }

  override async withdraw(sessionIds: ReadonlySet<string>): Promise<void> {
    await this.load();
    for (const entry of [...this.entries]) {
      if (entry.run.sessionId === null || !sessionIds.has(entry.run.sessionId)) continue;
      const dropped = this.drop(entry.run.id);
      // The file only grows: a later line for the run says it is withdrawn, and the later line wins.
      if (dropped) await this.write(`${JSON.stringify(ArchiveLine.parse({ ...dropped, withdrawn: true }))}\n`);
    }
  }

  private write(line: string): Promise<void> {
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
