import { describe, expect, it } from 'vitest';
import { GRANTABLE_SCOPES, type Scope } from '@aubergine/shared';
import { ACTIONS, NEVER_BY_TOKEN, authorize, type Action, type Principal } from './auth';

const SESSION = '01900000-0000-7000-8000-0000000000a1';
const OTHER = '01900000-0000-7000-8000-0000000000a2';
const token = (...scopes: Scope[]): Principal => ({ kind: 'token', tokenId: '01900000-0000-7000-8000-0000000000f1', name: 'test', scopes });

/** For a token: the one scope that opens each action. Anything not here is closed to every token. */
const NEEDS: Partial<Record<Action, Scope>> = {
  'canvases.read': 'read',
  'sessions.read': 'read',
  'events.read': 'read',
  'canvases.write': 'canvases:write',
  'layout.write': 'canvases:write',
  'canvases.show': 'canvases:write',
  'sessions.write': 'sessions:write',
  'sessions.show': 'sessions:write',
  'notes.write': 'notes:write',
  'note.append': 'notes:write',
};

describe('authorize', () => {
  it('lets the signed-in user do everything', () => {
    for (const action of ACTIONS) expect(authorize({ kind: 'user' }, action, {}), action).toBe(true);
  });

  it('decides every action for every single scope: allowed with the scope it needs, refused with any other', () => {
    for (const action of ACTIONS) {
      for (const scope of GRANTABLE_SCOPES) {
        const expected = NEEDS[action] === scope;
        expect(authorize(token(scope), action, { sessionId: SESSION, canvasId: OTHER }), `${action} with ${scope}`).toBe(expected);
      }
    }
  });

  it('refuses a token holding every scope each thing no token may do', () => {
    const everything = token(...GRANTABLE_SCOPES);
    expect([...NEVER_BY_TOKEN].sort()).toEqual(['activity.read', 'outside.move', 'outside.read', 'processes.signal', 'settings.write', 'tokens.manage']);
    for (const action of NEVER_BY_TOKEN) {
      expect(authorize(everything, action, {}), action).toBe(false);
      expect(authorize(everything, action, { sessionId: SESSION, canvasId: OTHER }), action).toBe(false);
    }
  });

  it('gives a token with every scope exactly the actions that have a scope, and nothing else', () => {
    const everything = token(...GRANTABLE_SCOPES);
    const allowed = ACTIONS.filter((action) => authorize(everything, action, { sessionId: SESSION }));
    expect([...allowed].sort()).toEqual(Object.keys(NEEDS).sort());
    // What a session reports about itself is not something a token can do for it.
    expect(authorize(everything, 'attention.set', { sessionId: SESSION })).toBe(false);
    expect(authorize(everything, 'agent.report', { sessionId: SESSION })).toBe(false);
  });

  it('gives a token with no scopes nothing', () => {
    for (const action of ACTIONS) expect(authorize(token(), action, { sessionId: SESSION }), action).toBe(false);
  });

  it('keeps a session token to exactly what it had: three things, for itself only', () => {
    const session: Principal = { kind: 'session', sessionId: SESSION };
    const own = ACTIONS.filter((action) => authorize(session, action, { sessionId: SESSION }));
    expect([...own].sort()).toEqual(['agent.report', 'attention.set', 'note.append']);
    for (const action of ACTIONS) {
      expect(authorize(session, action, { sessionId: OTHER }), `${action} on another session`).toBe(false);
      expect(authorize(session, action, {}), `${action} on nothing`).toBe(false);
      expect(authorize(session, action, { canvasId: OTHER }), `${action} on a canvas`).toBe(false);
    }
  });

  it('refuses an action it has never heard of to everyone but the user', () => {
    const unknown = 'something.new' as Action;
    expect(authorize(token(...GRANTABLE_SCOPES), unknown, {})).toBe(false);
    expect(authorize({ kind: 'session', sessionId: SESSION }, unknown, { sessionId: SESSION })).toBe(false);
  });
});
