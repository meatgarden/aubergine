import { z } from 'zod';
import {
  CanvasState,
  Frame,
  FrameLabel,
  FrameRect,
  LayoutNode,
  NodeColor,
  NodeRect,
  Session,
  SessionName,
  SessionNote,
} from './entities';
import { ChangeEvent } from './events';
import { Settings } from './settings';

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
  /** POST: take the session off the canvas, keeping its shell. */
  parkSession: (sessionId: string) => `/api/v1/sessions/${sessionId}/park`,
  /** POST: put a parked session back on the canvas. */
  restoreSession: (sessionId: string) => `/api/v1/sessions/${sessionId}/restore`,
  /** POST: start a new shell for a session whose shell exited. */
  restartSession: (sessionId: string) => `/api/v1/sessions/${sessionId}/restart`,
  /** POST: the user is looking at this session now. */
  seenSession: (sessionId: string) => `/api/v1/sessions/${sessionId}/seen`,
  /** GET: the session's visible screen as plain text. */
  snapshot: (sessionId: string) => `/api/v1/sessions/${sessionId}/snapshot`,
  node: (nodeId: string) => `/api/v1/nodes/${nodeId}`,
  frames: '/api/v1/frames',
  frame: (frameId: string) => `/api/v1/frames/${frameId}`,
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
  settings: Settings,
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

/** PATCH body: any of the fields the user can edit. */
export const UpdateSessionRequest = z
  .object({ name: SessionName, note: SessionNote })
  .partial()
  .refine((body) => body.name !== undefined || body.note !== undefined, 'Nothing to update');
export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequest>;

/** PUT body for a node: where it is, and optionally its color. */
export const UpdateNodeRequest = NodeRect.extend({ color: NodeColor.optional() });
export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequest>;

export const CreateFrameRequest = z.object({ label: FrameLabel.optional(), rect: FrameRect });
export type CreateFrameRequest = z.infer<typeof CreateFrameRequest>;

/** PUT body for a frame. With `carry`, nodes lying inside the frame move with it. */
export const UpdateFrameRequest = FrameRect.extend({
  label: FrameLabel.optional(),
  color: NodeColor.optional(),
  carry: z.boolean().optional(),
});
export type UpdateFrameRequest = z.infer<typeof UpdateFrameRequest>;

export const FrameResponse = Frame;

export const SnapshotResponse = z.object({ text: z.string() });
export type SnapshotResponse = z.infer<typeof SnapshotResponse>;

export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
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
