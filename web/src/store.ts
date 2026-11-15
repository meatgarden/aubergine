import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  applyEvent,
  placeOfSession,
  sortedCanvases,
  type AppState,
  type Canvas,
  type Layout,
  type ChangeEvent,
  type RuntimeStatus,
  type Settings,
} from '@aubergine/shared';
import { ApiError, api, subscribeToEvents } from './api';
import { canvasIdFromPath, chooseCanvas, rememberCanvas, rememberedCanvas, sessionFromAddress, writeAddress } from './address';
import { announcement, notificationsWanted } from './attention';

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
  app: AppState | null;
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
  /** Sessions parked from this page, oldest first, so the last one can be brought back. */
  parkedHere: string[];
  /** A session the canvas was asked to bring into view. The counter makes repeats count. */
  show: { sessionId: string; tick: number } | null;
  /**
   * Until when a terminal is on its way to getting the keyboard: set when one is asked for,
   * cleared when it has it. Keys typed in between are meant for that terminal.
   */
  settleUntil: number;

  load: () => Promise<void>;
  apply: (event: ChangeEvent) => void;
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

export type Panel = 'parked' | 'outside' | 'shortcuts';
export interface Ask {
  kind: 'rename-session' | 'rename-canvas' | 'note' | 'move';
  /** The session or canvas it is about. */
  id: string;
  tick: number;
}

export const useApp = create<AppStore>((set, get) => ({
  phase: 'loading',
  runtime: null,
  settings: DEFAULT_SETTINGS,
  app: null,
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
  show: null,
  settleUntil: 0,

  load: async () => {
    try {
      const response = await api.getState();
      const exists = (id: string): boolean => response.state.canvases.some((c) => c.id === id);
      const current = get().canvasId;
      set({ phase: 'ready', runtime: response.runtime, settings: response.settings, app: response.state });
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
        if (sessionFromAddress(location.search)) set({ canvasId: chosen, focus: null });
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

  apply: (event) => {
    const app = get().app;
    if (!app) return;
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
    const next: Partial<AppStore> = { app: applyEvent(app, event) };
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
      const first = sortedCanvases(get().app ?? app)[0];
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

  askToClose: (sessionId) => set({ closing: sessionId }),
  askToCloseCanvas: (canvasId) => set({ closingCanvas: canvasId }),
  setPicker: (open) => set({ picker: open }),
  setCanvas: (canvasId, options) => {
    if (get().canvasId !== canvasId) set({ canvasId, focus: null, selected: null, settleUntil: 0 });
    writeAddress(canvasId, options?.push !== false);
    rememberCanvas(canvasId);
    events?.viewing(canvasId);
  },
  showSession: (sessionId) => set((state) => ({ show: { sessionId, tick: (state.show?.tick ?? 0) + 1 }, settleUntil: Date.now() + SETTLE_MS })),
  settled: () => set({ settleUntil: 0 }),
  shown: (tick) => set((state) => (state.show?.tick === tick ? { show: null } : {})),
}));

const noLayout: Layout = { nodes: [], frames: [] };

/** The canvas this page is showing. */
export function currentCanvas(state: Pick<AppStore, 'app' | 'canvasId'>): Canvas | null {
  return state.app?.canvases.find((c) => c.id === state.canvasId) ?? null;
}

/** The nodes and frames of the canvas this page is showing. */
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
      const place = store.app ? placeOfSession(store.app, wanted) : null;
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
    if (id && store.app?.canvases.some((c) => c.id === id) && id !== store.canvasId) {
      useApp.setState({ canvasId: id, focus: null, selected: null });
      rememberCanvas(id);
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
