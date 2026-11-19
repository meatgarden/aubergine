import { useSyncExternalStore } from 'react';

/**
 * Whether the bar over the canvas is kept open. It is folded to "New terminal" unless the pointer or the keyboard is
 * in it; kept open, all of it shows all the time. A convenience of this browser only, chosen in Settings. Where that
 * cannot be remembered it is kept open for as long as the page is open.
 */
const KEY = 'aubergine.bar';
const listeners = new Set<() => void>();

/** What this browser remembers, read as kept open or not: folded where nothing, or nothing readable, is remembered. */
export function keptOpenFrom(remembered: string | null): boolean {
  return remembered === 'open';
}

function load(): boolean {
  try {
    return keptOpenFrom(localStorage.getItem(KEY));
  } catch {
    return false;
  }
}

let keptOpen = load();

export function barKeptOpen(): boolean {
  return keptOpen;
}

export function keepBarOpen(next: boolean): void {
  if (keptOpen === next) return;
  keptOpen = next;
  try {
    localStorage.setItem(KEY, next ? 'open' : 'folded');
  } catch {
    // Not being able to remember this is harmless.
  }
  for (const listener of listeners) listener();
}

export function useBarKeptOpen(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, barKeptOpen);
}
