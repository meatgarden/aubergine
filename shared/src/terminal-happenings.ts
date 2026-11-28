import type { AttentionState, Session } from './entities';
import type { ChangeEvent } from './events';

/**
 * What a change event means for a terminal: that it started or stopped
 * waiting for the owner, that its agent finished, that a command in it
 * failed. One function, so that "while you were away" and the rules cannot
 * tell these differently. The happening is the change of state, not the
 * state: whoever asks keeps what the terminal was (`TerminalBefore`) and
 * hands it back the next time.
 *
 * Nothing a terminal showed is in the answer: not the command that failed,
 * not what the agent said. A failure is its exit code and no more.
 */

/** What is kept about one terminal between two changes, to tell a change from a repeat. */
export interface TerminalBefore {
  attention: AttentionState;
  finishedAt: string | null;
}

/** A terminal nothing is known about: it does not wait, and no command of its has been seen to end. */
export const NOTHING_BEFORE: TerminalBefore = { attention: 'none', finishedAt: null };

export const terminalBefore = (session: Pick<Session, 'attention' | 'status'>): TerminalBefore => ({ attention: session.attention.state, finishedAt: session.status.lastFinishedAt });

export interface TerminalHappening {
  sessionId: string;
  /** What to keep for the next change of this terminal. */
  after: TerminalBefore;
  /** `began`: it did not wait for the owner and now does. `ended`: it did and no longer does. */
  waiting: 'began' | 'ended' | null;
  /** `began`: its agent was not finished and now says it is. `again`: it said so before, and says so once more. */
  finished: 'began' | 'again' | null;
  /** The exit code of a command that has just ended, and not well. Never the command. */
  failedWith: number | null;
}

/** What `event` means for the terminal it is about, given what that terminal was (`before`); null for an event that is about none of this. */
export function terminalHappening(before: (sessionId: string) => TerminalBefore | undefined, event: ChangeEvent): TerminalHappening | null {
  if (event.type !== 'session.attention' && event.type !== 'session.status') return null;
  const was = before(event.sessionId) ?? NOTHING_BEFORE;
  if (event.type === 'session.attention') {
    const now = event.attention.state;
    return {
      sessionId: event.sessionId,
      after: { ...was, attention: now },
      waiting: now === 'waiting' && was.attention !== 'waiting' ? 'began' : now !== 'waiting' && was.attention === 'waiting' ? 'ended' : null,
      finished: now !== 'done' ? null : was.attention === 'done' ? 'again' : 'began',
      failedWith: null,
    };
  }
  const { lastFinishedAt, lastExit } = event.status;
  // The same report comes again while the shell stands at that prompt: only a new time of ending is a command that ended.
  const ended = lastFinishedAt !== null && lastFinishedAt !== was.finishedAt;
  return { sessionId: event.sessionId, after: { ...was, finishedAt: lastFinishedAt }, waiting: null, finished: null, failedWith: ended && lastExit !== null && lastExit !== 0 ? lastExit : null };
}
