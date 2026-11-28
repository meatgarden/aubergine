import { needsUser, sortedCanvases, type AppState, type Canvas, type Layout, type Run, type Session } from '@aubergine/shared';
import { SCOPE_FILTER, TAG_FILTER, TEXT_FILTER, filterById, type FilterContext } from './list-filters';
import { listGroups } from './terminal-list';
import { groupColor, groupFoldId } from './groups';

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

/**
 * The one mark of a terminal: a dot of one size, coloured by what the terminal is doing. The list, a terminal's
 * title and the Board draw the same dot from this, so they cannot disagree. `hollow` is a terminal that is put
 * away or has ended. The word is what the dot says to whoever cannot see its colour.
 */
export type DotTone = 'waiting' | 'finished' | 'working' | 'unread' | 'failed' | 'ordinary' | 'hollow';
export const DOT_WORD: Record<DotTone, string> = {
  waiting: 'waiting for you',
  finished: 'finished',
  working: 'working',
  unread: 'new output',
  failed: 'the last command failed',
  ordinary: 'nothing new',
  hollow: 'put away',
};

export function dotTone(session: Session, parked = false): DotTone {
  const state = rowState(session);
  if (state === 'ended') return 'hollow';
  if (state === 'waiting') return session.attention.state === 'done' ? 'finished' : 'waiting';
  if (state === 'processing') return 'working';
  if (state === 'failed') return 'failed';
  if (parked) return 'hollow';
  return state === 'unread' ? 'unread' : 'ordinary';
}

export { shortCommand } from '@aubergine/shared';

/** How many of the rows listed run an agent and how many are plain shells. Ended terminals are neither. */
export function kindCounts(rows: readonly Pick<Row, 'session'>[]): { agents: number; shells: number } {
  let agents = 0;
  let shells = 0;
  for (const { session } of rows) {
    if (session.state === 'exited') continue;
    if (session.agent) agents += 1;
    else shells += 1;
  }
  return { agents, shells };
}

/** The counts in words, as the line over the list says them; nothing when there is nothing. */
export function kindWords({ agents, shells }: { agents: number; shells: number }): string {
  const parts = [agents > 0 ? `${agents} ${agents === 1 ? 'agent' : 'agents'}` : null, shells > 0 ? `${shells} ${shells === 1 ? 'shell' : 'shells'}` : null];
  return parts.filter(Boolean).join(' · ');
}

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
  /** The terminal's own color: of its node, or of the place it was parked from; `none` when it has none. */
  color: string;
  state: RowState;
  /** Its place in the natural order: canvases in tab order, each in reading order, parked last. */
  index: number;
}

interface Placement {
  sessionId: string;
  frame: { id: string; label: string } | null;
  color: string;
}

const placements = new WeakMap<Layout, Placement[]>();

