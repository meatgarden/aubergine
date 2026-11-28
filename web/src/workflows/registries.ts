import type { ComponentType } from 'react';
import type { Element, Tick } from '@aubergine/shared';
import type { RunPicture } from './run-model';

/**
 * Two registries of the workflow screens. Each holds what there is today and
 * is asked by everything that draws; a new kind of element, or a new way of
 * looking at a run, is one more call here and no change to what asks.
 */

/** How one kind of element is edited, and how it is shown inside a run. */
export interface ElementView {
  kind: string;
  /** The fields of the editor for an element of this kind. */
  Editor: ComponentType<{ element: Element; onChange: (element: Element) => void }>;
  /** The element as whoever is on the run reads it, with the run's inputs filled in. */
  Detail: ComponentType<{ element: Element; inputs: Record<string, string> }>;
}

/**
 * A view registered for a kind that has one already stands over it, and taking it away (a plugin's, when the plugin is
 * switched off) brings back the one under it. Every view registered is kept in the order registered, by kind.
 */
const elementViews = new Map<string, ElementView[]>();
export function registerElementView(view: ElementView): void {
  elementViews.set(view.kind, [...(elementViews.get(view.kind) ?? []), view]);
  changed();
}
/** Takes away that view, or with none named the last one registered for the kind. */
export function unregisterElementView(kind: string, view?: ElementView): void {
  const views = elementViews.get(kind) ?? [];
  const at = view === undefined ? views.length - 1 : views.lastIndexOf(view);
  if (at < 0) return;
  elementViews.set(kind, views.filter((_, i) => i !== at));
  changed();
}
export const elementView = (kind: string): ElementView | undefined => elementViews.get(kind)?.at(-1);

const listeners = new Set<() => void>();
let version = 0;
function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}
/** A number that changes each time a view of any of these registries is added or taken away. */
export const viewsVersion = (): number => version;
/** For what draws a run to draw again when a view is added or taken away after the page was drawn (a plugin's). */
export function subscribeToViews(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One way of looking at a run. */
export interface RunViewProps {
  picture: RunPicture;
  /** The elements of the version the run goes through, when it is still known. */
  elements: readonly Element[];
  /** False for a run that is over: nothing can be reported on it. */
  live: boolean;
  now: number;
  /** What whoever is on the run is told now: the text `aubergine workflow status` prints. */
  text: string;
  /** The line that sets an agent off on the run. */
  kickoff: string;
}
export interface RunView {
  id: string;
  title: string;
  /** Lower numbers come first; the first is the one shown when a run is opened. */
  order: number;
  Component: ComponentType<RunViewProps>;
}

const runViews = new Map<string, RunView>();
export function registerRunView(view: RunView): void {
  runViews.set(view.id, view);
  changed();
}
export function unregisterRunView(id: string): void {
  if (runViews.delete(id)) changed();
}
export function runViewList(): RunView[] {
  return [...runViews.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** How one kind of output is shown: a checklist as a list that can be ticked, and so on. */
export interface OutputView {
  kind: string;
  View: ComponentType<{
    value: unknown;
    ticks: readonly Tick[];
    /** Ticks or unticks an item; absent where ticking is not possible. */
    onTick?: (item: number, ticked: boolean) => void;
  }>;
}

/** As for element views: one registered over another stands over it until it is taken away. */
const outputViews = new Map<string, OutputView[]>();
export function registerOutputView(view: OutputView): void {
  outputViews.set(view.kind, [...(outputViews.get(view.kind) ?? []), view]);
  changed();
}
/** Takes away that view, or with none named the last one registered for the kind. */
export function unregisterOutputView(kind: string, view?: OutputView): void {
  const views = outputViews.get(kind) ?? [];
  const at = view === undefined ? views.length - 1 : views.lastIndexOf(view);
  if (at < 0) return;
  outputViews.set(kind, views.filter((_, i) => i !== at));
  changed();
}
export const outputView = (kind: string): OutputView | undefined => outputViews.get(kind)?.at(-1);
