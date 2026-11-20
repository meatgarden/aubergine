import { useSyncExternalStore } from 'react';

/**
 * How the canvases are shown over the canvas: as a row of tabs, or as one dropdown that names the canvas being looked
 * at and lists the others. A convenience of this browser only, switched by the button at the start of the bar of tabs
 * (`canvas.switchView`). Nothing remembered, or nothing readable, means tabs.
 */
export type CanvasView = 'tabs' | 'list';

const KEY = 'aubergine.canvasView';
const listeners = new Set<() => void>();

/** What this browser remembers, read as a way of showing the canvases. */
export function canvasViewFrom(remembered: string | null): CanvasView {
  return remembered === 'list' ? 'list' : 'tabs';
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
