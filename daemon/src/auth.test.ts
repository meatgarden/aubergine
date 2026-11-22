import { describe, expect, it } from 'vitest';
import { GRANTABLE_SCOPES, type Scope } from '@aubergine/shared';
import { ACTIONS, NEVER_BY_TOKEN, authorize, type Action, type Principal } from './auth';

const SESSION = '01900000-0000-7000-8000-0000000000a1';
const OTHER = '01900000-0000-7000-8000-0000000000a2';
const token = (...scopes: Scope[]): Principal => ({ kind: 'token', tokenId: '01900000-0000-7000-8000-0000000000f1', name: 'test', scopes, reach: { kind: 'all' } });

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
  'links.read': 'read',
  'links.write': 'notes:write',
  'workflows.read': 'read',
  'runs.read': 'read',
  'workflows.write': 'workflows:write',
  'runs.write': 'runs:write',
  'run.own.read': 'read',
  'run.own.report': 'runs:write',
  'drafts.read': 'read',
  'drafts.propose': 'workflows:write',
  'repository.own.read': 'read',
  'repository.read': 'read',
  'terminal.read': 'terminal:read',
  'terminal.input': 'terminal:input',
  'library.read': 'read',
  'environments.read': 'read',
  'environment.own.read': 'read',
  'library.request': 'workflows:write',
  'messages.read': 'messages:read',
  'messages.write': 'messages:write',
  'tasks.read': 'read',
  'schedules.read': 'read',
  'projects.read': 'read',
  'tasks.write': 'tasks:write',
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
    expect([...NEVER_BY_TOKEN].sort()).toEqual(['activity.read', 'away.read', 'demo.manage', 'describe.manage', 'desktop.open', 'devices.manage', 'drafts.review', 'environments.manage', 'history.open', 'history.read', 'inventory.read', 'library.manage', 'messages.manage', 'outside.move', 'outside.read', 'processes.signal', 'projects.manage', 'queue.manage', 'recap.ask', 'repository.review', 'repository.write', 'rules.manage', 'runs.approve', 'schedules.manage', 'sessions.protect', 'settings.write', 'sharing.manage', 'shelf.manage', 'tokens.manage']);
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

  it('lets a token whose workflow changes need review propose, and not write', () => {
    const reviewed: Principal = { kind: 'token', tokenId: '01900000-0000-7000-8000-0000000000f2', name: 'reviewed', scopes: [...GRANTABLE_SCOPES], reviewWorkflows: true };
    expect(authorize(reviewed, 'workflows.write', {})).toBe(false);
    expect(authorize(reviewed, 'drafts.propose', {})).toBe(true);
    expect(authorize(reviewed, 'workflows.read', {})).toBe(true);
    expect(authorize(reviewed, 'runs.write', {})).toBe(true);
    // And never, with or without the switch: deciding about a draft.
    expect(authorize(reviewed, 'drafts.review', {})).toBe(false);
    expect(authorize(token(...GRANTABLE_SCOPES), 'drafts.review', {})).toBe(false);
    // A session proposes and reads its own, and decides nothing.
    const session: Principal = { kind: 'session', sessionId: SESSION };
    expect(authorize(session, 'draft.own.propose', { sessionId: SESSION })).toBe(true);
    expect(authorize(session, 'drafts.review', { sessionId: SESSION })).toBe(false);
    expect(authorize(session, 'drafts.read', { sessionId: SESSION })).toBe(false);
    expect(authorize(session, 'drafts.propose', { sessionId: SESSION })).toBe(false);
  });

  it('gives a token with no scopes nothing', () => {
    for (const action of ACTIONS) expect(authorize(token(), action, { sessionId: SESSION }), action).toBe(false);
  });

  it('keeps a session token to what it reports about itself and the run it is on, for itself only', () => {
    const session: Principal = { kind: 'session', sessionId: SESSION };
    const own = ACTIONS.filter((action) => authorize(session, action, { sessionId: SESSION }));
    expect([...own].sort()).toEqual(['agent.report', 'ask.own.add', 'attention.set', 'describe.own', 'draft.own.propose', 'draft.own.read', 'environment.own.read', 'links.read', 'links.write', 'message.own.read', 'message.own.send', 'note.append', 'project.own.read', 'queue.own.read', 'recap.own.write', 'repository.own.read', 'run.own.read', 'run.own.report', 'task.own.propose']);
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
