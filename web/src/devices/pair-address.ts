import { readPairingCode } from '@aubergine/shared';

/**
 * A sign-in code that came in the page's address, after `#pair=`. A browser never sends what is after the `#`,
 * so the code is in no server's or proxy's log; the page takes it out of the address before it asks anything,
 * so that it is not kept in the history or shown, and holds it in memory only until the sign-in surface tries it.
 * It is never logged, never stored in the browser, and never written into an address again.
 */

/** Longer than this, a fragment is not a code with or without its dash, whatever it holds. */
const LONGEST = '#pair='.length + 11;

/** The code in a fragment such as `#pair=ABCDE-FGHJK`, made comparable; null for anything else. */
export function codeFromFragment(fragment: string): string | null {
  if (fragment.length > LONGEST || !fragment.startsWith('#pair=')) return null;
  return readPairingCode(fragment.slice('#pair='.length));
}

/** Whether the fragment is meant as a code at all, a good one or not: such a fragment is taken out of the address. */
export const fragmentIsPairing = (fragment: string): boolean => fragment.startsWith('#pair=');

let waiting: string | null = null;

/**
 * Run once, before anything else on the page: takes a code out of the address (with `history.replaceState`, so the
 * address with the code is not kept as a step of the history) and keeps it until `takeWaitingCode` asks.
 */
export function takeCodeFromAddress(where: Location = location, history: Pick<History, 'replaceState' | 'state'> = window.history): void {
  if (!fragmentIsPairing(where.hash)) return;
  waiting = codeFromFragment(where.hash);
  history.replaceState(history.state, '', `${where.pathname}${where.search}`);
}

/** The code that came in the address, once: asking again gives nothing. */
export function takeWaitingCode(): string | null {
  const code = waiting;
  waiting = null;
  return code;
}
