import { needsUser, sortedCanvases, type AppState, type Canvas, type Layout, type Session } from '@aubergine/shared';
import { SCOPE_FILTER, TAG_FILTER, TEXT_FILTER, filterById, type FilterContext } from './list-filters';
import { listGroups } from './terminal-list';

/**
 * The terminal list as data: which rows there are, what state each is in,
 * which pass the filters, how they are grouped and sorted, and which of them
 * are in view. Everything here is a pure function of the page's state; the
 * component only draws the result.
 */

/** The one state a row shows, most pressing first. Derived from the session, never stored. */
export type RowState = 'waiting' | 'processing' | 'unread' | 'failed' | 'idle' | 'ended';

export const STATE_ORDER: readonly RowState[] = ['waiting', 'processing', 'unread', 'failed', 'idle', 'ended'];
/** A mark and a word for each state, so that it never rests on color alone. */
export const STATE_MARK: Record<RowState, string> = { waiting: '!', processing: '◐', unread: '●', failed: '✕', idle: '○', ended: '–' };
export const STATE_WORD: Record<RowState, string> = {
  waiting: 'waiting for you',
  processing: 'processing',
  unread: 'unread',
  failed: 'failed',
  idle: 'idle',
  ended: 'ended',
};

export function rowState(session: Session): RowState {
  if (session.state === 'exited') return 'ended';
  if (needsUser(session.attention)) return 'waiting';
  if (session.status.state === 'busy' || session.attention.state === 'working') return 'processing';
  if (session.status.unread) return 'unread';
  if (session.status.state === 'idle' && session.status.lastExit !== null && session.status.lastExit !== 0) return 'failed';
  return 'idle';
}

export interface Row {
  session: Session;
  /** The canvas it is on; null for a parked session. */
  canvasId: string | null;
  canvasName: string | null;
  /** The label of the frame it lies in, if any. */
  frame: { id: string; label: string } | null;
  parked: boolean;
  state: RowState;
  /** Its place in the natural order: canvases in tab order, each in reading order, parked last. */
  index: number;
}

interface Placement {
  sessionId: string;
  frame: { id: string; label: string } | null;
}

const placements = new WeakMap<Layout, Placement[]>();

/** The sessions of a canvas in reading order, each with its frame. Worked out once per layout. */
function placementsOf(layout: Layout): Placement[] {
  let known = placements.get(layout);
  if (!known) {
    known = listGroups(layout).flatMap((group) =>
      group.nodes.map((node) => ({ sessionId: node.sessionId, frame: group.frame ? { id: group.frame.id, label: group.frame.label || 'Frame' } : null })),
    );
    placements.set(layout, known);
  }
  return known;
}

/**
 * Makes the function that turns the state into rows. It remembers its last
 * answer: a change that touches neither sessions nor canvases gives back the
 * same array, and a row whose session and place are unchanged is the same
 * object as before, so drawing it again can be skipped.
 */
export function createRowSelector(): (app: AppState) => Row[] {
  let last: { sessions: AppState['sessions']; canvases: AppState['canvases']; rows: Row[] } | null = null;
  let byId = new Map<string, Row>();

  return (app) => {
    if (last && last.sessions === app.sessions && last.canvases === app.canvases) return last.rows;
    const sessions = new Map(app.sessions.map((s) => [s.id, s]));
    const next = new Map<string, Row>();
    const rows: Row[] = [];
    const add = (session: Session, canvas: Canvas | null, frame: Placement['frame']): void => {
      const index = rows.length;
      const before = byId.get(session.id);
      const same =
        before &&
        before.session === session &&
        before.index === index &&
        before.canvasId === (canvas?.id ?? null) &&
        before.canvasName === (canvas?.name ?? null) &&
        before.frame?.id === frame?.id &&
        before.frame?.label === frame?.label;
      const row: Row = same
        ? before
        : { session, canvasId: canvas?.id ?? null, canvasName: canvas?.name ?? null, frame, parked: canvas === null, state: rowState(session), index };
      next.set(session.id, row);
      rows.push(row);
    };
    for (const canvas of sortedCanvases(app)) {
      for (const placement of placementsOf(canvas.layout)) {
        const session = sessions.get(placement.sessionId);
        if (session) add(session, canvas, placement.frame);
      }
    }
    for (const session of app.sessions) {
      if (session.state === 'parked') add(session, null, null);
    }
    byId = next;
    last = { sessions: app.sessions, canvases: app.canvases, rows };
    return rows;
  };
}

/* ---------- The view: what is filtered, how it is grouped and sorted ---------- */

