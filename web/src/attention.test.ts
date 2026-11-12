import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, newId, type AttentionState, type Session } from '@aubergine/shared';
import { announcement, nextWaiting, waitingQueue } from './attention';

function session(name: string, state: AttentionState, at: string | null, extra: Partial<Session> = {}): Session {
  return {
    id: newId(),
    projectId: newId(),
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    state: 'open',
    cwd: null,
    command: null,
    note: '',
    status: NO_STATUS,
    attention: { ...NO_ATTENTION, state, at },
    noteLog: [],
    ...extra,
  };
}

const a = session('a', 'waiting', '2026-01-01T10:05:00.000Z');
const b = session('b', 'working', '2026-01-01T10:00:00.000Z');
const c = session('c', 'done', '2026-01-01T10:01:00.000Z');
const d = session('d', 'waiting', '2026-01-01T10:03:00.000Z', { state: 'parked' });
const e = session('e', 'none', null);
const all = [a, b, c, d, e];

describe('waitingQueue', () => {
  it('lists sessions that need the user, longest wait first, parked ones included', () => {
    expect(waitingQueue(all).map((s) => s.name)).toEqual(['c', 'd', 'a']);
  });

  it('leaves out working and quiet sessions, and ended shells', () => {
    expect(waitingQueue([b, e, session('x', 'waiting', '2026-01-01T09:00:00.000Z', { state: 'exited' })])).toEqual([]);
  });
});

describe('nextWaiting', () => {
  it('walks the queue and wraps around', () => {
    expect(nextWaiting(all, null)?.name).toBe('c');
    expect(nextWaiting(all, c.id)?.name).toBe('d');
    expect(nextWaiting(all, a.id)?.name).toBe('c');
    expect(nextWaiting([b, e], null)).toBeNull();
  });
});

describe('announcement', () => {
  it('announces a session that starts waiting or finishes', () => {
    const waiting = { state: 'waiting' as const, message: 'Allow the edit?', at: '2026-01-01T11:00:00.000Z' };
    expect(announcement({ type: 'session.attention', sessionId: b.id, attention: waiting }, all)).toEqual({
      sessionId: b.id,
      title: 'b is waiting for you',
      body: 'Allow the edit?',
    });
    const done = { state: 'done' as const, message: null, at: '2026-01-01T11:00:00.000Z' };
    expect(announcement({ type: 'session.attention', sessionId: b.id, attention: done }, all)?.title).toBe('b has finished');
  });

  it('says nothing for other changes, or when nothing changed', () => {
    const working = { state: 'working' as const, message: null, at: '2026-01-01T11:00:00.000Z' };
    expect(announcement({ type: 'session.attention', sessionId: a.id, attention: working }, all)).toBeNull();
    expect(announcement({ type: 'session.attention', sessionId: a.id, attention: a.attention }, all)).toBeNull();
    expect(announcement({ type: 'session.parked', sessionId: a.id }, all)).toBeNull();
  });
});
