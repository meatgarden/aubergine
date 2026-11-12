import { describe, expect, it } from 'vitest';
import { NO_STATUS, newId, type Session } from '@aubergine/shared';
import { UsageError, formatSessions, parseCommand, resolveSession } from './commands';

function session(name: string, extra: Partial<Session> = {}): Session {
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
    ...extra,
  };
}

describe('parseCommand', () => {
  it('parses each command', () => {
    expect(parseCommand([])).toEqual({ name: 'help' });
    expect(parseCommand(['list'])).toEqual({ name: 'list' });
    expect(parseCommand(['new'])).toEqual({ name: 'new', sessionName: null });
    expect(parseCommand(['new', 'api', 'server'])).toEqual({ name: 'new', sessionName: 'api server' });
    expect(parseCommand(['attach', 'api'])).toEqual({ name: 'attach', query: 'api' });
    expect(parseCommand(['service', 'install'])).toEqual({ name: 'service', action: 'install' });
    expect(parseCommand(['service', 'uninstall'])).toEqual({ name: 'service', action: 'uninstall' });
  });

  it('rejects what it does not understand', () => {
    expect(() => parseCommand(['attach'])).toThrow(UsageError);
    expect(() => parseCommand(['service'])).toThrow(UsageError);
    expect(() => parseCommand(['service', 'start'])).toThrow(UsageError);
    expect(() => parseCommand(['explode'])).toThrow(/Unknown command/);
  });
});

describe('resolveSession', () => {
  const sessions = [
    session('api server'),
    session('API tests'),
    session('logs', { state: 'parked' }),
    session('old', { state: 'exited' }),
  ];

  it('finds a session by exact name, any case, including parked ones', () => {
    expect(resolveSession(sessions, 'API SERVER').name).toBe('api server');
    expect(resolveSession(sessions, 'logs').state).toBe('parked');
  });

  it('accepts a unique start of a name or of an ID', () => {
    expect(resolveSession(sessions, 'lo').name).toBe('logs');
    const target = sessions[1]!;
    expect(resolveSession(sessions, target.id.slice(0, 20)).id).toBe(target.id);
  });

  it('refuses ambiguous and unknown names, and sessions whose shell ended', () => {
    expect(() => resolveSession(sessions, 'api')).toThrow(/2 sessions start with/);
    expect(() => resolveSession(sessions, 'nothing')).toThrow(/No running session/);
    expect(() => resolveSession(sessions, 'old')).toThrow(/No running session/);
  });
});

describe('formatSessions', () => {
  it('prints an aligned table', () => {
    const text = formatSessions([
      session('api', { command: 'node', cwd: '/work/api' }),
      session('a longer name', { state: 'parked' }),
    ]);
    expect(text.split('\n')).toEqual([
      'NAME           STATE   COMMAND  FOLDER',
      'api            open    node     /work/api',
      'a longer name  parked  -        -',
    ]);
    expect(formatSessions([])).toBe('No sessions.');
  });
});
