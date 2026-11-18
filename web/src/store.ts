import { showNotification } from './attention';
import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  placeOfSession,
  sortedCanvases,
  type AppState,
  type Canvas,
  type Layout,
  type ChangeEvent,
  type RuntimeStatus,
  type Settings,
  firstProject,
  stateOf,
} from '@aubergine/shared';
import { ApiError, api, askAbout, lookAt, subscribeToEvents } from './api';
import { NOT_FOLLOWING, behind, takeChange, takeWhole, type Following } from './following';
import { canvasIdFromPath, chooseCanvas, rememberCanvas, rememberedCanvas, sessionFromAddress, writeAddress } from './address';
import { announcement, notificationsWanted } from './attention';
import { clampPanelWidth, loadPanelPrefs, savePanelPrefs, type PanelPrefs } from './panel/registry';
import { loadView, saveView, type ListView } from './terminal-rows';

export type Phase =
  | 'loading'
  /** This browser has no valid access cookie. */
  | 'unauthorized'
  /** The daemon does not answer. */
  | 'unreachable'
  | 'ready';

export interface AppStore {
  phase: Phase;
  runtime: RuntimeStatus | null;
  /** User settings from the daemon's settings file. */
  settings: Settings;
  /**
   * What the page shows: the project being looked at, with what is shared with it. Every list on screen is made from
   * this, so that everything on screen is of that project unless it says otherwise.
   */
  app: AppState | null;
  /** Everything, of every project: for the switcher, for what waits anywhere, and for the views that say "all projects". */
  whole: AppState | null;
  /** The canvas this page is showing. */
  canvasId: string | null;
  /** False while the live event stream is down after having been up. */
  live: boolean;
  /** Session whose terminal should hold keyboard focus. The counter re-triggers focus on repeat clicks. */
  focus: { sessionId: string; tick: number } | null;
  /** Session waiting for the user to confirm closing it. */
  closing: string | null;
  /** Canvas waiting for the user to say what happens to its sessions before it is closed. */
  closingCanvas: string | null;
  /** Whether the palette (sessions, canvases and commands) is open. */
  picker: boolean;
  /**
   * The terminal that is selected: the one commands such as park and rename act on when no
   * terminal has the keyboard. Focusing a terminal selects it; leaving it keeps it selected.
   */
  selected: string | null;
  /** The one panel that is open, if any. */
  panel: Panel | null;
  /** Something a component was asked to start: renaming, a note, the move menu. Used once. */
  ask: Ask | null;
  /** The last thing that went wrong, shown in the toolbar. */
  notice: string | null;
  /** The side panel: open or collapsed to its strip, its width, which sections are folded. Remembered by this browser. */
  side: PanelPrefs;
  /** The terminal list: its filters, grouping, order and density. Remembered by this browser. */
  listView: ListView;
  /** What is open beside the side panel: a section's drawer for one of its rows. */
  drawer: { section: string; kind: string; id: string } | null;
  /** Sessions parked from this page, oldest first, so the last one can be brought back. */
  parkedHere: string[];
  /** A session the canvas was asked to bring into view. The counter makes repeats count. */
  show: { sessionId: string; tick: number } | null;
  /**
   * Until when a terminal is on its way to getting the keyboard: set when one is asked for,
   * cleared when it has it. Keys typed in between are meant for that terminal.
   */
  settleUntil: number;
  /** The workflow open in the editor. */
  editingWorkflow: string | null;
  /** The "Run workflow" dialog: on a session, or on a new agent session (`sessionId` null). */
  startingRun: { sessionId: string | null; workflowId?: string; elementId?: string } | null;
  /** "Describe an element…" or "Describe a workflow…": asking an agent for a draft. */
  describing: 'workflow' | 'element' | null;
  /** The shelf element open in its editor; `new` for one being made. */
  editingElement: string | null;
  /** The run whose view is open. */
  viewingRun: string | null;

