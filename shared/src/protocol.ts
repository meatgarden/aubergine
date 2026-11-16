import { z } from 'zod';
import {
  AgentInfo,
  AgentKind,
  Attention,
  Canvas,
  CanvasName,
  Labels,
  AttentionState,
  AppState,
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
  Tags,
} from './entities';
import { ActivityEntry, TokenView } from './tokens';
import { CanvasChanges, ChangeEvent } from './events';
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
  /** POST: start the session's agent again in the conversation it was last in. */
  resumeAgent: (sessionId: string) => `/api/v1/sessions/${sessionId}/resume-agent`,
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
    /** PUT: say which agent is running here and in which conversation. */
    report: (sessionId: string) => `/v1/sessions/${sessionId}/agent`,
  },
  /** GET: the user's open terminals that are not on the canvas. Read-only. */
  outside: '/api/v1/outside',
  /** POST: give one of those terminals a canvas session in its folder. */
  outsideAdd: '/api/v1/outside/add',
  /** POST: move the agent conversation of one of those terminals onto the canvas. */
  outsideMove: '/api/v1/outside/move',
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
  state: AppState,
  /** Where new things go when no canvas is named: the canvas most recently looked at in a browser, else the first. */
  defaultCanvasId: Id,
});
export type StateResponse = z.infer<typeof StateResponse>;

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
  /** The canvas to put it on. Without one: the canvas most recently looked at in a browser, else the first. */
  canvasId: Id.optional(),
  tags: Tags.optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.object({ session: Session, node: LayoutNode });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

/** PATCH body: any of the fields the user can edit. */
export const UpdateSessionRequest = z
  .object({ name: SessionName, note: SessionNote, tags: Tags })
  .partial()
  .refine((body) => body.name !== undefined || body.note !== undefined || body.tags !== undefined, 'Nothing to update');
export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequest>;

/** PUT body for a node: where it is, and optionally its color. */
export const UpdateNodeRequest = NodeRect.extend({ color: NodeColor.optional() });
export type UpdateNodeRequest = z.infer<typeof UpdateNodeRequest>;

export const CreateFrameRequest = z.object({
  label: FrameLabel.optional(),
  rect: FrameRect,
  /** The canvas to put it on; the default canvas when omitted. */
  canvasId: Id.optional(),
});
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

export const ReportAgentRequest = AgentInfo;
export type ReportAgentRequest = z.infer<typeof ReportAgentRequest>;

/** Environment variables every session's shell is given, for programs that talk to the daemon. */
export const SESSION_ENV = {
  url: 'AUBERGINE_URL',
  sessionId: 'AUBERGINE_SESSION_ID',
  token: 'AUBERGINE_TOKEN',
} as const;

/**
 * A terminal the user has open outside the canvas, as the daemon found it.
 * `tty` and the process IDs are what a client sends back to act on it; the
 * daemon looks everything else up again itself.
 */
export const OutsideTerminal = z.object({
  /** Terminal device, for example `ttys004`. This is the word the command line takes. */
  tty: z.string(),
  /** The terminal's shell. */
  pid: z.number().int(),
  cwd: z.string().nullable(),
  /**
   * `shell`: sitting at its prompt. `command`: something is running.
   * `agent`: Claude Code is running. `view`: already showing a canvas session.
   */
  kind: z.enum(['shell', 'command', 'agent', 'view']),
  /** What is in the foreground, when something is. */
  running: z.string().nullable(),
  runningPid: z.number().int().nullable(),
  /** For `agent`: what is known about its conversation. */
  agent: z
    .object({
      /** False when the agent's own record could not be read. */
      known: z.boolean(),
      name: z.string().nullable(),
      /** `idle`, `busy`, or null when unknown. */
      status: z.string().nullable(),
    })
    .nullable(),
});
export type OutsideTerminal = z.infer<typeof OutsideTerminal>;

