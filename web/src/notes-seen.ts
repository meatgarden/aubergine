import { useSyncExternalStore } from 'react';

/**
 * How many log entries of each session's notes this browser has seen, so the
 * list can say how many are new. A convenience of this browser only.
 */
const KEY = 'aubergine.notes.seen';
const listeners = new Set<() => void>();

function load(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? (saved as Record<string, number>) : {};
  } catch {
    return {};
  }
}

let seen = load();

export function markNotesSeen(sessionId: string, entries: number): void {
  if (seen[sessionId] === entries) return;
  seen = { ...seen, [sessionId]: entries };
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Not being able to remember this is harmless.
  }
  for (const listener of listeners) listener();
}

/** Log entries added since the notes of this session were last opened here. */
export function useUnseenNotes(sessionId: string, entries: number): number {
  const known = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => seen[sessionId] ?? 0,
  );
  return Math.max(0, entries - known);
}
