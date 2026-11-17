/**
 * Whether a terminal's note is showing beside it. Open unless it was closed
 * in this browser; only the closed ones are remembered.
 */
const KEY = 'aubergine.notes.closed';

function load(storage: Pick<Storage, 'getItem'> | null): string[] {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function noteStartsOpen(sessionId: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  return !load(storage).includes(sessionId);
}

export function rememberNoteOpen(sessionId: string, open: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): void {
  if (!storage) return;
  try {
    const closed = load(storage).filter((id) => id !== sessionId);
    if (!open) closed.push(sessionId);
    // Sessions come and go; the newest few hundred are plenty.
    storage.setItem(KEY, JSON.stringify(closed.slice(-500)));
  } catch {
    // Not being able to remember this is harmless.
  }
}

/** How the note is laid out beside its terminal, in canvas units. Kept in step with the stylesheet. */
export const NOTE_GAP = 8;
export const NOTE_WIDTH = 280;
export const NOTE_TAB_WIDTH = 22;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How much of a note fits to the right of its terminal without lying over another terminal:
 * all of it, a slim tab that opens it, or nothing.
 */
export function noteRoom(me: Rect, others: readonly Rect[]): 'full' | 'tab' | 'none' {
  const free = (width: number): boolean => {
    const left = me.x + me.width + NOTE_GAP;
    const right = left + width;
    return !others.some((o) => o.x < right && o.x + o.width > left && o.y < me.y + me.height && o.y + o.height > me.y);
  };
  if (free(NOTE_WIDTH)) return 'full';
  return free(NOTE_TAB_WIDTH) ? 'tab' : 'none';
}
