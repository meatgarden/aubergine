import { create } from 'zustand';

/**
 * Where the tour stands. Whether it was finished or put away is remembered
 * in this browser and nowhere else: nothing about who took the tour is sent
 * to the server or recorded.
 */

const STORAGE_KEY = 'aubergine.tour';

export type TourStatus = 'active' | 'paused' | 'finished' | 'dismissed';
export interface Remembered {
  status: TourStatus;
  /** The step it was at, by its id, so that it can be taken up again even if steps were added since. */
  step: string | null;
}

export function parseRemembered(text: string | null): Remembered | null {
  try {
    const value = JSON.parse(text ?? 'null') as Partial<Remembered> | null;
    if (!value || !['active', 'paused', 'finished', 'dismissed'].includes(value.status as string)) return null;
    return { status: value.status as TourStatus, step: typeof value.step === 'string' ? value.step : null };
  } catch {
    return null;
  }
}

export function remembered(): Remembered | null {
  try {
    return parseRemembered(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function remember(value: Remembered): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage is blocked: the tour still works, it is only not remembered.
  }
}

/** Whether the tour should begin by itself: only if this browser has never been shown it. */
export const neverShown = (value: Remembered | null): boolean => value === null;

/** The step to take the tour up at: where it was left, when that step still exists; otherwise the first. */
export function resumeAt(value: Remembered | null, stepIds: readonly string[]): number {
  if (!value || (value.status !== 'active' && value.status !== 'paused') || value.step === null) return 0;
  const at = stepIds.indexOf(value.step);
  return at < 0 ? 0 : at;
}

interface TourStore {
  /** The step being shown, by its place in the list; null while the tour is not up. */
  step: number | null;
  /** What the person did since this step began. */
  signals: ReadonlySet<string>;
  /** Something being pointed at from the help panel, for a few seconds. */
  pointing: { stepId: string; until: number } | null;
  start: (step: number, stepId: string) => void;
  go: (step: number, stepId: string) => void;
  /** Puts it away for now (it can be taken up again), for good, or as finished. */
  end: (how: 'paused' | 'dismissed' | 'finished', stepId: string | null) => void;
  signal: (name: string) => void;
  point: (stepId: string | null) => void;
}

export const useTour = create<TourStore>((set, get) => ({
  step: null,
  signals: new Set(),
  pointing: null,
  start: (step, stepId) => {
    remember({ status: 'active', step: stepId });
    set({ step, signals: new Set(), pointing: null });
  },
  go: (step, stepId) => {
    remember({ status: 'active', step: stepId });
    set({ step, signals: new Set() });
  },
  end: (how, stepId) => {
    remember({ status: how, step: how === 'paused' ? stepId : null });
    set({ step: null, signals: new Set() });
  },
  signal: (name) => {
    const { step, signals } = get();
    if (step === null || signals.has(name)) return;
    set({ signals: new Set([...signals, name]) });
  },
  point: (stepId) => set({ pointing: stepId === null ? null : { stepId, until: Date.now() + 4000 } }),
}));

/**
 * Says that the person just did something a step may be waiting for, where
 * the state alone would not show it (a terminal took the keyboard, the
 * canvas was zoomed out). It does nothing while the tour is not up.
 */
export function tourSignal(name: string): void {
  useTour.getState().signal(name);
}