  editWorkflow: (workflowId: string | null) => void;
  startRun: (starting: { sessionId: string | null; workflowId?: string; elementId?: string } | null) => void;
  describe: (kind: 'workflow' | 'element' | null) => void;
  editElement: (elementId: string | null) => void;
  viewRun: (runId: string | null) => void;
  /** The panel of past conversations, when it is open: for a folder, with a search, or both. */
  historyView: { folder: string | null; query: string } | null;
  openHistory: (view: { folder: string | null; query: string } | null) => void;
  /** The session whose "what is switched on" panel is open. */
  inventoryFor: string | null;
  showInventory: (sessionId: string | null) => void;
  /** The question about tools for a new agent session is on screen. */
  choosingAgentTools: boolean;
  chooseAgentTools: (open: boolean) => void;
  /** The dialog for a new terminal in a folder of the owner's choosing, or in a working copy of its own. */
  startingTerminal: boolean;
  chooseStart: (open: boolean) => void;
  /** The environment whose changes are being read: a working copy's panel. */
  viewingEnvironment: string | null;
  viewEnvironment: (environmentId: string | null) => void;
  load: () => Promise<void>;
  /** A change. With its number when it came from the server's stream; without, when the page applies the answer to its own request. */
  apply: (event: ChangeEvent, revision?: number) => void;
  /** What is known of the server's state and how far: so that an older whole state never replaces a newer one, and no change is lost or applied twice. */
  following: Following;
  focusSession: (sessionId: string | null) => void;
  askToClose: (sessionId: string | null) => void;
  askToCloseCanvas: (canvasId: string | null) => void;
  setPicker: (open: boolean) => void;
  select: (sessionId: string | null) => void;
  /** Opens a panel, or closes it when it is the one that is open. `null` closes whatever is open. */
  togglePanel: (panel: Panel | null) => void;
  request: (ask: Omit<Ask, 'tick'>) => void;
  /** An ask is used once: forget it, unless a newer one has replaced it. */
  asked: (tick: number) => void;
  setNotice: (notice: string | null) => void;
  /** The thing the review screen is asked to show when it opens (`source:item`); null: whatever waits first. */
  reviewWanted: string | null;
  wantReview: (key: string | null) => void;
  /** The one setting the page changes: whether new terminals also open on the desktop. */
  setDesktopOpenNew: (openNew: boolean) => void;
  setSide: (change: Partial<PanelPrefs>) => void;
  setListView: (change: Partial<ListView>) => void;
  /** Opens a section's drawer for a row; `null` closes whatever is open. */
  openDrawer: (drawer: { section: string; kind: string; id: string } | null) => void;
  showSession: (sessionId: string) => void;
  /** A terminal has the keyboard: nothing is on its way any more. */
  settled: () => void;
  /** A request to show a session is used once: forget it, unless a newer one has replaced it. */
  shown: (tick: number) => void;
  /** Switches this page to another canvas. `push` adds a step to the browser's history. */
  setCanvas: (canvasId: string, options?: { push?: boolean }) => void;
}

/** The longest a terminal is waited for after it was asked to take the keyboard. */
const SETTLE_MS = 700;

export type Panel = 'parked' | 'outside' | 'shortcuts' | 'tokens' | 'activity' | 'workflows' | 'review' | 'help' | 'library' | 'board' | 'queue' | 'projects' | 'sharing';
export interface Ask {
  kind: 'rename-session' | 'rename-canvas' | 'note' | 'move' | 'tags' | 'list-search' | 'new-project' | 'project-from-template';
  /** The session or canvas it is about. */
  id: string;
  tick: number;
}

