import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GROUP_NAME_MAX, GroupName, groupsOf, membersOf } from './groups';
import { applyEvent } from './events';
import { PatchSessionRequest, UpdateSessionRequest } from './protocol';
import { Session, createInitialState } from './entities';
import { newId } from './ids';

describe('the name of a group', () => {
  it('is one line of plain text, trimmed, of at most the limit', () => {
    expect(GroupName.parse('  backend ')).toBe('backend');
    expect(GroupName.parse('Release 2.1 — API')).toBe('Release 2.1 — API');
    expect(GroupName.parse('x'.repeat(GROUP_NAME_MAX))).toHaveLength(GROUP_NAME_MAX);
    for (const name of ['', '   ', 'x'.repeat(GROUP_NAME_MAX + 1), 'two\nlines', 'a\tb', 'bell\u0007', 'evil‮name', 'iso⁦late', 3, null])
      expect(GroupName.safeParse(name).success, JSON.stringify(name)).toBe(false);
  });

  it('can be described', () => {
    expect(() => z.toJSONSchema(GroupName)).not.toThrow();
    expect(z.toJSONSchema(GroupName).description).toContain('Terminals with the same group name are one group');
  });
});

describe('groups of terminals', () => {
  const sessions = [{ group: 'web' }, { group: null }, { group: 'api 10' }, {}, { group: 'API 9' }, { group: 'web' }, { group: 'Backend' }];

  it('are the distinct names, sorted as a person would', () => {
    expect(groupsOf(sessions)).toEqual(['API 9', 'api 10', 'Backend', 'web']);
    expect(groupsOf([])).toEqual([]);
  });

  it('have as members the terminals of exactly that name', () => {
    expect(membersOf(sessions, 'web')).toEqual([sessions[0], sessions[5]]);
    expect(membersOf(sessions, 'Web')).toEqual([]);
    expect(membersOf(sessions, 'api 10')).toEqual([sessions[2]]);
  });
});

describe('the group of a session', () => {
  const state = createInitialState(new Date('2026-01-01T00:00:00Z'));
  const session = Session.parse({ id: newId(), projectId: state.projects[0]!.id, name: 'build', createdAt: '2026-01-01T00:00:00.000Z' });

  it('is none in a stored session without it, and only a name or null in one with it', () => {
    expect(session.group).toBeNull();
    expect(Session.parse({ ...session, group: 'web' }).group).toBe('web');
    expect(Session.safeParse({ ...session, group: 'two\nlines' }).success).toBe(false);
  });

  it('changes by its one event, through the shared reducer', () => {
    const withIt = { ...state, sessions: [session] };
    const grouped = applyEvent(withIt, { type: 'session.grouped', sessionId: session.id, group: 'web' });
    expect(grouped.sessions[0]!.group).toBe('web');
    expect({ ...grouped.sessions[0], group: null }).toEqual(session);
    expect(applyEvent(grouped, { type: 'session.grouped', sessionId: session.id, group: null }).sessions[0]!.group).toBeNull();
  });

  it('is sent in the bodies that change a session: a name, or null to take it out; left out is not null', () => {
    for (const Body of [PatchSessionRequest, UpdateSessionRequest]) {
      expect(Body.parse({ group: ' web ' })).toEqual({ group: 'web' });
      expect(Body.parse({ group: null })).toEqual({ group: null });
      expect('group' in Body.parse({ name: 'x' })).toBe(false);
      for (const group of ['', 'a\nb', 3, {}, 'x'.repeat(GROUP_NAME_MAX + 1)]) expect(Body.safeParse({ group }).success, JSON.stringify(group)).toBe(false);
    }
    expect(() => z.toJSONSchema(PatchSessionRequest, { io: 'input' })).not.toThrow();
  });
});