export const OutsideResponse = z.object({ terminals: z.array(OutsideTerminal) });
export type OutsideResponse = z.infer<typeof OutsideResponse>;

/** Which terminal to act on: both values exactly as the listing gave them. */
const OutsideTarget = z.object({
  tty: z.string().regex(/^[A-Za-z0-9/]{1,32}$/),
  pid: z.number().int().positive(),
  /** The canvas for the new session; the default canvas when omitted. */
  canvasId: Id.optional(),
});

export const OutsideAddRequest = OutsideTarget.extend({
  /** Where to put the node; the daemon picks a spot when omitted. */
  rect: NodeRect.optional(),
});
export type OutsideAddRequest = z.infer<typeof OutsideAddRequest>;

export const OutsideMoveRequest = OutsideTarget.extend({
  /** `fork`: start a copy, the original keeps running. `stop`: ask the original to exit, then resume. */
  mode: z.enum(['fork', 'stop']),
  /** With `stop`: also stop an agent that is not idle. */
  force: z.boolean().optional(),
  /** Only say what would happen. */
  dryRun: z.boolean().optional(),
});
export type OutsideMoveRequest = z.infer<typeof OutsideMoveRequest>;

/** What was done (or with `dryRun`, would be done) for one terminal. */
export const OutsideResult = z.object({
  /** The new session, when one was created. */
  session: Session.nullable(),
  node: LayoutNode.nullable(),
  /** One or two sentences for the user: what happened and what to do with the old tab. */
  message: z.string(),
});
export type OutsideResult = z.infer<typeof OutsideResult>;

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

/** Body for restoring a parked session: optionally, the canvas to put it on. */
export const RestoreSessionRequest = z.object({ canvasId: Id.optional() });
export type RestoreSessionRequest = z.infer<typeof RestoreSessionRequest>;

export const SnapshotResponse = z.object({ text: z.string() });
export type SnapshotResponse = z.infer<typeof SnapshotResponse>;

export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'runtime_unavailable',
  /** The request body is larger than the server accepts. */
  'too_large',
  /** Too many calls in a short time; `Retry-After` says when to try again. */
  'rate_limited',
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
  /** Likewise: a request to switch to a canvas. */
  z.object({ type: z.literal('show-canvas'), canvasId: Id }),
]);
export type EventsServerMessage = z.infer<typeof EventsServerMessage>;

/** Browser → daemon on the events WebSocket, JSON text frames. */
export const EventsClientMessage = z.discriminatedUnion('type', [
  /** Which canvas this browser tab is showing. Sent on connecting, on switching, and when the tab is used again. */
  z.object({ type: z.literal('viewing'), canvasId: Id }),
]);
export type EventsClientMessage = z.infer<typeof EventsClientMessage>;

/** The address of a canvas in the browser: `/c/<canvas id>`. */
export const canvasAddress = (canvasId: string): string => `/c/${canvasId}`;

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

/* ====================================================================
 * The public API, under /v1.
 *
 * These shapes are a promise: /v1 only gains things. Fields are added, never
 * renamed or removed. Servers ignore request fields they do not know, and
 * clients must ignore response fields they do not know.
 *
 * Everywhere: errors are `{ error: { code, message } }` with a stable code;
 * lists are paged with a cursor; times are ISO 8601 strings; IDs are opaque
 * strings; a create may carry an `Idempotency-Key` header so that sending it
 * again does not create a second thing.
 * ==================================================================== */

