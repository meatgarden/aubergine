import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Id, Message, ThreadId, ThreadState } from '@aubergine/shared';
import { z } from 'zod';

/**
 * Where messages are kept: one line per thing that happened. It is not
 * state: the state holds only counts. Callers know only this interface, so
 * the messages can move from a file to a database without touching them.
 */

const Timestamp = z.iso.datetime();

export const MessageLine = z.discriminatedUnion('type', [
  /** A message was sent. In a line carried over when the file was started again, it may already be read. */
  z.object({ type: z.literal('sent'), message: Message }),
  /** These were read. */
  z.object({ type: z.literal('read'), ids: z.array(Id), at: Timestamp }),
  /** Where a thread stands now: the later line for a thread wins. */
  z.object({ type: z.literal('thread'), threadId: ThreadId, state: ThreadState, turns: z.number().int().min(0), at: Timestamp }),
  /** The owner closed a session to a sender, or opened it again: the later line wins. */
  z.object({ type: z.literal('block'), sessionId: Id, sender: z.string().max(80), blocked: z.boolean(), at: Timestamp }),
]);
export type MessageLine = z.infer<typeof MessageLine>;

export interface MessageLog {
  /** Everything kept, oldest first. Lines that cannot be read are left out. */
  read(): Promise<MessageLine[]>;
  /**
   * Adds lines. Never rejects: what was said is already held in memory by the caller.
   * `carry` gives what must survive when the file is started again: it is asked only then.
   */
  append(lines: readonly MessageLine[], carry: () => MessageLine[]): Promise<void>;
}

/** Keeps the lines in memory. For tests, and for a server started without a data folder. */
export class MemoryMessageLog implements MessageLog {
  readonly lines: MessageLine[] = [];
  async read(): Promise<MessageLine[]> {
    return [...this.lines];
  }
  async append(lines: readonly MessageLine[]): Promise<void> {
    this.lines.push(...lines);
  }
}

export const MESSAGE_LOG_FILE = 'messages.log';

/**
 * One JSON line per message, reading, change to a thread and block, appended
 * to `messages.log` in the data folder, which only its owner can read. When
 * the file reaches its cap it becomes `messages.log.1`, replacing the one
 * before, and the new file starts with what is still current.
 */
export class FileMessageLog implements MessageLog {
  readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  private endChecked = false;

  constructor(
    dir: string,
    private readonly maxBytes: () => number,
    private readonly onError: (error: unknown) => void = () => {},
  ) {
    this.file = path.join(dir, MESSAGE_LOG_FILE);
  }

  async read(): Promise<MessageLine[]> {
    await this.queue;
    const text = await readFile(this.file, 'utf8').catch(() => '');
    const lines: MessageLine[] = [];
    for (const raw of text.split('\n')) {
      if (raw.trim() === '') continue;
      try {
        const line = MessageLine.safeParse(JSON.parse(raw));
        if (line.success) lines.push(line.data);
      } catch {
        // A line cut short by a crash: left out.
      }
    }
    return lines;
  }

  append(lines: readonly MessageLine[], carry: () => MessageLine[]): Promise<void> {
    const text = lines.map((line) => `${JSON.stringify(MessageLine.parse(line))}\n`).join('');
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const size = await stat(this.file).then(
          (s) => s.size,
          () => 0,
        );
        if (size > 0 && size + text.length > this.maxBytes()) {
          // Started again: the old file is set aside, and the new one begins with what is still current, the new lines among it.
          await rename(this.file, `${this.file}.1`);
          await writeFile(this.file, carry().map((line) => `${JSON.stringify(line)}\n`).join(''), { mode: 0o600 });
          return;
        }
        // A line cut short by a crash has no end: the first line added after a start goes on a line of its own.
        const tail = size > 0 && !this.endChecked && !(await readFile(this.file, 'utf8')).endsWith('\n') ? '\n' : '';
        this.endChecked = true;
        await appendFile(this.file, tail + text, { mode: 0o600 });
      })
      .catch((error: unknown) => this.onError(error));
    return this.queue;
  }
}
