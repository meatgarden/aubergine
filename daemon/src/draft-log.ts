import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { DraftRecord } from '@aubergine/shared';

/**
 * The record of what became of drafts: who proposed each, what kind it was,
 * whether it was accepted or discarded, when, and by whom. Not what a draft
 * said. Callers know only this interface, so the record can move from a
 * file to a database without touching them.
 */
export interface DraftLog {
  /** Adds one record. Never rejects: failing to record must not fail the decision it records. */
  append(record: DraftRecord): Promise<void>;
  /** Every record kept, newest first. */
  read(): Promise<DraftRecord[]>;
}

/** Keeps records in memory. For tests, and for a server started without a data folder. */
export class MemoryDraftLog implements DraftLog {
  readonly records: DraftRecord[] = [];
  async append(record: DraftRecord): Promise<void> {
    this.records.push(record);
  }
  async read(): Promise<DraftRecord[]> {
    return [...this.records].reverse();
  }
}

export const DRAFT_LOG_FILE = 'drafts.log';
const MAX_BYTES = 1024 * 1024;

/**
 * One JSON line per draft that was accepted or discarded, appended to
 * `drafts.log` in the data folder. It is not state: losing it loses no
 * workflow. When the file reaches its cap it becomes `drafts.log.1`,
 * replacing the one before.
 */
export class FileDraftLog implements DraftLog {
  readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    dir: string,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly maxBytes: number = MAX_BYTES,
  ) {
    this.file = path.join(dir, DRAFT_LOG_FILE);
  }

  append(record: DraftRecord): Promise<void> {
    const line = `${JSON.stringify(DraftRecord.parse(record))}\n`;
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const size = await stat(this.file).then(
          (s) => s.size,
          () => 0,
        );
        if (size > 0 && size + line.length > this.maxBytes) await rename(this.file, `${this.file}.1`);
        // A line cut short by a crash has no end: start on a line of its own.
        const tail = size > 0 && size + line.length <= this.maxBytes && !(await readFile(this.file, 'utf8')).endsWith('\n') ? '\n' : '';
        await appendFile(this.file, tail + line, { mode: 0o600 });
      })
      .catch((error: unknown) => {
        this.onError(error);
      });
    return this.queue;
  }

  async read(): Promise<DraftRecord[]> {
    await this.queue;
    const records: DraftRecord[] = [];
    for (const file of [`${this.file}.1`, this.file]) {
      const text = await readFile(file, 'utf8').catch(() => '');
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          records.push(DraftRecord.parse(JSON.parse(line)));
        } catch {
          // A line cut short by a crash: skip it, keep the rest.
        }
      }
    }
    return records.reverse();
  }
}
