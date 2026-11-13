import type { Session } from '@aubergine/shared';
import { HOOK_EVENTS, type HookEvent } from '../agents/claude-code';

export type Command =
  | { name: 'list' }
  | { name: 'new'; sessionName: string | null }
  | { name: 'attach'; query: string }
  | {
      name: 'here';
      sessionName: string | null;
      attach: boolean;
      /** Show the new session on an open canvas, or open a browser on it. */
      open: boolean;
      claude: boolean;
      /** Words after `--`: a command to type into the new session, or with `claude`, arguments for the agent. */
      command: string[];
      /** Called from the shell snippet: be quick, be quiet, and report failure by exit code. */
      fromShellHook: boolean;
    }
  | { name: 'scan' }
  | {
      name: 'move';
      /** Terminals to move; empty with `all` false means: just list. */
      terminals: string[];
      all: boolean;
      stop: boolean;
      force: boolean;
      yes: boolean;
      dryRun: boolean;
      open: boolean;
    }
  | { name: 'import'; terminals: string[]; all: boolean; dryRun: boolean }
  | { name: 'note'; text: string }
  | { name: 'hook'; event: HookEvent }
  | { name: 'hooks-print' }
  | { name: 'shell-hook-print' }
  | { name: 'service'; action: 'install' | 'uninstall' }
  | { name: 'help' };

export const USAGE = `Usage: aubergine <command>

  list                       List sessions with their state, command and folder
  new [name]                 Start a new terminal on the canvas
  attach <name>              Open a session in this terminal (detach by closing the window)
  here [name] [-- command]   Start a session in this folder and turn this terminal into a view of it
                             --no-attach   only create it
                             --no-open     do not bring it up in the browser
                             --claude      start Claude Code in it, continuing this folder's last conversation
                             --claude -- <args>   start it with these arguments instead, for example
                                                  --claude -- --resume <id> --fork-session
  scan                       List your open terminals that are not on the canvas yet (read-only)
  import [terminal…]         Give those terminals a canvas session in the same folder; with none named,
                             every one, one per folder (--all: one per terminal). --dry-run shows the plan
  move [terminal…|--all]     Move running Claude Code tabs onto the canvas; with nothing named, list them
                             (default)     start a copy of the conversation; the original keeps running
                             --stop        ask an idle original to exit, then resume the same conversation
                             --dry-run, --yes, --force, --no-open
  note <text>                Inside a session: add an entry to that session's note log
  hook <event>               For agent hooks: reads the hook's JSON on stdin (prompt, notification, stop)
  hooks print                Print the Claude Code hook settings, to add to your own config by hand
  shell-hook print           Print a zsh snippet that makes new terminal tabs start on the canvas
  service install            Start the Aubergine server at login
  service uninstall          Stop starting it at login
  help                       Show this text

The server must be running for list, new, attach, here, scan, import, move and note.`;

export class UsageError extends Error {}