/** The sessions of a canvas in reading order, each with its frame. Worked out once per layout. */
function placementsOf(layout: Layout): Placement[] {
  let known = placements.get(layout);
  if (!known) {
    known = listGroups(layout).flatMap((group) =>
      group.nodes.map((node) => ({ sessionId: node.sessionId, frame: group.frame ? { id: group.frame.id, label: group.frame.label || 'Frame' } : null, color: node.color })),
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
    const add = (session: Session, canvas: Canvas | null, frame: Placement['frame'], color: string): void => {
      const index = rows.length;
      const before = byId.get(session.id);
      const same =
        before &&
        before.session === session &&
        before.index === index &&
        before.canvasId === (canvas?.id ?? null) &&
        before.canvasName === (canvas?.name ?? null) &&
        before.frame?.id === frame?.id &&
        before.frame?.label === frame?.label &&
        before.color === color;
      const row: Row = same
        ? before
        : { session, canvasId: canvas?.id ?? null, canvasName: canvas?.name ?? null, frame, parked: canvas === null, color, state: rowState(session), index };
      next.set(session.id, row);
      rows.push(row);
    };
    for (const canvas of sortedCanvases(app)) {
      for (const placement of placementsOf(canvas.layout)) {
        const session = sessions.get(placement.sessionId);
        if (session) add(session, canvas, placement.frame, placement.color);
      }
    }
    for (const session of app.sessions) {
      if (session.state === 'parked') add(session, null, null, session.parkedFrom?.color ?? 'none');
    }
    byId = next;
    last = { sessions: app.sessions, canvases: app.canvases, rows };
    return rows;
  };
}

/* ---------- The view: what is filtered, how it is grouped and sorted ---------- */

export type Grouping = 'canvas' | 'group' | 'flat';
export type Sort = 'canvas' | 'updated' | 'typed' | 'name';
export type Density = 'comfortable' | 'compact';
export const SORTS: readonly Sort[] = ['canvas', 'updated', 'typed', 'name'];

/** How the list is laid out, as one choice: by canvas, or the flat list in one of its orders. */
export interface ListLayout {
  id: string;
  label: string;
  grouping: Grouping;
  /** The order of the flat list; left out by "By canvas", which keeps the order that was chosen last. */
  sort?: Sort;
}
const FLAT_LABEL: Record<Sort, string> = { canvas: 'Flat, canvas order', updated: 'Flat, last updated', typed: 'Flat, last typed in', name: 'Flat, by name' };
/** By canvas first, then by group (whatever canvas a group's terminals are on), then the flat list in each order, in the order of `SORTS`. */
export const LAYOUTS: readonly ListLayout[] = [
  { id: 'canvas', label: 'By canvas', grouping: 'canvas' },
  { id: 'group', label: 'By group', grouping: 'group' },
  ...SORTS.map((sort): ListLayout => ({ id: `flat-${sort}`, label: FLAT_LABEL[sort], grouping: 'flat', sort })),
];

/** The id of the layout that is chosen. */
export function layoutOf(view: Pick<ListView, 'grouping' | 'sort'>): string {
  return view.grouping === 'flat' ? `flat-${view.sort}` : view.grouping;
}

/** What changes in the view when a layout is chosen; an unknown id changes nothing. */
export function withLayout(view: Pick<ListView, 'grouping' | 'sort'>, id: string): Pick<ListView, 'grouping' | 'sort'> {
  const layout = LAYOUTS.find((l) => l.id === id);
  if (!layout) return { grouping: view.grouping, sort: view.sort };
  return { grouping: layout.grouping, sort: layout.sort ?? view.sort };
}

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
  /** The terminals of every project, not only of the one being looked at. Each group then names its project. */
  everyProject?: boolean;
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
    grouping: v.grouping === 'flat' ? 'flat' : v.grouping === 'group' ? 'group' : 'canvas',
    sort: SORTS.includes(v.sort as Sort) ? (v.sort as Sort) : 'canvas',
    collapsedGroups: strings(v.collapsedGroups) ?? [],
    density: v.density === 'compact' ? 'compact' : 'comfortable',
    ...(v.everyProject === true ? { everyProject: true } : {}),
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
    // A filter that is not registered (a plugin's that is not loaded) narrows nothing, so it has no chip.
    ...view.filters.flatMap((id) => {
      const filter = filterById(id);
      return filter ? [{ key: id, label: filter.label, remove: { filters: view.filters.filter((f) => f !== id) } }] : [];
    }),
    ...(view.text.trim() ? [{ key: TEXT_FILTER, label: `“${view.text.trim()}”`, remove: { text: '' } }] : []),
    ...view.tags.map((tag) => ({ key: `${TAG_FILTER}:${tag}`, label: `#${tag}`, remove: { tags: view.tags.filter((t) => t !== tag) } })),
  ];
}

/** The rows that pass every filter in effect. Filters that are not registered (any more) are ignored. */
const NO_RUNS: ReadonlyMap<string, Run> = new Map();

