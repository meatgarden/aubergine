import { describe, expect, it } from 'vitest';
import { Session, Tags, createInitialState, normaliseTags } from './entities';
import { newId } from './ids';
import { applyEvent } from './events';

describe('tags', () => {
  it('are trimmed, without repeats whatever the capitals, first spelling kept', () => {
    expect(normaliseTags([' api ', 'Urgent', 'API', '', 'urgent', 'db'])).toEqual(['api', 'Urgent', 'db']);
    expect(Tags.parse(['  backend', 'Backend'])).toEqual(['backend']);
  });

  it('have limits', () => {
    expect(Tags.safeParse(['x'.repeat(33)]).success).toBe(false);
    expect(Tags.safeParse(Array.from({ length: 13 }, (_, i) => `t${i}`)).success).toBe(false);
    expect(Tags.safeParse([' ']).success).toBe(false);
    expect(Tags.safeParse('api').success).toBe(false);
  });
});

describe('a session from before times and tags existed', () => {
  it('loads with none', () => {
    const old = { id: newId(), projectId: newId(), name: 'api', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(Session.parse(old)).toMatchObject({ lastInputAt: null, lastOutputAt: null, tags: [] });
  });
});

describe('events for times and tags', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const initial = createInitialState(now);
  const session = Session.parse({ id: newId(), projectId: initial.projects[0]!.id, name: 'api', createdAt: now.toISOString() });
  const state = { ...initial, sessions: [session] };

  it('set one time without touching the other', () => {
    const typed = applyEvent(state, { type: 'session.times', sessionId: session.id, lastInputAt: '2026-01-01T00:01:00.000Z' });
    expect(typed.sessions[0]).toMatchObject({ lastInputAt: '2026-01-01T00:01:00.000Z', lastOutputAt: null });
    const printed = applyEvent(typed, { type: 'session.times', sessionId: session.id, lastOutputAt: '2026-01-01T00:02:00.000Z' });
    expect(printed.sessions[0]).toMatchObject({ lastInputAt: '2026-01-01T00:01:00.000Z', lastOutputAt: '2026-01-01T00:02:00.000Z' });
  });

  it('replace the tags', () => {
    const tagged = applyEvent(state, { type: 'session.tagged', sessionId: session.id, tags: ['a', 'b'] });
    expect(applyEvent(tagged, { type: 'session.tagged', sessionId: session.id, tags: ['c'] }).sessions[0]?.tags).toEqual(['c']);
  });

  it('leave other sessions as the very same objects', () => {
    const other = Session.parse({ id: newId(), projectId: initial.projects[0]!.id, name: 'web', createdAt: now.toISOString() });
    const two = { ...state, sessions: [session, other] };
    const next = applyEvent(two, { type: 'session.times', sessionId: session.id, lastOutputAt: '2026-01-01T00:02:00.000Z' });
    expect(next.sessions[1]).toBe(other);
    expect(next.canvases).toBe(two.canvases);
  });
});
