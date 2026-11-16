import { z } from 'zod';
import { Id } from './ids';

/**
 * "While you were away": what changed on the canvases since the owner last
 * looked. A short list of moments, made from change events the server
 * already has and keeps for a while in memory. It is not a log: it is
 * bounded, and gone when the server restarts.
 */

export const AwayKind = z.enum(['waiting', 'no-longer-waiting', 'agent-finished', 'command-failed', 'run-moved', 'run-finished', 'draft-arrived']);
export type AwayKind = z.infer<typeof AwayKind>;

export const AwayItem = z.object({
  at: z.iso.datetime(),
  kind: AwayKind,
  /** The terminal it is about, when it is about one that still exists. */
  sessionId: Id.nullable(),
  /** The run it is about. */
  runId: Id.nullable(),
  /** One line, in plain words. What a person or an agent wrote is shown through `showControl` by whoever draws it. */
  text: z.string().max(400),
});
export type AwayItem = z.infer<typeof AwayItem>;

export const AwayDigest = z.object({
  /** The time the list really starts at: the time asked for, or later when the server does not remember that far back. */
  since: z.iso.datetime(),
  /** True when the time asked for is before what the server remembers: it restarted since, or more happened than it keeps. */
  partial: z.boolean(),
  /** Why it is partial, in a sentence; empty otherwise. */
  why: z.string(),
  items: z.array(AwayItem),
});
export type AwayDigest = z.infer<typeof AwayDigest>;

export const AwayQuery = z.object({ since: z.iso.datetime() });

/** A moment as the server keeps it: who and what, without names, which are looked up when the list is asked for. */
export interface Moment {
  at: string;
  kind: AwayKind;
  sessionId: string | null;
  runId: string | null;
  /** What to say after the name. */
  detail: string;
}

export const AWAY_MAX_ITEMS = 60;

/**
 * The list for someone who was away since `since`. Newest first. Several
 * moves of one run are one line, its latest; a terminal that started and
 * stopped waiting while the owner was away is not listed, since it needs
 * nothing now.
 */
export function awayDigest(moments: readonly Moment[], since: string, remembersFrom: string, why: string, nameOf: (sessionId: string) => string | null): AwayDigest {
  const partial = since < remembersFrom;
  const from = partial ? remembersFrom : since;
  const recent = moments.filter((moment) => moment.at > from).sort((a, b) => b.at.localeCompare(a.at));
  const seen = new Set<string>();
  const items: AwayItem[] = [];
  for (const moment of recent) {
    // One line per run for its moves, and one per terminal for its waiting: the newest stands for the rest.
    const key = moment.kind === 'run-moved' || moment.kind === 'run-finished' ? `run ${moment.runId}` : moment.kind === 'waiting' || moment.kind === 'no-longer-waiting' || moment.kind === 'agent-finished' ? `attention ${moment.sessionId}` : null;
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    // A terminal that waited and no longer does needs nothing from the owner now: not worth a line by itself.
    if (moment.kind === 'no-longer-waiting') continue;
    const name = moment.sessionId ? nameOf(moment.sessionId) : null;
    const who = moment.sessionId ? (name ?? 'A terminal that is gone') : '';
    items.push({ at: moment.at, kind: moment.kind, sessionId: name === null ? null : moment.sessionId, runId: moment.runId, text: [who, moment.detail].filter(Boolean).join(' ').slice(0, 400) });
    if (items.length >= AWAY_MAX_ITEMS) break;
  }
  return { since: from, partial, why: partial ? why : '', items };
}