export const publicPaths = {
  canvases: '/v1/canvases',
  canvas: (canvasId: string) => `/v1/canvases/${canvasId}`,
  canvasSessions: (canvasId: string) => `/v1/canvases/${canvasId}/sessions`,
  canvasNode: (canvasId: string, nodeId: string) => `/v1/canvases/${canvasId}/nodes/${nodeId}`,
  canvasFrames: (canvasId: string) => `/v1/canvases/${canvasId}/frames`,
  canvasFrame: (canvasId: string, frameId: string) => `/v1/canvases/${canvasId}/frames/${frameId}`,
  /** What this server can do, and who is asking. Needs no scope. */
  root: '/v1',
  /** The description of the API, as an OpenAPI document. Needs no scope. */
  description: '/v1/openapi.json',
  sessions: '/v1/sessions',
  session: (sessionId: string) => `/v1/sessions/${sessionId}`,
  parkSession: (sessionId: string) => `/v1/sessions/${sessionId}/park`,
  restoreSession: (sessionId: string) => `/v1/sessions/${sessionId}/restore`,
  showSession: (sessionId: string) => `/v1/sessions/${sessionId}/show`,
  showCanvas: (canvasId: string) => `/v1/canvases/${canvasId}/show`,
  sessionNotes: (sessionId: string) => `/v1/sessions/${sessionId}/notes`,
  /** A stream of changes (server-sent events). `?canvasId=` narrows it to one canvas. */
  events: '/v1/events',
  /** Tokens and the record of what they did: for the signed-in browser only, never for a token. */
  tokens: '/v1/tokens',
  token: (tokenId: string) => `/v1/tokens/${tokenId}`,
  activity: '/v1/activity',
  moveSession: (sessionId: string) => `/v1/sessions/${sessionId}/move`,
} as const;

/** Header a client may send with a create, to make repeating it safe. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IdempotencyKey = z.string().regex(/^[\x21-\x7e]{1,128}$/);

export const PAGE_DEFAULT = 100;
export const PAGE_MAX = 500;

/** Query of every list: how many to return, and where to carry on from. */
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT).describe('How many items to return at most.'),
  cursor: z.string().min(1).max(512).optional().describe('The `nextCursor` of the page before. Opaque: do not build or change it.'),
});
export type PageQuery = z.infer<typeof PageQuery>;

/** The shape of every list: some items, and a cursor for the rest (null when there is no more). */
export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

const Counts = z.object({ sessions: z.number().int(), waiting: z.number().int(), unread: z.number().int() });

/** A canvas without its layout, with how much is on it. */
export const CanvasSummary = Canvas.omit({ layout: true }).extend({ counts: Counts });
export type CanvasSummary = z.infer<typeof CanvasSummary>;

/** A canvas with its nodes and frames. */
export const CanvasDetail = CanvasSummary.extend({ nodes: z.array(LayoutNode), frames: z.array(Frame) });
export type CanvasDetail = z.infer<typeof CanvasDetail>;

export const CanvasList = pageOf(CanvasSummary);
export type CanvasList = z.infer<typeof CanvasList>;

export const CreateCanvasRequest = z.object({
  name: CanvasName.describe('The name on its tab.'),
  color: NodeColor.optional().describe('The color of its tab.'),
  labels: Labels.optional().describe('Pairs of key and value for tools of your own to give meaning to.'),
});
export type CreateCanvasRequest = z.infer<typeof CreateCanvasRequest>;

/** Any of: name, color, order, labels. `labels` replaces the whole set. */
export const UpdateCanvasRequest = CanvasChanges.refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type UpdateCanvasRequest = z.infer<typeof UpdateCanvasRequest>;

/**
 * Query of closing a canvas: what happens to the sessions on it. They are
 * never ended. `sessions=park`, or `sessions=move&to=<canvas id>`. It may be
 * left out only when the canvas has no sessions.
 */
export const CloseCanvasQuery = z
  .object({
    sessions: z.enum(['park', 'move']).optional().describe('What happens to the sessions on it. Needed when it has any.'),
    to: Id.optional().describe('With `sessions=move`: the canvas to move them to.'),
  })
  .refine((query) => query.sessions !== 'move' || query.to !== undefined, 'sessions=move needs to=<canvas id>');
export type CloseCanvasQuery = z.infer<typeof CloseCanvasQuery>;

