import type { AppState, DemoParts } from '@aubergine/shared';
import type { AppStore } from '../store';

/**
 * The steps of the tour. The tour itself knows nothing about what a step
 * shows: it draws whatever is registered, in `order`, points at what the
 * step points at, and moves on when the step says it was done. A new
 * feature adds a step by calling `registerTourStep` from a module of its
 * own; nothing in `Tour.tsx` changes.
 */

/** What a step may look at to say where its thing is and whether it was done. */
export interface TourContext {
  app: AppState;
  state: AppStore;
  /** The demo's parts, when there is a demo. */
  demo: DemoParts | null;
  /** Things the person did since this step began, that leave no trace in the state: see `signals.ts`. */
  signals: ReadonlySet<string>;
}

export interface TourStep {
  id: string;
  /** Lower numbers come first. */
  order: number;
  /** A few words. */
  title: string;
  /** What to do, in at most two short sentences. */
  text: string;
  /** The same as a one-line reminder, for the help panel. */
  reminder: string;
  /** The thing on the page this step is about, or null when it is not on screen. */
  target: (context: TourContext) => Element | null;
  /** Whether the person has done it. Left out for a step that only tells. */
  done?: (context: TourContext) => boolean;
  /** Something to do when the step is reached, to bring its thing into view. It must not do the step for the person. */
  arrive?: (context: TourContext) => void;
}

const registry = new Map<string, TourStep>();
let snapshot: TourStep[] = [];

export function registerTourStep(step: TourStep): void {
  registry.set(step.id, step);
  snapshot = [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function unregisterTourStep(id: string): void {
  if (registry.delete(id)) snapshot = [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The registered steps in the order they are taken. The same array until the registry changes. */
export function tourSteps(): TourStep[] {
  return snapshot;
}
