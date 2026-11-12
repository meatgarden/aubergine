import { existsSync } from 'node:fs';
import os from 'node:os';
import {
  Id,
  NO_ATTENTION,
  NO_STATUS,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  findFreeRect,
  needsUser,
  newId,
  nodesInside,
  type Attention,
  type AttentionState,
  type CreateFrameRequest,
  type Frame,
  type LayoutNode,
  type NodeRect,
  type NoteEntry,
  type RuntimeStatus,
  type Session,
  type ShellStatus,
  type UpdateFrameRequest,
  type UpdateNodeRequest,
  type UpdateSessionRequest,
} from '@aubergine/shared';
import type { Canvas } from './canvas';
import type { RuntimeSession, SessionRuntime } from './runtime/runtime';
import { noIntegration, type ShellIntegration, type ShellReport } from './shell/integration';

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class RuntimeUnavailableError extends Error {}

export interface SessionsOptions {
  /** Folder new shells start in when nothing better is known. */
  defaultFolder?: () => string | null;
  /** Shell to start; `null` for the user's own. */
  shell?: () => string | null;
  /** Makes shells report command status. */
  integration?: ShellIntegration;
  /** Variables every session's shell is given, such as its address and token for the agent API. */
  sessionEnv?: (sessionId: string) => Record<string, string>;
  /** Whether prompts given to agents may be kept in the note log. */
  logPrompts?: () => boolean;
}

/**
 * The operations behind the API. Each one talks to the runtime where a shell
 * is involved and records the result as a change event.
 */
export class Sessions {
  private runtimeStatus: RuntimeStatus | null = null;
  private refreshing: Promise<void> | null = null;
  private refreshQueued: Promise<void> | null = null;
  private readonly integration: ShellIntegration;
  /** When the user last looked at each session; not saved. */
  private readonly seenAt = new Map<string, number>();
  private readonly startedAt = Date.now();

  constructor(
    private readonly canvas: Canvas,
    private readonly runtime: SessionRuntime,
    private readonly options: SessionsOptions = {},
  ) {
    this.integration = options.integration ?? noIntegration;
  }

  async status(): Promise<RuntimeStatus> {
    // A usable runtime stays usable; keep asking while it is not, so the
    // error page clears once the user has installed what was missing.
    if (this.runtimeStatus?.status !== 'ok') this.runtimeStatus = await this.runtime.check();
    return this.runtimeStatus;
  }

  /**
   * Lines the saved state up with what is really running: shells that
   * outlived the last daemon process are kept as they are, saved sessions
   * whose shell is gone (for example after a reboot) get a fresh one in
   * their last known folder, and running sessions nobody remembers are put
   * back on the canvas. Nothing is re-run.
   */
  async reconcile(): Promise<void> {
    if ((await this.status()).status !== 'ok') return;
    const running = new Set((await this.runtime.list()).map((s) => s.id));

    for (const session of this.canvas.state.sessions) {
      if (session.state === 'exited' || running.has(session.id)) continue;
      await this.startShell(session.id, session.cwd);
    }

    const known = new Set(this.canvas.state.sessions.map((s) => s.id));
    for (const id of running) {
      if (known.has(id) || !Id.safeParse(id).success) continue;
      this.record(id, 'Recovered terminal', undefined, null);
    }
    await this.refresh();
  }

  async create(input: { name?: string | undefined; rect?: NodeRect | undefined }): Promise<{ session: Session; node: LayoutNode }> {
    const status = await this.status();
    if (status.status !== 'ok') throw new RuntimeUnavailableError(`tmux is ${status.status}`);
    const id = newId();
    const started = await this.startShell(id, null);
    // What a new shell prints while starting up is not news.
    this.seenAt.set(id, Date.now() + 5000);
    return this.record(id, input.name, input.rect, started.cwd);
  }

  update(sessionId: string, changes: UpdateSessionRequest): Session {
    this.find(sessionId);
    if (changes.name !== undefined) this.canvas.emit({ type: 'session.renamed', sessionId, name: changes.name });
    if (changes.note !== undefined) this.canvas.emit({ type: 'session.noted', sessionId, note: changes.note });
    return this.find(sessionId);
  }

  /** Takes the node off the canvas. The shell keeps running. */
  park(sessionId: string): Session {
    const session = this.find(sessionId);
    if (session.state === 'exited') throw new ConflictError('This shell has ended; remove it instead');
    if (session.state === 'open') this.canvas.emit({ type: 'session.parked', sessionId });
    return this.find(sessionId);
  }

  restore(sessionId: string): Session {
    if (this.find(sessionId).state === 'parked') this.canvas.emit({ type: 'session.restored', sessionId });
    return this.find(sessionId);
  }

  /** Starts a new shell, in the same folder, for a session whose shell ended. */
  async restart(sessionId: string): Promise<Session> {
    const session = this.find(sessionId);
    if (session.state !== 'exited') throw new ConflictError('This shell is still running');
    if (!(await this.runtime.has(sessionId))) {
      await this.startShell(sessionId, session.cwd);
    }
    this.canvas.emit({ type: 'session.restarted', sessionId });
    return this.find(sessionId);
  }

