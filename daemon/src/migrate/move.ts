import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { isSameProcess, parseProcessStart, type ClaudeSession } from './claude-sessions';
import { looksLikeClaude, type ScannedShell } from './shells';

/**
 * Moving running Claude Code tabs onto the canvas.
 *
 * A running process cannot be moved, but its conversation can: either a
 * copy of it is started on the canvas while the original carries on (fork),
 * or the original is asked to exit and the same conversation is resumed on
 * the canvas (stop).
 *
 * Stopping is the one place where Aubergine signals a process the user
 * started. It is limited to the exact processes the user chose, each checked
 * to still be the same Claude Code process immediately before, asked once
 * with a polite termination request, and never forced.
 */

export interface Candidate {
  shell: ScannedShell;
  /** The agent process in that terminal. */
  pid: number;
  /** What Claude Code recorded about it; null when that could not be read. */
  session: ClaudeSession | null;
}

/**
 * The agent tabs that can be moved: terminals where Claude Code is in the
 * foreground, started by a person from a command line. A process that
 * something else started (its record names another entry point) is left out.
 */
export function findCandidates(shells: readonly ScannedShell[], sessions: ReadonlyMap<number, ClaudeSession>): Candidate[] {
  const candidates: Candidate[] = [];
  for (const shell of shells) {
    if (!shell.looksLikeClaude || shell.runningPid === null) continue;
    const session = sessions.get(shell.runningPid) ?? null;
    if (session && session.entrypoint !== 'cli') continue;
    candidates.push({ shell, pid: shell.runningPid, session });
  }
  return candidates;
}

export type MoveMode = 'fork' | 'stop';

export type MoveItem =
  | {
      candidate: Candidate;
      /** `fork`: start a copy. `resume`: stop the original, then carry on. `continue`: conversation unknown, take the folder's most recent. */
      action: 'fork' | 'resume' | 'continue';
      cwd: string;
      /** Arguments for the agent in the new session. */
      agentArgs: string[];
    }
  | { candidate: Candidate; action: 'refuse'; reason: string };

export interface MoveOptions {
  /** Terminals to move, or `all`. */
  select: readonly string[] | 'all';
  mode: MoveMode;
  /** With `stop`: also stop agents that are not idle. */
  force: boolean;
}

/** Decides what to do with each selected tab. Pure. */
export function planMove(candidates: readonly Candidate[], options: MoveOptions): { items: MoveItem[]; unknown: string[] } {
  const wanted = options.select === 'all' ? null : new Set(options.select.map((tty) => tty.replace(/^\/dev\//, '')));
  const unknown = wanted ? [...wanted].filter((tty) => !candidates.some((c) => c.shell.tty === tty)) : [];
  const items: MoveItem[] = [];

  for (const candidate of candidates) {
    if (wanted && !wanted.has(candidate.shell.tty)) continue;
    const { session, shell } = candidate;
    const cwd = session?.cwd ?? shell.cwd;
    if (!cwd) {
      items.push({ candidate, action: 'refuse', reason: 'its folder could not be read' });
    } else if (options.mode === 'fork') {
      items.push(
        session
          ? { candidate, action: 'fork', cwd, agentArgs: ['--resume', session.conversationId, '--fork-session'] }
          : { candidate, action: 'continue', cwd, agentArgs: ['--continue'] },
      );
    } else if (!session) {
      items.push({ candidate, action: 'refuse', reason: 'its conversation could not be read, so it cannot be stopped and resumed safely; move it without --stop' });
    } else if (!session.processStart) {
      items.push({ candidate, action: 'refuse', reason: 'there is no way to be sure the process is still the same one; move it without --stop' });
    } else if (session.status !== 'idle' && !options.force) {
      items.push({ candidate, action: 'refuse', reason: `it is ${session.status ?? 'in an unknown state'}, not idle; wait for it to finish its turn, or use --force` });
    } else {
      items.push({ candidate, action: 'resume', cwd, agentArgs: ['--resume', session.conversationId] });
    }
  }
  return { items, unknown };
}

export function describeItem(item: MoveItem): string {
  const where = item.candidate.shell.tty;
  switch (item.action) {
    case 'fork':
      return `${where}: start a copy of its conversation on the canvas; the original keeps running`;
    case 'continue':
      return `${where}: its conversation could not be read, so the new session continues the most recent conversation in ${item.cwd}; the original keeps running`;
    case 'resume':
      return `${where}: ask the original (process ${item.candidate.pid}) to exit, then resume the same conversation on the canvas`;
    case 'refuse':
      return `${where}: not moved, because ${item.reason}`;
  }
}

/* ---------- Stopping the original ---------- */

export interface ProcessControl {
  /** When the process with this ID started, or null when there is none. */
  startOf(pid: number): Promise<{ started: Date | null; args: string } | null>;
  /** Sends the polite termination request. */
  terminate(pid: number): void;
  wait(ms: number): Promise<void>;
}

export type StopResult = 'stopped' | 'not-the-same-process' | 'still-running';

/**
 * Asks one agent process to exit, and reports whether it did.
 *
 * It first checks that the process ID still belongs to the Claude Code
 * process the session file describes. It sends one termination request (the
 * signal a process manager sends first, which programs are expected to treat
 * as "finish up and leave"), waits, and checks. It never escalates to a
 * signal that cannot be handled, and never touches any other process.
 */
export async function stopAgent(session: ClaudeSession, control: ProcessControl, waitMs = 10_000): Promise<StopResult> {
  const now = await control.startOf(session.pid);
  if (!now || !isSameProcess(session, now.started) || !looksLikeClaude(now.args)) return 'not-the-same-process';

  control.terminate(session.pid);
  const deadline = Date.now() + waitMs;
  for (;;) {
    await control.wait(150);
    const still = await control.startOf(session.pid);
    // Gone, or the ID already belongs to something else.
    if (!still || !isSameProcess(session, still.started)) return 'stopped';
    if (Date.now() >= deadline) return 'still-running';
  }
}

/** The real thing: `ps` for looking, SIGTERM for asking. */
export const systemProcesses: ProcessControl = {
  startOf: (pid) =>
    new Promise((resolve) => {
      // UTC, to compare with what the session file recorded.
      execFile('ps', ['-o', 'lstart=,args=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, TZ: 'UTC', LC_ALL: 'C' } }, (error, stdout) => {
        const line = (stdout ?? '').split('\n').find((l) => l.trim() !== '');
        if (error || !line) return resolve(null);
        // `lstart` is always 24 characters: "Tue Nov 10 17:41:56 2026".
        const match = /^\s*(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/.exec(line);
        resolve(match ? { started: parseProcessStart(match[1] ?? ''), args: match[2] ?? '' } : null);
      });
    }),
  terminate: (pid) => {
    process.kill(pid, 'SIGTERM');
  },
  wait: (ms) => sleep(ms),
};
