import { describe, expect, it } from 'vitest';
import { awayDigest, type ChangeEvent, type Moment } from '@aubergine/shared';
import { memoryOf, momentOf } from './away';

const A = '01900000-0000-7000-8000-0000000000a1';
const B = '01900000-0000-7000-8000-0000000000b1';
const RUN = '01900000-0000-7000-8000-0000000000c1';
const at = (minute: number): string => `2026-03-10T10:${String(minute).padStart(2, '0')}:00.000Z`;
const name = (): string => 'Fix a bug';
const attention = (sessionId: string, state: string, message: string | null = null): ChangeEvent => ({ type: 'session.attention', sessionId, attention: { state, message, at: at(0) } }) as ChangeEvent;
const status = (sessionId: string, lastExit: number | null, lastFinishedAt: string | null): ChangeEvent => ({ type: 'session.status', sessionId, status: { state: 'idle', commandLine: null, startedAt: null, lastExit, lastFinishedAt, unread: false } }) as ChangeEvent;
const run = (type: 'run.moved' | 'run.finished', more: object): ChangeEvent => ({ type, run: { id: RUN, workflowId: A, sessionId: A, status: 'running', currentElementId: 'build', blockedReason: null, ...more } }) as unknown as ChangeEvent;

describe('what counts as a moment', () => {
  it('is a change, not a repeat', () => {
    const memory = memoryOf({ sessions: [], drafts: [], runs: [] });
    expect(momentOf(attention(A, 'waiting', 'Which branch?'), memory, at(1), name)).toMatchObject({ kind: 'waiting', sessionId: A, detail: 'started waiting for you: Which branch?' });
    // Still waiting: nothing new.
    expect(momentOf(attention(A, 'waiting', 'Which branch?'), memory, at(2), name)).toBeNull();
    expect(momentOf(attention(A, 'working'), memory, at(3), name)).toMatchObject({ kind: 'no-longer-waiting' });
    expect(momentOf(attention(A, 'working'), memory, at(4), name)).toBeNull();
    expect(momentOf(attention(A, 'done', 'All green.'), memory, at(5), name)).toMatchObject({ kind: 'agent-finished', detail: 'says it has finished: All green.' });
  });

  it('is a command that has just failed, once, and never the command itself', () => {
    const memory = memoryOf({ sessions: [], drafts: [], runs: [] });
    expect(momentOf(status(A, 0, at(1)), memory, at(1), name)).toBeNull();
    const failed = momentOf(status(A, 2, at(2)), memory, at(2), name);
    expect(failed).toEqual({ at: at(2), kind: 'command-failed', sessionId: A, runId: null, detail: 'had a command fail (exit 2).' });
    // The same report again (the shell is still at that prompt): not a second failure.
    expect(momentOf(status(A, 2, at(2)), memory, at(3), name)).toBeNull();
    expect(momentOf(status(A, null, null), memory, at(4), name)).toBeNull();
  });

  it('is a run that moved on, was blocked or ended, and a draft that arrived', () => {
    const memory = memoryOf({ sessions: [], drafts: [], runs: [] });
    expect(momentOf(run('run.moved', { currentElementId: 'build' }), memory, at(1), name)).toMatchObject({ kind: 'run-moved', runId: RUN, detail: 'moved on in "Fix a bug".' });
    // A report that leaves it on the same element (a tick, a pause) is not a move.
    expect(momentOf(run('run.moved', { currentElementId: 'build' }), memory, at(2), name)).toBeNull();
    expect(momentOf(run('run.moved', { status: 'blocked', blockedReason: 'No access.' }), memory, at(3), name)?.detail).toBe('is blocked on "Fix a bug": No access.');
    expect(momentOf(run('run.finished', { status: 'finished', currentElementId: null }), memory, at(4), name)).toMatchObject({ kind: 'run-finished', detail: 'finished "Fix a bug".' });
    const draft = { type: 'draft.changed', draft: { id: B, status: 'waiting', kind: 'element', sessionId: A } } as unknown as ChangeEvent;
    expect(momentOf(draft, memory, at(5), name)).toMatchObject({ kind: 'draft-arrived', detail: 'handed in a step for you to review.' });
    expect(momentOf(draft, memory, at(6), name)).toBeNull();
    // Everything else is not a moment.
    expect(momentOf({ type: 'session.renamed', sessionId: A, name: 'x' } as ChangeEvent, memory, at(7), name)).toBeNull();
  });
});

describe('the list for someone who was away', () => {
  const moment = (minute: number, kind: Moment['kind'], sessionId: string | null, more: Partial<Moment> = {}): Moment => ({ at: at(minute), kind, sessionId, runId: null, detail: `${kind}.`, ...more });
  const names = (id: string): string | null => (id === A ? 'api server' : null);

  it('is what happened after they left, newest first, with names looked up now', () => {
    const digest = awayDigest([moment(1, 'command-failed', A), moment(5, 'waiting', A), moment(9, 'draft-arrived', null)], at(3), at(0), 'why', names);
    expect(digest).toMatchObject({ since: at(3), partial: false, why: '' });
    expect(digest.items.map((item) => [item.kind, item.text])).toEqual([
      ['draft-arrived', 'draft-arrived.'],
      ['waiting', 'api server waiting.'],
    ]);
  });

  it('says so when it does not remember as far back as was asked', () => {
    const digest = awayDigest([moment(5, 'waiting', A)], at(1), at(4), 'The server was started after you left.', names);
    expect(digest).toMatchObject({ since: at(4), partial: true, why: 'The server was started after you left.' });
    expect(digest.items).toHaveLength(1);
  });

  it('gives one line per run and per terminal for its waiting, and none for one that no longer waits', () => {
    const digest = awayDigest(
      [moment(1, 'waiting', A), moment(2, 'no-longer-waiting', A), moment(3, 'run-moved', A, { runId: RUN }), moment(4, 'run-moved', A, { runId: RUN }), moment(5, 'run-finished', A, { runId: RUN }), moment(6, 'waiting', B)],
      at(0),
      at(0),
      '',
      names,
    );
    expect(digest.items.map((item) => [item.kind, item.sessionId, item.text])).toEqual([
      ['waiting', null, 'A terminal that is gone waiting.'],
      ['run-finished', A, 'api server run-finished.'],
    ]);
  });

  it('is never longer than it should be', () => {
    const many = Array.from({ length: 200 }, (_, i) => moment(0, 'command-failed', A, { at: `2026-03-10T11:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}.000Z` }));
    expect(awayDigest(many, at(0), at(0), '', names).items).toHaveLength(60);
  });
});