export type Grouping = 'canvas' | 'flat';
export type Sort = 'canvas' | 'updated' | 'typed' | 'name';
export type Density = 'comfortable' | 'compact';
export const SORTS: readonly Sort[] = ['canvas', 'updated', 'typed', 'name'];
export const SORT_LABEL: Record<Sort, string> = { canvas: 'Canvas order', updated: 'Last updated', typed: 'Last typed in', name: 'Name' };

export interface ListView {
  /** The ids of the filters that are switched on. */
  filters: string[];
  text: string;
  tags: string[];
  grouping: Grouping;
  /** How the flat list is ordered. */
  sort: Sort;
  /** Groups (canvas ids, or `parked`) that are folded away. */
  collapsedGroups: string[];
  density: Density;
}

/** Only the canvas being looked at, so that Tab does not jump between canvases by surprise. */
export const DEFAULT_VIEW: ListView = { filters: [SCOPE_FILTER], text: '', tags: [], grouping: 'canvas', sort: 'canvas', collapsedGroups: [], density: 'comfortable' };

const VIEW_KEY = 'aubergine.list.view';

/** Reads a saved view, keeping only what still makes sense. */
export function parseView(saved: unknown): ListView {
  if (!saved || typeof saved !== 'object') return DEFAULT_VIEW;
  const v = saved as Partial<Record<keyof ListView, unknown>>;
  const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every((x) => typeof x === 'string') ? (value as string[]) : null);
  return {
    filters: (strings(v.filters) ?? DEFAULT_VIEW.filters).filter((id) => id !== TEXT_FILTER && id !== TAG_FILTER),
    text: typeof v.text === 'string' ? v.text.slice(0, 200) : '',
    tags: strings(v.tags) ?? [],
    grouping: v.grouping === 'flat' ? 'flat' : 'canvas',
    sort: SORTS.includes(v.sort as Sort) ? (v.sort as Sort) : 'canvas',
    collapsedGroups: strings(v.collapsedGroups) ?? [],
    density: v.density === 'compact' ? 'compact' : 'comfortable',
  };
}

export function loadView(): ListView {
  try {
    return parseView(JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null'));
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: ListView): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Not being able to remember this is harmless.
  }
}

/** Every filter in effect: the ones switched on, plus text and tags when there are any. */
export function activeFilters(view: ListView): string[] {
  return [...view.filters, ...(view.text.trim() ? [TEXT_FILTER] : []), ...(view.tags.length > 0 ? [TAG_FILTER] : [])];
}

/** One removable chip per thing that narrows the list. */
export function filterChips(view: ListView): { key: string; label: string; remove: Partial<ListView> }[] {
  return [
    ...view.filters.map((id) => ({ key: id, label: filterById(id)?.label ?? id, remove: { filters: view.filters.filter((f) => f !== id) } })),
    ...(view.text.trim() ? [{ key: TEXT_FILTER, label: `“${view.text.trim()}”`, remove: { text: '' } }] : []),
    ...view.tags.map((tag) => ({ key: `${TAG_FILTER}:${tag}`, label: `#${tag}`, remove: { tags: view.tags.filter((t) => t !== tag) } })),
  ];
}

/** The rows that pass every filter in effect. Filters that are not registered (any more) are ignored. */
export function filterRows(rows: readonly Row[], view: ListView, currentCanvasId: string | null): Row[] {
  const tests = activeFilters(view)
    .map((id) => filterById(id))
    .filter((filter) => filter !== undefined)
    .map((filter) => filter.test);
  if (tests.length === 0) return rows as Row[];
  const context: FilterContext = {
    currentCanvasId,
    words: view.text.toLowerCase().split(/\s+/).filter(Boolean),
    tags: view.tags.map((tag) => tag.toLowerCase()),
  };
  return rows.filter((row) => tests.every((test) => test(row, context)));
}

const time = (iso: string | null): number => (iso ? Date.parse(iso) : 0);

export function sortRows(rows: readonly Row[], sort: Sort): Row[] {
  const sorted = [...rows];
  if (sort === 'updated') sorted.sort((a, b) => time(b.session.lastOutputAt) - time(a.session.lastOutputAt) || a.index - b.index);
  else if (sort === 'typed') sorted.sort((a, b) => time(b.session.lastInputAt) - time(a.session.lastInputAt) || a.index - b.index);
  else if (sort === 'name') sorted.sort((a, b) => a.session.name.localeCompare(b.session.name, undefined, { numeric: true, sensitivity: 'base' }) || a.index - b.index);
  else sorted.sort((a, b) => a.index - b.index);
  return sorted;
}

