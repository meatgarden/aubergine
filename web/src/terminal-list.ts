import { nodesInside, type Frame, type Layout, type LayoutNode } from '@aubergine/shared';

/** A heading of the list with the terminals under it; `frame` is null for those outside any frame. */
export interface ListGroup {
  frame: Frame | null;
  nodes: LayoutNode[];
}

interface Placed {
  x: number;
  y: number;
  height: number;
}

/**
 * Reading order: top to bottom, then left to right. Things whose tops are
 * within half a height of each other count as one row, so a row that is not
 * perfectly level still reads from left to right.
 */
export function readingOrder<T extends Placed>(items: readonly T[]): T[] {
  const byTop = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  for (const item of byTop) {
    const row = rows.at(-1);
    const first = row?.[0];
    if (row && first && item.y < first.y + first.height / 2) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/**
 * The terminals of a canvas as the list shows them: each frame that holds
 * terminals as a heading with those terminals under it, then the terminals
 * outside any frame, everything in reading order so that the list matches
 * the picture. A terminal counts as in a frame when it lies entirely inside
 * it; if frames overlap, the first in reading order has it.
 */
export function listGroups(layout: Layout): ListGroup[] {
  const groups: ListGroup[] = [];
  let rest = layout.nodes;
  for (const frame of readingOrder(layout.frames)) {
    const inside = nodesInside(frame, rest);
    if (inside.length === 0) continue;
    rest = rest.filter((node) => !inside.includes(node));
    groups.push({ frame, nodes: readingOrder(inside) });
  }
  if (rest.length > 0) groups.push({ frame: null, nodes: readingOrder(rest) });
  return groups;
}

/** The sessions of a canvas in the list's order. */
export function listOrder(layout: Layout): string[] {
  return listGroups(layout).flatMap((group) => group.nodes.map((node) => node.sessionId));
}

/** The session after (or before) `from` in the list's order, wrapping at the ends; the first (or last) when there is no `from`. */
export function stepInList(order: readonly string[], from: string | null, by: 1 | -1): string | null {
  if (order.length === 0) return null;
  const index = from === null ? -1 : order.indexOf(from);
  if (index < 0) return (by === 1 ? order[0] : order.at(-1)) ?? null;
  return order[(index + by + order.length) % order.length] ?? null;
}

const STORAGE_KEY = 'aubergine.list';
export const LIST_MIN_WIDTH = 160;
export const LIST_MAX_WIDTH = 520;
export const LIST_DEFAULT_WIDTH = 240;

export interface ListPrefs {
  collapsed: boolean;
  width: number;
}

export function clampListWidth(width: number): number {
  return Math.round(Math.min(LIST_MAX_WIDTH, Math.max(LIST_MIN_WIDTH, width)));
}

/** Whether the list is collapsed and how wide it is: a preference of this browser. */
export function loadListPrefs(): ListPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ListPrefs> | null;
    if (saved && typeof saved === 'object') {
      return {
        collapsed: saved.collapsed === true,
        width: Number.isFinite(saved.width) ? clampListWidth(saved.width as number) : LIST_DEFAULT_WIDTH,
      };
    }
  } catch {
    // Unreadable or blocked storage: the default will do.
  }
  return { collapsed: false, width: LIST_DEFAULT_WIDTH };
}

export function saveListPrefs(prefs: ListPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Not being able to remember this is harmless.
  }
}
