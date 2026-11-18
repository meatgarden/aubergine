import { applyEvent, type AppState, type ChangeEvent } from '@aubergine/shared';

/**
 * Following the server's state without losing a change.
 *
 * The page learns the state two ways: whole, when it asks, and change by
 * change, on the events socket. The two can cross: a whole state that was
 * asked for before a change may arrive after it. So the server numbers its
 * changes (a revision, counted from when that server started, which it
 * names with an epoch), gives the number with each change and with the
 * whole state, and the page compares:
 *
 * - a whole state older than what the page has is not taken;
 * - a change the whole state already holds is not applied again;
 * - a change that arrives before any whole state is kept, and applied after
 *   the whole state it belongs after.
 *
 * Pure: the store keeps one of these and passes what arrives through it.
 */
export interface Following {
  /** Everything, as far as it is known. Null until the first whole state. */
  whole: AppState | null;
  /** Which run of the server the revision counts in. Another epoch is another server process: its numbers start again. */
  epoch: string | null;
  /** The last change that is in `whole`. */
  revision: number;
  /** Changes that arrived before the whole state they belong after. */
  waiting: { revision: number; event: ChangeEvent }[];
}

export const NOT_FOLLOWING: Following = { whole: null, epoch: null, revision: 0, waiting: [] };

/** A whole state arrived. It is taken unless it is older than what is known, and the changes that were waiting for it are applied. */
export function takeWhole(now: Following, state: AppState, epoch: string, revision: number): Following {
  // Of the same run of the server, and from before changes the page already has: the newer state stays.
  if (now.whole !== null && now.epoch === epoch && revision < now.revision) return now;
  let whole = state;
  let at = revision;
  // From another run of the server, what was waiting counts in other numbers: it is dropped.
  const waiting = now.epoch === null || now.epoch === epoch ? now.waiting : [];
  for (const change of [...waiting].sort((a, b) => a.revision - b.revision)) {
    if (change.revision <= at) continue;
    whole = applyEvent(whole, change.event);
    at = change.revision;
  }
  return { whole, epoch, revision: at, waiting: [] };
}

/**
 * A change arrived. With its number: applied once, in its place. Without one (what the page applies itself from the
 * answer to its own request, ahead of the socket): applied at once, and the number is left as it is.
 */
export function takeChange(now: Following, event: ChangeEvent, revision?: number): Following {
  if (revision === undefined) return now.whole === null ? now : { ...now, whole: applyEvent(now.whole, event) };
  // Before any whole state: kept until one arrives.
  if (now.whole === null) return { ...now, waiting: [...now.waiting, { revision, event }].slice(-5000) };
  // Already in the whole state the page has.
  if (revision <= now.revision) return now;
  return { ...now, whole: applyEvent(now.whole, event), revision };
}
