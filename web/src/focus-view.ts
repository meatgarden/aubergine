import { useSyncExternalStore } from 'react';

/**
 * Which columns the focus view (a terminal by itself, `/t/<session>`) has open beside its terminal: the canvases of
 * its project, its details, its note. All closed until asked for, and remembered in this browser as one entry. Where
 * that cannot be remembered the choice lasts as long as the page is open.
 */
export interface FocusColumns {
  canvases: boolean;
  details: boolean;
  note: boolean;
}

const KEY = 'aubergine.focusView';
const CLOSED: FocusColumns = { canvases: false, details: false, note: false };
const listeners = new Set<() => void>();

/** What this browser remembers, read as the columns that are open: all closed where nothing, or nothing readable, is remembered. */
export function columnsFrom(remembered: string | null): FocusColumns {
  if (remembered === null) return CLOSED;
  let saved: unknown;
  try {
    saved = JSON.parse(remembered);
  } catch {
    return CLOSED;
  }
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return CLOSED;
  const { canvases, details, note } = saved as Record<string, unknown>;
  if (typeof canvases !== 'boolean' || typeof details !== 'boolean' || typeof note !== 'boolean') return CLOSED;
  return { canvases, details, note };
}

function load(): FocusColumns {
  try {
    return columnsFrom(localStorage.getItem(KEY));
  } catch {
    return CLOSED;
  }
}

let columns = load();

export function focusColumns(): FocusColumns {
  return columns;
}

/** Opens or closes columns, and remembers what is open now. */
export function setFocusColumns(change: Partial<FocusColumns>): void {
  const next = { ...columns, ...change };
  if (next.canvases === columns.canvases && next.details === columns.details && next.note === columns.note) return;
  columns = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not being able to remember this is harmless: it lasts for this page.
  }
  for (const listener of listeners) listener();
}

export function useFocusColumns(): FocusColumns {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, focusColumns);
}