/** Where on a canvas: a point, and optionally a size. */
export const Position = z.object({
  x: NodeRect.shape.x,
  y: NodeRect.shape.y,
  width: NodeRect.shape.width.optional(),
  height: NodeRect.shape.height.optional(),
});
export type Position = z.infer<typeof Position>;

export const StartSessionRequest = z.object({
  name: SessionName.optional().describe('What to call it. A name is made up when left out.'),
  cwd: z.string().startsWith('/').max(4096).optional().describe('Folder to start in (absolute path). The default folder when left out.'),
  command: z.string().trim().min(1).max(4000).optional().describe('A line to type into the new session once its shell is ready.'),
  position: Position.optional().describe('Where to put it. A free spot is found when left out.'),
  tags: Tags.optional().describe('Short words of your own to find and filter the session by.'),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequest>;

/** Body of changing a session: any of its name and its tags. `tags` replaces the whole list. */
export const PatchSessionRequest = z
  .object({ name: SessionName, tags: Tags, note: SessionNote })
  .partial()
  .refine((body) => body.name !== undefined || body.tags !== undefined || body.note !== undefined, 'Nothing to update');
export type PatchSessionRequest = z.infer<typeof PatchSessionRequest>;

/** A session together with where it is. */
export const PlacedSession = z.object({ session: Session, canvasId: Id, node: LayoutNode });
export type PlacedSession = z.infer<typeof PlacedSession>;

/** Query of listing sessions: a page, optionally only those in one state. */
export const SessionsQuery = PageQuery.extend({ state: z.enum(['open', 'parked', 'exited']).optional().describe('Only sessions in this state.') });
export type SessionsQuery = z.infer<typeof SessionsQuery>;

/** Body of restoring a parked session: the canvas to put it on. Without one, the canvas most recently looked at. */
export const RestoreSessionBody = z.object({ canvasId: Id.optional().describe('The canvas to put it on. Without one, the canvas most recently looked at in a browser.') });
export type RestoreSessionBody = z.infer<typeof RestoreSessionBody>;

/** The answer to asking for something to be shown: how many browser tabs were asked. */
export const ShownResponse = z.object({ shown: z.number().int() });
export type ShownResponse = z.infer<typeof ShownResponse>;

/** Query of the stream of changes: optionally only what concerns one canvas. */
export const EventsQuery = z.object({ canvasId: Id.optional().describe('Only changes that concern this canvas.') });
export type EventsQuery = z.infer<typeof EventsQuery>;

export const TokenList = pageOf(TokenView);
export type TokenList = z.infer<typeof TokenList>;

/** Query of reading the activity log: a page, optionally of one token only. Newest first. */
export const ActivityQuery = PageQuery.extend({ tokenId: Id.optional().describe('Only calls made with this token.') });
export type ActivityQuery = z.infer<typeof ActivityQuery>;

export const ActivityList = pageOf(ActivityEntry);
export type ActivityList = z.infer<typeof ActivityList>;

export const SessionList = pageOf(Session);
export type SessionList = z.infer<typeof SessionList>;

export const MoveSessionRequest = z.object({
  canvasId: Id.describe('The canvas to move it to.'),
  position: z.object({ x: NodeRect.shape.x, y: NodeRect.shape.y }).optional().describe('Where to put it there. A free spot is found when left out.'),
});
export type MoveSessionRequest = z.infer<typeof MoveSessionRequest>;

/** Any of: x, y, width, height, color. */
export const PatchNodeRequest = NodeRect.extend({ color: NodeColor })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type PatchNodeRequest = z.infer<typeof PatchNodeRequest>;

export const CreateFrameBody = FrameRect.extend({ label: FrameLabel.optional(), color: NodeColor.optional() });
export type CreateFrameBody = z.infer<typeof CreateFrameBody>;

/** Any of: x, y, width, height, label, color. With `carry`, nodes inside the frame move along with it. */
export const PatchFrameRequest = FrameRect.extend({ label: FrameLabel, color: NodeColor, carry: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type PatchFrameRequest = z.infer<typeof PatchFrameRequest>;
