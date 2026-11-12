import { z } from 'zod';
import { type CanvasState, LayoutNode, Session, SessionName } from './entities';
import { Id } from './ids';

/**
 * Every change to canvas state is one of these events. The daemon applies an
 * event to its own state, saves it and broadcasts it; the browser applies the
 * same event to its copy with the same reducer.
 */
export const ChangeEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.created'), session: Session, node: LayoutNode }),
  z.object({ type: z.literal('session.renamed'), sessionId: Id, name: SessionName }),
  z.object({ type: z.literal('session.closed'), sessionId: Id }),
  z.object({ type: z.literal('node.updated'), node: LayoutNode }),
]);
export type ChangeEvent = z.infer<typeof ChangeEvent>;

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
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === event.sessionId ? { ...s, name: event.name } : s,
        ),
      };
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
