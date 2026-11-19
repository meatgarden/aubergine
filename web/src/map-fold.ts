import { useSyncExternalStore } from 'react';

/**
 * Whether the small map of the canvas is folded away. A convenience of this browser only: folded unless it was
 * shown here before. Where that cannot be remembered it still shows, for as long as the page is open.
 */
const KEY = 'aubergine.map.folded';
const listeners = new Set<() => void>();

/** What this browser remembers, read as folded or not: folded where nothing, or nothing readable, is remembered. */
export function foldedFrom(remembered: string | null): boolean {
  return remembered !== 'no';
}

function load(): boolean {
  try {
    return foldedFrom(localStorage.getItem(KEY));
  } catch {
    return true;
  }
}

let folded = load();

export function mapFolded(): boolean {
  return folded;
}

export function foldMap(next: boolean): void {
  if (folded === next) return;
  folded = next;
  try {
    // Both are kept: folded is the default, and shown is what this browser chose.
    localStorage.setItem(KEY, next ? 'yes' : 'no');
  } catch {
    // Not being able to remember this is harmless.
  }
  for (const listener of listeners) listener();
}

export function useMapFolded(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, mapFolded);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The room the map takes in the bottom right corner of the canvas, with its margin and the button that folds it. */
export const MAP_ROOM = { width: 232, height: 212 };

/**
 * Whether a terminal, with the note beside it, lies under the map. The terminal that has the keyboard is never
 * left under it: the map steps aside for as long as that lasts. `rect` is in canvas units, `also` is how far the
 * note reaches to its right.
 */
export function underMap(rect: Rect, also: number, view: { x: number; y: number; zoom: number }, pane: { width: number; height: number }): boolean {
  const right = (rect.x + rect.width + also) * view.zoom + view.x;
  const bottom = (rect.y + rect.height) * view.zoom + view.y;
  const left = rect.x * view.zoom + view.x;
  const top = rect.y * view.zoom + view.y;
  return right > pane.width - MAP_ROOM.width && bottom > pane.height - MAP_ROOM.height && left < pane.width && top < pane.height;
}
