import { describe, expect, it } from 'vitest';
import { newId } from '@aubergine/shared';
import { authorize, principalFromBearer, sessionToken } from './auth';

const secret = 'a'.repeat(64);

describe('session tokens', () => {
  it('identify exactly one session', () => {
    const id = newId();
    const token = sessionToken(secret, id);
    expect(principalFromBearer(secret, `Bearer ${token}`)).toEqual({ kind: 'session', sessionId: id });
    expect(sessionToken(secret, id)).toBe(token);
    expect(sessionToken(secret, newId())).not.toBe(token);
  });

  it('cannot be moved to another session or forged', () => {
    const id = newId();
    const other = newId();
    const [prefix, , mac] = sessionToken(secret, id).split('.');
    expect(principalFromBearer(secret, `Bearer ${prefix}.${other}.${mac}`)).toBeNull();
    expect(principalFromBearer('b'.repeat(64), `Bearer ${sessionToken(secret, id)}`)).toBeNull();
    expect(principalFromBearer(secret, `Bearer ${prefix}.${id}.${'0'.repeat(64)}`)).toBeNull();
    expect(principalFromBearer(secret, `Bearer ${prefix}.not-an-id.${mac}`)).toBeNull();
    expect(principalFromBearer(secret, 'Bearer')).toBeNull();
    expect(principalFromBearer(secret, undefined)).toBeNull();
    expect(principalFromBearer(secret, `Basic ${sessionToken(secret, id)}`)).toBeNull();
  });

  it("accept the daemon's own token as the user", () => {
    expect(principalFromBearer(secret, `Bearer ${secret}`)).toEqual({ kind: 'user' });
  });
});

describe('authorize', () => {
  const mine = newId();
  const theirs = newId();
  const session = { kind: 'session', sessionId: mine } as const;

  it('lets a session act on itself only', () => {
    expect(authorize(session, 'attention.set', { sessionId: mine })).toBe(true);
    expect(authorize(session, 'note.append', { sessionId: mine })).toBe(true);
    expect(authorize(session, 'attention.set', { sessionId: theirs })).toBe(false);
    expect(authorize(session, 'note.append', { sessionId: theirs })).toBe(false);
    expect(authorize(session, 'agent.report', { sessionId: mine })).toBe(true);
    expect(authorize(session, 'agent.report', { sessionId: theirs })).toBe(false);
  });

  it('refuses actions it does not know', () => {
    expect(authorize(session, 'session.kill' as never, { sessionId: mine })).toBe(false);
  });

  it('lets the user do anything', () => {
    expect(authorize({ kind: 'user' }, 'note.append', { sessionId: theirs })).toBe(true);
  });
});
