import { create } from 'zustand';
import { applyEvent, type CanvasState, type ChangeEvent, type RuntimeStatus } from '@aubergine/shared';
import { ApiError, api, subscribeToEvents } from './api';

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
  canvas: CanvasState | null;
  /** False while the live event stream is down after having been up. */
  live: boolean;
  /** Session whose terminal should hold keyboard focus. The counter re-triggers focus on repeat clicks. */
  focus: { sessionId: string; tick: number } | null;
  /** Session waiting for the user to confirm closing it. */
  closing: string | null;

  load: () => Promise<void>;
  apply: (event: ChangeEvent) => void;
  focusSession: (sessionId: string | null) => void;
  askToClose: (sessionId: string | null) => void;
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'loading',
  runtime: null,
  canvas: null,
  live: true,
  focus: null,
  closing: null,

  load: async () => {
    try {
      const response = await api.getState();
      set({ phase: 'ready', runtime: response.runtime, canvas: response.state });
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
