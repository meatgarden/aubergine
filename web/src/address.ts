import { PAGE_NAMES, SHOW_PARAM, canvasAddress, isPageName, pageAddress, projectCanvasAddress, terminalAddress, type PageName } from '@aubergine/shared';

/**
 * Which canvas a browser tab shows is carried by its address (`/p/<project>/c/<canvas>`;
 * the older `/c/<canvas>` still leads to the same canvas, whatever project it is in), so
 * tabs inside the page and separate browser tabs or windows both work, and
 * back and forward move between canvases.
 */

const LAST_CANVAS_KEY = 'aubergine.canvas';

/** The canvas named by an address path, if it names one. */
export function canvasIdFromPath(pathname: string): string | null {
  // The canvas is what counts: a canvas that moved to another project is found under its old address too.
  // After it may come the name of a page that is shown over it, and nothing else.
  const match = new RegExp(`^(?:/p/[^/]+)?/c/([^/]+)(?:/(?:${PAGE_NAMES.join('|')}))?/?$`).exec(pathname);
  return match?.[1] ?? null;
}

/** The page named by an address path, after its canvas: `/c/<canvas>/queue`. Null for the canvas itself. */
export function pageFromPath(pathname: string): PageName | null {
  const name = /^(?:\/p\/[^/]+)?\/c\/[^/]+\/([a-z]+)\/?$/.exec(pathname)?.[1];
  return isPageName(name) ? name : null;
}

/** What a history step made here carries: that it was added when a page was opened, so that leaving the page can go back over it. */
const OPENED = { auberginePage: true };
export const openedHere = (): boolean => (history.state as { auberginePage?: boolean } | null)?.auberginePage === true;

/**
 * The canvas to show when a page opens: the one in the address if it exists;
 * else the one this browser looked at last; else the server's default.
 */
export function chooseCanvas(options: {
  fromAddress: string | null;
  remembered: string | null;
  fallback: string;
  exists: (canvasId: string) => boolean;
}): string {
  for (const candidate of [options.fromAddress, options.remembered]) {
    if (candidate && options.exists(candidate)) return candidate;
  }
  return options.fallback;
}

/** The canvas this browser looked at last: in one project, or (with none named) at all. */
export function rememberedCanvas(projectId?: string): string | null {
  try {
    return localStorage.getItem(projectId ? `${LAST_CANVAS_KEY}.${projectId}` : LAST_CANVAS_KEY);
  } catch {
    return null;
  }
}

export function rememberCanvas(canvasId: string, projectId?: string): void {
  try {
    localStorage.setItem(LAST_CANVAS_KEY, canvasId);
    // Per project too, so that coming back to a project comes back to the canvas that was open in it.
    if (projectId) localStorage.setItem(`${LAST_CANVAS_KEY}.${projectId}`, canvasId);
  } catch {
    // Not remembering is harmless.
  }
}

/** A session an address asks to be shown (`?session=<id>`), as `aubergine here` opens. */
export function sessionFromAddress(search: string): string | null {
  return new URLSearchParams(search).get(SHOW_PARAM);
}

/** Puts a canvas in the address bar. `push` adds a history step; otherwise the current one is replaced. */
export function writeAddress(canvasId: string, push: boolean, projectId?: string | null, page: PageName | null = null): void {
  const canvas = projectId ? projectCanvasAddress(projectId, canvasId) : canvasAddress(canvasId);
  const target = page ? pageAddress(canvas, page) : canvas;
  if (location.pathname === target && location.search === '') return;
  // A step that opens a page over the canvas says so, and a step that only changes what the page is over keeps saying it.
  const state = page && (push || openedHere()) ? OPENED : null;
  if (push) history.pushState(state, '', target);
  else history.replaceState(state, '', target);
}

/** The terminal an address shows by itself (`/t/<session id>`), if it is the address of one. */
export function terminalFromPath(pathname: string): string | null {
  return /^\/t\/([^/]+)\/?$/.exec(pathname)?.[1] ?? null;
}

/** Where a canvas is, as a link: with its project where it has one. */
export const canvasHref = (canvasId: string, projectId?: string | null): string =>
  projectId ? projectCanvasAddress(projectId, canvasId) : canvasAddress(canvasId);

/** Where a terminal is by itself, as a link. */
export const terminalHref = (sessionId: string): string => terminalAddress(sessionId);

/** Where a terminal is on its canvas, as a link: the page goes to its canvas and brings it into view. */
export const terminalOnCanvasHref = (sessionId: string): string => `/?${new URLSearchParams({ [SHOW_PARAM]: sessionId }).toString()}`;

/**
 * Opens one of this app's own addresses in a new browser tab. Asked from a click or a key, so the browser allows it.
 * With `noopener` the new tab is a page of its own that cannot reach back into this one; the browser then answers
 * nothing about it, so nothing here can say whether it opened.
 */
export function openInNewTab(href: string): void {
  window.open(href, '_blank', 'noopener');
}

/** The tabs of the Runs page. */
export type RunsTab = 'runs' | 'workflow' | 'schedules' | 'rules';

/**
 * The page a name is shown as, and the tab of Runs it opens on. The Queue and the Board became one page, Runs: their
 * names are kept for old addresses, keys and commands, and open Runs on its columns or by step.
 */
export function shownPage(page: PageName): { page: PageName; tab: RunsTab | null } {
  if (page === 'queue') return { page: 'runs', tab: 'runs' };
  if (page === 'board') return { page: 'runs', tab: 'workflow' };
  return { page, tab: null };
}
