import type { LayoutNode, NodeRect, OutsideMoveRequest, OutsideResult, OutsideTerminal, Session } from '@aubergine/shared';
import { BadInputError, ConflictError, NotFoundError } from '../sessions';
import type { ClaudeSession } from './claude-sessions';
import { describeItem, findCandidates, planMove, stopAgent, type Candidate, type ProcessControl } from './move';
import type { ScannedShell } from './shells';

/** What this module needs from the rest of the daemon and from the operating system. */
export interface OutsideDeps {
  /** The user's open shells that are not inside Aubergine. */
  scan(): Promise<ScannedShell[]>;
  /** The agent's own record for a process, or null. */
  readAgentRecord(pid: number): Promise<ClaudeSession | null>;
  processes: ProcessControl;
  /** How long to wait for an agent to exit after asking it to. */
  stopWaitMs?: number;
  createSession(input: { name: string; uniqueName: true; cwd: string; rect?: NodeRect; agent?: 'claude-code'; agentArgs?: string[] }): Promise<{
    session: Session;
    node: LayoutNode;
  }>;
}

function nameForFolder(folder: string): string {
  return folder.split('/').filter(Boolean).pop()?.trim().slice(0, 80) || 'Terminal';
}

/**
 * Terminals the user has open outside the canvas: listing them, and bringing
 * one onto the canvas at a time. Shared by the canvas panel and the command
 * line.
 *
 * A request only names a terminal and a process ID from the listing.
 * Everything else (the folder, the conversation, whether the agent is idle,
 * whether that process ID is still that process) is looked up again here,
 * right before acting. Nothing a client sends is trusted for those.
 */
export class Outside {
  constructor(private readonly deps: OutsideDeps) {}

  private async look(): Promise<{ shells: ScannedShell[]; candidates: Candidate[] }> {
    const shells = await this.deps.scan();
    const records = new Map<number, ClaudeSession>();
    for (const shell of shells) {
      if (!shell.looksLikeClaude || shell.runningPid === null) continue;
      const record = await this.deps.readAgentRecord(shell.runningPid);
      if (record) records.set(record.pid, record);
    }
    return { shells, candidates: findCandidates(shells, records) };
  }

  async list(): Promise<OutsideTerminal[]> {
    const { shells, candidates } = await this.look();
    return shells.map((shell) => {
      const candidate = candidates.find((c) => c.shell.tty === shell.tty) ?? null;
      const kind = shell.viewingAubergine ? 'view' : candidate ? 'agent' : shell.running ? 'command' : 'shell';
      return {
        tty: shell.tty,
        pid: shell.pid,
        cwd: candidate?.session?.cwd ?? shell.cwd,
        kind,
        running: shell.running,
        runningPid: shell.runningPid,
        agent: candidate
          ? { known: candidate.session !== null, name: candidate.session?.name ?? null, status: candidate.session?.status ?? null }
          : null,
      };
    });
  }

  /** Gives a terminal a canvas session in its folder. `pid` is the terminal's shell, as listed. */
  async add(target: { tty: string; pid: number; rect?: NodeRect | undefined }): Promise<OutsideResult> {
    const { shells } = await this.look();
    const shell = shells.find((s) => s.tty === target.tty);
    if (!shell || shell.pid !== target.pid) throw new NotFoundError(`No such terminal now: ${target.tty}. Refresh the list.`);
    if (shell.viewingAubergine) throw new ConflictError('That terminal is already showing a canvas session');
    if (!shell.cwd) throw new BadInputError('The folder of that terminal could not be read');

    const created = await this.deps.createSession({
      name: nameForFolder(shell.cwd),
      uniqueName: true,
      cwd: shell.cwd,
      ...(target.rect ? { rect: target.rect } : {}),
    });
    const attach = `aubergine attach "${created.session.name}"`;
    const message = shell.looksLikeClaude
      ? `Claude Code is running in ${shell.tty}. This session is a plain shell in the same folder; to bring the conversation over, use "Fork to canvas" or "Stop and resume here" instead.`
      : shell.running
        ? `"${shell.running.slice(0, 60)}" is still running in ${shell.tty}; a running command cannot be moved. Start it again here if you need it, and when the old one has finished, run there: ${attach}`
        : `In ${shell.tty} run: ${attach}   (or just close that tab and use the canvas)`;
    return { ...created, message };
  }

  /** Moves an agent tab's conversation onto the canvas. `pid` is the agent process, as listed. */
  async move(target: OutsideMoveRequest): Promise<OutsideResult> {
    const { candidates } = await this.look();
    const candidate = candidates.find((c) => c.shell.tty === target.tty);
    if (!candidate || candidate.pid !== target.pid) {
      throw new NotFoundError(`No Claude Code tab on ${target.tty} now. Refresh the list.`);
    }
    const [item] = planMove([candidate], { select: 'all', mode: target.mode, force: target.force === true }).items;
    if (!item) throw new NotFoundError(`No Claude Code tab on ${target.tty} now. Refresh the list.`);
    if (item.action === 'refuse') throw new ConflictError(`Not moved, because ${item.reason}.`);
    if (target.dryRun) return { session: null, node: null, message: describeItem(item) };

    if (item.action === 'resume' && candidate.session) {
      const result = await stopAgent(candidate.session, this.deps.processes, this.deps.stopWaitMs);
      if (result === 'not-the-same-process') {
        throw new ConflictError(`Left alone: process ${candidate.pid} is no longer the same Claude Code process.`);
      }
      if (result === 'still-running') {
        throw new ConflictError(
          `The original (process ${candidate.pid}) did not exit when asked, so nothing was started here for it. Exit it yourself (/exit), then run in that tab: aubergine here --claude`,
        );
      }
    }

    const created = await this.deps.createSession({
      name: nameForFolder(item.cwd),
      uniqueName: true,
      cwd: item.cwd,
      agent: 'claude-code',
      agentArgs: item.agentArgs,
    });
    const tty = candidate.shell.tty;
    const message =
      item.action === 'resume'
        ? `The original has exited and its conversation carries on here. ${tty} is at its shell prompt now; to use it as a view of this session, run there: aubergine attach "${created.session.name}"`
        : `This session has ${item.action === 'fork' ? 'a copy of the conversation' : 'the most recent conversation in that folder (the original could not be read)'}. The original is still running in ${tty}: exit it there (/exit) when you are ready. Until then, two agents with the same history are working in the same folder.`;
    return { ...created, message };
  }
}
