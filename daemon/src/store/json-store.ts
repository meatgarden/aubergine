import { copyFile, constants, mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  ApiToken,
  Device,
  AcceptedRepositoryWorkflow,
  Canvas,
  Draft,
  ShelfElement,
  Id,
  LibraryState,
  SessionEnvironment,
  QueueState,
  SchedulesState,
  withFirstVersion,
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
  AppState,
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

/** The same, with drafts waiting for the owner and the shelf of elements. Elements may say what they need and produce; runs keep what was produced and ticked. */
const StateFileV5 = StateFileV4.extend({ version: z.literal(5), drafts: z.array(Draft), shelf: z.array(ShelfElement) });

/** The same, with the repository workflows the owner accepted. */
const StateFileV6 = StateFileV5.extend({ version: z.literal(6), repositoryAccepted: z.array(AcceptedRepositoryWorkflow) });

/**
 * The current shape. Nothing was added at the top: sessions may be "people only" and remember which token typed last,
 * and a token may carry which sessions its terminal scopes reach. Older files have none of that, and read as: open to
 * tokens as before, typed by nobody, reaching no terminal.
 */
const StateFileV7 = StateFileV6.extend({ version: z.literal(7) });

/**
 * The current shape. Nothing was added at the top: a shelf element has versions and a state, and an element in a
 * workflow may say which shelf element it is a copy of. In an older file a shelf element has no versions, and a
 * copy says only which shelf element it came from: on load, what each shelf element says becomes its version 1,
 * and each such copy is marked as from that element at a version nobody recorded.
 */
const StateFileV8 = StateFileV7.extend({ version: z.literal(8) });

/** The same, with the library: its sources as last read, what was installed from them, and installs that wait. An older file has none of it. */
const StateFileV9 = StateFileV8.extend({ version: z.literal(9), library: LibraryState });

/**
 * The same at the top. A run may now wait for a person (a status of its own), keeps the decisions people made on
 * it, and an element may be an approval. An older file has none of these: its runs load with no decisions, and
 * nothing in it needs repair. The number changed so that the older file is kept beside this one before it is written.
 */
const StateFileV10 = StateFileV9.extend({ version: z.literal(10) });

/** The same, with what was prepared for sessions to work in: working copies. An older file has none, and every session in it works in the folder it was started in. */
const StateFileV11 = StateFileV10.extend({ version: z.literal(11), environments: z.array(SessionEnvironment).default([]) });

/** The same, with the queue: tasks for agents, what is asked of the owner in writing, the rules, and how tasks are started. An older file has none of it. */
const StateFileV12 = StateFileV11.extend({ version: z.literal(12), queue: QueueState.prefault({}) });

/** The same, with schedules. An older file has none, and its tasks say neither that they run an element nor that they were arranged beforehand. */
const StateFileV13 = StateFileV12.extend({ version: z.literal(13), schedules: SchedulesState.prefault({}) });

/**
 * The same, with projects: several where there was one. Everything an older file holds goes into the one project it
 * has, which keeps its ID and its name. Tasks, what is asked of the owner, rules, schedules, runs and working copies
 * say which project they are of; how tasks are started is kept per project; workflows, shelf elements, library
 * sources, installed items and tokens are shared with every project; tokens reach every project.
 */
const StateFileV14 = StateFileV13.omit({ project: true }).extend({ version: z.literal(14), projects: AppState.shape.projects, sharing: AppState.shape.sharing });

/** The same, with devices: browsers paired from an outside address, each with a hash of its secret. An older file has none. */
const StateFileV15 = StateFileV14.extend({ version: z.literal(15), devices: z.array(Device) });

const StateFile = z.discriminatedUnion('version', [StateFileV1, StateFileV2, StateFileV3, StateFileV4, StateFileV5, StateFileV6, StateFileV7, StateFileV8, StateFileV9, StateFileV10, StateFileV11, StateFileV12, StateFileV13, StateFileV14, StateFileV15]);
const CURRENT_VERSION = 15;
type StateFile = z.infer<typeof StateFile>;

/**
 * A workflow from before copies knew their source: an element that says it came from the shelf is marked as a
 * copy of that shelf element, from a version nobody recorded. About such a copy nothing is claimed: it is never
 * said to be behind.
 */
function withSourceMarks(workflow: Workflow): Workflow {
  return {
    ...workflow,
    versions: workflow.versions.map((version) => ({
      ...version,
      elements: version.elements.map((element) => {
        const shelfId = element.origin.kind === 'shelf' ? Id.safeParse((element.origin as { shelfId?: unknown }).shelfId) : null;
        return element.source === null && shelfId?.success ? { ...element, source: { shelfId: shelfId.data, version: null, hash: null } } : element;
      }),
    })),
  };
}

/**
 * A library source from before a source kept what it calls itself: one the owner gave no name was stored under its
 * address, cut to the length of a name. Such a name is taken away, so that the source is shown by its address in
 * full and, after it is next read, by what it calls itself. A name the owner typed is not touched.
 */
function withoutAddressNames(library: LibraryState): LibraryState {
  return { ...library, sources: library.sources.map((source) => (source.address !== '' && (source.name === source.address || source.name === source.address.slice(0, 120)) ? { ...source, name: '' } : source)) };
}

/**
 * Turns whatever was on disk into the current state. An older file's single
 * layout becomes one canvas named "Main" holding it. Pure.
 */
export function migrate(file: StateFile): AppState {
  const { organization, workspace, sessions } = file;
  const projects = 'projects' in file ? file.projects : [file.project];
  const project = projects[0] as AppState['projects'][number];
  const canvases: Canvas[] =
    file.version === 1
      ? [{ ...newCanvas(project.id, FIRST_CANVAS_NAME, 0, new Date(project.createdAt)), layout: file.layout }]
      : file.canvases;
  return tidy({
    organization,
    workspace,
    projects,
    sharing: 'sharing' in file ? file.sharing : {},
    sessions,
    canvases,
    tokens: file.version >= 3 && 'tokens' in file ? file.tokens : [],
    devices: file.version >= 15 && 'devices' in file ? file.devices : [],
    // Before projects every workflow carried the one project's ID. They are shared with every project now.
    workflows: (file.version >= 4 && 'workflows' in file ? file.workflows : []).map((workflow) => (file.version < 8 ? withSourceMarks(workflow) : workflow)).map((workflow) => (file.version < 14 ? { ...workflow, projectId: null } : workflow)),
    runs: file.version >= 4 && 'runs' in file ? file.runs : [],
    drafts: file.version >= 5 && 'drafts' in file ? file.drafts : [],
    shelf: (file.version >= 5 && 'shelf' in file ? file.shelf : []).map(withFirstVersion),
    repositoryAccepted: file.version >= 6 && 'repositoryAccepted' in file ? file.repositoryAccepted : [],
    library: file.version >= 9 && 'library' in file ? (file.version < 10 ? withoutAddressNames(file.library) : file.library) : { sources: [], installed: [], requests: [] },
    environments: file.version >= 11 && 'environments' in file ? file.environments : [],
    queue: file.version >= 12 && 'queue' in file ? file.queue : QueueState.parse({}),
    schedules: file.version >= 13 && 'schedules' in file ? file.schedules : SchedulesState.parse({}),
  });
}

/**
 * A file from before projects, as it was read and before it is checked: the things that now say which project they
 * are of are given the one project the file has, and how tasks are started moves under that project. Nothing else
 * is touched, and a file that already has projects is returned as it is.
 */
export function intoOneProject(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const file = raw as Record<string, unknown>;
  const projectId = (file.project as { id?: unknown } | undefined)?.id;
  if (typeof file.version !== 'number' || file.version >= 14 || typeof projectId !== 'string') return raw;
  const ofIt = (things: unknown): unknown => (Array.isArray(things) ? things.map((thing: unknown) => (thing !== null && typeof thing === 'object' && !('projectId' in thing) ? { ...thing, projectId } : thing)) : things);
  const next: Record<string, unknown> = { ...file, runs: ofIt(file.runs), environments: ofIt(file.environments) };
  if (file.queue !== null && typeof file.queue === 'object') {
    const { limit, hold, automatic, ...queue } = file.queue as Record<string, unknown>;
    const changed = limit !== undefined || hold !== undefined || automatic !== undefined;
    next.queue = { ...queue, tasks: ofIt(queue.tasks), asks: ofIt(queue.asks), rules: ofIt(queue.rules), ...(changed ? { settings: { [projectId]: { ...(limit !== undefined ? { limit } : {}), ...(hold !== undefined ? { hold } : {}), ...(automatic !== undefined ? { automatic } : {}) } } } : {}) };
  }
  if (file.schedules !== null && typeof file.schedules === 'object') next.schedules = { ...(file.schedules as object), items: ofIt((file.schedules as { items?: unknown }).items) };
  return next;
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
  // An environment whose session is gone says so; it is kept, because what it holds may exist nowhere else.
  const environments = state.environments.map((environment) => (environment.sessionId !== null && !byId.has(environment.sessionId) ? { ...environment, sessionId: null } : environment));
  return { ...state, sessions, canvases, runs, drafts, environments };
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
      parsed = StateFile.parse(intoOneProject(JSON.parse(text)));
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
