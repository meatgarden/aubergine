/**
 * The rule that a terminal takes typing only at full size, said once: the
 * first time someone clicks a terminal that is zoomed out. Remembered in
 * this browser, and never said again.
 */

const STORAGE_KEY = 'aubergine.hint.full-size';

export const FULL_SIZE_HINT = 'Terminals take typing at full size: zooming in…';

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
