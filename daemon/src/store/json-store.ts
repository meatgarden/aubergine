import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  Layout,
  Organization,
  Project,
  Session,
  Workspace,
  createInitialState,
  type CanvasState,
} from '@aubergine/shared';
import type { Store } from './store';

/** On-disk shape. Sessions and layout are separate sections; layout refers to sessions by ID. */
const StateFile = z.object({
  version: z.literal(1),
  organization: Organization,
  workspace: Workspace,
  project: Project,
  sessions: z.array(Session),
  layout: Layout,
});
type StateFile = z.infer<typeof StateFile>;

export class JsonStore implements Store {
  readonly file: string;
  private queued: CanvasState | null = null;
  private writing: Promise<void> | null = null;
  private counter = 0;

  constructor(
    dir: string,
    private readonly onWarning: (message: string) => void = () => {},
  ) {
    this.file = path.join(dir, 'state.json');
  }

  async load(): Promise<CanvasState> {
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return createInitialState();
      throw error;
    }

    let parsed: StateFile;
    try {
      parsed = StateFile.parse(JSON.parse(text));
    } catch (error) {
      // Never overwrite a file we could not read: set it aside and start fresh.
      const aside = `${this.file}.unreadable-${Date.now()}`;
      await rename(this.file, aside);
      this.onWarning(
        `Could not read ${this.file} (${(error as Error).message.slice(0, 200)}). ` +
          `It was moved to ${aside} and a fresh state was started.`,
      );
      return createInitialState();
    }

    const { version: _version, ...state } = parsed;
    // Drop layout nodes whose session is gone, so the rest of the code can rely on the link.
    const sessionIds = new Set(state.sessions.map((s) => s.id));
    return {
      ...state,
      layout: { nodes: state.layout.nodes.filter((n) => sessionIds.has(n.sessionId)) },
    };
  }

  /**
   * Writes are serialized, and saves that arrive while a write is running
   * collapse into one: only the newest state is written next.
   */
  save(state: CanvasState): Promise<void> {
    this.queued = state;
    this.writing ??= this.drain().finally(() => {
      this.writing = null;
    });
    return this.writing;
  }

  private async drain(): Promise<void> {
    while (this.queued) {
      const state = this.queued;
      this.queued = null;
      await this.writeAtomically(state);
    }
  }

  /** Write to a temporary file, flush it, then rename over the real one. */
  private async writeAtomically(state: CanvasState): Promise<void> {
    const body: StateFile = { version: 1, ...state };
    const dir = path.dirname(this.file);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.${this.counter++}.tmp`;
    const handle = await open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(body, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, this.file);
  }
}