export const useApp = create<AppStore>((set, get) => ({
  phase: 'loading',
  runtime: null,
  settings: DEFAULT_SETTINGS,
  app: null,
  whole: null,
  following: NOT_FOLLOWING,
  canvasId: null,
  live: true,
  focus: null,
  closing: null,
  closingCanvas: null,
  picker: false,
  selected: null,
  panel: null,
  ask: null,
  notice: null,
  parkedHere: [],
  side: loadPanelPrefs(),
  listView: loadView(),
  drawer: null,
  show: null,
  settleUntil: 0,
  editingWorkflow: null,
  startingRun: null,
  viewingRun: null,
  historyView: null,
  openHistory: (historyView) => set({ historyView }),
  inventoryFor: null,
  showInventory: (inventoryFor) => set({ inventoryFor }),
  choosingAgentTools: false,
  chooseAgentTools: (choosingAgentTools) => set({ choosingAgentTools }),
  startingTerminal: false,
  chooseStart: (startingTerminal) => set({ startingTerminal }),
  viewingEnvironment: null,
  viewEnvironment: (viewingEnvironment) => set({ viewingEnvironment }),

  editWorkflow: (editingWorkflow) => set({ editingWorkflow }),
  startRun: (startingRun) => set({ startingRun }),
  describing: null,
  editingElement: null,
  describe: (describing) => set({ describing }),
  editElement: (editingElement) => set({ editingElement }),
  viewRun: (viewingRun) => set({ viewingRun }),

  load: async () => {
    try {
      const response = await api.getState();
      // Taken unless it is older than what the stream has already brought; what the stream brought before it is applied after it.
      const following = takeWhole(get().following, response.state, response.epoch ?? 'unnumbered', response.revision ?? 0);
      const everything = following.whole ?? response.state;
      const exists = (id: string): boolean => everything.canvases.some((c) => c.id === id);
      const current = get().canvasId;
      set({ phase: 'ready', runtime: response.runtime, settings: response.settings, following, whole: everything, app: viewOf(everything, current, get().app) });
      // Keep looking at the same canvas. On opening the page, or if that canvas is gone: the one
      // in the address, else the one this browser looked at last, else the server's default.
      if (!current || !exists(current)) {
        const chosen = chooseCanvas({
          fromAddress: canvasIdFromPath(location.pathname),
          remembered: rememberedCanvas(),
          fallback: response.defaultCanvasId,
          exists,
        });
        // An address that asks for a session is left for that to deal with.
        if (sessionFromAddress(location.search)) set({ canvasId: chosen, focus: null, app: viewOf(everything, chosen, get().app) });
        else get().setCanvas(chosen, { push: false });
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        set({ phase: 'unauthorized' });
      } else if (get().phase !== 'ready') {
        set({ phase: 'unreachable' });
      }
    }
  },

  apply: (event, revision) => {
    // Changes are applied to everything, each once and in its place; what is shown is worked out from that again.
    const before = get().following;
    const after = takeChange(before, event, revision);
    if (after === before) return;
    const app = before.whole;
    if (!app || after.whole === null || after.whole === app) {
      // Before the first whole state, or after a change that was missed: kept for when the whole state arrives.
      set({ following: after });
      // A change was missed: the whole state is asked for, once, and what waits is applied after it.
      if (behind(after) && !behind(before)) void get().load();
      return;
    }
    // A session has just started waiting: say so on the desktop, if the user asked for that
    // and is not already looking at it.
    const news = announcement(event, app.sessions);
    if (news && notificationsWanted() && (document.hidden || get().focus?.sessionId !== news.sessionId)) {
      try {
        new Notification(news.title, { body: news.body, tag: news.sessionId });
      } catch {
        // Notifications are a nicety; never let one break an update.
      }
    }
    const whole = after.whole;
    const next: Partial<AppStore> = { following: after, whole, app: viewOf(whole, get().canvasId, get().app) };
    if (event.type === 'session.closed') {
      if (get().closing === event.sessionId) next.closing = null;
    }
    if (event.type === 'session.closed' || event.type === 'session.parked') {
      if (get().focus?.sessionId === event.sessionId) next.focus = null;
      if (get().selected === event.sessionId) next.selected = null;
      const others = get().parkedHere.filter((id) => id !== event.sessionId);
      next.parkedHere = event.type === 'session.parked' ? [...others, event.sessionId] : others;
    }
    if (event.type === 'session.restored') next.parkedHere = get().parkedHere.filter((id) => id !== event.sessionId);
    set(next);
    if (event.type === 'canvas.removed' && get().canvasId === event.canvasId) {
      // The canvas this page was showing is gone: show the first of what is left.
      // The first of what is left in the project being looked at; of everything, when that project went with it.
      const first = sortedCanvases(get().app ?? app)[0] ?? sortedCanvases(get().whole ?? app)[0];
      if (first) get().setCanvas(first.id, { push: false });
    }
  },

  focusSession: (sessionId) =>
    set((state) => ({
      focus: sessionId ? { sessionId, tick: (state.focus?.tick ?? 0) + 1 } : null,
      // The terminal that had the keyboard stays selected when the keyboard leaves it.
      selected: sessionId ?? state.selected,
      // Taken away on purpose: nothing is on its way to a terminal any more.
      settleUntil: sessionId ? Date.now() + SETTLE_MS : 0,
    })),
  select: (sessionId) => set({ selected: sessionId }),
  togglePanel: (panel) => set((state) => ({ panel: panel === null || state.panel === panel ? null : panel })),
  request: (ask) => set((state) => ({ ask: { ...ask, tick: (state.ask?.tick ?? 0) + 1 } })),
  asked: (tick) => set((state) => (state.ask?.tick === tick ? { ask: null } : {})),
  setNotice: (notice) => set({ notice }),
  reviewWanted: null,
  wantReview: (key) => set({ reviewWanted: key }),
  setDesktopOpenNew: (openNew) => set((state) => ({ settings: { ...state.settings, desktop: { ...state.settings.desktop, openNew } } })),
  setSide: (change) => {
    const side = { ...get().side, ...change };
    side.width = clampPanelWidth(side.width);
    savePanelPrefs(side);
    // A collapsed panel has nowhere to show a drawer.
    set(side.open ? { side } : { side, drawer: null });
  },
  setListView: (change) => {
    const listView = { ...get().listView, ...change };
    saveView(listView);
    set({ listView });
  },
  openDrawer: (drawer) => set({ drawer }),

  askToClose: (sessionId) => set({ closing: sessionId }),
  askToCloseCanvas: (canvasId) => set({ closingCanvas: canvasId }),
  setPicker: (open) => set({ picker: open }),
  setCanvas: (canvasId, options) => {
    // Another canvas may be of another project: what is shown follows it.
    const everything = get().whole;
    if (get().canvasId !== canvasId) set({ canvasId, focus: null, selected: null, settleUntil: 0, ...(everything ? { app: viewOf(everything, canvasId, get().app) } : {}) });
    const projectId = everything?.canvases.find((c) => c.id === canvasId)?.projectId ?? null;
    writeAddress(canvasId, options?.push !== false, projectId);
    rememberCanvas(canvasId, projectId ?? undefined);
    events?.viewing(canvasId);
  },
  showSession: (sessionId) => set((state) => ({ show: { sessionId, tick: (state.show?.tick ?? 0) + 1 }, settleUntil: Date.now() + SETTLE_MS })),
  settled: () => set({ settleUntil: 0 }),
  shown: (tick) => set((state) => (state.show?.tick === tick ? { show: null } : {})),
}));

