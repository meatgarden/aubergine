import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, newId, type Session } from '@aubergine/shared';
import { UsageError, formatSessions, insideAubergine, nameForFolder, parseCommand, resolveSession } from './commands';

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
    attention: NO_ATTENTION,
    noteLog: [],
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
    expect(parseCommand(['note', 'tests', 'pass'])).toEqual({ name: 'note', text: 'tests pass' });
    expect(parseCommand(['scan'])).toEqual({ name: 'scan' });
    expect(parseCommand(['import'])).toEqual({ name: 'import', all: false, dryRun: false });
    expect(parseCommand(['import', '--dry-run', '--all'])).toEqual({ name: 'import', all: true, dryRun: true });
    expect(parseCommand(['hook', 'stop'])).toEqual({ name: 'hook', event: 'stop' });
    expect(parseCommand(['hooks', 'print'])).toEqual({ name: 'hooks-print' });
    expect(parseCommand(['service', 'install'])).toEqual({ name: 'service', action: 'install' });
    expect(parseCommand(['service', 'uninstall'])).toEqual({ name: 'service', action: 'uninstall' });
  });

  it('rejects what it does not understand', () => {
    expect(() => parseCommand(['attach'])).toThrow(UsageError);
    expect(() => parseCommand(['note'])).toThrow(UsageError);
    expect(() => parseCommand(['hook', 'explode'])).toThrow(UsageError);
    expect(() => parseCommand(['hooks'])).toThrow(UsageError);
    expect(() => parseCommand(['import', '--force'])).toThrow(/does not know --force/);
    expect(() => parseCommand(['service'])).toThrow(UsageError);
    expect(() => parseCommand(['service', 'start'])).toThrow(UsageError);
    expect(() => parseCommand(['explode'])).toThrow(/Unknown command/);
  });
});

describe('here', () => {
  it('parses its name, flags and command', () => {
    expect(parseCommand(['here'])).toEqual({
      name: 'here',
      sessionName: null,
      attach: true,
      claude: false,
      command: [],
      fromShellHook: false,
    });
    expect(parseCommand(['here', 'api', 'server', '--no-attach', '--', 'npm', 'run', 'dev'])).toMatchObject({
      sessionName: 'api server',
      attach: false,
      command: ['npm', 'run', 'dev'],
    });
    expect(parseCommand(['here', '--claude'])).toMatchObject({ claude: true, attach: true });
    // Flags after "--" belong to the command.
    expect(parseCommand(['here', '--', 'ls', '--no-attach'])).toMatchObject({ attach: true, command: ['ls', '--no-attach'] });
  });

  it('rejects unknown flags and an empty command', () => {
    expect(() => parseCommand(['here', '--detach'])).toThrow(/does not know --detach/);
    expect(() => parseCommand(['here', '--'])).toThrow(UsageError);
  });

  it('knows when it is already inside Aubergine', () => {
    expect(insideAubergine({ AUBERGINE_SESSION_ID: 'x' }, 'aubergine')).toBe(true);
    expect(insideAubergine({ TMUX: '/private/tmp/tmux-501/aubergine,123,0' }, 'aubergine')).toBe(true);
    // The user's own tmux is not Aubergine.
    expect(insideAubergine({ TMUX: '/private/tmp/tmux-501/default,123,0' }, 'aubergine')).toBe(false);
    expect(insideAubergine({}, 'aubergine')).toBe(false);
  });

  it('names a session after its folder', () => {
    expect(nameForFolder('/Users/me/work/api')).toBe('api');
    expect(nameForFolder('/Users/me/work/api/')).toBe('api');
    expect(nameForFolder('/')).toBe('Terminal');
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
