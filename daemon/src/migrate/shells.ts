import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import { NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH, type FrameRect, type NodeRect, type Session } from '@aubergine/shared';

/**
 * Finding the terminals a person already has open, so that each can be given
 * a canvas session. Everything here only reads: no process is stopped,
 * signalled or changed.
 *
 * The parsing and planning are pure functions. The part that asks the
 * operating system (`scanShells`) is at the bottom; it is written for macOS,
 * with a Linux path that has not been tested.
 */

export interface Process {
  pid: number;
  ppid: number;
  /** Process group. */
  pgid: number;
  /** The process group in the foreground of this process's terminal. */
  tpgid: number;
  /** Terminal device without `/dev/`, for example `ttys004` or `pts/3`. */
  tty: string;
  /** The full command line. */
  args: string;
}

export interface ScannedShell {
  tty: string;
  pid: number;
  /** The shell's working folder, when it could be read. */
  cwd: string | null;
  /** The command in the foreground, or null when the shell sits at its prompt. */
  running: string | null;
  looksLikeClaude: boolean;
  /** This tab is already showing an Aubergine session. */
  viewingAubergine: boolean;
  /** The terminal this scan was run from. */
  current: boolean;
}

const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'dash', 'ksh', 'tcsh', 'csh']);

/** The program name of a command line: `-zsh` → `zsh`, `/bin/zsh -l` → `zsh`. */
export function programName(args: string): string {
  const first = args.trim().split(/\s+/)[0] ?? '';
  return (first.split('/').pop() ?? '').replace(/^-/, '');
}

/** Parses `ps -axo pid=,ppid=,pgid=,tpgid=,tty=,args=`. */
export function parsePs(text: string): Process[] {
  const processes: Process[] = [];
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const tty = (match[5] ?? '').replace(/^\/dev\//, '');
    if (tty === '?' || tty === '??' || tty === '-') continue;
    processes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      tpgid: Number(match[4]),
      tty,
      args: (match[6] ?? '').trim(),
    });
  }
  return processes;
}

/** Parses `lsof -a -d cwd -p <pids> -Fpn` into working folder by process ID. */
export function parseLsofCwd(text: string): Map<number, string> {
  const folders = new Map<number, string>();
  let pid: number | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid !== null) folders.set(pid, line.slice(1));
  }
  return folders;
}

/** Whether a command line is Claude Code. */
export function looksLikeClaude(args: string): boolean {
  return programName(args) === 'claude' || /(^|[\s/])claude(\.js)?(\s|$)/.test(args.split(/\s--?\w/)[0] ?? '');
}

export interface FindOptions {
  /** Terminals that belong to Aubergine sessions themselves; never reported. */
  aubergineTtys: ReadonlySet<string>;
  /** Name of Aubergine's tmux socket, to recognise tabs that are views of a session. */
  tmuxSocket: string;
  /** The terminal the scan runs in, if any. */
  currentTty: string | null;
}

/**
 * The interactive shells among `processes`: one per terminal, with what is
 * in the foreground there.
 */
export function findShells(processes: readonly Process[], folders: ReadonlyMap<number, string>, options: FindOptions): ScannedShell[] {
  const byTty = new Map<string, Process[]>();
  for (const process of processes) {
    const list = byTty.get(process.tty) ?? [];
    list.push(process);
    byTty.set(process.tty, list);
  }

  const shells: ScannedShell[] = [];
  for (const [tty, list] of byTty) {
    if (options.aubergineTtys.has(tty)) continue;
    // The tab's own shell is the first shell started on its terminal.
    const shell = [...list].sort((a, b) => a.pid - b.pid).find((p) => SHELLS.has(programName(p.args)));
    if (!shell) continue;

    const foreground = list.filter((p) => p.pgid === p.tpgid);
    const leader = foreground.find((p) => p.pid === p.pgid) ?? foreground[0] ?? null;
    const running = leader && leader.pid !== shell.pid ? leader.args : null;
    shells.push({
      tty,
      pid: shell.pid,
      cwd: folders.get(shell.pid) ?? null,
      running,
      looksLikeClaude: running !== null && looksLikeClaude(running),
      viewingAubergine:
        running !== null && programName(running) === 'tmux' && running.includes(`-L ${options.tmuxSocket} `) && /\battach/.test(running),
      current: tty === options.currentTty,
    });
  }
  return shells.sort((a, b) => a.tty.localeCompare(b.tty, undefined, { numeric: true }));
}

/** A plain table of scanned shells. */
export function formatScan(shells: readonly ScannedShell[]): string {
  if (shells.length === 0) return 'No open shells found outside Aubergine.';
  const rows = [
    ['TERMINAL', 'RUNNING', 'FOLDER'],
    ...shells.map((s) => [
      s.tty + (s.current ? ' (this one)' : ''),
      s.viewingAubergine ? 'a view of an Aubergine session' : s.looksLikeClaude ? 'Claude Code' : (s.running ?? '-').slice(0, 48),
      s.cwd ?? '(unknown)',
    ]),
  ];
  const widths = [0, 1].map((column) => Math.max(...rows.map((row) => (row[column] ?? '').length)));
  return rows.map((row) => row.map((cell, column) => (column < 2 ? cell.padEnd(widths[column] ?? 0) : cell)).join('  ').trimEnd()).join('\n');
}

export interface ImportItem {
  shell: ScannedShell;
  cwd: string;
  /** Name asked for; the daemon makes it unique. */
  name: string;
}

export interface ImportPlan {
  create: ImportItem[];
  skipped: { shell: ScannedShell; reason: string }[];
}

