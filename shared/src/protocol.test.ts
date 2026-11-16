import { describe, expect, it } from 'vitest';
import {
  AppState,
  ChangeEvent,
  ConversationId,
  CreateSessionRequest,
  Labels,
  canvasCounts,
  canvasOfNode,
  newCanvas,
  placeOfSession,
  sortedCanvases,
  type Canvas,
  DEFAULT_SETTINGS,
  NO_ATTENTION,
  NO_STATUS,
  EventsServerMessage,
  NODE_MIN_WIDTH,
  PROTOCOL_VERSION,
  UpdateSessionRequest,
  StateResponse,
  TerminalClientMessage,
  TerminalServerMessage,
  TerminalSize,
  UpdateNodeRequest,
  applyEvent,
  createInitialState,
  needsUser,
  newId,
  nodesInside,
  type Frame,
  type LayoutNode,
  type NoteEntry,
  type Session,
} from './index';

function fixture(): { state: AppState; session: Session; node: LayoutNode } {
  const state = createInitialState(new Date('2026-01-01T00:00:00Z'));
  const session: Session = {
    id: newId(),
    projectId: state.project.id,
    name: 'build',
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
    recap: null,
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
  };
  const node: LayoutNode = {
    id: newId(),
    sessionId: session.id,
    x: 10,
    y: 20,
    width: 720,
    height: 440,
    color: 'none',
  };
  return { state, session, node };
}

/** The first canvas of a state. */
const main = (state: AppState): Canvas => {
  const canvas = sortedCanvases(state)[0];
  if (!canvas) throw new Error('no canvas');
  return canvas;
};

describe('entities', () => {
  it('builds a valid initial state with a default hierarchy', () => {
    const state = createInitialState();
    expect(AppState.safeParse(state).success).toBe(true);
    expect(state.workspace.organizationId).toBe(state.organization.id);
    expect(state.project.workspaceId).toBe(state.workspace.id);
  });

  it('requires a projectId on sessions', () => {
    const { state, session } = fixture();
    const { projectId: _omit, ...withoutProject } = session;
    const bad = { ...state, sessions: [withoutProject] };
    expect(AppState.safeParse(bad).success).toBe(false);
  });
});

