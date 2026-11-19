import { useSyncExternalStore } from 'react';

/**
 * Where the bar over the canvas stands: a corner or the middle of an edge, chosen in Settings and remembered in this
 * browser only. The bottom right corner is the map's, so the bar is never put there.
 */
export const BAR_PLACES = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center'] as const;
export type BarPlace = (typeof BAR_PLACES)[number];
export const DEFAULT_BAR_PLACE: BarPlace = 'top-left';
export const BAR_PLACE_WORDS: Record<BarPlace, string> = {
  'top-left': 'Top left',
  'top-center': 'Top center',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom center',
};

const KEY = 'aubergine.bar.place';
const listeners = new Set<() => void>();

/** What this browser remembers, read as a place: the usual one where nothing, or nothing known, is remembered. */
export function placeFrom(remembered: string | null): BarPlace {
  return (BAR_PLACES as readonly string[]).includes(remembered ?? '') ? (remembered as BarPlace) : DEFAULT_BAR_PLACE;
}

/** Whether what hangs from the bar (its menus, the parked list) opens upward: the bar is at the foot of the canvas. */
export const opensUp = (place: BarPlace): boolean => place.startsWith('bottom-');

function load(): BarPlace {
  try {
    return placeFrom(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_BAR_PLACE;
  }
}

let place = load();

export function barPlace(): BarPlace {
  return place;
}

export function placeBar(next: BarPlace): void {
  if (place === next) return;
  place = next;
  try {
    if (next === DEFAULT_BAR_PLACE) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not being able to remember this is harmless.
  }
  for (const listener of listeners) listener();
}

export function useBarPlace(): BarPlace {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, barPlace);
}
