import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { Task } from '@aubergine/shared';
import { paginate } from './public-api';

/**
 * Tasks that are over and were put away: declined, withdrawn, or looked at
 * after they were done or failed. Like finished runs they are not state.
 * Callers know only this interface.
 */
export interface TaskArchive {
  /** Adds one task. A task is put here first and taken out of the state second, so it is never in neither. */
  append(task: Task): Promise<void>;
  get(taskId: string): Promise<Task | null>;
  /** Newest first, a page at a time. */
  /** `projectId`: the tasks of one project; null or left out: of every project. */
  read(query: { limit: number; cursor?: string | undefined }, projectId?: string | null): Promise<{ items: Task[]; nextCursor: string | null }>;
}

const newestFirst = (tasks: Task[]): Task[] => [...tasks].sort((a, b) => (b.endedAt ?? b.updatedAt).localeCompare(a.endedAt ?? a.updatedAt) || a.id.localeCompare(b.id));

/** Keeps them in memory. For tests, and for a server started without a data folder. */
export class MemoryTaskArchive implements TaskArchive {
  readonly tasks: Task[] = [];
  async append(task: Task): Promise<void> {
    this.tasks.push(task);
  }
  async get(taskId: string): Promise<Task | null> {
    return this.tasks.find((task) => task.id === taskId) ?? null;
  }
  async read(query: { limit: number; cursor?: string | undefined }, projectId: string | null = null): Promise<{ items: Task[]; nextCursor: string | null }> {
    return paginate(newestFirst(this.tasks.filter((task) => projectId === null || task.projectId === projectId)), (task) => task.id, query);
  }
}

export const TASK_ARCHIVE_FILE = 'tasks.log';
const MAX_BYTES = 4 * 1024 * 1024;

/** One JSON line per task that was put away, appended to `tasks.log` in the data folder, started again when it is large. */
export class FileTaskArchive implements TaskArchive {
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  /** `projectBefore`: the project a line from before projects is of: the one project there was then. */
  constructor(
    dir: string,
    private readonly projectBefore: () => string | null = () => null,
  ) {
    this.file = path.join(dir, TASK_ARCHIVE_FILE);
  }

  append(task: Task): Promise<void> {
    this.queue = this.queue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const size = await stat(this.file).then(
        (s) => s.size,
        () => 0,
      );
      if (size > MAX_BYTES) await rename(this.file, `${this.file}.1`).catch(() => {});
      await appendFile(this.file, `${JSON.stringify(task)}\n`, { mode: 0o600 });
    });
    return this.queue;
  }

  private async all(): Promise<Task[]> {
    await this.queue.catch(() => {});
    const text = await readFile(this.file, 'utf8').catch(() => '');
    const tasks: Task[] = [];
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const raw = JSON.parse(line) as Record<string, unknown>;
        // A line from before projects does not say which project: it was the one there was.
        const parsed = Task.safeParse(raw !== null && typeof raw === 'object' && raw.projectId === undefined ? { ...raw, projectId: this.projectBefore() ?? undefined } : raw);
        if (parsed.success) tasks.push(parsed.data);
      } catch {
        // A line that cannot be read is passed over.
      }
    }
    return tasks;
  }

  async get(taskId: string): Promise<Task | null> {
    return (await this.all()).find((task) => task.id === taskId) ?? null;
  }

  async read(query: { limit: number; cursor?: string | undefined }, projectId: string | null = null): Promise<{ items: Task[]; nextCursor: string | null }> {
    return paginate(newestFirst((await this.all()).filter((task) => projectId === null || task.projectId === projectId)), (task) => task.id, query);
  }
}
