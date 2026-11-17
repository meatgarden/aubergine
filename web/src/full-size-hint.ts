/**
 * A terminal that is too small to read cannot be typed in: a click zooms in
 * first. Said once, the first time that happens. Remembered in
 * this browser, and never said again.
 */

const STORAGE_KEY = 'aubergine.hint.full-size';

export const FULL_SIZE_HINT = 'Too small to type in: zooming in…';

/** Whether to say it now. Saying it is remembered at once, so that it is said one time only. */
export function shouldSayFullSize(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(STORAGE_KEY) !== null) return false;
    storage.setItem(STORAGE_KEY, 'said');
    return true;
  } catch {
    // Storage is blocked: better never to say it than to say it every time.
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
