import { existsSync, statSync } from 'node:fs';
import os from 'node:os';
import {
  Id,
  NO_ATTENTION,
  NO_STATUS,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  canvasOfNode,
  findFreeRect,
  needsUser,
  newCanvas,
  newId,
  nodesInside,
  placeOfSession,
  sortedCanvases,
  type AgentInfo,
  type Canvas,
  type CanvasChanges,
  type AgentKind,
  type Attention,
  type AttentionState,
  type CreateFrameRequest,
  type CreateSessionRequest,
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
import type { StateHub } from './state-hub';
import type { HistorySearch, RuntimeSession, SessionRuntime } from './runtime/runtime';
import { noIntegration, type ShellIntegration, type ShellReport } from './shell/integration';

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class BadInputError extends Error {}
export class RuntimeUnavailableError extends Error {}

export interface SessionsOptions {
  /** Folder new shells start in when nothing better is known. */
  defaultFolder?: () => string | null;
  /** Shell to start; `null` for the user's own. */
  shell?: () => string | null;
  /** Makes shells report command status. */
  integration?: ShellIntegration;
  /** The canvas most recently looked at in a browser, if any. New things go there when no canvas is named. */
  currentCanvas?: () => string | null;
  /** Variables every session's shell is given, such as its address and token for the agent API. */
  sessionEnv?: (sessionId: string) => Record<string, string>;
  /** Whether prompts given to agents may be kept in the note log. */
  logPrompts?: () => boolean;
  /** The line that starts an agent in a new session, with its reporting set up. */
  agentLaunchLine?: (agent: AgentKind, args: readonly string[]) => Promise<string>;
}

/** The two times of a session (last typed into, last printed) are recorded at most this often. */
export const TIMES_INTERVAL_MS = 5000;

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
  private readonly inputNotedAt = new Map<string, number>();
  private readonly startedAt = Date.now();

  constructor(
    private readonly hub: StateHub,
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

    for (const session of this.hub.state.sessions) {
      if (session.state === 'exited' || running.has(session.id)) continue;
      await this.startShell(session.id, session.cwd);
    }

    const known = new Set(this.hub.state.sessions.map((s) => s.id));
    for (const id of running) {
      if (known.has(id) || !Id.safeParse(id).success) continue;
      this.record(id, 'Recovered terminal', undefined, null, this.canvas(null));
    }
    // Every session that is not parked is on a canvas; put back any that lost its place.
    for (const session of this.hub.state.sessions) {
      if (session.state === 'parked' || placeOfSession(this.hub.state, session.id)) continue;
      const canvas = this.canvas(null);
      const node: LayoutNode = { id: newId(), sessionId: session.id, color: 'none', ...this.freeSpot(canvas) };
      this.hub.emit({ type: 'session.moved', sessionId: session.id, canvasId: canvas.id, node });
    }
    await this.refresh();
  }

  async create(input: CreateSessionRequest): Promise<{ session: Session; node: LayoutNode }> {
    const status = await this.status();
    if (status.status !== 'ok') throw new RuntimeUnavailableError(`tmux is ${status.status}`);
    if (input.cwd !== undefined && !isFolder(input.cwd)) throw new BadInputError(`Not a folder: ${input.cwd}`);
    // Looked up before anything is started, so that a wrong canvas starts nothing.
    const canvas = this.canvas(input.canvasId ?? null);

    const id = newId();
    const started = await this.startShell(id, input.cwd ?? null);
    // What a new shell prints while starting up is not news.
    this.seenAt.set(id, Date.now() + 5000);
    const launch = input.agent
      ? await this.options.agentLaunchLine?.(input.agent, input.agentArgs ?? (input.agentContinue ? ['--continue'] : []))
      : undefined;
    const fallback = launch ? this.nextName('Claude Code') : undefined;
    const name = input.name && input.uniqueName ? this.uniqueName(input.name) : (input.name ?? fallback);
    const created = this.record(id, name, input.rect, started.cwd, canvas, input.tags ?? []);
    if (input.agent && launch) {
      this.hub.emit({ type: 'session.agent', sessionId: id, agent: { kind: input.agent, conversationId: null } });
    }

    // Typed once the shell is ready; the new node does not wait for that.
    const lines = [launch ?? input.command].filter((line): line is string => Boolean(line));
    if (lines.length > 0) {
      void (async () => {
        for (const line of lines) await this.runtime.typeLine(id, line);
        if (lines.length > 0) this.noteInput(id);
      })().catch(() => {});
    }
    return created;
  }

  /** `name`, or `name 2`, `name 3`… when sessions already use it. */
  private uniqueName(name: string): string {
    const names = new Set(this.hub.state.sessions.map((s) => s.name));
    if (!names.has(name)) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, 74)} ${n}`;
      if (!names.has(candidate)) return candidate;
    }
  }

  update(sessionId: string, changes: UpdateSessionRequest): Session {
    this.find(sessionId);
    if (changes.name !== undefined) this.hub.emit({ type: 'session.renamed', sessionId, name: changes.name });
    if (changes.note !== undefined) this.hub.emit({ type: 'session.noted', sessionId, note: changes.note });
    if (changes.tags !== undefined) this.hub.emit({ type: 'session.tagged', sessionId, tags: changes.tags });
    return this.find(sessionId);
  }

  /**
   * Input has reached a session through the server (a browser's terminal, or
   * a line typed for the user). Recorded at most once every few seconds per
   * session: typing must not flood the event stream or the state file.
   */
  noteInput(sessionId: string, now = Date.now()): void {
    if (now - (this.inputNotedAt.get(sessionId) ?? 0) < TIMES_INTERVAL_MS) return;
    if (!this.hub.state.sessions.some((s) => s.id === sessionId)) return;
    this.inputNotedAt.set(sessionId, now);
    this.hub.emit({ type: 'session.times', sessionId, lastInputAt: new Date(now).toISOString() });
  }

  /**
   * Brings the two times up to date from what the runtime and the shell
   * report: output from the runtime's activity time, and input also from the
   * start of a command, which is the only sign of input that did not pass
   * through the server (a view of the session opened in another terminal).
   */
  private noteTimes(session: Session, activityAt: Date | null, commandStartedAt: string | null): void {
    const changes: { lastInputAt?: string; lastOutputAt?: string } = {};
    const output = session.lastOutputAt ? Date.parse(session.lastOutputAt) : 0;
    if (activityAt && activityAt.getTime() - output >= TIMES_INTERVAL_MS) changes.lastOutputAt = activityAt.toISOString();
    const input = session.lastInputAt ? Date.parse(session.lastInputAt) : 0;
    if (commandStartedAt && Date.parse(commandStartedAt) > input) changes.lastInputAt = commandStartedAt;
    if (changes.lastInputAt !== undefined || changes.lastOutputAt !== undefined) {
      this.hub.emit({ type: 'session.times', sessionId: session.id, ...changes });
    }
  }

  /** Takes the session off its canvas. The shell keeps running, and the session remembers where it sat. */
  park(sessionId: string): Session {
    const session = this.find(sessionId);
    if (session.state === 'exited') throw new ConflictError('This shell has ended; remove it instead');
    if (session.state === 'open') this.hub.emit({ type: 'session.parked', sessionId });
    return this.find(sessionId);
  }

  /**
   * Puts a parked session back on a canvas: the one named, else the one it
   * came from if that still exists, else the default. It returns to its old
   * spot when that is on the same canvas and still free.
   */
  restore(sessionId: string, canvasId?: string | null): { session: Session; node: LayoutNode } {
    const session = this.find(sessionId);
    if (session.state !== 'parked') {
      const place = placeOfSession(this.hub.state, sessionId);
      if (!place) throw new ConflictError('This session is not parked');
      return { session, node: place.node };
    }
    const from = session.parkedFrom;
    const fromStillThere = from !== null && this.hub.state.canvases.some((c) => c.id === from.canvasId);
    const canvas = this.canvas(canvasId ?? (fromStillThere ? from.canvasId : null));
    const spot = from
      ? findFreeRect(canvas.layout.nodes, centerOf(from.rect), { width: from.rect.width, height: from.rect.height })
      : null;
    const oldSpotFree =
      from !== null && spot !== null && from.canvasId === canvas.id && spot.x === from.rect.x && spot.y === from.rect.y;
    const rect = from && oldSpotFree ? from.rect : this.freeSpot(canvas, from?.rect);
    const node: LayoutNode = { id: newId(), sessionId, color: from?.color ?? 'none', ...rect };
    this.hub.emit({ type: 'session.restored', sessionId, canvasId: canvas.id, node });
    return { session: this.find(sessionId), node };
  }

  /** Moves a session to another canvas. Its shell is untouched. */
  moveToCanvas(sessionId: string, canvasId: string, position?: { x: number; y: number }): { session: Session; node: LayoutNode } {
    const session = this.find(sessionId);
    const target = this.canvas(canvasId);
    const place = placeOfSession(this.hub.state, sessionId);
    if (!place) throw new ConflictError('This session is parked; restore it onto the canvas instead');
    if (place.canvas.id === target.id && !position) return { session, node: place.node };
    const size = { width: place.node.width, height: place.node.height };
    const others = target.layout.nodes.filter((n) => n.sessionId !== sessionId);
    const rect = position ? { ...position, ...size } : findFreeRect(others, centerOf(this.freeSpot(target, size)), size);
    const node: LayoutNode = { ...place.node, ...rect };
    this.hub.emit({ type: 'session.moved', sessionId, canvasId: target.id, node });
    return { session: this.find(sessionId), node };
  }

  /* ---------- Canvases ---------- */

  /** The canvas new things go to when none is named. */
  defaultCanvasId(): string {
    return this.canvas(null).id;
  }

  listCanvases(): Canvas[] {
    return sortedCanvases(this.hub.state);
  }

  getCanvas(canvasId: string): Canvas {
    return this.canvas(canvasId);
  }

  createCanvas(input: { name: string; color?: Canvas['color'] | undefined; labels?: Canvas['labels'] | undefined }): Canvas {
    const last = this.listCanvases().at(-1);
    const canvas: Canvas = {
      ...newCanvas(this.hub.state.project.id, input.name, (last?.order ?? 0) + 1),
      ...(input.color ? { color: input.color } : {}),
      ...(input.labels ? { labels: input.labels } : {}),
    };
    this.hub.emit({ type: 'canvas.created', canvas });
    return canvas;
  }

  updateCanvas(canvasId: string, changes: CanvasChanges): Canvas {
    this.canvas(canvasId);
    if (Object.keys(changes).length > 0) this.hub.emit({ type: 'canvas.updated', canvasId, changes });
    return this.canvas(canvasId);
  }

  /**
   * Closes a canvas. Its sessions are never ended: they are moved to another
   * canvas or parked, as the caller chose. The last canvas cannot be closed.
   */
  removeCanvas(canvasId: string, choice: { sessions: 'park' } | { sessions: 'move'; to: string } | null): void {
    const canvas = this.canvas(canvasId);
    if (this.hub.state.canvases.length === 1) throw new ConflictError('The last canvas cannot be closed');
    if (canvas.layout.nodes.length > 0 && !choice) {
      throw new ConflictError('This canvas still has sessions: say whether to move them to another canvas or park them');
    }
    if (choice?.sessions === 'move') {
      if (choice.to === canvasId) throw new BadInputError('Sessions cannot be moved to the canvas that is being closed');
      this.canvas(choice.to);
    }
    for (const node of canvas.layout.nodes) {
      const session = this.hub.state.sessions.find((s) => s.id === node.sessionId);
      if (choice?.sessions === 'move') {
        this.moveToCanvas(node.sessionId, choice.to);
      } else if (session?.state === 'exited') {
        // Its shell has already ended, so there is nothing to keep running: remove the leftover.
        this.hub.emit({ type: 'session.closed', sessionId: node.sessionId });
      } else {
        this.hub.emit({ type: 'session.parked', sessionId: node.sessionId });
      }
    }
    this.hub.emit({ type: 'canvas.removed', canvasId });
  }

  /** The canvas with this ID; with none given, the one most recently looked at, else the first. */
  private canvas(canvasId: string | null): Canvas {
    const canvases = this.listCanvases();
    if (canvasId !== null) {
      const found = canvases.find((c) => c.id === canvasId);
      if (!found) throw new NotFoundError(`No canvas ${canvasId}`);
      return found;
    }
    const current = this.options.currentCanvas?.() ?? null;
    const fallback = canvases.find((c) => c.id === current) ?? canvases[0];
    if (!fallback) throw new NotFoundError('There is no canvas');
    return fallback;
  }

  /** Starts a new shell, in the same folder, for a session whose shell ended. */
  async restart(sessionId: string): Promise<Session> {
    const session = this.find(sessionId);
    if (session.state !== 'exited') throw new ConflictError('This shell is still running');
    if (!(await this.runtime.has(sessionId))) {
      await this.startShell(sessionId, session.cwd);
    }
    this.hub.emit({ type: 'session.restarted', sessionId });
    return this.find(sessionId);
  }

  /** Ends the shell for good and removes the session and its node. */
  async close(sessionId: string): Promise<void> {
    this.find(sessionId);
    await this.runtime.kill(sessionId);
    if (this.has(sessionId)) this.hub.emit({ type: 'session.closed', sessionId });
    this.seenAt.delete(sessionId);
    await this.integration.forget(sessionId);
  }

  /**
   * Called when a shell turns out to be gone (for example the user typed
   * `exit`). An open session keeps its node, marked as ended; a parked one
   * has nothing left to show and is removed.
   */
  shellEnded(sessionId: string): void {
    const session = this.hub.state.sessions.find((s) => s.id === sessionId);
    if (!session || session.state === 'exited') return;
    this.hub.emit(
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
    for (const session of this.hub.state.sessions) {
      if (session.state === 'exited') continue;
      const live = running.get(session.id);
      if (!live) {
        this.shellEnded(session.id);
        continue;
      }
      if (live.cwd !== session.cwd || live.command !== session.command) {
        this.hub.emit({ type: 'session.activity', sessionId: session.id, cwd: live.cwd, command: live.command });
      }
      const status = this.nextStatus(session, await this.integration.read(session.id), live.activityAt);
      if (!sameStatus(status, session.status)) {
        this.hub.emit({ type: 'session.status', sessionId: session.id, status });
      }
      this.noteTimes(session, live.activityAt, status.startedAt);
    }
  }

  updateNode(nodeId: string, changes: UpdateNodeRequest, inCanvas?: string): LayoutNode {
    const place = canvasOfNode(this.hub.state, nodeId);
    if (!place || (inCanvas !== undefined && place.canvas.id !== inCanvas)) throw new NotFoundError(`No node ${nodeId}`);
    const { color, ...rect } = changes;
    const node: LayoutNode = { ...place.node, ...rect, color: color ?? place.node.color };
    this.hub.emit({ type: 'node.updated', canvasId: place.canvas.id, node });
    return node;
  }

  createFrame(input: CreateFrameRequest): Frame {
    const canvas = this.canvas(input.canvasId ?? null);
    const frame: Frame = { id: newId(), label: input.label ?? '', color: 'none', ...input.rect };
    this.hub.emit({ type: 'frame.created', canvasId: canvas.id, frame });
    return frame;
  }

  /** Moves, resizes, renames or recolors a frame. With `carry`, nodes inside it move along. */
  updateFrame(frameId: string, changes: UpdateFrameRequest, inCanvas?: string): Frame {
    const { canvas, frame: existing } = this.frame(frameId, inCanvas);
    const { label, color, carry, ...rect } = changes;
    const frame: Frame = { ...existing, ...rect, label: label ?? existing.label, color: color ?? existing.color };

    const dx = frame.x - existing.x;
    const dy = frame.y - existing.y;
    if (carry && (dx !== 0 || dy !== 0)) {
      for (const node of nodesInside(existing, canvas.layout.nodes)) {
        this.hub.emit({ type: 'node.updated', canvasId: canvas.id, node: { ...node, x: node.x + dx, y: node.y + dy } });
      }
    }
    this.hub.emit({ type: 'frame.updated', canvasId: canvas.id, frame });
    return frame;
  }

  removeFrame(frameId: string, inCanvas?: string): void {
    const { canvas } = this.frame(frameId, inCanvas);
    this.hub.emit({ type: 'frame.removed', canvasId: canvas.id, frameId });
  }

  private frame(frameId: string, inCanvas?: string): { canvas: Canvas; frame: Frame } {
    for (const canvas of this.hub.state.canvases) {
      if (inCanvas !== undefined && canvas.id !== inCanvas) continue;
      const frame = canvas.layout.frames.find((f) => f.id === frameId);
      if (frame) return { canvas, frame };
    }
    throw new NotFoundError(`No frame ${frameId}`);
  }

  has(sessionId: string): boolean {
    return this.hub.state.sessions.some((s) => s.id === sessionId);
  }

  /** Whether the session is known and its shell has not ended. */
  isRunning(sessionId: string): boolean {
    return this.hub.state.sessions.some((s) => s.id === sessionId && s.state !== 'exited');
  }

  private find(sessionId: string): Session {
    const session = this.hub.state.sessions.find((s) => s.id === sessionId);
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

  /** Records which agent is running in the session and in which conversation. */
  reportAgent(sessionId: string, agent: AgentInfo): AgentInfo {
    const session = this.find(sessionId);
    // An agent that reports without a conversation does not erase the one we know.
    const next: AgentInfo = { kind: agent.kind, conversationId: agent.conversationId ?? session.agent?.conversationId ?? null };
    if (session.agent?.kind !== next.kind || session.agent.conversationId !== next.conversationId) {
      this.hub.emit({ type: 'session.agent', sessionId, agent: next });
    }
    return next;
  }

  /** Starts the session's agent again, in the conversation it was last in. */
  async resumeAgent(sessionId: string): Promise<Session> {
    const session = this.find(sessionId);
    if (session.state === 'exited') throw new ConflictError('This shell has ended; restart it first');
    if (!session.agent?.conversationId) throw new ConflictError('No agent conversation is known for this session');
    // The ID was validated when it was recorded, and is quoted again when the line is built.
    const line = await this.options.agentLaunchLine?.(session.agent.kind, ['--resume', session.agent.conversationId]);
    if (!line) throw new ConflictError('Starting agents is not set up');
    await this.runtime.typeLine(sessionId, line);
    return this.find(sessionId);
  }

  /** Searches the terminal history of every running session, parked ones included. */
  searchHistory(query: string): Promise<HistorySearch> {
    const ids = this.hub.state.sessions.filter((s) => s.state !== 'exited').map((s) => s.id);
    return this.runtime.search(ids, query);
  }

  /** Scrolls a session's terminal back to where `text` appears. */
  async reveal(sessionId: string, text: string): Promise<void> {
    this.find(sessionId);
    if (this.isRunning(sessionId)) await this.runtime.reveal(sessionId, text);
  }

  /** Says whether the session wants the user. Reported by the agent running in it. */
  setAttention(sessionId: string, state: AttentionState, message?: string): Attention {
    this.find(sessionId);
    const attention: Attention = {
      state,
      message: message || null,
      at: state === 'none' ? null : new Date().toISOString(),
    };
    this.hub.emit({ type: 'session.attention', sessionId, attention });
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
    this.hub.emit({ type: 'session.note.appended', sessionId, entry });
    return entry;
  }

  /** The user is looking at this session: nothing in it is unread, and it no longer waits for them. */
  seen(sessionId: string): Session {
    const session = this.find(sessionId);
    this.seenAt.set(sessionId, Date.now());
    if (needsUser(session.attention)) {
      this.hub.emit({ type: 'session.attention', sessionId, attention: NO_ATTENTION });
    }
    if (session.status.unread) {
      this.hub.emit({ type: 'session.status', sessionId, status: { ...session.status, unread: false } });
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
    canvas: Canvas,
    tags: string[] = [],
  ): { session: Session; node: LayoutNode } {
    const state = this.hub.state;
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
      agent: null,
      parkedFrom: null,
      lastInputAt: null,
      lastOutputAt: null,
      tags,
    };
    const node: LayoutNode = { id: newId(), sessionId: id, color: 'none', ...(rect ?? this.freeSpot(canvas)) };
    this.hub.emit({ type: 'session.created', session, canvasId: canvas.id, node });
    return { session, node };
  }

  private nextName(base = 'Terminal'): string {
    const names = new Set(this.hub.state.sessions.map((s) => s.name));
    const first = base === 'Terminal' ? names.size + 1 : 1;
    for (let n = first; ; n++) {
      if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
    }
  }

  /** Free space on a canvas, next to its newest node. */
  private freeSpot(canvas: Canvas, size: { width: number; height: number } = { width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT }): NodeRect {
    const nodes = canvas.layout.nodes;
    const last = nodes.at(-1);
    const center = last
      ? { x: last.x + last.width / 2, y: last.y + last.height / 2 }
      : { x: size.width / 2, y: size.height / 2 };
    return findFreeRect(nodes, center, { width: size.width, height: size.height });
  }
}

function centerOf(rect: NodeRect | { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
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

function isFolder(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}