/** What the list draws, top to bottom: headings and rows. */
export type Item =
  | { kind: 'group'; id: string; title: string; count: number; waiting: number; collapsed: boolean }
  | { kind: 'frame'; id: string; title: string }
  | { kind: 'row'; row: Row; indented: boolean };

export const PARKED_GROUP = 'parked';

/**
 * Lays the filtered rows out as items. By canvas: each canvas with rows as a
 * heading that folds, its frames as sub-headings, parked sessions as the last
 * group. With only one canvas in scope its heading is left out. Flat: the
 * rows alone, in the chosen order.
 */
export function buildItems(rows: readonly Row[], view: ListView): Item[] {
  if (view.grouping === 'flat') return sortRows(rows, view.sort).map((row) => ({ kind: 'row', row, indented: false }));

  const items: Item[] = [];
  const oneCanvas = view.filters.includes(SCOPE_FILTER);
  const groups = new Map<string, Row[]>();
  for (const row of [...rows].sort((a, b) => a.index - b.index)) {
    const id = row.canvasId ?? PARKED_GROUP;
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  for (const [id, members] of groups) {
    const parked = id === PARKED_GROUP;
    const collapsed = view.collapsedGroups.includes(id);
    const heading = parked || !oneCanvas;
    if (heading) {
      items.push({
        kind: 'group',
        id,
        title: parked ? 'Parked' : (members[0]?.canvasName ?? ''),
        count: members.length,
        waiting: members.filter((row) => row.state === 'waiting').length,
        collapsed,
      });
      if (collapsed) continue;
    }
    let frame: string | null = null;
    for (const row of members) {
      if (row.frame && row.frame.id !== frame) items.push({ kind: 'frame', id: `${id}:${row.frame.id}`, title: row.frame.label });
      frame = row.frame?.id ?? null;
      items.push({ kind: 'row', row, indented: heading || row.frame !== null });
    }
  }
  return items;
}

/** The terminals Tab walks through: the rows on show that are on a canvas, in the order drawn. */
export function navigationOrder(items: readonly Item[]): { sessionId: string; canvasId: string }[] {
  return items.flatMap((item) => (item.kind === 'row' && item.row.canvasId !== null ? [{ sessionId: item.row.session.id, canvasId: item.row.canvasId }] : []));
}

/** How many rows are in each state, for the counts on the collapsed strip. */
export function stateCounts(rows: readonly Row[]): Record<RowState, number> {
  const counts: Record<RowState, number> = { waiting: 0, processing: 0, unread: 0, failed: 0, idle: 0, ended: 0 };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}

/** Why the list is empty: the filters that are hiding everything, in words. */
export function describeEmpty(view: ListView, total: number): string {
  if (total === 0) return 'No terminals yet.';
  const chips = filterChips(view).map((chip) => chip.label);
  if (chips.length === 0) return 'No terminals.';
  return `No terminal matches ${chips.join(' + ')}. ${total} ${total === 1 ? 'is' : 'are'} hidden.`;
}

/* ---------- Drawing only what is in view ---------- */

export const ROW_HEIGHT: Record<Density, number> = { comfortable: 44, compact: 24 };
export const GROUP_HEIGHT = 28;
export const FRAME_HEIGHT = 22;

export function itemHeight(item: Item, density: Density): number {
  return item.kind === 'row' ? ROW_HEIGHT[density] : item.kind === 'group' ? GROUP_HEIGHT : FRAME_HEIGHT;
}

/** Where each item starts, and the height of them all. */
export function measureItems(items: readonly Item[], density: Density): { tops: number[]; total: number } {
  const tops: number[] = [];
  let total = 0;
  for (const item of items) {
    tops.push(total);
    total += itemHeight(item, density);
  }
  return { tops, total };
}

/**
 * The items to draw for a scroll position: those that touch the visible
 * strip, plus a few either side so that scrolling never shows a gap.
 * Returns the first index and one past the last.
 */
export function visibleRange(tops: readonly number[], total: number, scrollTop: number, viewport: number, overscan = 6): [number, number] {
  if (tops.length === 0) return [0, 0];
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, total - viewport)));
  // The last item that starts at or before the top edge.
  let low = 0;
  let high = tops.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((tops[middle] as number) <= top) low = middle;
    else high = middle - 1;
  }
  let end = low;
  while (end < tops.length && (tops[end] as number) < top + viewport) end += 1;
  return [Math.max(0, low - overscan), Math.min(tops.length, end + overscan)];
}

/** How long ago, in a few characters: `now`, `12s`, `4m`, `3h`, `2d`. Empty when it never happened. */
export function ago(iso: string | null, now: number): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}
