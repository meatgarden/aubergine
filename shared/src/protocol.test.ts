import { describe, expect, it } from 'vitest';
import {
  CanvasState,
  ChangeEvent,
  CreateSessionRequest,
  EventsServerMessage,
  NODE_MIN_WIDTH,
  PROTOCOL_VERSION,
  RenameSessionRequest,
  StateResponse,
  TerminalClientMessage,
  TerminalServerMessage,
  TerminalSize,
  UpdateNodeRequest,
  applyEvent,
  createInitialState,
  newId,
  type LayoutNode,
  type Session,
} from './index';

function fixture(): { state: CanvasState; session: Session; node: LayoutNode } {
  const state = createInitialState(new Date('2026-01-01T00:00:00Z'));
  const session: Session = {
    id: newId(),
    projectId: state.project.id,
    name: 'build',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const node: LayoutNode = {
    id: newId(),
    sessionId: session.id,
    x: 10,
    y: 20,
    width: 720,
    height: 440,
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
      state,
    };
    expect(StateResponse.safeParse(body).success).toBe(true);
    expect(StateResponse.safeParse({ ...body, protocolVersion: 2 }).success).toBe(false);
  });

  it('validates create, rename and node update requests', () => {
    expect(CreateSessionRequest.safeParse({}).success).toBe(true);
    expect(CreateSessionRequest.parse({ name: '  logs  ' }).name).toBe('logs');
    expect(RenameSessionRequest.safeParse({ name: '   ' }).success).toBe(false);
    expect(RenameSessionRequest.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
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
