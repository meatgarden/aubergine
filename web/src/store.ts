import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  applyEvent,
  type CanvasState,
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

interface AppState {
  phase: Phase;
  runtime: RuntimeStatus | null;
  /** User settings from the daemon's settings file. */
  settings: Settings;
  canvas: CanvasState | null;
  /** False while the live event stream is down after having been up. */
  live: boolean;
  /** Session whose terminal should hold keyboard focus. The counter re-triggers focus on repeat clicks. */
  focus: { sessionId: string; tick: number } | null;
  /** Session waiting for the user to confirm closing it. */
  closing: string | null;
  /** Whether the session picker is open. */
  picker: boolean;

  load: () => Promise<void>;
  apply: (event: ChangeEvent) => void;
  focusSession: (sessionId: string | null) => void;
  askToClose: (sessionId: string | null) => void;
  setPicker: (open: boolean) => void;
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'loading',
  runtime: null,
  settings: DEFAULT_SETTINGS,
  canvas: null,
  live: true,
  focus: null,
  closing: null,
  picker: false,

  load: async () => {
    try {
      const response = await api.getState();
      set({ phase: 'ready', runtime: response.runtime, settings: response.settings, canvas: response.state });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        set({ phase: 'unauthorized' });
      } else if (get().phase !== 'ready') {
        set({ phase: 'unreachable' });
      }
    }
  },

  apply: (event) => {
    const canvas = get().canvas;
    if (!canvas) return;
    // A session has just started waiting: say so on the desktop, if the user asked for that
    // and is not already looking at it.
    const news = announcement(event, canvas.sessions);
    if (news && notificationsWanted() && (document.hidden || get().focus?.sessionId !== news.sessionId)) {
      try {
        new Notification(news.title, { body: news.body, tag: news.sessionId });
      } catch {
        // Notifications are a nicety; never let one break an update.
      }
    }
    const next: Partial<AppState> = { canvas: applyEvent(canvas, event) };
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
}));

/** Loads state, keeps it live, and keeps retrying while the daemon is away. */
export function startSync(): () => void {
  const { load, apply } = useApp.getState();
  let unsubscribe: (() => void) | null = null;
  let stopped = false;

  // The event stream needs the access cookie, so it starts after the first successful load.
  const sync = async (): Promise<void> => {
    await load();
    if (stopped || unsubscribe || useApp.getState().phase !== 'ready') return;
    unsubscribe = subscribeToEvents({
      onReady: () => {
        useApp.setState({ live: true });
        void load();
      },
      onEvent: apply,
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
