import type { Session } from '@aubergine/shared';

export type Command =
  | { name: 'list' }
  | { name: 'new'; sessionName: string | null }
  | { name: 'attach'; query: string }
  | { name: 'service'; action: 'install' | 'uninstall' }
  | { name: 'help' };

export const USAGE = `Usage: aubergine <command>

  list                       List sessions with their state, command and folder
  new [name]                 Start a new terminal on the canvas
  attach <name>              Open a session in this terminal (detach by closing the window)
  service install            Start the Aubergine server at login
  service uninstall          Stop starting it at login
  help                       Show this text

The server must be running for list, new and attach.`;

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
