import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, newId, type Session } from '@aubergine/shared';
import {
  UsageError,
  formatCanvases,
  formatSessions,
  insideAubergine,
  nameForFolder,
  parseCommand,
  resolveCanvas,
  resolveSession,
  takeOption,
} from './commands';

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
    agent: null,
    parkedFrom: null, peopleOnly: false, typedBy: null,
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
    ...extra,
  };
}

describe('parseCommand', () => {
  it('parses each command', () => {
    expect(parseCommand([])).toEqual({ name: 'begin' });
    expect(parseCommand(['help'])).toEqual({ name: 'help' });
    expect(parseCommand(['demo'])).toEqual({ name: 'demo', remove: false, open: true });
    expect(parseCommand(['demo', '--remove', '--no-open'])).toEqual({ name: 'demo', remove: true, open: false });
    expect(() => parseCommand(['demo', 'twice'])).toThrow(/does not know/);
    expect(parseCommand(['list'])).toEqual({ name: 'list' });
    expect(parseCommand(['new'])).toEqual({ name: 'new', sessionName: null, canvas: null });
    expect(parseCommand(['new', 'api', 'server'])).toEqual({ name: 'new', sessionName: 'api server', canvas: null });
    expect(parseCommand(['attach', 'api'])).toEqual({ name: 'attach', query: 'api' });
    expect(parseCommand(['note', 'tests', 'pass'])).toEqual({ name: 'note', text: 'tests pass' });
    expect(parseCommand(['scan'])).toEqual({ name: 'scan' });
    expect(parseCommand(['import'])).toEqual({ name: 'import', terminals: [], all: false, dryRun: false, canvas: null });
    expect(parseCommand(['import', '--dry-run', '--all'])).toEqual({ name: 'import', terminals: [], all: true, dryRun: true, canvas: null });
    expect(parseCommand(['import', 'ttys004', 'ttys007'])).toMatchObject({ terminals: ['ttys004', 'ttys007'] });
    expect(parseCommand(['hook', 'stop'])).toEqual({ name: 'hook', event: 'stop' });
    expect(parseCommand(['hooks', 'print'])).toEqual({ name: 'hooks-print' });
    expect(parseCommand(['shell-hook', 'print'])).toEqual({ name: 'shell-hook-print' });
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
    expect(parseCommand(['start'])).toEqual({ name: 'start', open: false });
    expect(parseCommand(['start', '--open'])).toEqual({ name: 'start', open: true });
    expect(parseCommand(['open'])).toEqual({ name: 'open', print: false });
    expect(parseCommand(['open', '--print'])).toEqual({ name: 'open', print: true });
    expect(parseCommand(['update'])).toEqual({ name: 'update' });
    expect(parseCommand(['version'])).toEqual({ name: 'version' });
    expect(parseCommand(['--version'])).toEqual({ name: 'version' });
    expect(parseCommand(['doctor'])).toEqual({ name: 'doctor' });
    expect(parseCommand(['uninstall'])).toEqual({ name: 'uninstall', yes: false });
    expect(parseCommand(['uninstall', '--yes'])).toEqual({ name: 'uninstall', yes: true });
    expect(() => parseCommand(['start', '--background'])).toThrow(/start does not know --background/);
    expect(() => parseCommand(['open', 'somewhere'])).toThrow(UsageError);
    expect(() => parseCommand(['uninstall', '--data'])).toThrow(/uninstall does not know --data/);
    expect(() => parseCommand(['update', 'now'])).toThrow(UsageError);
    expect(() => parseCommand(['service', 'start'])).toThrow(UsageError);
    expect(() => parseCommand(['explode'])).toThrow(/Unknown command/);
  });
});

