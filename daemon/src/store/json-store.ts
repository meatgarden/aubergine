import { copyFile, constants, mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  ApiToken,
  Canvas,
  Draft,
  ShelfElement,
  FIRST_CANVAS_NAME,
  Layout,
  Organization,
  Project,
  Run,
  Session,
  Workflow,
  Workspace,
  createInitialState,
  newCanvas,
  type AppState,
  type ParkedPlace,
} from '@aubergine/shared';
import type { Store } from './store';

const common = {
  organization: Organization,
  workspace: Workspace,
  project: Project,
  sessions: z.array(Session),
};

/** The first on-disk shape: one layout for everything. Files like this must keep loading. */
const StateFileV1 = z.object({ version: z.literal(1), ...common, layout: Layout });

/** Canvases, each with its own layout. Sessions stay apart and are referred to by ID. */
const StateFileV2 = z.object({ version: z.literal(2), ...common, canvases: z.array(Canvas).min(1) });

/** The same, with API tokens. Of a token only a hash of its secret is here. */
const StateFileV3 = z.object({ version: z.literal(3), ...common, canvases: z.array(Canvas).min(1), tokens: z.array(ApiToken) });

/** The same, with workflows and the runs still going. Runs that are over are in the archive, not here. */
const StateFileV4 = StateFileV3.extend({ version: z.literal(4), workflows: z.array(Workflow), runs: z.array(Run) });

/** The current shape: the same, with drafts waiting for the owner and the shelf of elements. Elements may say what they need and produce; runs keep what was produced and ticked. */
const StateFileV5 = StateFileV4.extend({ version: z.literal(5), drafts: z.array(Draft), shelf: z.array(ShelfElement) });

const StateFile = z.discriminatedUnion('version', [StateFileV1, StateFileV2, StateFileV3, StateFileV4, StateFileV5]);
const CURRENT_VERSION = 5;
type StateFile = z.infer<typeof StateFile>;

/**
 * Turns whatever was on disk into the current state. An older file's single
 * layout becomes one canvas named "Main" holding it. Pure.
 */
export function migrate(file: StateFile): AppState {
  const { organization, workspace, project, sessions } = file;
  const canvases: Canvas[] =
    file.version === 1
      ? [{ ...newCanvas(project.id, FIRST_CANVAS_NAME, 0, new Date(project.createdAt)), layout: file.layout }]
      : file.canvases;
  return tidy({
    organization,
    workspace,
    project,
    sessions,
    canvases,
    tokens: file.version >= 3 && 'tokens' in file ? file.tokens : [],
    workflows: file.version >= 4 && 'workflows' in file ? file.workflows : [],
    runs: file.version >= 4 && 'runs' in file ? file.runs : [],
    drafts: file.version === 5 ? file.drafts : [],
    shelf: file.version === 5 ? file.shelf : [],
  });
}

/**
 * Makes the links the rest of the code relies on hold: every node points at
 * a session that exists, a session is on at most one canvas, and a parked
 * session is on none but remembers where it sat.
 */
function tidy(state: AppState): AppState {
  const byId = new Map(state.sessions.map((s) => [s.id, s]));
  const placed = new Set<string>();
  const parkedFrom = new Map<string, ParkedPlace>();

  const canvases = state.canvases.map((canvas) => ({
    ...canvas,
    layout: {
      ...canvas.layout,
      nodes: canvas.layout.nodes.filter((node) => {
        const session = byId.get(node.sessionId);
        if (!session || placed.has(node.sessionId)) return false;
        placed.add(node.sessionId);
        if (session.state !== 'parked') return true;
        // Older files kept a parked session's node in the layout.
        const { id: _id, sessionId: _sessionId, color, ...rect } = node;
        parkedFrom.set(session.id, { canvasId: canvas.id, rect, color });
        return false;
      }),
    },
  }));

  const sessions = state.sessions.map((session) => {
    const place = parkedFrom.get(session.id);
    return place && !session.parkedFrom ? { ...session, parkedFrom: place } : session;
  });
  // A run points at a workflow version that exists and at a session that exists, and a session is on one run.
  const onRun = new Set<string>();
  const runs = state.runs.filter((run) => {
    const workflow = state.workflows.find((w) => w.id === run.workflowId);
    if (!workflow?.versions.some((v) => v.number === run.workflowVersion)) return false;
    if (run.sessionId === null) return true;
    if (!byId.has(run.sessionId) || onRun.has(run.sessionId)) return false;
    onRun.add(run.sessionId);
    return true;
  });
  // A draft of a session that is gone can still be read and accepted; it just belongs to no session any more.
  const drafts = state.drafts.map((draft) => (draft.sessionId !== null && !byId.has(draft.sessionId) ? { ...draft, sessionId: null } : draft));
  return { ...state, sessions, canvases, runs, drafts };
}

export class JsonStore implements Store {
  readonly file: string;
  private queued: AppState | null = null;
  private writing: Promise<void> | null = null;
  private counter = 0;

  constructor(
    dir: string,
    private readonly onWarning: (message: string) => void = () => {},
  ) {
    this.file = path.join(dir, 'state.json');
  }

  async load(): Promise<AppState> {
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

    if (parsed.version !== CURRENT_VERSION) await this.keepCopyOfOlderFile(parsed.version);
    return migrate(parsed);
  }

  /**
   * The next save rewrites the file in the current shape, which older code
   * cannot read. Keep the old file beside it so a step back stays possible.
   * An existing copy is left alone: it is the oldest one, and the one to keep.
   */
  private async keepCopyOfOlderFile(version: number): Promise<void> {
    const copy = `${this.file}.v${version}.backup`;
    try {
      await copyFile(this.file, copy, constants.COPYFILE_EXCL);
      this.onWarning(`${this.file} is from an older version. A copy was kept at ${copy} before updating it.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  /**
   * Writes are serialized, and saves that arrive while a write is running
   * collapse into one: only the newest state is written next.
   */
  save(state: AppState): Promise<void> {
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
  private async writeAtomically(state: AppState): Promise<void> {
    const body: StateFile = { version: CURRENT_VERSION, ...state };
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
