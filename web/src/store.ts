import { showNotification } from './attention';
import { create } from 'zustand';
import {
  type ThemeSetting,
  isPageName,
  type PageName,
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
import { ApiError, NotUnderstood, api, askAbout, isRefusal, isSuperseded, lookAt, ownApi, showTarget, subscribeToEvents, whenRefused } from './api';
import { findServer, loadServers, withPageSettings, type LinkedServer } from './servers';
import { NOT_FOLLOWING, behind, takeChange, takeWhole, type Following } from './following';
import { canvasIdFromPath, chooseCanvas, linkFromPath, openedHere, pageFromPath, rememberCanvas, rememberedCanvas, sessionFromAddress, shownPage, terminalFromPath, writeAddress, writeAddressesFor, type RunsTab } from './address';
import { announcement, notificationsWanted } from './attention';
import { clampDrawerWidth, clampPanelWidth, loadPanelPrefs, savePanelPrefs, type PanelPrefs } from './panel/registry';
import { loadView, saveView, type ListView } from './terminal-rows';

export type Phase =
  | 'loading'
  /** This browser has no valid access cookie. */
  | 'unauthorized'
  /** The daemon does not answer. */
  | 'unreachable'
  | 'ready';

/** Where the page goes once another server is shown: a canvas of it, or a project of it. */
export interface ShowWhere {
  canvasId?: string;
  projectId?: string;
  /** False where the address is already the one to go to (back and forward); otherwise going there is a step in the history. */
  push?: boolean;
}

export interface AppStore {
  phase: Phase;
  /**
   * The server shown: null for the one that served the page, or the short name of a server this browser linked.
   * Everything below that names things (canvases, terminals, runs) is of that server. Changed by `showServer` alone.
   */
  server: LinkedServer['id'] | null;
  /**
   * Shows another server: the own one (null) or a linked one. Stops following the server shown, forgets everything of
   * it, follows the other, and goes to the canvas or project asked for, else to that server's default. The one way the
   * server shown changes.
   */
  showServer: (server: LinkedServer['id'] | null, then?: ShowWhere) => void;
  /** The settings of the own server: what is about the page itself (the theme, the fonts, the keys) is taken from these whatever is shown. */
  ownSettings: Settings | null;
  /** The dialog that links a server is open. */
  linking: boolean;
  linkServer: (open: boolean) => void;
  /** The linked server whose unlinking waits for a yes. */
  unlinking: string | null;
  askToUnlink: (server: string | null) => void;
  runtime: RuntimeStatus | null;
  /**
   * Settings from the settings file of the server shown, but for what is about the page itself, which is the own
   * server's (`withPageSettings`).
   */
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
  /**
   * Whether the page came in under this computer's own name, as the server said with the state. False on another
   * device, at an outside address: there nothing is offered that acts on the desktop of the computer Aubergine runs
   * on. Ask `atThisComputer`, not this.
   */
  here: boolean;
  /** Whether the dialog that adds a device is open. What it shows (the code) is the dialog's own, and nobody else's. */
  addingDevice: boolean;
  /** The part of Settings to bring into view when it opens; used once. */
  settingsAt: 'devices' | null;
  addDevice: (open: boolean) => void;
  showSettings: (at: 'devices' | null) => void;
  /**
   * The page that is shown in place of the canvas, if any: Queue, Board, Workflows or Library. The canvas stays as it
   * was underneath, and a panel or a dialog opens over a page as it does over the canvas. Its name is in the address.
   */
  page: PageName | null;
  /** The tab the Runs page shows. */
  runsTab: RunsTab;
  setRunsTab: (tab: RunsTab) => void;
  /** Something a component was asked to start: renaming, a note, the move menu. Used once. */
  ask: Ask | null;
  /** The last thing that went wrong, shown in the toolbar. */
  notice: string | null;
  /** The side panel: open or collapsed to its strip, its width, which sections are folded. Remembered by this browser. */
  side: PanelPrefs;
  /** The terminal list: its filters, grouping, order and density. Remembered by this browser. */
  listView: ListView;
  /** What is open beside the side panel: a section's drawer for one of its rows. */
  /** `part` names the part of the drawer that was asked for, where it has parts: a terminal's messages, say. */
  drawer: { section: string; kind: string; id: string; part?: string } | null;
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
  /** "Describe a step…" or "Describe a workflow…": asking an agent for a draft. */
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
  /**
   * Opens a panel, or closes it when it is the one that is open. `null` closes the panel that is open, or, with none
   * open, leaves the page for the canvas. A name that is a page's shows that page, or leaves it when it is the one shown.
   */
  togglePanel: (panel: Panel | null) => void;
  /** Shows a page in place of the canvas, or (null) the canvas as it was. */
  showPage: (page: PageName | null) => void;
  request: (ask: Omit<Ask, 'tick'>) => void;
  /** An ask is used once: forget it, unless a newer one has replaced it. */
  asked: (tick: number) => void;
  setNotice: (notice: string | null) => void;
  /** The thing the review screen is asked to show when it opens (`source:item`); null: whatever waits first. */
  reviewWanted: string | null;
  wantReview: (key: string | null) => void;
  /** The one setting the page changes: whether new terminals also open on the desktop. */
  setDesktopOpenNew: (openNew: boolean) => void;
  /** What just happened, said in one line that goes by itself: with the way to take it back where there is one. */
  said: { text: string; undo?: { label: string; run: () => void }; tick: number } | null;
  say: (text: string | null, undo?: { label: string; run: () => void }) => void;
  /** How the page looks, as it was just chosen: the page follows at once; the file is written by whoever chose. */
  setTheme: (theme: ThemeSetting) => void;
  setDescribeRemind: (remind: boolean) => void;
  setSide: (change: Partial<PanelPrefs>) => void;
  setListView: (change: Partial<ListView>) => void;
  /** Opens a section's drawer for a row; `null` closes whatever is open. */
  openDrawer: (drawer: { section: string; kind: string; id: string; part?: string } | null) => void;
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

export type Panel = 'settings' | 'parked' | 'outside' | 'shortcuts' | 'tokens' | 'activity' | 'workflows' | 'review' | 'help' | 'library' | 'board' | 'queue' | 'projects' | 'sharing';
export interface Ask {
  kind: 'rename-session' | 'rename-canvas' | 'note' | 'move' | 'tags' | 'list-search' | 'new-project' | 'project-from-template';
  /** The session or canvas it is about. */
  id: string;
  tick: number;
}

/** The page and the tab of Runs the address names when the page loads. */
function startPage(): { page: PageName | null; tab: RunsTab | null } {
  const found = pageFromPath(location.pathname);
  return found ? shownPage(found) : { page: null, tab: null };
}

export const useApp = create<AppStore>((set, get) => ({
  phase: 'loading',
  server: null,
  ownSettings: null,
  linking: false,
  linkServer: (linking) => set({ linking }),
  unlinking: null,
  askToUnlink: (unlinking) => set({ unlinking }),
  showServer: (server, then) => showServer(server, then),
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
  here: true,
  addingDevice: false,
  settingsAt: null,
  addDevice: (addingDevice) => set({ addingDevice }),
  showSettings: (settingsAt) => {
    if (get().panel !== 'settings') get().togglePanel('settings');
    set({ settingsAt });
  },
  // A page whose address the browser was opened at is shown from the start.
  page: typeof location === 'undefined' ? null : startPage().page,
  runsTab: typeof location === 'undefined' ? 'runs' : (startPage().tab ?? 'runs'),
  setRunsTab: (runsTab) => set({ runsTab }),
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
    const server = get().server;
    try {
      // A linked server shown from the start: what is about the page itself is the own server's, read first.
      if (server !== null && get().ownSettings === null) {
        let own: Settings;
        try {
          own = (await ownApi.getState()).settings;
        } catch {
          // The own server is not there or does not take this page: that is said as it always is, by showing it.
          if (get().server === server) get().showServer(null);
          return;
        }
        if (get().server !== server) return;
        set({ ownSettings: own });
      }
      const response = await api.getState();
      // Taken unless it is older than what the stream has already brought; what the stream brought before it is applied after it.
      const following = takeWhole(get().following, response.state, response.epoch ?? 'unnumbered', response.revision ?? 0);
      const everything = following.whole ?? response.state;
      const exists = (id: string): boolean => everything.canvases.some((c) => c.id === id);
      const current = get().canvasId;
      const ownSettings = server === null ? response.settings : get().ownSettings;
      set({ phase: 'ready', runtime: response.runtime, settings: withPageSettings(response.settings, ownSettings), ownSettings, here: response.here, following, whole: everything, app: viewOf(everything, current, get().app) });
      // A tab that shows one terminal by itself looks at no canvas, and keeps its own address.
      if (terminalPage !== null) return;
      // Keep looking at the same canvas. On opening the page, or if that canvas is gone: the one asked for on
      // showing this server, else the one in the address, else the one this browser looked at last, else the server's default.
      if (!current || !exists(current)) {
        const wanted = goingTo;
        goingTo = null;
        const inProject = wanted?.projectId ? everything.canvases.filter((c) => c.projectId === wanted.projectId) : [];
        const remembered = wanted?.projectId ? rememberedCanvas(wanted.projectId) : null;
        const chosen = chooseCanvas({
          fromAddress: wanted?.canvasId ?? (wanted?.projectId ? (inProject.find((c) => c.id === remembered) ?? inProject[0])?.id ?? null : canvasIdFromPath(location.pathname)),
          remembered: rememberedCanvas(),
          fallback: response.defaultCanvasId,
          exists,
        });
        // An address that asks for a session is left for that to deal with.
        if (sessionFromAddress(location.search)) set({ canvasId: chosen, focus: null, app: viewOf(everything, chosen, get().app) });
        else get().setCanvas(chosen, { push: wanted?.push ?? false });
      }
    } catch (error) {
      // An answer for a server no longer shown: nothing to do, and nothing to say.
      if (isSuperseded(error) || get().server !== server) return;
      if (server !== null) {
        // The linked server no longer takes this page's credential: said once, where every such refusal is said.
        if (isRefusal(error)) return;
        // Not shown yet, or another version: the own server is shown instead, and the page says why.
        if (error instanceof NotUnderstood) return leaveServer(server, 'version');
        if (get().phase !== 'ready') return leaveServer(server, 'unreachable');
        return;
      }
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
  togglePanel: (panel) => {
    const state = get();
    if (panel !== null && isPageName(panel)) {
      // The Queue and the Board are tabs of Runs: pressing one while its tab is shown leads back to the canvas.
      const shown = shownPage(panel);
      const here = state.page === shown.page && (shown.tab === null || state.runsTab === shown.tab);
      return state.showPage(here ? null : panel);
    }
    if (panel === null && state.panel === null) return state.showPage(null);
    set({ panel: panel === null || state.panel === panel ? null : panel });
  },
  showPage: (asked) => {
    const shown = asked === null ? null : shownPage(asked);
    if (shown?.tab) set({ runsTab: shown.tab });
    const page = shown?.page ?? null;
    const state = get();
    if (state.page === page) return;
    set({ page });
    if (!state.canvasId) return;
    // Leaving a page that this page's own step opened goes back over that step, so that the browser's back and
    // the page's own ways out leave the same history. Anything else is written in place.
    if (page === null && state.page !== null && openedHere()) return history.back();
    const projectId = state.whole?.canvases.find((c) => c.id === state.canvasId)?.projectId ?? null;
    writeAddress(state.canvasId, page !== null && state.page === null, projectId, page);
  },
  request: (ask) => set((state) => ({ ask: { ...ask, tick: (state.ask?.tick ?? 0) + 1 } })),
  asked: (tick) => set((state) => (state.ask?.tick === tick ? { ask: null } : {})),
  setNotice: (notice) => set({ notice }),
  reviewWanted: null,
  wantReview: (key) => set({ reviewWanted: key }),
  said: null,
  say: (text, undo) => set((state) => ({ said: text === null ? null : { text, undo, tick: (state.said?.tick ?? 0) + 1 } })),
  setDesktopOpenNew: (openNew) => set((state) => ({ settings: { ...state.settings, desktop: { ...state.settings.desktop, openNew } } })),
  setTheme: (theme) => set((state) => ({ settings: { ...state.settings, theme }, ...(state.ownSettings ? { ownSettings: { ...state.ownSettings, theme } } : {}) })),
  setDescribeRemind: (remind) => set((state) => ({ settings: { ...state.settings, describe: { ...state.settings.describe, remind } } })),
  setSide: (change) => {
    const side = { ...get().side, ...change };
    side.width = clampPanelWidth(side.width);
    side.drawerWidth = clampDrawerWidth(side.drawerWidth);
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
    writeAddress(canvasId, options?.push !== false, projectId, get().page);
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

/** The terminal this browser tab shows by itself (`/t/<session id>`), or null for the app with its canvases. */
export const terminalPage: string | null = typeof location === 'undefined' ? null : terminalFromPath(location.pathname);

/**
 * A tab that shows one terminal by itself reads the state, and reads it again when it is used again or while the
 * server is away. It does not join the stream of changes: a tab on the stream is one the server may ask to show a
 * terminal or a canvas, and this one can show neither. The terminal itself is live over its own socket.
 */
function startTerminalPageSync(load: () => Promise<void>): () => void {
  // Showing another server (the own one, when a linked one could not be shown) reads it as a first load does.
  syncNow = load;
  void load();
  const onFocus = (): void => void load();
  window.addEventListener('focus', onFocus);
  const poll = window.setInterval(() => {
    const { phase, runtime } = useApp.getState();
    if (phase !== 'ready' || runtime?.status !== 'ok') void load();
  }, 3000);
  return () => {
    syncNow = null;
    window.removeEventListener('focus', onFocus);
    window.clearInterval(poll);
  };
}

/** Loads state, keeps it live, and keeps retrying while the daemon is away. */
/** The live connection to the daemon, once there is one. */
let events: ReturnType<typeof subscribeToEvents> | null = null;

/**
 * Whether what acts on the desktop of the computer Aubergine runs on is offered: "Open on desktop", the box in the
 * dialogs that make a terminal, the setting for new terminals, and the terminals open outside the canvas. Not on
 * another device. The server refuses them from there anyway; this only keeps the page from offering them.
 */
export const atThisComputer = (state: Pick<AppStore, 'here'>): boolean => state.here;

/** What `startSync` does at its start, done again at once: after this browser was signed in with a code. */
let syncNow: (() => Promise<void>) | null = null;
export function signedIn(): void {
  void syncNow?.();
}

/** Where to go once the server being shown has been read: asked for by `showServer`, used by the next load. */
let goingTo: ShowWhere | null = null;

/** What the page says about leaving a linked server for the own one. One sentence each, with the label as this browser has it. */
export function leavingWords(label: string, why: 'version' | 'refused' | 'unreachable' | 'unknown'): string {
  if (why === 'unknown') return 'This browser has no server linked under that address, so this page’s own server is shown.';
  if (why === 'version') return `“${label}” runs another version of Aubergine than this page, and both must be the same to show it here; this page’s own server is shown.`;
  if (why === 'refused') return `“${label}” no longer takes this page’s sign-in: its device there was revoked or went unused. Link it again or unlink it from the project menu.`;
  return `“${label}” could not be reached, so this page’s own server is shown.`;
}

/** The own server is shown in place of a linked one, and the page says why. */
function leaveServer(server: string, why: 'version' | 'refused' | 'unreachable'): void {
  const store = useApp.getState();
  if (store.server !== server) return;
  const label = findServer(loadServers(), server)?.label ?? 'The linked server';
  store.showServer(null);
  useApp.getState().say(leavingWords(label, why));
}
// A linked server that refuses the credential on any call or socket: once, for the server shown.
whenRefused(() => {
  const server = useApp.getState().server;
  if (server !== null) leaveServer(server, 'refused');
});

/** What names something of the server shown, set back as it is before anything is read: nothing of one server is left for the next. */
const NOTHING_OF_A_SERVER = {
  runtime: null,
  whole: null,
  app: null,
  following: NOT_FOLLOWING,
  canvasId: null,
  live: true,
  focus: null,
  selected: null,
  closing: null,
  closingCanvas: null,
  picker: false,
  panel: null,
  page: null,
  ask: null,
  notice: null,
  drawer: null,
  parkedHere: [],
  show: null,
  settleUntil: 0,
  editingWorkflow: null,
  startingRun: null,
  describing: null,
  editingElement: null,
  viewingRun: null,
  historyView: null,
  inventoryFor: null,
  choosingAgentTools: false,
  startingTerminal: false,
  viewingEnvironment: null,
  reviewWanted: null,
  addingDevice: false,
  settingsAt: null,
  linking: false,
  unlinking: null,
} satisfies Partial<AppStore>;

function showServer(server: string | null, then?: ShowWhere): void {
  const store = useApp.getState();
  const entry = server === null ? null : findServer(loadServers(), server);
  if (server !== null && entry === null) {
    if (store.server !== null) showServer(null);
    useApp.getState().say(leavingWords('', 'unknown'));
    return;
  }
  if (store.server === server) {
    // The server is shown already: only where to go on it.
    const whole = store.whole;
    const canvas = then?.canvasId ? whole?.canvases.find((c) => c.id === then.canvasId) : undefined;
    if (canvas) store.setCanvas(canvas.id);
    return;
  }
  // Stop following the server shown, so that nothing more of it arrives; anything already on its way is dropped
  // (`Superseded`, and a socket opened before this is not listened to).
  events?.stop();
  events = null;
  showTarget(entry === null ? null : { id: entry.id, address: entry.address, credential: entry.credential });
  writeAddressesFor(entry?.id ?? null);
  goingTo = { ...then, push: then?.push ?? true };
  useApp.setState({
    ...NOTHING_OF_A_SERVER,
    server,
    phase: 'loading',
    // Until the other server has said, nothing is offered that acts on the desktop where Aubergine runs.
    here: entry === null,
    // What is the page's own stays as it is meanwhile: the own server's.
    settings: store.ownSettings ?? store.settings,
  });
  void syncNow?.();
}

/** Shows from the start the server the address names (`/s/<link>/…`): before anything is asked of any server. */
function serverFromAddress(): void {
  if (typeof location === 'undefined') return;
  const link = linkFromPath(location.pathname);
  if (link === null) return;
  const entry = findServer(loadServers(), link);
  if (entry === null) {
    useApp.getState().say(leavingWords('', 'unknown'));
    return;
  }
  showTarget({ id: entry.id, address: entry.address, credential: entry.credential });
  writeAddressesFor(entry.id);
  useApp.setState({ server: entry.id, here: false });
}

export function startSync(): () => void {
  const { load, apply } = useApp.getState();
  serverFromAddress();
  if (terminalPage !== null) return startTerminalPageSync(load);
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
  syncNow = sync;
  void sync();

  // Back and forward move between canvases.
  const onPopState = (): void => {
    const id = canvasIdFromPath(location.pathname);
    const store = useApp.getState();
    // A step back or forward to another server's address shows that server, and that canvas on it.
    const link = linkFromPath(location.pathname);
    if (link !== store.server) {
      const found = pageFromPath(location.pathname);
      store.showServer(link, { ...(id ? { canvasId: id } : {}), push: false });
      if (found) useApp.setState({ page: shownPage(found).page, ...(shownPage(found).tab ? { runsTab: shownPage(found).tab! } : {}) });
      return;
    }
    // And between a page and the canvas it was opened from.
    const found = pageFromPath(location.pathname);
    const shown = found ? shownPage(found) : null;
    if (shown?.tab) useApp.setState({ runsTab: shown.tab });
    const page = shown?.page ?? null;
    if (page !== store.page) useApp.setState({ page });
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
    syncNow = null;
    events?.stop();
    events = null;
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('focus', onFocus);
    window.clearInterval(poll);
  };
}