describe('HTTP schemas', () => {
  it('accepts a full state response and rejects another protocol version', () => {
    const { state } = fixture();
    const body = {
      protocolVersion: PROTOCOL_VERSION,
      runtime: { status: 'ok', version: '3.8', minVersion: '3.2' },
      settings: DEFAULT_SETTINGS,
      state,
      defaultCanvasId: main(state).id,
    };
    expect(StateResponse.safeParse(body).success).toBe(true);
    expect(StateResponse.safeParse({ ...body, protocolVersion: 2 }).success).toBe(false);
  });

  it('validates create, rename and node update requests', () => {
    expect(CreateSessionRequest.safeParse({}).success).toBe(true);
    expect(CreateSessionRequest.parse({ name: '  logs  ' }).name).toBe('logs');
    expect(UpdateSessionRequest.safeParse({ name: '   ' }).success).toBe(false);
    expect(UpdateSessionRequest.safeParse({}).success).toBe(false);
    expect(UpdateSessionRequest.safeParse({ note: 'text' }).success).toBe(true);
    expect(UpdateSessionRequest.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
    expect(UpdateNodeRequest.safeParse({ x: 0, y: 0, width: 800, height: 500 }).success).toBe(true);
    expect(
      UpdateNodeRequest.safeParse({ x: 0, y: 0, width: NODE_MIN_WIDTH - 1, height: 500 }).success,
    ).toBe(false);
    expect(UpdateNodeRequest.safeParse({ x: NaN, y: 0, width: 800, height: 500 }).success).toBe(
      false,
    );
  });
});

describe('WebSocket schemas', () => {
  it('parses terminal client messages and rejects unknown ones', () => {
    expect(TerminalClientMessage.parse({ t: 'input', data: 'ls\r' })).toEqual({
      t: 'input',
      data: 'ls\r',
    });
    expect(TerminalClientMessage.safeParse({ t: 'resize', cols: 80, rows: 24 }).success).toBe(true);
    expect(TerminalClientMessage.safeParse({ t: 'resize', cols: 0, rows: 24 }).success).toBe(false);
    expect(TerminalClientMessage.safeParse({ t: 'exec', cmd: 'ls' }).success).toBe(false);
  });

  it('coerces terminal sizes from query strings', () => {
    expect(TerminalSize.parse({ cols: '120', rows: '40' })).toEqual({ cols: 120, rows: 40 });
    expect(TerminalSize.safeParse({ cols: 'wide', rows: '40' }).success).toBe(false);
  });

  it('parses server messages', () => {
    expect(TerminalServerMessage.safeParse({ t: 'exit', reason: 'session_ended' }).success).toBe(
      true,
    );
    const { state, session, node } = fixture();
    const message = { type: 'event', event: { type: 'session.created', canvasId: main(state).id, session, node } };
    expect(EventsServerMessage.safeParse(message).success).toBe(true);
    expect(EventsServerMessage.safeParse({ type: 'hello', protocolVersion: 99 }).success).toBe(
      false,
    );
  });
});

describe('applyEvent', () => {
  it('creates, renames, moves and closes a session', () => {
    const { state, session, node } = fixture();

    const created = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    expect(created.sessions).toEqual([session]);
    expect(main(created).layout.nodes).toEqual([node]);
    expect(applyEvent(created, { type: 'session.created', canvasId: main(state).id, session, node })).toEqual(created);

    const renamed = applyEvent(created, {
      type: 'session.renamed',
      sessionId: session.id,
      name: 'deploy',
    });
    expect(renamed.sessions[0]?.name).toBe('deploy');

    const moved = applyEvent(renamed, { type: 'node.updated', canvasId: main(state).id, node: { ...node, x: 300 } });
    expect(main(moved).layout.nodes[0]?.x).toBe(300);
    expect(moved.sessions).toEqual(renamed.sessions);

    const closed = applyEvent(moved, { type: 'session.closed', sessionId: session.id });
    expect(closed.sessions).toEqual([]);
    expect(main(closed).layout.nodes).toEqual([]);
    expect(AppState.safeParse(closed).success).toBe(true);
  });

  it('parks, restores, exits and restarts a session', () => {
    const { state, session, node } = fixture();
    const id = session.id;
    let current = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    current = applyEvent(current, { type: 'session.activity', sessionId: id, cwd: '/tmp', command: 'vim' });
    expect(current.sessions[0]).toMatchObject({ cwd: '/tmp', command: 'vim' });

    // Parking takes it off its canvas, and it remembers where it sat.
    current = applyEvent(current, { type: 'session.parked', sessionId: id });
    expect(current.sessions[0]?.state).toBe('parked');
    expect(main(current).layout.nodes).toEqual([]);
    expect(current.sessions[0]?.parkedFrom).toEqual({
      canvasId: main(state).id,
      rect: { x: node.x, y: node.y, width: node.width, height: node.height },
      color: 'none',
    });
    expect(applyEvent(current, { type: 'session.parked', sessionId: id })).toEqual(current);
    current = applyEvent(current, { type: 'session.restored', sessionId: id, canvasId: main(state).id, node });
    expect(current.sessions[0]).toMatchObject({ state: 'open', parkedFrom: null, peopleOnly: false, typedBy: null, recap: null });
    expect(main(current).layout.nodes).toEqual([node]);

    current = applyEvent(current, { type: 'session.exited', sessionId: id });
    expect(current.sessions[0]).toMatchObject({ state: 'exited', cwd: '/tmp', command: null });
    current = applyEvent(current, { type: 'session.restarted', sessionId: id });
    expect(current.sessions[0]?.state).toBe('open');

    current = applyEvent(current, { type: 'session.noted', sessionId: id, note: '# billing bug' });
    expect(current.sessions[0]?.note).toBe('# billing bug');
  });

  it('records what the shell reports', () => {
    const { state, session, node } = fixture();
    let current = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    const busy = { ...NO_STATUS, state: 'busy' as const, commandLine: 'make test', startedAt: '2026-01-01T00:00:05.000Z' };
    current = applyEvent(current, { type: 'session.status', sessionId: session.id, status: busy });
    expect(current.sessions[0]?.status).toEqual(busy);
    current = applyEvent(current, { type: 'session.exited', sessionId: session.id });
    expect(current.sessions[0]?.status.state).toBeNull();
  });

  it('appends note entries in order, once each, and records attention', () => {
    const { state, session, node } = fixture();
    const id = session.id;
    let current = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    const entry: NoteEntry = { id: newId(), at: '2026-01-01T00:00:00.000Z', author: 'agent', kind: 'prompt', text: 'fix the build' };
    current = applyEvent(current, { type: 'session.note.appended', sessionId: id, entry });
    current = applyEvent(current, { type: 'session.note.appended', sessionId: id, entry });
    expect(current.sessions[0]?.noteLog).toEqual([entry]);
    expect(current.sessions[0]?.note).toBe('');

    const waiting = { state: 'waiting' as const, message: 'Allow the edit?', at: '2026-01-01T00:00:01.000Z' };
    current = applyEvent(current, { type: 'session.attention', sessionId: id, attention: waiting });
    expect(needsUser(current.sessions[0]!.attention)).toBe(true);
    expect(needsUser({ ...waiting, state: 'working' })).toBe(false);
  });

  it('remembers the agent and its conversation, also after the shell has ended', () => {
    const { state, session, node } = fixture();
    let current = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    const agent = { kind: 'claude-code' as const, conversationId: '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee' };
    current = applyEvent(current, { type: 'session.agent', sessionId: session.id, agent });
    current = applyEvent(current, { type: 'session.exited', sessionId: session.id });
    expect(current.sessions[0]?.agent).toEqual(agent);
  });

  it('only accepts conversation IDs that are safe on a command line', () => {
    expect(ConversationId.safeParse('0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee').success).toBe(true);
    for (const bad of ['', 'short', 'abc; rm -rf ~', '$(whoami)-aaaaaaaa', "aaaaaaaa'bbbb", '-leading-dash-id', 'a'.repeat(80)]) {
      expect(ConversationId.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('reads sessions saved before these fields existed', () => {
    const { state, session } = fixture();
    const { state: _s, cwd: _c, command: _m, note: _n, status: _t, attention: _a, noteLog: _l, agent: _g, ...old } = session;
    const parsed = AppState.parse({ ...state, sessions: [old] });
    expect(parsed.sessions[0]).toMatchObject({
      state: 'open',
      cwd: null,
      command: null,
      note: '',
      status: NO_STATUS,
      attention: NO_ATTENTION,
      noteLog: [],
      agent: null,
      parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null,
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
    });
  });

  it('creates, updates and removes frames, leaving nodes alone', () => {
    const { state, session, node } = fixture();
    const frame: Frame = { id: newId(), label: 'API', x: -40, y: -40, width: 900, height: 600, color: 'blue' };
    let current = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    current = applyEvent(current, { type: 'frame.created', canvasId: main(state).id, frame });
    expect(main(current).layout.frames).toEqual([frame]);
    current = applyEvent(current, { type: 'frame.updated', canvasId: main(state).id, frame: { ...frame, label: 'Backend' } });
    expect(main(current).layout.frames[0]?.label).toBe('Backend');
    expect(main(current).layout.nodes).toEqual([node]);
    current = applyEvent(current, { type: 'node.updated', canvasId: main(state).id, node: { ...node, color: 'green' } });
    expect(main(current).layout.frames).toHaveLength(1);
    current = applyEvent(current, { type: 'frame.removed', canvasId: main(state).id, frameId: frame.id });
    expect(main(current).layout.frames).toEqual([]);
    expect(main(current).layout.nodes[0]?.color).toBe('green');
  });

  it('reads layouts saved before frames and colors existed', () => {
    const { state, node } = fixture();
    const { color: _c, ...oldNode } = node;
    const parsed = AppState.parse({ ...state, sessions: [], canvases: [{ ...main(state), layout: { nodes: [oldNode] } }] });
    expect(main(parsed).layout.frames).toEqual([]);
    expect(main(parsed).layout.nodes[0]?.color).toBe('none');
  });

  it('knows which nodes lie inside a frame', () => {
    const frame = { x: 0, y: 0, width: 1000, height: 600 };
    const inside = { x: 10, y: 10, width: 720, height: 440 };
    const straddling = { x: 500, y: 10, width: 720, height: 440 };
    const outside = { x: 2000, y: 0, width: 720, height: 440 };
    expect(nodesInside(frame, [inside, straddling, outside])).toEqual([inside]);
  });

  it('adds, changes and orders canvases', () => {
    const { state } = fixture();
    expect(state.canvases.map((c) => c.name)).toEqual(['Main']);
    const second = newCanvas(state.project.id, 'Deploys', 1);
    let current = applyEvent(state, { type: 'canvas.created', canvas: second });
    expect(applyEvent(current, { type: 'canvas.created', canvas: second })).toEqual(current);
    current = applyEvent(current, {
      type: 'canvas.updated',
      canvasId: second.id,
      changes: { name: 'Releases', color: 'green', order: -1, labels: { ticket: '123' } },
    });
    expect(sortedCanvases(current).map((c) => c.name)).toEqual(['Releases', 'Main']);
    expect(sortedCanvases(current)[0]).toMatchObject({ color: 'green', labels: { ticket: '123' } });
    expect(AppState.safeParse(current).success).toBe(true);
  });

  it('moves a session between canvases, keeping it on exactly one', () => {
    const { state, session, node } = fixture();
    const second = newCanvas(state.project.id, 'Deploys', 1);
    let current = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    current = applyEvent(current, { type: 'canvas.created', canvas: second });
    const there = { ...node, x: 900 };
    current = applyEvent(current, { type: 'session.moved', sessionId: session.id, canvasId: second.id, node: there });
    expect(main(current).layout.nodes).toEqual([]);
    expect(placeOfSession(current, session.id)).toMatchObject({ canvas: { id: second.id }, node: there });
    expect(canvasOfNode(current, node.id)?.canvas.id).toBe(second.id);
    // The session itself is untouched.
    expect(current.sessions).toEqual([session]);
    // Moving to a canvas that does not exist changes nothing.
    expect(applyEvent(current, { type: 'session.moved', sessionId: session.id, canvasId: newId(), node })).toEqual(current);
  });

  it('parks whatever is still on a canvas when it is removed, and never removes the last one', () => {
    const { state, session, node } = fixture();
    const second = newCanvas(state.project.id, 'Deploys', 1);
    let current = applyEvent(state, { type: 'canvas.created', canvas: second });
    current = applyEvent(current, { type: 'session.created', canvasId: second.id, session, node });
    current = applyEvent(current, { type: 'canvas.removed', canvasId: second.id });
    expect(current.canvases.map((c) => c.name)).toEqual(['Main']);
    expect(current.sessions[0]).toMatchObject({ state: 'parked', parkedFrom: { canvasId: second.id } });
    expect(applyEvent(current, { type: 'canvas.removed', canvasId: main(current).id })).toEqual(current);
  });

  it('counts sessions, waiting ones and unread ones per canvas', () => {
    const { state, session, node } = fixture();
    const waiting = { ...session, attention: { state: 'waiting' as const, message: null, at: '2026-01-01T00:00:00.000Z' } };
    const unread = { ...session, id: newId(), status: { ...NO_STATUS, unread: true } };
    let current = applyEvent(state, { type: 'session.created', canvasId: main(state).id, session: waiting, node });
    current = applyEvent(current, {
      type: 'session.created',
      canvasId: main(state).id,
      session: unread,
      node: { ...node, id: newId(), sessionId: unread.id },
    });
    expect(canvasCounts(current, main(current))).toEqual({ sessions: 2, waiting: 1, unread: 1 });
    const empty = newCanvas(state.project.id, 'Empty', 1);
    expect(canvasCounts(current, empty)).toEqual({ sessions: 0, waiting: 0, unread: 0 });
  });

  it('accepts a few short labels and refuses odd keys or too many', () => {
    expect(Labels.safeParse({ ticket: '123', 'owner/team': 'build-bot' }).success).toBe(true);
    expect(Labels.safeParse({ 'has space': 'x' }).success).toBe(false);
    expect(Labels.safeParse({ ok: 'x'.repeat(300) }).success).toBe(false);
    expect(Labels.safeParse(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']))).success).toBe(false);
  });

  it('does not mutate the previous state', () => {
    const { state, session, node } = fixture();
    const frozen = structuredClone(state);
    applyEvent(state, { type: 'session.created', canvasId: main(state).id, session, node });
    expect(state).toEqual(frozen);
  });

  it('only accepts known event types', () => {
    expect(ChangeEvent.safeParse({ type: 'session.exploded', sessionId: newId() }).success).toBe(
      false,
    );
  });
});
