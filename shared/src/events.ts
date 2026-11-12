import { z } from 'zod';
import { type CanvasState, LayoutNode, Session, SessionName, SessionNote } from './entities';
import { Id } from './ids';

/**
 * Every change to canvas state is one of these events. The daemon applies an
 * event to its own state, saves it and broadcasts it; the browser applies the
 * same event to its copy with the same reducer.
 */
export const ChangeEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.created'), session: Session, node: LayoutNode }),
  z.object({ type: z.literal('session.renamed'), sessionId: Id, name: SessionName }),
  /** Moved off the canvas; the shell keeps running. */
  z.object({ type: z.literal('session.parked'), sessionId: Id }),
  z.object({ type: z.literal('session.restored'), sessionId: Id }),
  /** The shell ended by itself. */
  z.object({ type: z.literal('session.exited'), sessionId: Id }),
  /** A new shell was started for an exited session. */
  z.object({ type: z.literal('session.restarted'), sessionId: Id }),
  /** The foreground folder or command changed. */
  z.object({
    type: z.literal('session.activity'),
    sessionId: Id,
    cwd: z.string().nullable(),
    command: z.string().nullable(),
  }),
  z.object({ type: z.literal('session.noted'), sessionId: Id, note: SessionNote }),
  /** Ended for good and removed. */
  z.object({ type: z.literal('session.closed'), sessionId: Id }),
  z.object({ type: z.literal('node.updated'), node: LayoutNode }),
]);
export type ChangeEvent = z.infer<typeof ChangeEvent>;

function patchSession(state: CanvasState, sessionId: string, patch: Partial<Session>): CanvasState {
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
  };
}

/** Pure reducer: returns the state after `event`. Applying an event twice is harmless. */
export function applyEvent(state: CanvasState, event: ChangeEvent): CanvasState {
  switch (event.type) {
    case 'session.created':
      return {
        ...state,
        sessions: [...state.sessions.filter((s) => s.id !== event.session.id), event.session],
        layout: {
          nodes: [...state.layout.nodes.filter((n) => n.id !== event.node.id), event.node],
        },
      };
    case 'session.renamed':
      return patchSession(state, event.sessionId, { name: event.name });
    case 'session.parked':
      return patchSession(state, event.sessionId, { state: 'parked' });
    case 'session.restored':
    case 'session.restarted':
      return patchSession(state, event.sessionId, { state: 'open' });
    case 'session.exited':
      return patchSession(state, event.sessionId, { state: 'exited', command: null });
    case 'session.activity':
      return patchSession(state, event.sessionId, { cwd: event.cwd, command: event.command });
    case 'session.noted':
      return patchSession(state, event.sessionId, { note: event.note });
    case 'session.closed':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== event.sessionId),
        layout: { nodes: state.layout.nodes.filter((n) => n.sessionId !== event.sessionId) },
      };
    case 'node.updated':
      return {
        ...state,
        layout: {
          nodes: state.layout.nodes.map((n) => (n.id === event.node.id ? event.node : n)),
        },
      };
  }
}
