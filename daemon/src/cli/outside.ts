import type { OutsideTerminal } from '@aubergine/shared';
import type { ScannedShell } from '../migrate/shells';

/** How a terminal is described in one cell. */
function what(terminal: OutsideTerminal): string {
  switch (terminal.kind) {
    case 'view':
      return 'a view of an Aubergine session';
    case 'agent':
      return `Claude Code (${terminal.agent?.status ?? 'state unknown'})`;
    case 'command':
      return (terminal.running ?? '').slice(0, 44);
    case 'shell':
      return '-';
  }
}

function table(rows: string[][]): string {
  const last = (rows[0]?.length ?? 1) - 1;
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? [];
  return rows
    .map((row) => row.map((cell, column) => (column < last ? cell.padEnd(widths[column] ?? 0) : cell)).join('  ').trimEnd())
    .join('\n');
}

/** The table `scan` prints. The first column is the word to pass to `import` and `move`. */
export function formatOutside(terminals: readonly OutsideTerminal[], currentTty: string | null): string {
  if (terminals.length === 0) return 'No open terminals found outside Aubergine.';
  return table([
    ['TERMINAL', 'RUNNING', 'FOLDER'],
    ...terminals.map((t) => [t.tty + (t.tty === currentTty ? ' (this one)' : ''), what(t), t.cwd ?? '(unknown)']),
  ]);
}

/** The table `move` prints with nothing named: agent tabs only. */
export function formatAgents(terminals: readonly OutsideTerminal[]): string {
  const agents = terminals.filter((t) => t.kind === 'agent');
  if (agents.length === 0) return 'No Claude Code tabs found outside Aubergine.';
  return table([
    ['TERMINAL', 'STATE', 'CONVERSATION', 'FOLDER'],
    ...agents.map((t) => [
      t.tty,
      t.agent?.status ?? 'unknown',
      t.agent?.known ? (t.agent.name ?? '(unnamed)') : '(not readable)',
      t.cwd ?? '(unknown)',
    ]),
  ]);
}

/** One ready-to-copy command per terminal that something can be done with. */
export function commandsFor(terminals: readonly OutsideTerminal[], only: 'all' | 'agents'): string[] {
  const lines: string[] = [];
  for (const t of terminals) {
    if (t.kind === 'view') continue;
    if (t.kind === 'agent') {
      lines.push(`aubergine move ${t.tty}            # copy its conversation onto the canvas; the original keeps running`);
      if (t.agent?.known && t.agent.status === 'idle') {
        lines.push(`aubergine move ${t.tty} --stop     # ask it to exit, then resume the same conversation on the canvas`);
      }
    } else if (only === 'all') {
      lines.push(`aubergine import ${t.tty}          # a canvas session in ${t.cwd ?? 'its folder'}`);
    }
  }
  return lines;
}

/** The listing in the shape the import planner works on. */
export function toShells(terminals: readonly OutsideTerminal[], currentTty: string | null): ScannedShell[] {
  return terminals.map((t) => ({
    tty: t.tty,
    pid: t.pid,
    cwd: t.cwd,
    running: t.running,
    runningPid: t.runningPid,
    looksLikeClaude: t.kind === 'agent',
    viewingAubergine: t.kind === 'view',
    current: t.tty === currentTty,
  }));
}

/** Terminal names as people type them: with or without `/dev/`. */
export function normaliseTty(word: string): string {
  return word.replace(/^\/dev\//, '');
}
