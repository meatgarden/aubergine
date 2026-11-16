import type { AppState, Run } from '@aubergine/shared';
import { buildItems, createRowSelector, filterRows, navigationOrder, viewUsesRuns, type Item, type ListView, type Row } from './terminal-rows';
import { runsBySession } from './workflows/run-model';

export interface ListModel {
  /** Every session, in the natural order. */
  rows: Row[];
  /** The rows that pass the filters. */
  filtered: Row[];
  /** What the list draws. */
  items: Item[];
  /** The terminals Tab walks through. */
  order: { sessionId: string; canvasId: string }[];
}

const selectRows = createRowSelector();
let last: { rows: Row[]; view: ListView; canvasId: string | null; runs: readonly Run[] | null; model: ListModel } | null = null;
const EMPTY: ListModel = { rows: [], filtered: [], items: [], order: [] };

/**
 * The terminal list for the page as it is now. The list on screen and the
 * commands that move through it both ask here, so they always agree. The
 * answer is remembered: it is worked out again only when the rows, the view
 * or the canvas being looked at has changed.
 */
export function listModel(app: AppState | null, view: ListView, canvasId: string | null): ListModel {
  if (!app) return EMPTY;
  const rows = selectRows(app);
  // Runs matter to the list only while a filter looks at them: otherwise a run that moves leaves the list as it is.
  const runs = viewUsesRuns(view) ? app.runs : null;
  if (last && last.rows === rows && last.view === view && last.canvasId === canvasId && last.runs === runs) return last.model;
  const filtered = filterRows(rows, view, canvasId, runs ? runsBySession(runs) : undefined);
  const items = buildItems(filtered, view);
  const model = { rows, filtered, items, order: navigationOrder(items) };
  last = { rows, view, canvasId, runs, model };
  return model;
}