describe('here', () => {
  it('parses its name, flags and command', () => {
    expect(parseCommand(['here'])).toEqual({
      name: 'here',
      sessionName: null,
      canvas: null,
      attach: true,
      open: true,
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

  it('only brings the session up in the browser for a plain interactive run', () => {
    expect(parseCommand(['here'])).toMatchObject({ open: true });
    expect(parseCommand(['here', '--no-open'])).toMatchObject({ open: false, attach: true });
    expect(parseCommand(['here', '--no-attach'])).toMatchObject({ open: false });
    expect(parseCommand(['here', '--from-shell-hook'])).toMatchObject({ open: false });
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

describe('move', () => {
  it('lists when nothing is named, and parses what to move and how', () => {
    expect(parseCommand(['move'])).toEqual({
      name: 'move',
      terminals: [],
      all: false,
      stop: false,
      force: false,
      yes: false,
      dryRun: false,
      open: true,
    });
    expect(parseCommand(['move', 'ttys001', 'ttys004', '--dry-run'])).toMatchObject({ terminals: ['ttys001', 'ttys004'], dryRun: true, stop: false });
    expect(parseCommand(['move', '--all', '--stop', '--yes', '--no-open'])).toMatchObject({ all: true, stop: true, yes: true, open: false });
  });

  it('rejects combinations that make no sense', () => {
    expect(() => parseCommand(['move', '--all', 'ttys001'])).toThrow(UsageError);
    expect(() => parseCommand(['move', 'ttys001', '--force'])).toThrow(/only applies with --stop/);
    expect(() => parseCommand(['move', '--kill'])).toThrow(/does not know --kill/);
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
    // Long enough to tell apart IDs made in the same millisecond, which share their first part.
    expect(resolveSession(sessions, target.id.slice(0, 32)).id).toBe(target.id);
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

describe('canvases', () => {
  const canvas = (name: string, sessions = 0, waiting = 0) => ({
    id: newId(),
    projectId: newId(),
    name,
    color: 'none' as const,
    order: 0,
    labels: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    counts: { sessions, waiting, unread: 0 },
  });

  it("parses the canvas commands and the option that names one", () => {
    expect(parseCommand(['canvas'])).toEqual({ name: 'canvas-list' });
    expect(parseCommand(['canvas', 'list'])).toEqual({ name: 'canvas-list' });
    expect(parseCommand(['canvas', 'new', 'Client', 'work'])).toEqual({ name: 'canvas-new', canvasName: 'Client work' });
    expect(() => parseCommand(['canvas', 'new'])).toThrow(/needs a name/);
    expect(() => parseCommand(['canvas', 'close', 'x'])).toThrow(UsageError);

    expect(parseCommand(['new', 'api', '--canvas', 'Client work'])).toEqual({ name: 'new', sessionName: 'api', canvas: 'Client work' });
    expect(parseCommand(['new', '--canvas=Deploys'])).toEqual({ name: 'new', sessionName: null, canvas: 'Deploys' });
    expect(parseCommand(['here', '--canvas', 'Deploys', 'api', '--no-attach'])).toMatchObject({ sessionName: 'api', canvas: 'Deploys', attach: false });
    expect(parseCommand(['import', 'ttys004', '--canvas', 'Deploys'])).toMatchObject({ terminals: ['ttys004'], canvas: 'Deploys' });
    // After "--" it belongs to the command being started.
    expect(parseCommand(['here', '--', 'run', '--canvas', 'x'])).toMatchObject({ canvas: null, command: ['run', '--canvas', 'x'] });
  });

  it("refuses an option without a name, or given twice", () => {
    expect(() => takeOption(['--canvas'], '--canvas')).toThrow(/needs a name/);
    expect(() => takeOption(['--canvas', '--all'], '--canvas')).toThrow(/needs a name/);
    expect(() => takeOption(['--canvas='], '--canvas')).toThrow(/needs a name/);
    expect(() => takeOption(['--canvas', 'a', '--canvas=b'], '--canvas')).toThrow(/twice/);
    expect(takeOption(['a', '--canvas', 'b', 'c'], '--canvas')).toEqual({ value: 'b', rest: ['a', 'c'] });
  });

  it("finds a canvas by name, by the start of its name, or by ID", () => {
    const all = [canvas('Main'), canvas('Deploys'), canvas('Design')];
    expect(resolveCanvas(all, 'main')).toBe(all[0]);
    expect(resolveCanvas(all, 'dep')).toBe(all[1]);
    expect(resolveCanvas(all, all[2]!.id)).toBe(all[2]);
    expect(() => resolveCanvas(all, 'de')).toThrow(/could be: "Deploys", "Design"/);
    expect(() => resolveCanvas(all, 'nowhere')).toThrow(/No canvas named "nowhere"/);
    expect(() => resolveCanvas([canvas('Twin'), canvas('twin')], 'Twin')).toThrow(/2 canvases are named/);
  });

  it("lists canvases with their counts and marks where new sessions go", () => {
    const all = [canvas('Main', 1), canvas('Deploys', 3, 2)];
    const text = formatCanvases(all, all[1]!.id);
    expect(text).toContain('  Main     1 terminal\n');
    expect(text).toContain('* Deploys  3 terminals  2 waiting for you');
  });
});

describe('an option a command does not know', () => {
  // Every command, with something made up after it. Free text (a note) may hold anything.
  const lines = ['list', 'new x', 'canvas list', 'canvas new x', 'attach x', 'here', 'scan', 'move', 'import', 'hook stop', 'hooks print', 'shell-hook print', 'token list', 'token create x --scope read', 'token revoke x', 'start', 'open', 'update', 'version', 'doctor', 'uninstall', 'service install', 'screen x', 'output x', 'protect x', 'unprotect x'];
  it.each(lines)('is refused in one sentence that names it: %s', (line) => {
    let thrown: unknown;
    try {
      parseCommand([...line.split(' '), '--made-up']);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as Error).message).not.toContain('\n');
  });

  it('is named where the command can tell which word it was', () => {
    expect(() => parseCommand(['new', 'w1', '--no-attach'])).toThrow('new does not know --no-attach');
    expect(() => parseCommand(['attach', 'api', '--now'])).toThrow('attach does not know --now');
  });
});

describe('the terminal commands', () => {
  it('read a session name, and for send and run the text exactly as given', () => {
    expect(parseCommand(['screen', 'api', 'server'])).toEqual({ name: 'screen', query: 'api server' });
    expect(parseCommand(['output', 'api', '--lines', '50'])).toEqual({ name: 'output', query: 'api', lines: 50 });
    expect(parseCommand(['output', 'api'])).toEqual({ name: 'output', query: 'api', lines: null });
    expect(parseCommand(['send', 'api', 'echo', 'hello', '--enter'])).toEqual({ name: 'send', query: 'api', text: 'echo hello', enter: true });
    expect(parseCommand(['send', 'api', '--enter', 'git', 'log', '--oneline'])).toEqual({ name: 'send', query: 'api', text: 'git log --oneline', enter: true });
    // Without --enter nothing is pressed, and options of the text itself are text.
    expect(parseCommand(['send', 'api', 'ls', '--all'])).toEqual({ name: 'send', query: 'api', text: 'ls --all', enter: false });
    expect(parseCommand(['run', 'api', '--timeout', '5', '--', 'pnpm', 'test', '--', '--watch'])).toEqual({ name: 'run', query: 'api', command: 'pnpm test -- --watch', timeout: 5 });
    expect(parseCommand(['run', 'api', 'server', '--', 'ls'])).toEqual({ name: 'run', query: 'api server', command: 'ls', timeout: null });
    expect(parseCommand(['protect', 'api'])).toEqual({ name: 'protect', query: 'api', peopleOnly: true });
    expect(parseCommand(['unprotect', 'api'])).toEqual({ name: 'protect', query: 'api', peopleOnly: false });
  });

  it('say what is missing or unknown', () => {
    for (const words of [['screen'], ['output'], ['output', 'x', '--lines', 'many'], ['send'], ['send', 'x'], ['send', '--enter'], ['run', 'x'], ['run', 'x', '--'], ['run', '--', 'ls'], ['run', 'x', '--loud', '--', 'ls'], ['run', 'x', '--timeout', 'soon', '--', 'ls'], ['protect'], ['unprotect', 'x', '--now']]) {
      expect(() => parseCommand(words), words.join(' ')).toThrow(UsageError);
    }
  });

  it('read which sessions a new token may reach', () => {
    expect(parseCommand(['token', 'create', 'bot', '--scope', 'terminal:read', '--reach', 'tag:ci'])).toMatchObject({ scopes: ['terminal:read'], reach: 'tag:ci' });
    expect(parseCommand(['token', 'create', 'bot', '--scope', 'read'])).toMatchObject({ reach: null });
  });
});
