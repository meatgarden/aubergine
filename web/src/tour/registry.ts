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

/** The groups Help lists its lines under, in this order, with the heading a person reads. */
export const HELP_GROUPS = [
  ['terminals', 'Terminals'],
  ['waiting', 'What waits for you'],
  ['workflows', 'Workflows'],
  ['projects', 'Projects'],
] as const;
export type HelpGroup = (typeof HELP_GROUPS)[number][0];

export interface TourStep {
  id: string;
  /** Which group of Help its reminder is listed under. */
  group: HelpGroup;
  /** A line of Help only: the tour does not walk through it. Help can still point at it. */
  helpOnly?: boolean;
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
let lines: TourStep[] = [];

function sorted(): void {
  lines = [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  snapshot = lines.filter((step) => !step.helpOnly);
}

export function registerTourStep(step: TourStep): void {
  registry.set(step.id, step);
  sorted();
}

export function unregisterTourStep(id: string): void {
  if (registry.delete(id)) sorted();
}

/** Everything Help lists: the steps of the tour and the lines that are Help's alone, in order. */
export function helpLines(): TourStep[] {
  return lines;
}

/** The registered steps in the order they are taken. The same array until the registry changes. */
export function tourSteps(): TourStep[] {
  return snapshot;
}
