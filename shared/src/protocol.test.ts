import { describe, expect, it } from 'vitest';
import {
  CanvasState,
  ChangeEvent,
  CreateSessionRequest,
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

function fixture(): { state: CanvasState; session: Session; node: LayoutNode } {
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

describe('entities', () => {
  it('builds a valid initial state with a default hierarchy', () => {
    const state = createInitialState();
    expect(CanvasState.safeParse(state).success).toBe(true);
    expect(state.workspace.organizationId).toBe(state.organization.id);
    expect(state.project.workspaceId).toBe(state.workspace.id);
  });

  it('requires a projectId on sessions', () => {
    const { state, session } = fixture();
    const { projectId: _omit, ...withoutProject } = session;
    const bad = { ...state, sessions: [withoutProject] };
    expect(CanvasState.safeParse(bad).success).toBe(false);
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
    const { session, node } = fixture();
    const message = { type: 'event', event: { type: 'session.created', session, node } };
    expect(EventsServerMessage.safeParse(message).success).toBe(true);
    expect(EventsServerMessage.safeParse({ type: 'hello', protocolVersion: 99 }).success).toBe(
      false,
    );
  });
});

describe('applyEvent', () => {
  it('creates, renames, moves and closes a session', () => {
    const { state, session, node } = fixture();

    const created = applyEvent(state, { type: 'session.created', session, node });
    expect(created.sessions).toEqual([session]);
    expect(created.layout.nodes).toEqual([node]);
    expect(applyEvent(created, { type: 'session.created', session, node })).toEqual(created);

    const renamed = applyEvent(created, {
      type: 'session.renamed',
      sessionId: session.id,
      name: 'deploy',
    });
    expect(renamed.sessions[0]?.name).toBe('deploy');

    const moved = applyEvent(renamed, { type: 'node.updated', node: { ...node, x: 300 } });
    expect(moved.layout.nodes[0]?.x).toBe(300);
    expect(moved.sessions).toEqual(renamed.sessions);

    const closed = applyEvent(moved, { type: 'session.closed', sessionId: session.id });
    expect(closed.sessions).toEqual([]);
    expect(closed.layout.nodes).toEqual([]);
    expect(CanvasState.safeParse(closed).success).toBe(true);
  });

  it('parks, restores, exits and restarts a session without touching its node', () => {
    const { state, session, node } = fixture();
    const id = session.id;
    let current = applyEvent(state, { type: 'session.created', session, node });
    current = applyEvent(current, { type: 'session.activity', sessionId: id, cwd: '/tmp', command: 'vim' });
    expect(current.sessions[0]).toMatchObject({ cwd: '/tmp', command: 'vim' });

    current = applyEvent(current, { type: 'session.parked', sessionId: id });
    expect(current.sessions[0]?.state).toBe('parked');
    expect(current.layout.nodes).toEqual([node]);
    current = applyEvent(current, { type: 'session.restored', sessionId: id });
    expect(current.sessions[0]?.state).toBe('open');

    current = applyEvent(current, { type: 'session.exited', sessionId: id });
    expect(current.sessions[0]).toMatchObject({ state: 'exited', cwd: '/tmp', command: null });
    current = applyEvent(current, { type: 'session.restarted', sessionId: id });
    expect(current.sessions[0]?.state).toBe('open');

    current = applyEvent(current, { type: 'session.noted', sessionId: id, note: '# billing bug' });
    expect(current.sessions[0]?.note).toBe('# billing bug');
  });

  it('records what the shell reports', () => {
    const { state, session, node } = fixture();
    let current = applyEvent(state, { type: 'session.created', session, node });
    const busy = { ...NO_STATUS, state: 'busy' as const, commandLine: 'make test', startedAt: '2026-01-01T00:00:05.000Z' };
    current = applyEvent(current, { type: 'session.status', sessionId: session.id, status: busy });
    expect(current.sessions[0]?.status).toEqual(busy);
    current = applyEvent(current, { type: 'session.exited', sessionId: session.id });
    expect(current.sessions[0]?.status.state).toBeNull();
  });

  it('appends note entries in order, once each, and records attention', () => {
    const { state, session, node } = fixture();
    const id = session.id;
    let current = applyEvent(state, { type: 'session.created', session, node });
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

  it('reads sessions saved before these fields existed', () => {
    const { state, session } = fixture();
    const { state: _s, cwd: _c, command: _m, note: _n, status: _t, attention: _a, noteLog: _l, ...old } = session;
    const parsed = CanvasState.parse({ ...state, sessions: [old] });
    expect(parsed.sessions[0]).toMatchObject({
      state: 'open',
      cwd: null,
      command: null,
      note: '',
      status: NO_STATUS,
      attention: NO_ATTENTION,
      noteLog: [],
    });
  });

  it('creates, updates and removes frames, leaving nodes alone', () => {
    const { state, session, node } = fixture();
    const frame: Frame = { id: newId(), label: 'API', x: -40, y: -40, width: 900, height: 600, color: 'blue' };
    let current = applyEvent(state, { type: 'session.created', session, node });
    current = applyEvent(current, { type: 'frame.created', frame });
    expect(current.layout.frames).toEqual([frame]);
    current = applyEvent(current, { type: 'frame.updated', frame: { ...frame, label: 'Backend' } });
    expect(current.layout.frames[0]?.label).toBe('Backend');
    expect(current.layout.nodes).toEqual([node]);
    current = applyEvent(current, { type: 'node.updated', node: { ...node, color: 'green' } });
    expect(current.layout.frames).toHaveLength(1);
    current = applyEvent(current, { type: 'frame.removed', frameId: frame.id });
    expect(current.layout.frames).toEqual([]);
    expect(current.layout.nodes[0]?.color).toBe('green');
  });

  it('reads layouts saved before frames and colors existed', () => {
    const { state, node } = fixture();
    const { color: _c, ...oldNode } = node;
    const parsed = CanvasState.parse({ ...state, sessions: [], layout: { nodes: [oldNode] } });
    expect(parsed.layout.frames).toEqual([]);
    expect(parsed.layout.nodes[0]?.color).toBe('none');
  });

  it('knows which nodes lie inside a frame', () => {
    const frame = { x: 0, y: 0, width: 1000, height: 600 };
    const inside = { x: 10, y: 10, width: 720, height: 440 };
    const straddling = { x: 500, y: 10, width: 720, height: 440 };
    const outside = { x: 2000, y: 0, width: 720, height: 440 };
    expect(nodesInside(frame, [inside, straddling, outside])).toEqual([inside]);
  });

  it('does not mutate the previous state', () => {
    const { state, session, node } = fixture();
    const frozen = structuredClone(state);
    applyEvent(state, { type: 'session.created', session, node });
    expect(state).toEqual(frozen);
  });

  it('only accepts known event types', () => {
    expect(ChangeEvent.safeParse({ type: 'session.exploded', sessionId: newId() }).success).toBe(
      false,
    );
  });
});