const noLayout: Layout = { nodes: [], frames: [] };

/** A list as it was, where nothing in it changed: so that what did not change is not drawn again. */
function same<T>(before: readonly T[] | undefined, now: T[]): T[] {
  return before !== undefined && before.length === now.length && before.every((item, index) => item === now[index]) ? (before as T[]) : now;
}

/**
 * What is shown, out of everything: the project of the canvas being looked at, with what is shared with it. With one
 * project that is everything, as it is. The lists that did not change are kept as they were.
 */
export function viewOf(whole: AppState, canvasId: string | null, previous: AppState | null): AppState {
  if (whole.projects.length <= 1) return whole;
  const projectId = whole.canvases.find((c) => c.id === canvasId)?.projectId ?? firstProject(whole).id;
  const view = stateOf(whole, projectId);
  if (previous === null) return view;
  return {
    ...view,
    sessions: same(previous.sessions, view.sessions),
    canvases: same(previous.canvases, view.canvases),
    runs: same(previous.runs, view.runs),
    drafts: same(previous.drafts, view.drafts),
    workflows: same(previous.workflows, view.workflows),
    shelf: same(previous.shelf, view.shelf),
    environments: same(previous.environments, view.environments),
    library: { ...view.library, sources: same(previous.library.sources, view.library.sources), installed: same(previous.library.installed, view.library.installed) },
    queue: { ...view.queue, tasks: same(previous.queue.tasks, view.queue.tasks), asks: same(previous.queue.asks, view.queue.asks), rules: same(previous.queue.rules, view.queue.rules) },
    schedules: { ...view.schedules, items: same(previous.schedules.items, view.schedules.items) },
  };
}

