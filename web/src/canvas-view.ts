import { useSyncExternalStore } from 'react';

/**
 * How the canvases are shown: as a row of tabs over the canvas, as one dropdown there that names the canvas being
 * looked at and lists the others, or as a column of tabs at the left of the window, beside the side panel, as a
 * browser's vertical tabs are. A convenience of this browser only, chosen from the button at the start of the bar
 * (`canvas.switchView` goes through them in turn). Nothing remembered, or nothing readable, means tabs.
 */
export type CanvasView = 'tabs' | 'list' | 'column';

/** The three, in the order the button's menu and `canvas.switchView` give them. */
export const CANVAS_VIEWS: readonly CanvasView[] = ['tabs', 'list', 'column'];

/** The way after this one, back to the first after the last. */
export function nextCanvasView(view: CanvasView): CanvasView {
  return CANVAS_VIEWS[(CANVAS_VIEWS.indexOf(view) + 1) % CANVAS_VIEWS.length] ?? 'tabs';
}

const KEY = 'aubergine.canvasView';
const listeners = new Set<() => void>();

/** What this browser remembers, read as a way of showing the canvases. */
export function canvasViewFrom(remembered: string | null): CanvasView {
  return remembered === 'list' || remembered === 'column' ? remembered : 'tabs';
}

function load(): CanvasView {
  try {
    return canvasViewFrom(localStorage.getItem(KEY));
  } catch {
    return 'tabs';
  }
}

let view = load();

export function canvasView(): CanvasView {
  return view;
}

export function setCanvasView(next: CanvasView): void {
  if (view === next) return;
  view = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not being able to remember this is harmless: it holds while the page is open.
  }
  for (const listener of listeners) listener();
}

export function useCanvasView(): CanvasView {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, canvasView);
}

/**
 * Whether the column of canvases is folded to a rail: the button that opens it, a dot for each canvas and a plus for
 * a new one. A convenience of this browser only; nothing remembered means open.
 */
const FOLD_KEY = 'aubergine.canvasColumn.folded';
const foldListeners = new Set<() => void>();

export function columnFoldedFrom(remembered: string | null): boolean {
  return remembered === 'yes';
}

function loadFolded(): boolean {
  try {
    return columnFoldedFrom(localStorage.getItem(FOLD_KEY));
  } catch {
    return false;
  }
}

let folded = loadFolded();

export function canvasColumnFolded(): boolean {
  return folded;
}

export function setCanvasColumnFolded(next: boolean): void {
  if (folded === next) return;
  folded = next;
  try {
    if (next) localStorage.setItem(FOLD_KEY, 'yes');
    else localStorage.removeItem(FOLD_KEY);
  } catch {
    // Not being able to remember this is harmless: it holds while the page is open.
  }
  for (const listener of foldListeners) listener();
}

export function useCanvasColumnFolded(): boolean {
  return useSyncExternalStore((listener) => {
    foldListeners.add(listener);
    return () => foldListeners.delete(listener);
  }, canvasColumnFolded);
}