/** Whether any filter in effect looks at runs. */
export function viewUsesRuns(view: ListView): boolean {
  return activeFilters(view).some((id) => filterById(id)?.usesRuns === true);
}

export function filterRows(rows: readonly Row[], view: ListView, currentCanvasId: string | null, runs: ReadonlyMap<string, Run> = NO_RUNS): Row[] {
  const tests = activeFilters(view)
    .map((id) => filterById(id))
    .filter((filter) => filter !== undefined)
    .map((filter) => filter.test);
  if (tests.length === 0) return rows as Row[];
  const context: FilterContext = {
    currentCanvasId,
    words: view.text.toLowerCase().split(/\s+/).filter(Boolean),
    tags: view.tags.map((tag) => tag.toLowerCase()),
    runs,
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
  /** A group of terminals: its name in its color, pressed to fold its terminals away or bring them back. `id` is what is folded. */
  | { kind: 'set'; id: string; key: string; name: string; color: string; count: number; waiting: number; collapsed: boolean; indented: boolean }
  | { kind: 'row'; row: Row; indented: boolean };

export const PARKED_GROUP = 'parked';
/** The heading, in the list by group, of the terminals that are in none. */
export const NO_GROUP = 'no-group';

/**
 * Lays the filtered rows out as items. By canvas: each canvas with rows as a
 * heading that folds, its frames as sub-headings, parked sessions as the last
 * group. With only one canvas in scope its heading is left out. The terminals
 * of a group stand together under the group's heading, which folds. By group:
 * each group whole, whatever canvas its terminals are on. Flat: the rows
 * alone, in the chosen order.
 */
export function buildItems(rows: readonly Row[], view: ListView): Item[] {
  if (view.grouping === 'flat') return sortRows(rows, view.sort).map((row) => ({ kind: 'row', row, indented: false }));

  const items: Item[] = [];
  const inOrder = [...rows].sort((a, b) => a.index - b.index);
  /** A group's heading, and its rows unless it is folded. */
  const addSet = (name: string, members: readonly Row[], key: string, indented: boolean): void => {
    const id = groupFoldId(name);
    const collapsed = view.collapsedGroups.includes(id);
    items.push({ kind: 'set', id, key, name, color: groupColor(name), count: members.length, waiting: members.filter((row) => row.state === 'waiting').length, collapsed, indented });
    if (!collapsed) for (const row of members) items.push({ kind: 'row', row, indented: true });
  };

  if (view.grouping === 'group') {
    // Every group whole, whatever canvas its terminals are on; the terminals in no group last.
    const sets = new Map<string, Row[]>();
    const loose: Row[] = [];
    for (const row of inOrder) {
      const name = row.session.group ?? null;
      if (name === null) loose.push(row);
      else if (sets.has(name)) sets.get(name)?.push(row);
      else sets.set(name, [row]);
    }
    const names = [...sets.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    for (const name of names) addSet(name, sets.get(name) ?? [], name, false);
    if (loose.length > 0) {
      const collapsed = view.collapsedGroups.includes(NO_GROUP);
      if (names.length > 0) items.push({ kind: 'group', id: NO_GROUP, title: 'In no group', count: loose.length, waiting: loose.filter((row) => row.state === 'waiting').length, collapsed });
      if (names.length === 0 || !collapsed) for (const row of loose) items.push({ kind: 'row', row, indented: names.length > 0 });
    }
    return items;
  }

  const oneCanvas = view.filters.includes(SCOPE_FILTER);
  const groups = new Map<string, Row[]>();
  for (const row of inOrder) {
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
    const said = new Set<string>();
    for (const row of members) {
      const name = row.session.group ?? null;
      if (name !== null) {
        // A group's terminals stand together, where the first of them stands, under the group's own heading.
        if (said.has(name)) continue;
        said.add(name);
        addSet(name, members.filter((other) => other.session.group === name), `${id}:${name}`, heading);
        frame = null;
        continue;
      }
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
  if (total === 0) return 'Terminals you start will be listed here.';
  const chips = filterChips(view).map((chip) => chip.label);
  if (chips.length === 0) return 'No terminals.';
  return `No terminal matches ${chips.join(' + ')}. ${total} ${total === 1 ? 'is' : 'are'} hidden.`;
}

/* ---------- Drawing only what is in view ---------- */

/** The heights of what the list draws. They hold the controls of a row at the size controls have in the panel (see docs/design.md). */
/** Each row's box with 8px between one box and the next (the box is inset 4px at the top and the bottom). */
export const ROW_HEIGHT: Record<Density, number> = { comfortable: 56, compact: 40 };
export const GROUP_HEIGHT = 32;
export const FRAME_HEIGHT = 24;

export function itemHeight(item: Item, density: Density): number {
  return item.kind === 'row' ? ROW_HEIGHT[density] : item.kind === 'frame' ? FRAME_HEIGHT : GROUP_HEIGHT;
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

/** How long ago, as a row says it: `just now`, `4m ago`. */
export const saidAgo = (short: string): string => (short === 'now' ? 'just now' : `${short} ago`);

/** The state of a row in words, where it is not the ordinary one: what the chip on its second line says. */
export function chipOf(row: Pick<Row, 'session' | 'state'>): { text: string; tone: 'attention' | 'ok' | 'danger' } | null {
  const { session, state } = row;
  if (state === 'waiting') return session.attention.state === 'done' ? { text: 'finished', tone: 'ok' } : { text: 'waiting for you', tone: 'attention' };
  if (state === 'failed') return { text: `exit ${session.status.lastExit}`, tone: 'danger' };
  return null;
}

/**
 * What a row has to say about its terminal beyond its name, as data: its state in words where that is not the
 * ordinary one (`working` too), whether it is parked or ended, its one time, and the token that typed into it. The
 * row's template says which of these are drawn and in what order; this says what each would say. Pure.
 */
export interface RowFacts {
  state: { text: string; tone: 'attention' | 'ok' | 'danger' | 'working'; dot: DotTone; title?: string } | null;
  standing: { text: string; meantFor: string | null } | null;
  time: { text: string; title: string; typed: string; updated: string } | null;
  typedBy: { text: string; title: string } | null;
}

export function rowFacts(row: Pick<Row, 'session' | 'state' | 'parked'>, now: number): RowFacts {
  const { session, state } = row;
  const chip = chipOf(row);
  const dot = dotTone(session, row.parked);
  const title = session.attention.message ?? session.status.commandLine ?? undefined;
  const typed = ago(session.lastInputAt, now);
  const updated = ago(session.lastOutputAt, now);
  // The later of the two times is the one the row says.
  const active = ago([session.lastInputAt, session.lastOutputAt].filter((t): t is string => typeof t === 'string').sort().at(-1) ?? null, now);
  const standing = [session.state === 'exited' ? 'ended' : null, session.meantFor?.agent ? `was ${session.meantFor.agent}` : null, row.parked && session.state !== 'exited' ? 'parked' : null].filter(Boolean).join(' · ');
  return {
    state: chip ? { ...chip, dot, ...(title !== undefined ? { title } : {}) } : state === 'processing' ? { text: 'working', tone: 'working', dot } : null,
    standing: standing ? { text: standing, meantFor: session.meantFor?.agent ?? null } : null,
    time: active ? { text: saidAgo(active), title: [typed ? `You last typed here ${saidAgo(typed)}` : null, updated ? `It last printed ${saidAgo(updated)}` : null].filter(Boolean).join('. '), typed, updated } : null,
    typedBy: session.typedBy ? { text: `typed by ${session.typedBy.name} ${saidAgo(ago(session.typedBy.at, now))}`, title: `An API token typed into this terminal: ${new Date(session.typedBy.at).toLocaleString()}` } : null,
  };
}
