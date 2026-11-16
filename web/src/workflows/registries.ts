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

const elementViews = new Map<string, ElementView>();
export function registerElementView(view: ElementView): void {
  elementViews.set(view.kind, view);
}
export function unregisterElementView(kind: string): void {
  elementViews.delete(kind);
}
export const elementView = (kind: string): ElementView | undefined => elementViews.get(kind);

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
}
export function unregisterRunView(id: string): void {
  runViews.delete(id);
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

const outputViews = new Map<string, OutputView>();
export function registerOutputView(view: OutputView): void {
  outputViews.set(view.kind, view);
}
export function unregisterOutputView(kind: string): void {
  outputViews.delete(kind);
}
export const outputView = (kind: string): OutputView | undefined => outputViews.get(kind);
