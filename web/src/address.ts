import { SHOW_PARAM, canvasAddress } from '@aubergine/shared';

/**
 * Which canvas a browser tab shows is carried by its address (`/c/<id>`), so
 * tabs inside the page and separate browser tabs or windows both work, and
 * back and forward move between canvases.
 */

const LAST_CANVAS_KEY = 'aubergine.canvas';

/** The canvas named by an address path, if it names one. */
export function canvasIdFromPath(pathname: string): string | null {
  const match = /^\/c\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

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

export function rememberedCanvas(): string | null {
  try {
    return localStorage.getItem(LAST_CANVAS_KEY);
  } catch {
    return null;
  }
}

export function rememberCanvas(canvasId: string): void {
  try {
    localStorage.setItem(LAST_CANVAS_KEY, canvasId);
  } catch {
    // Not remembering is harmless.
  }
}

/** A session an address asks to be shown (`?session=<id>`), as `aubergine here` opens. */
export function sessionFromAddress(search: string): string | null {
  return new URLSearchParams(search).get(SHOW_PARAM);
}

/** Puts a canvas in the address bar. `push` adds a history step; otherwise the current one is replaced. */
export function writeAddress(canvasId: string, push: boolean): void {
  const target = canvasAddress(canvasId);
  if (location.pathname === target && location.search === '') return;
  if (push) history.pushState(null, '', target);
  else history.replaceState(null, '', target);
}
