import { z } from 'zod';
import {
  Attention,
  AttentionState,
  CanvasState,
  Frame,
  FrameLabel,
  FrameRect,
  LayoutNode,
  NodeColor,
  NodeRect,
  NoteEntry,
  NoteText,
  Session,
  SessionName,
  SessionNote,
} from './entities';
import { ChangeEvent } from './events';
import { Id } from './ids';
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
  /** POST: ask every open canvas to bring this session into view. Answers with how many are open. */
  showSession: (sessionId: string) => `/api/v1/sessions/${sessionId}/show`,
  /** POST: the user is looking at this session now. */
  seenSession: (sessionId: string) => `/api/v1/sessions/${sessionId}/seen`,
  /** GET: the session's visible screen as plain text. */
  snapshot: (sessionId: string) => `/api/v1/sessions/${sessionId}/snapshot`,
  node: (nodeId: string) => `/api/v1/nodes/${nodeId}`,
  frames: '/api/v1/frames',
  frame: (frameId: string) => `/api/v1/frames/${frameId}`,
  /** GET `?q=`: lines in the terminal history of running sessions that contain the text. */
  search: '/api/v1/search',
  /** POST: scroll the session's terminal back to where a piece of text appears. */
  revealInSession: (sessionId: string) => `/api/v1/sessions/${sessionId}/reveal`,
  /** POST: append an entry to the session's note log, as the user. */
  sessionNotes: (sessionId: string) => `/api/v1/sessions/${sessionId}/notes`,
  /**
   * Routes for programs running inside a session. They authenticate with a
   * bearer token and may only act on what that token allows.
   */
  agent: {
    /** PUT: say whether the session wants the user. */
    attention: (sessionId: string) => `/v1/sessions/${sessionId}/attention`,
    /** POST: append an entry to the session's note log. */
    notes: (sessionId: string) => `/v1/sessions/${sessionId}/notes`,
  },
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

/** Agents the canvas knows how to start. */
export const AgentKind = z.enum(['claude-code']);
export type AgentKind = z.infer<typeof AgentKind>;

export const CreateSessionRequest = z.object({
  name: SessionName.optional(),
  /** Where to put the new node. The daemon picks a spot when omitted. */
  rect: NodeRect.optional(),
  /** Start an agent in the new session, wired up to report to the canvas. */
  agent: AgentKind.optional(),
  /** With `agent`: carry on the most recent conversation for the folder instead of starting a new one. */
  agentContinue: z.boolean().optional(),
  /**
   * With `agent`: arguments for the agent, in place of the default. For
   * example `["--resume", "<id>", "--fork-session"]`.
   */
  agentArgs: z.array(z.string().min(1).max(500)).max(40).optional(),
  /** Folder to start in (absolute path). The default folder is used when omitted. */
  cwd: z.string().startsWith('/').max(4096).optional(),
  /** A line to type into the new session once its shell is ready. */
  command: z.string().trim().min(1).max(4000).optional(),
  /** Make `name` unique by adding a number when a session already has it. */
  uniqueName: z.boolean().optional(),
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

export const SetAttentionRequest = z.object({
  state: AttentionState,
  message: z.string().trim().max(500).optional(),
});
export type SetAttentionRequest = z.infer<typeof SetAttentionRequest>;

export const AppendNoteRequest = z.object({
  text: NoteText,
  kind: NoteEntry.shape.kind.optional(),
});
export type AppendNoteRequest = z.infer<typeof AppendNoteRequest>;

/** Answer to appending a note. `entry` is null when the daemon chose not to keep it. */
export const AppendNoteResponse = z.object({ entry: NoteEntry.nullable() });
export type AppendNoteResponse = z.infer<typeof AppendNoteResponse>;

export const AttentionResponse = Attention;

/** Environment variables every session's shell is given, for programs that talk to the daemon. */
export const SESSION_ENV = {
  url: 'AUBERGINE_URL',
  sessionId: 'AUBERGINE_SESSION_ID',
  token: 'AUBERGINE_TOKEN',
} as const;

export const ShowResponse = z.object({
  /** How many canvases are open and were told. Zero means nobody saw it. */
  viewers: z.number().int().min(0),
});
export type ShowResponse = z.infer<typeof ShowResponse>;

/** Query parameter that makes a freshly opened canvas go to one session: `/?session=<id>`. */
export const SHOW_PARAM = 'session';

export const SearchQuery = z.object({ q: z.string().trim().min(2).max(200) });

/** One matching line of terminal history, with the lines around it. */
export const SearchHit = z.object({
  sessionId: Id,
  text: z.string(),
  before: z.array(z.string()),
  after: z.array(z.string()),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchResponse = z.object({
  hits: z.array(SearchHit),
  /** True when there were more matches than are returned. */
  truncated: z.boolean(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const RevealRequest = z.object({ text: z.string().min(1).max(200) });
export type RevealRequest = z.infer<typeof RevealRequest>;

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
  /** Not a change of state: a request to bring a session into view and focus it. */
  z.object({ type: z.literal('show'), sessionId: Id }),
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
