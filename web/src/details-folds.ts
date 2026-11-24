import { useSyncExternalStore } from 'react';

/**
 * Which parts of a terminal's details are folded: what is known about it, its fields and its links. The same for every
 * terminal, remembered in this browser as one entry; nothing remembered means all open. Where that cannot be remembered the
 * choice lasts as long as the page is open.
 */
export interface DetailsFolds {
  /** What is known about it, the recap from its agent and the way to ask for one. True is folded. */
  known: boolean;
  /** Its fields. True is folded. An entry remembered before fields existed has none: they are open. */
  fields: boolean;
  /** Its links. True is folded. */
  links: boolean;
}

const KEY = 'aubergine.detailsFolds';
const OPEN: DetailsFolds = { known: false, fields: false, links: false };
const listeners = new Set<() => void>();

/** What this browser remembers, read as the parts that are folded: all open where nothing, or nothing readable, is remembered. */
export function foldsFrom(remembered: string | null): DetailsFolds {
  if (remembered === null) return OPEN;
  let saved: unknown;
  try {
    saved = JSON.parse(remembered);
  } catch {
    return OPEN;
  }
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return OPEN;
  const { known, fields, links } = saved as Record<string, unknown>;
  if (typeof known !== 'boolean' || typeof links !== 'boolean') return OPEN;
  return { known, fields: typeof fields === 'boolean' ? fields : false, links };
}

function load(): DetailsFolds {
  try {
    return foldsFrom(localStorage.getItem(KEY));
  } catch {
    return OPEN;
  }
}

let folds = load();

export function detailsFolds(): DetailsFolds {
  return folds;
}

/** Folds or opens parts, and remembers what is folded now. */
export function setDetailsFolds(change: Partial<DetailsFolds>): void {
  const next = { ...folds, ...change };
  if (next.known === folds.known && next.fields === folds.fields && next.links === folds.links) return;
  folds = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not being able to remember this is harmless: it lasts for this page.
  }
  for (const listener of listeners) listener();
}

export function useDetailsFolds(): DetailsFolds {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, detailsFolds);
}
