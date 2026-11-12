import { z } from 'zod';
import { CanvasState, LayoutNode, NodeRect, Session, SessionName } from './entities';
import { ChangeEvent } from './events';

/**
 * The wire protocol between the browser and the daemon. Bump the version and
 * the path prefixes together when a change is not backwards compatible.
 */
export const PROTOCOL_VERSION = 1;

export const paths = {
  /** Exchanges the access token for a cookie: `GET /auth?token=...`. */
  auth: '/auth',
  state: '/api/v1/state',
  sessions: '/api/v1/sessions',
  session: (sessionId: string) => `/api/v1/sessions/${sessionId}`,
  node: (nodeId: string) => `/api/v1/nodes/${nodeId}`,
  /** WebSocket: stream of change events. */
  events: '/ws/v1/events',
  /** WebSocket: one terminal viewer. Query: `cols`, `rows`. */
  terminal: (sessionId: string) => `/ws/v1/terminal/${sessionId}`,
} as const;

/* ---------- HTTP ---------- */

export const RuntimeStatus = z.object({
  status: z.enum(['ok', 'missing', 'too_old']),
  /** Version found on this machine, if any. */
  version: z.string().nullable(),
  minVersion: z.string(),
});
export type RuntimeStatus = z.infer<typeof RuntimeStatus>;

export const StateResponse = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  runtime: RuntimeStatus,
  state: CanvasState,
});
export type StateResponse = z.infer<typeof StateResponse>;

export const CreateSessionRequest = z.object({
  name: SessionName.optional(),
  /** Where to put the new node. The daemon picks a spot when omitted. */
  rect: NodeRect.optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.object({ session: Session, node: LayoutNode });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const RenameSessionRequest = z.object({ name: SessionName });
export type RenameSessionRequest = z.infer<typeof RenameSessionRequest>;

export const UpdateNodeRequest = NodeRect;
export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequest>;

export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'runtime_unavailable',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.object({
  error: z.object({ code: ErrorCode, message: z.string() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/* ---------- Events WebSocket (daemon → browser, JSON text frames) ---------- */

export const EventsServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), protocolVersion: z.literal(PROTOCOL_VERSION) }),
  z.object({ type: z.literal('event'), event: ChangeEvent }),
]);
export type EventsServerMessage = z.infer<typeof EventsServerMessage>;

/* ---------- Terminal WebSocket ---------- */

export const TerminalSize = z.object({
  cols: z.coerce.number().int().min(2).max(1000),
  rows: z.coerce.number().int().min(2).max(500),
});
export type TerminalSize = z.infer<typeof TerminalSize>;

/** Browser → daemon, JSON text frames. */
export const TerminalClientMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('input'), data: z.string().max(1_000_000) }),
  z.object({ t: z.literal('resize'), cols: TerminalSize.shape.cols, rows: TerminalSize.shape.rows }),
]);
export type TerminalClientMessage = z.infer<typeof TerminalClientMessage>;

/**
 * Daemon → browser. Terminal output travels as binary frames (raw bytes);
 * JSON text frames carry these control messages.
 */
export const TerminalServerMessage = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('exit'),
    /** `session_ended`: the shell is gone. `detached`: this viewer was dropped; reconnecting may work. */
    reason: z.enum(['session_ended', 'detached']),
  }),
]);
export type TerminalServerMessage = z.infer<typeof TerminalServerMessage>;

/** WebSocket close codes used by the daemon. */
export const CLOSE_SESSION_ENDED = 4001;
export const CLOSE_BAD_MESSAGE = 4002;
