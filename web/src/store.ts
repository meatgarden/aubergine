import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  SHOW_PARAM,
  applyEvent,
  sortedCanvases,
  type AppState,
  type Canvas,
  type Layout,
  type ChangeEvent,
  type RuntimeStatus,
  type Settings,
} from '@aubergine/shared';
import { ApiError, api, subscribeToEvents } from './api';
import { announcement, notificationsWanted } from './attention';

export type Phase =
  | 'loading'
  /** This browser has no valid access cookie. */
  | 'unauthorized'
  /** The daemon does not answer. */
  | 'unreachable'
  | 'ready';

interface AppStore {
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
  /** Whether the session picker is open. */
  picker: boolean;
  /** A session the canvas was asked to bring into view. The counter makes repeats count. */
  show: { sessionId: string; tick: number } | null;

  load: () => Promise<void>;
  apply: (event: ChangeEvent) => void;
  focusSession: (sessionId: string | null) => void;
  askToClose: (sessionId: string | null) => void;
  setPicker: (open: boolean) => void;
  showSession: (sessionId: string) => void;
  setCanvas: (canvasId: string) => void;
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
  picker: false,
  show: null,

  load: async () => {
    try {
      const response = await api.getState();
      const known = response.state.canvases.some((c) => c.id === get().canvasId);
      set({
        phase: 'ready',
        runtime: response.runtime,
        settings: response.settings,
        app: response.state,
        // Keep looking at the same canvas; if there is none yet, or it is gone, take the default.
        ...(known ? {} : { canvasId: response.defaultCanvasId }),
      });
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
    if (event.type === 'canvas.removed' && get().canvasId === event.canvasId) {
      next.canvasId = sortedCanvases(next.app ?? app)[0]?.id ?? null;
    }
    if (event.type === 'session.closed') {
      if (get().closing === event.sessionId) next.closing = null;
      if (get().focus?.sessionId === event.sessionId) next.focus = null;
    }
    set(next);
  },

  focusSession: (sessionId) =>
    set((state) => ({
      focus: sessionId ? { sessionId, tick: (state.focus?.tick ?? 0) + 1 } : null,
    })),

  askToClose: (sessionId) => set({ closing: sessionId }),
  setPicker: (open) => set({ picker: open }),
  setCanvas: (canvasId) => set({ canvasId, focus: null }),
  showSession: (sessionId) => set((state) => ({ show: { sessionId, tick: (state.show?.tick ?? 0) + 1 } })),
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
export function startSync(): () => void {
  const { load, apply } = useApp.getState();
  let unsubscribe: (() => void) | null = null;
  let stopped = false;

  // The event stream needs the access cookie, so it starts after the first successful load.
  const sync = async (): Promise<void> => {
    await load();
    // Opened on an address that names a session: go there once, then forget the address.
    const wanted = new URLSearchParams(location.search).get(SHOW_PARAM);
    if (wanted && useApp.getState().phase === 'ready') {
      history.replaceState(null, '', location.pathname);
      useApp.getState().showSession(wanted);
    }
    if (stopped || unsubscribe || useApp.getState().phase !== 'ready') return;
    unsubscribe = subscribeToEvents({
      onReady: () => {
        useApp.setState({ live: true });
        void load();
      },
      onEvent: apply,
      onShow: (sessionId) => useApp.getState().showSession(sessionId),
      onDown: () => useApp.setState({ live: false }),
    });
  };
  void sync();

  // While there is nothing to show yet, or tmux is unusable, keep asking.
  const poll = window.setInterval(() => {
    const { phase, runtime } = useApp.getState();
    if (phase !== 'ready' || runtime?.status !== 'ok') void sync();
  }, 3000);

  return () => {
    stopped = true;
    unsubscribe?.();
    window.clearInterval(poll);
  };
}