/** The canvas this page is showing. */
export function currentCanvas(state: Pick<AppStore, 'app' | 'canvasId'>): Canvas | null {
  return state.app?.canvases.find((c) => c.id === state.canvasId) ?? null;
}

/** The nodes and frames of the canvas this page is showing. */
/** The project being looked at: the one of the canvas that is shown. */
export function currentProjectId(state: Pick<AppStore, 'app' | 'canvasId'>): string | null {
  return currentCanvas(state)?.projectId ?? (state.app ? firstProject(state.app).id : null);
}
// What the page asks the server is asked about the project being looked at.
askAbout(() => currentProjectId(useApp.getState()));
useApp.subscribe((state) => lookAt(currentProjectId(state)));

export function currentLayout(state: Pick<AppStore, 'app' | 'canvasId'>): Layout {
  return currentCanvas(state)?.layout ?? noLayout;
}

/** Loads state, keeps it live, and keeps retrying while the daemon is away. */
/** The live connection to the daemon, once there is one. */
let events: ReturnType<typeof subscribeToEvents> | null = null;

export function startSync(): () => void {
  const { load, apply } = useApp.getState();
  let stopped = false;

  // The event stream needs the access cookie, so it starts after the first successful load.
  const sync = async (): Promise<void> => {
    await load();
    const store = useApp.getState();
    if (store.phase !== 'ready') return;
    // Opened on an address that names a session (as `aubergine here` does): go to it,
    // on whichever canvas it is, and let that put the canvas in the address.
    const wanted = sessionFromAddress(location.search);
    if (wanted) {
      const place = store.whole ? placeOfSession(store.whole, wanted) : null;
      const canvasId = place?.canvas.id ?? store.canvasId;
      if (canvasId) store.setCanvas(canvasId, { push: false });
      store.showSession(wanted);
    }
    if (stopped || events) return;
    events = subscribeToEvents({
      onReady: () => {
        useApp.setState({ live: true });
        void load();
      },
      onEvent: apply,
      onShow: (sessionId) => useApp.getState().showSession(sessionId),
      // A rule of the owner's: said in the page, and as a notification of the browser where the owner allowed those.
      onNotify: (title, body) => {
        useApp.getState().setNotice(body);
        showNotification(title, body);
      },
      onShowCanvas: (canvasId) => {
        const store = useApp.getState();
        if (store.whole?.canvases.some((c) => c.id === canvasId)) store.setCanvas(canvasId);
      },
      onDown: () => useApp.setState({ live: false }),
    });
    const current = useApp.getState().canvasId;
    if (current) events.viewing(current);
  };
  void sync();

  // Back and forward move between canvases.
  const onPopState = (): void => {
    const id = canvasIdFromPath(location.pathname);
    const store = useApp.getState();
    if (id && store.whole?.canvases.some((c) => c.id === id) && id !== store.canvasId) {
      useApp.setState({ canvasId: id, focus: null, selected: null, app: viewOf(store.whole, id, store.app) });
      rememberCanvas(id, store.whole.canvases.find((c) => c.id === id)?.projectId);
      events?.viewing(id);
    }
  };
  window.addEventListener('popstate', onPopState);

  // Coming back to this tab makes it the one most recently used.
  const onFocus = (): void => {
    const id = useApp.getState().canvasId;
    if (id) {
      rememberCanvas(id);
      events?.viewing(id);
    }
  };
  window.addEventListener('focus', onFocus);

  // While there is nothing to show yet, or tmux is unusable, keep asking.
  const poll = window.setInterval(() => {
    const { phase, runtime } = useApp.getState();
    if (phase !== 'ready' || runtime?.status !== 'ok') void sync();
  }, 3000);

  return () => {
    stopped = true;
    events?.stop();
    events = null;
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('focus', onFocus);
    window.clearInterval(poll);
  };
}
