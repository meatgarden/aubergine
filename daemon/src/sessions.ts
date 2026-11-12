import os from 'node:os';
import {
  Id,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  newId,
  type LayoutNode,
  type NodeRect,
  type RuntimeStatus,
  type Session,
} from '@aubergine/shared';
import type { Canvas } from './canvas';
import type { SessionRuntime } from './runtime/runtime';

export class NotFoundError extends Error {}
export class RuntimeUnavailableError extends Error {}

const GAP = 40;

/**
 * The operations behind the API. Each one talks to the runtime where a shell
 * is involved and records the result as a change event.
 */
export class Sessions {
  private runtimeStatus: RuntimeStatus | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly runtime: SessionRuntime,
  ) {}

  async status(): Promise<RuntimeStatus> {
    // A usable runtime stays usable; keep asking while it is not, so the
    // error page clears once the user has installed what was missing.
    if (this.runtimeStatus?.status !== 'ok') this.runtimeStatus = await this.runtime.check();
    return this.runtimeStatus;
  }

  /**
   * Lines the saved state up with what is really running: shells that
   * outlived the last daemon process are kept as they are, saved sessions
   * whose shell is gone get a fresh one, and running sessions nobody
   * remembers are put back on the canvas.
   */
  async reconcile(): Promise<void> {
    if ((await this.status()).status !== 'ok') return;
    const running = new Set((await this.runtime.list()).map((s) => s.id));

    for (const session of this.canvas.state.sessions) {
      if (!running.has(session.id)) await this.runtime.create({ id: session.id, cwd: os.homedir() });
    }

    const known = new Set(this.canvas.state.sessions.map((s) => s.id));
    for (const id of running) {
      if (known.has(id) || !Id.safeParse(id).success) continue;
      this.record(id, 'Recovered terminal', undefined);
    }
  }

  async create(input: { name?: string | undefined; rect?: NodeRect | undefined }): Promise<{ session: Session; node: LayoutNode }> {
    const status = await this.status();
    if (status.status !== 'ok') throw new RuntimeUnavailableError(`tmux is ${status.status}`);
    const id = newId();
    await this.runtime.create({ id, cwd: os.homedir() });
    return this.record(id, input.name, input.rect);
  }

  rename(sessionId: string, name: string): Session {
    const session = this.find(sessionId);
    this.canvas.emit({ type: 'session.renamed', sessionId, name });
    return { ...session, name };
  }

  /** Ends the shell and removes the session and its node. */
  async close(sessionId: string): Promise<void> {
    this.find(sessionId);
    await this.runtime.kill(sessionId);
    this.forget(sessionId);
  }

  /** Called when a shell turns out to be gone (for example the user typed `exit`). */
  forget(sessionId: string): void {
    if (this.canvas.state.sessions.some((s) => s.id === sessionId)) {
      this.canvas.emit({ type: 'session.closed', sessionId });
    }
  }

  updateNode(nodeId: string, rect: NodeRect): LayoutNode {
    const existing = this.canvas.state.layout.nodes.find((n) => n.id === nodeId);
    if (!existing) throw new NotFoundError(`No node ${nodeId}`);
    const node: LayoutNode = { ...existing, ...rect };
    this.canvas.emit({ type: 'node.updated', node });
    return node;
  }

  has(sessionId: string): boolean {
    return this.canvas.state.sessions.some((s) => s.id === sessionId);
  }

  private find(sessionId: string): Session {
    const session = this.canvas.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw new NotFoundError(`No session ${sessionId}`);
    return session;
  }

  private record(id: string, name: string | undefined, rect: NodeRect | undefined): { session: Session; node: LayoutNode } {
    const state = this.canvas.state;
    const session: Session = {
      id,
      projectId: state.project.id,
      name: name ?? this.nextName(),
      createdAt: new Date().toISOString(),
    };
    const node: LayoutNode = { id: newId(), sessionId: id, ...(rect ?? this.freeSpot()) };
    this.canvas.emit({ type: 'session.created', session, node });
    return { session, node };
  }

  private nextName(): string {
    const names = new Set(this.canvas.state.sessions.map((s) => s.name));
    for (let n = names.size + 1; ; n++) {
      if (!names.has(`Terminal ${n}`)) return `Terminal ${n}`;
    }
  }

  /** To the right of everything already on the canvas. */
  private freeSpot(): NodeRect {
    const nodes = this.canvas.state.layout.nodes;
    const size = { width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT };
    if (nodes.length === 0) return { x: 0, y: 0, ...size };
    const rightmost = nodes.reduce((a, b) => (a.x + a.width >= b.x + b.width ? a : b));
    return { x: rightmost.x + rightmost.width + GAP, y: rightmost.y, ...size };
  }
}