/**
 * Decides which scanned shells get a canvas session: one per folder that
 * does not already have a session, or every shell with `all`.
 */
export function planImport(shells: readonly ScannedShell[], sessions: readonly Session[], options: { all: boolean }): ImportPlan {
  const taken = new Set(sessions.filter((s) => s.state !== 'exited' && s.cwd).map((s) => s.cwd as string));
  const plan: ImportPlan = { create: [], skipped: [] };
  // When several tabs share a folder and only one gets a session, the tab
  // doing the most wins: an agent, then a running command, then an idle one.
  const weight = (shell: ScannedShell): number => (shell.looksLikeClaude ? 0 : shell.running ? 1 : 2);
  const ordered = shells.map((shell, index) => ({ shell, index })).sort((a, b) => weight(a.shell) - weight(b.shell) || a.index - b.index);
  for (const { shell } of ordered) {
    if (shell.viewingAubergine) {
      plan.skipped.push({ shell, reason: 'already a view of an Aubergine session' });
    } else if (!shell.cwd) {
      plan.skipped.push({ shell, reason: 'its folder could not be read' });
    } else if (!options.all && taken.has(shell.cwd)) {
      plan.skipped.push({ shell, reason: 'that folder already has a session (use --all to add another)' });
    } else {
      taken.add(shell.cwd);
      const name = shell.cwd.split('/').filter(Boolean).pop()?.slice(0, 80) || 'Terminal';
      plan.create.push({ shell, cwd: shell.cwd, name });
    }
  }
  const byTty = (a: { shell: ScannedShell }, b: { shell: ScannedShell }): number =>
    a.shell.tty.localeCompare(b.shell.tty, undefined, { numeric: true });
  plan.create.sort(byTty);
  plan.skipped.sort(byTty);
  return plan;
}

/** What the person should do in the original tab, which is left exactly as it is. */
export function nextStep(item: { shell: ScannedShell; sessionName: string }, claudeLine: string): string {
  const attach = `aubergine attach "${item.sessionName}"`;
  if (item.shell.looksLikeClaude) {
    return `Claude Code is running there. When it has finished its turn, exit it (/exit), then run: ${attach}\n      and in the session: ${claudeLine}`;
  }
  if (item.shell.running) {
    return `"${item.shell.running.slice(0, 60)}" is running there. When it has finished (or you have stopped it), run: ${attach}`;
  }
  return `Idle. In that tab run: ${attach}   (or just close the tab and use the canvas)`;
}

const GAP = 40;
const FRAME_PADDING = 48;

/**
 * Where to put `count` new nodes and the frame around them: a grid to the
 * right of everything already on the canvas.
 */
export function importLayout(count: number, existing: readonly NodeRect[]): { frame: FrameRect; nodes: NodeRect[] } {
  const right = existing.length > 0 ? Math.max(...existing.map((r) => r.x + r.width)) + 160 : 0;
  const top = existing.length > 0 ? Math.min(...existing.map((r) => r.y)) : 0;
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const nodes = Array.from({ length: count }, (_, index) => ({
    x: right + FRAME_PADDING + (index % columns) * (NODE_DEFAULT_WIDTH + GAP),
    y: top + FRAME_PADDING + Math.floor(index / columns) * (NODE_DEFAULT_HEIGHT + GAP),
    width: NODE_DEFAULT_WIDTH,
    height: NODE_DEFAULT_HEIGHT,
  }));
  return {
    nodes,
    frame: {
      x: right,
      y: top,
      width: 2 * FRAME_PADDING + columns * NODE_DEFAULT_WIDTH + (columns - 1) * GAP,
      height: 2 * FRAME_PADDING + rows * NODE_DEFAULT_HEIGHT + (rows - 1) * GAP,
    },
  };
}

/* ---------- Asking the operating system ---------- */

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    // Failure of any of these simply means less is known.
    execFile(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (_error, stdout) => resolve(stdout ?? ''));
  });
}

async function workingFolders(pids: number[]): Promise<Map<number, string>> {
  if (pids.length === 0) return new Map();
  if (process.platform === 'linux') {
    // Untested: no Linux machine was at hand when this was written.
    const folders = new Map<number, string>();
    await Promise.all(
      pids.map(async (pid) => {
        try {
          folders.set(pid, await readlink(`/proc/${pid}/cwd`));
        } catch {
          // Not ours to read, or gone.
        }
      }),
    );
    return folders;
  }
  return parseLsofCwd(await run('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn']));
}

/** The user's open interactive shells that are not inside Aubergine. Read-only. */
export async function scanShells(options: { tmuxBin: string; tmuxSocket: string }): Promise<ScannedShell[]> {
  const processes = parsePs(await run('ps', ['-axo', 'pid=,ppid=,pgid=,tpgid=,tty=,args=']));
  const panes = await run(options.tmuxBin, ['-L', options.tmuxSocket, 'list-panes', '-a', '-F', '#{pane_tty}']);
  const aubergineTtys = new Set(panes.split('\n').filter(Boolean).map((tty) => tty.replace(/^\/dev\//, '')));
  // Only our own processes: a shell we could not give a session to is of no use here.
  const mine = processes.filter((p) => SHELLS.has(programName(p.args)));
  const folders = await workingFolders(mine.map((p) => p.pid));
  const current = processes.find((p) => p.pid === process.pid)?.tty ?? null;
  return findShells(processes, folders, { aubergineTtys, tmuxSocket: options.tmuxSocket, currentTty: current });
}