export function parseCommand(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return { name: 'help' };
    case 'list':
    case 'ls':
      if (rest.length > 0) throw new UsageError('list takes no arguments');
      return { name: 'list' };
    case 'new':
      return { name: 'new', sessionName: rest.length > 0 ? rest.join(' ') : null };
    case 'attach':
      if (rest.length === 0) throw new UsageError('attach needs a session name');
      return { name: 'attach', query: rest.join(' ') };
    case 'here': {
      const split = rest.indexOf('--');
      const options = split < 0 ? rest : rest.slice(0, split);
      const command = split < 0 ? [] : rest.slice(split + 1);
      const flags = options.filter((word) => word.startsWith('--'));
      const unknown = flags.find((flag) => !['--no-attach', '--no-open', '--claude', '--from-shell-hook'].includes(flag));
      if (unknown) throw new UsageError(`here does not know ${unknown}`);
      if (split >= 0 && command.length === 0) throw new UsageError('here: nothing after "--"');
      const words = options.filter((word) => !word.startsWith('--'));
      return {
        name: 'here',
        sessionName: words.length > 0 ? words.join(' ') : null,
        attach: !flags.includes('--no-attach'),
        // Never from the shell snippet or when only creating: those must not take the user's attention.
        open: !flags.some((flag) => ['--no-open', '--no-attach', '--from-shell-hook'].includes(flag)),
        claude: flags.includes('--claude'),
        command,
        fromShellHook: flags.includes('--from-shell-hook'),
      };
    }
    case 'scan':
      if (rest.length > 0) throw new UsageError('scan takes no arguments');
      return { name: 'scan' };
    case 'move': {
      const known = ['--all', '--stop', '--force', '--yes', '--dry-run', '--no-open'];
      const unknown = rest.find((word) => word.startsWith('--') && !known.includes(word));
      if (unknown) throw new UsageError(`move does not know ${unknown}`);
      const terminals = rest.filter((word) => !word.startsWith('--'));
      const all = rest.includes('--all');
      if (all && terminals.length > 0) throw new UsageError('move: name terminals or use --all, not both');
      if (rest.includes('--force') && !rest.includes('--stop')) throw new UsageError('move: --force only applies with --stop');
      return {
        name: 'move',
        terminals,
        all,
        stop: rest.includes('--stop'),
        force: rest.includes('--force'),
        yes: rest.includes('--yes'),
        dryRun: rest.includes('--dry-run'),
        open: !rest.includes('--no-open'),
      };
    }
    case 'import': {
      const unknown = rest.find((word) => word.startsWith('--') && word !== '--all' && word !== '--dry-run');
      if (unknown) throw new UsageError(`import does not know ${unknown}`);
      return {
        name: 'import',
        terminals: rest.filter((word) => !word.startsWith('--')),
        all: rest.includes('--all'),
        dryRun: rest.includes('--dry-run'),
      };
    }
    case 'note':
      if (rest.join(' ').trim() === '') throw new UsageError('note needs some text');
      return { name: 'note', text: rest.join(' ') };
    case 'hook': {
      const event = HOOK_EVENTS.find((e) => e === rest[0]);
      if (!event || rest.length !== 1) throw new UsageError(`hook needs one of: ${HOOK_EVENTS.join(', ')}`);
      return { name: 'hook', event };
    }
    case 'hooks':
      if (rest.length === 1 && rest[0] === 'print') return { name: 'hooks-print' };
      throw new UsageError('hooks needs "print"');
    case 'shell-hook':
      if (rest.length === 1 && rest[0] === 'print') return { name: 'shell-hook-print' };
      throw new UsageError('shell-hook needs "print"');
    case 'service':
      if (rest.length === 1 && (rest[0] === 'install' || rest[0] === 'uninstall')) {
        return { name: 'service', action: rest[0] };
      }
      throw new UsageError('service needs "install" or "uninstall"');
    default:
      throw new UsageError(`Unknown command: ${command}`);
  }
}

/**
 * Finds the session a name refers to: an exact name (case does not matter),
 * else a unique name starting with the text, else a unique ID prefix.
 */
export function resolveSession(sessions: readonly Session[], query: string): Session {
  const wanted = query.trim().toLowerCase();
  const running = sessions.filter((s) => s.state !== 'exited');
  const pick = (matches: Session[], what: string): Session | null => {
    if (matches.length === 1) return matches[0] ?? null;
    if (matches.length > 1) {
      throw new UsageError(`${matches.length} sessions ${what} "${query}": ${matches.map((s) => s.name).join(', ')}`);
    }
    return null;
  };
  const found =
    pick(running.filter((s) => s.name.toLowerCase() === wanted), 'are named') ??
    pick(running.filter((s) => s.name.toLowerCase().startsWith(wanted)), 'start with') ??
    pick(running.filter((s) => wanted.length >= 4 && s.id.startsWith(wanted)), 'have an ID starting with');
  if (!found) throw new UsageError(`No running session matches "${query}". Try: aubergine list`);
  return found;
}

/** A plain table: name, state, command, folder. */
export function formatSessions(sessions: readonly Session[]): string {
  if (sessions.length === 0) return 'No sessions.';
  const rows = [
    ['NAME', 'STATE', 'COMMAND', 'FOLDER'],
    ...sessions.map((s) => [s.name, s.state, s.command ?? '-', s.cwd ?? '-']),
  ];
  const widths = [0, 1, 2].map((column) => Math.max(...rows.map((row) => (row[column] ?? '').length)));
  return rows
    .map((row) => row.map((cell, column) => (column < 3 ? cell.padEnd(widths[column] ?? 0) : cell)).join('  ').trimEnd())
    .join('\n');
}

/**
 * Whether this process is running inside an Aubergine session (or a view of
 * one). `tmuxSocket` is the name of our tmux socket.
 */
export function insideAubergine(env: NodeJS.ProcessEnv, tmuxSocket: string): boolean {
  if (env.AUBERGINE_SESSION_ID) return true;
  // $TMUX is "<socket path>,<pid>,<n>"; ours ends in "/<socket name>".
  const socketPath = (env.TMUX ?? '').split(',')[0] ?? '';
  return socketPath !== '' && socketPath.split('/').pop() === tmuxSocket;
}

/** A session name for a folder: its last part. */
export function nameForFolder(folder: string): string {
  const base = folder.split('/').filter(Boolean).pop() ?? '';
  return base.trim().slice(0, 80) || 'Terminal';
}