  /** Ends the shell for good and removes the session and its node. */
  async close(sessionId: string): Promise<void> {
    this.find(sessionId);
    await this.runtime.kill(sessionId);
    if (this.has(sessionId)) this.canvas.emit({ type: 'session.closed', sessionId });
    this.seenAt.delete(sessionId);
    await this.integration.forget(sessionId);
  }

  /**
   * Called when a shell turns out to be gone (for example the user typed
   * `exit`). An open session keeps its node, marked as ended; a parked one
   * has nothing left to show and is removed.
   */
  shellEnded(sessionId: string): void {
    const session = this.canvas.state.sessions.find((s) => s.id === sessionId);
    if (!session || session.state === 'exited') return;
    this.canvas.emit(
      session.state === 'parked' ? { type: 'session.closed', sessionId } : { type: 'session.exited', sessionId },
    );
  }

  /**
   * Asks the runtime what every session is doing: notices shells that ended
   * with nobody watching, and records changes of folder or command.
   *
   * Calls never run side by side. A call made while a run is under way waits
   * for one more run after it, so what it resolves with always reflects the
   * runtime as it was after the call, never an older picture.
   */
  refresh(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = this.refreshOnce().finally(() => {
        this.refreshing = null;
      });
      return this.refreshing;
    }
    this.refreshQueued ??= this.refreshing
      .catch(() => {})
      .then(() => {
        this.refreshQueued = null;
        return this.refresh();
      });
    return this.refreshQueued;
  }

  private async refreshOnce(): Promise<void> {
    if (this.runtimeStatus?.status !== 'ok') return;
    const running = new Map((await this.runtime.list()).map((s) => [s.id, s]));
    for (const session of this.canvas.state.sessions) {
      if (session.state === 'exited') continue;
      const live = running.get(session.id);
      if (!live) {
        this.shellEnded(session.id);
        continue;
      }
      if (live.cwd !== session.cwd || live.command !== session.command) {
        this.canvas.emit({ type: 'session.activity', sessionId: session.id, cwd: live.cwd, command: live.command });
      }
      const status = this.nextStatus(session, await this.integration.read(session.id), live.activityAt);
      if (!sameStatus(status, session.status)) {
        this.canvas.emit({ type: 'session.status', sessionId: session.id, status });
      }
    }
  }

  updateNode(nodeId: string, changes: UpdateNodeRequest): LayoutNode {
    const existing = this.canvas.state.layout.nodes.find((n) => n.id === nodeId);
    if (!existing) throw new NotFoundError(`No node ${nodeId}`);
    const { color, ...rect } = changes;
    const node: LayoutNode = { ...existing, ...rect, color: color ?? existing.color };
    this.canvas.emit({ type: 'node.updated', node });
    return node;
  }

  createFrame(input: CreateFrameRequest): Frame {
    const frame: Frame = { id: newId(), label: input.label ?? '', color: 'none', ...input.rect };
    this.canvas.emit({ type: 'frame.created', frame });
    return frame;
  }

  /** Moves, resizes, renames or recolors a frame. With `carry`, nodes inside it move along. */
  updateFrame(frameId: string, changes: UpdateFrameRequest): Frame {
    const existing = this.canvas.state.layout.frames.find((f) => f.id === frameId);
    if (!existing) throw new NotFoundError(`No frame ${frameId}`);
    const { label, color, carry, ...rect } = changes;
    const frame: Frame = { ...existing, ...rect, label: label ?? existing.label, color: color ?? existing.color };

    const dx = frame.x - existing.x;
    const dy = frame.y - existing.y;
    if (carry && (dx !== 0 || dy !== 0)) {
      for (const node of nodesInside(existing, this.visibleNodes())) {
        this.canvas.emit({ type: 'node.updated', node: { ...node, x: node.x + dx, y: node.y + dy } });
      }
    }
    this.canvas.emit({ type: 'frame.updated', frame });
    return frame;
  }

  removeFrame(frameId: string): void {
    if (!this.canvas.state.layout.frames.some((f) => f.id === frameId)) throw new NotFoundError(`No frame ${frameId}`);
    this.canvas.emit({ type: 'frame.removed', frameId });
  }

  /** Nodes that are on the canvas, which leaves out parked sessions. */
  private visibleNodes(): LayoutNode[] {
    const parked = new Set(this.canvas.state.sessions.filter((s) => s.state === 'parked').map((s) => s.id));
    return this.canvas.state.layout.nodes.filter((n) => !parked.has(n.sessionId));
  }

  has(sessionId: string): boolean {
    return this.canvas.state.sessions.some((s) => s.id === sessionId);
  }

  /** Whether the session is known and its shell has not ended. */
  isRunning(sessionId: string): boolean {
    return this.canvas.state.sessions.some((s) => s.id === sessionId && s.state !== 'exited');
  }

  private find(sessionId: string): Session {
    const session = this.canvas.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw new NotFoundError(`No session ${sessionId}`);
    return session;
  }

  private async startShell(sessionId: string, folder: string | null): Promise<RuntimeSession> {
    const shell = this.shell();
    const env = await this.integration.environment(sessionId, shell ?? process.env.SHELL ?? '');
    return this.runtime.create({
      id: sessionId,
      cwd: this.startFolder(folder),
      shell,
      env: { ...env, ...this.options.sessionEnv?.(sessionId) },
    });
  }

  /** Says whether the session wants the user. Reported by the agent running in it. */
  setAttention(sessionId: string, state: AttentionState, message?: string): Attention {
    this.find(sessionId);
    const attention: Attention = {
      state,
      message: message || null,
      at: state === 'none' ? null : new Date().toISOString(),
    };
    this.canvas.emit({ type: 'session.attention', sessionId, attention });
    return attention;
  }

  /**
   * Appends to the session's note log. Returns null when the entry is not
   * kept: prompts are dropped when the user has turned prompt logging off.
   */
  appendNote(sessionId: string, input: { author: NoteEntry['author']; kind?: NoteEntry['kind'] | undefined; text: string }): NoteEntry | null {
    this.find(sessionId);
    const kind = input.kind ?? 'note';
    if (kind === 'prompt' && this.options.logPrompts?.() === false) return null;
    const entry: NoteEntry = { id: newId(), at: new Date().toISOString(), author: input.author, kind, text: input.text };
    this.canvas.emit({ type: 'session.note.appended', sessionId, entry });
    return entry;
  }

  /** The user is looking at this session: nothing in it is unread, and it no longer waits for them. */
  seen(sessionId: string): Session {
    const session = this.find(sessionId);
    this.seenAt.set(sessionId, Date.now());
    if (needsUser(session.attention)) {
      this.canvas.emit({ type: 'session.attention', sessionId, attention: NO_ATTENTION });
    }
    if (session.status.unread) {
      this.canvas.emit({ type: 'session.status', sessionId, status: { ...session.status, unread: false } });
    }
    return this.find(sessionId);
  }

  private nextStatus(session: Session, report: ShellReport | null, activityAt: Date | null): ShellStatus {
    // tmux reports activity in whole seconds, so allow for that before calling something new.
    const seen = this.seenAt.get(session.id) ?? this.startedAt;
    const unread = activityAt !== null && activityAt.getTime() > seen + 1000;
    if (!report) return { ...session.status, unread };
    const iso = (date: Date | null): string | null => date?.toISOString() ?? null;
    return report.state === 'busy'
      ? {
          ...session.status,
          state: 'busy',
          commandLine: report.commandLine,
          startedAt: iso(report.startedAt),
          unread,
        }
      : {
          state: 'idle',
          commandLine: null,
          startedAt: null,
          // Before the first command there is no exit code; keep what was known.
          lastExit: report.lastExit ?? session.status.lastExit,
          lastFinishedAt: iso(report.lastFinishedAt) ?? session.status.lastFinishedAt,
          unread,
        };
  }

  private shell(): string | null {
    const shell = this.options.shell?.() ?? null;
    return shell && existsSync(shell) ? shell : null;
  }

  /** The folder to start a shell in: the one asked for if it still exists, else the default, else home. */
  private startFolder(wanted: string | null): string {
    for (const folder of [wanted, this.options.defaultFolder?.() ?? null]) {
      if (folder && existsSync(folder)) return folder;
    }
    return os.homedir();
  }

  private record(
    id: string,
    name: string | undefined,
    rect: NodeRect | undefined,
    cwd: string | null,
  ): { session: Session; node: LayoutNode } {
    const state = this.canvas.state;
    const session: Session = {
      id,
      projectId: state.project.id,
      name: name ?? this.nextName(),
      createdAt: new Date().toISOString(),
      state: 'open',
      cwd,
      command: null,
      note: '',
      status: NO_STATUS,
      attention: NO_ATTENTION,
      noteLog: [],
    };
    const node: LayoutNode = { id: newId(), sessionId: id, color: 'none', ...(rect ?? this.freeSpot()) };
    this.canvas.emit({ type: 'session.created', session, node });
    return { session, node };
  }

  private nextName(): string {
    const names = new Set(this.canvas.state.sessions.map((s) => s.name));
    for (let n = names.size + 1; ; n++) {
      if (!names.has(`Terminal ${n}`)) return `Terminal ${n}`;
    }
  }

  /** Free space next to the newest node on the canvas. */
  private freeSpot(): NodeRect {
    const nodes = this.visibleNodes();
    const size = { width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT };
    const last = nodes.at(-1);
    const center = last
      ? { x: last.x + last.width / 2, y: last.y + last.height / 2 }
      : { x: size.width / 2, y: size.height / 2 };
    return findFreeRect(nodes, center, size);
  }
}

function sameStatus(a: ShellStatus, b: ShellStatus): boolean {
  return (
    a.state === b.state &&
    a.commandLine === b.commandLine &&
    a.startedAt === b.startedAt &&
    a.lastExit === b.lastExit &&
    a.lastFinishedAt === b.lastFinishedAt &&
    a.unread === b.unread
  );
}
