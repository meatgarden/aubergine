import type { Run } from '@aubergine/shared';
import type { Row } from './terminal-rows';

/** What a filter may look at besides the row itself. */
export interface FilterContext {
  /** The canvas being looked at. */
  currentCanvasId: string | null;
  /** The words in the text box, in lower case. */
  words: readonly string[];
  /** The tags chosen, in lower case. A row passes with any of them. */
  tags: readonly string[];
  /** The run each session is on, by session. */
  runs: ReadonlyMap<string, Run>;
}

/**
 * A filter of the terminal list: a name and a pure test of one row. The
 * filters that are switched on combine with AND. A new filter is one call of
 * `registerFilter`; the filter bar and the chips show whatever is registered.
 */
export interface ListFilter {
  id: string;
  /** On its button and its chip. */
  label: string;
  /** Lower numbers come first in the filter bar. */
  order: number;
  test: (row: Row, context: FilterContext) => boolean;
  /** The test looks at runs, so the list is worked out again when a run moves. */
  usesRuns?: boolean;
}

const registry = new Map<string, ListFilter>();
const listeners = new Set<() => void>();
let version = 0;
function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function registerFilter(filter: ListFilter): void {
  registry.set(filter.id, filter);
  changed();
}

export function unregisterFilter(id: string): void {
  if (registry.delete(id)) changed();
}

/** A number that changes each time a filter is added or taken away (a plugin's, after the page is drawn). */
export const filtersVersion = (): number => version;
/** For the list to be worked out again when a filter is added or taken away. */
export function subscribeToFilters(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listFilters(): ListFilter[] {
  return [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function filterById(id: string): ListFilter | undefined {
  return registry.get(id);
}

/** The filter the owner named: only the canvas being looked at. Parked sessions are on no canvas and stay listed. */
export const SCOPE_FILTER = 'scope';
/** Switched on by typing in the text box, and by choosing tags, rather than by a button. */
export const TEXT_FILTER = 'text';
export const TAG_FILTER = 'tag';

registerFilter({
  id: SCOPE_FILTER,
  label: 'This canvas',
  order: 0,
  test: (row, context) => row.parked || row.canvasId === context.currentCanvasId,
});
registerFilter({ id: 'waiting', label: 'Waiting for me', order: 10, test: (row) => row.state === 'waiting' });
registerFilter({ id: 'busy', label: 'Busy', order: 20, test: (row) => row.state === 'processing' || row.session.status.state === 'busy' });
registerFilter({ id: 'unread', label: 'Unread', order: 30, test: (row) => row.session.status.unread && row.session.state !== 'exited' });
registerFilter({ id: 'agent', label: 'Has an agent', order: 40, test: (row) => row.session.agent !== null });
registerFilter({ id: 'parked', label: 'Parked', order: 50, test: (row) => row.parked });
registerFilter({ id: 'workflow', label: 'On a workflow', order: 60, usesRuns: true, test: (row, context) => context.runs.has(row.session.id) });
registerFilter({ id: 'workflow-running', label: 'Workflow: running', order: 61, usesRuns: true, test: (row, context) => context.runs.get(row.session.id)?.status === 'running' });
registerFilter({ id: 'workflow-blocked', label: 'Workflow: blocked', order: 62, usesRuns: true, test: (row, context) => context.runs.get(row.session.id)?.status === 'blocked' });
registerFilter({ id: 'workflow-paused', label: 'Workflow: paused', order: 63, usesRuns: true, test: (row, context) => context.runs.get(row.session.id)?.status === 'paused' });
registerFilter({
  id: TEXT_FILTER,
  label: 'Text',
  order: 90,
  test: (row, context) => {
    if (context.words.length === 0) return true;
    const { session } = row;
    const text = [session.name, session.cwd ?? '', session.command ?? '', session.note, ...session.noteLog.map((e) => e.text), ...session.tags]
      .join('\n')
      .toLowerCase();
    return context.words.every((word) => text.includes(word));
  },
});
registerFilter({
  id: TAG_FILTER,
  label: 'Tag',
  order: 91,
  test: (row, context) => context.tags.length === 0 || row.session.tags.some((tag) => context.tags.includes(tag.toLowerCase())),
});
