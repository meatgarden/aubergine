import { z } from 'zod';
import { ApiToken } from './tokens';
import { Id, newId } from './ids';

export const Timestamp = z.iso.datetime();
const Name = z.string().trim().min(1).max(80);

export const Organization = z.object({ id: Id, name: Name, createdAt: Timestamp });
export type Organization = z.infer<typeof Organization>;

export const Workspace = z.object({ id: Id, organizationId: Id, name: Name, createdAt: Timestamp });
export type Workspace = z.infer<typeof Workspace>;

export const Project = z.object({ id: Id, workspaceId: Id, name: Name, createdAt: Timestamp });
export type Project = z.infer<typeof Project>;

export const SessionName = Name;

export const NODE_MIN_WIDTH = 280;
export const NODE_MIN_HEIGHT = 160;
export const NODE_DEFAULT_WIDTH = 720;
export const NODE_DEFAULT_HEIGHT = 440;

const Coordinate = z.number().finite().min(-1e7).max(1e7);

/** Where a node sits on the canvas, in canvas units (pixels at 100% zoom). */
export const NodeRect = z.object({
  x: Coordinate,
  y: Coordinate,
  width: z.number().finite().min(NODE_MIN_WIDTH).max(10000),
  height: z.number().finite().min(NODE_MIN_HEIGHT).max(10000),
});
export type NodeRect = z.infer<typeof NodeRect>;

/** Colors a node or frame can be given. `none` is the default look. */
export const NodeColor = z.enum(['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple']);
export type NodeColor = z.infer<typeof NodeColor>;

/** Where a parked session sat, so that it can be put back. */
export const ParkedPlace = z.object({ canvasId: Id, rect: NodeRect, color: NodeColor.default('none') });
export type ParkedPlace = z.infer<typeof ParkedPlace>;

/**
 * `open`: on the canvas with a running shell. `parked`: off the canvas, shell
 * still running. `exited`: the shell ended by itself; the node stays until
 * the user restarts or removes it.
 */
export const SessionState = z.enum(['open', 'parked', 'exited']);
export type SessionState = z.infer<typeof SessionState>;

export const SessionNote = z.string().max(200_000);

/**
 * What the session's shell reports about itself, plus whether it has printed
 * anything since the user last looked. Shells without integration report
 * nothing, and `state` stays null.
 */
export const ShellStatus = z.object({
  /** `busy` while a command runs, `idle` at a prompt. */
  state: z.enum(['busy', 'idle']).nullable().default(null),
  /** The command line being run, while busy. */
  commandLine: z.string().max(400).nullable().default(null),
  /** When the running command started. */
  startedAt: Timestamp.nullable().default(null),
  /** Exit code of the last finished command. */
  lastExit: z.number().int().nullable().default(null),
  lastFinishedAt: Timestamp.nullable().default(null),
  /** Output has appeared since the node was last focused. */
  unread: z.boolean().default(false),
});
export type ShellStatus = z.infer<typeof ShellStatus>;

export const NO_STATUS: ShellStatus = ShellStatus.parse({});

/**
 * Whether a session wants the user. Set by the agent running in it:
 * `working` while it is busy, `waiting` when it needs an answer, `done` when
 * it has finished its turn. `none` when nothing was reported or the user has
 * looked.
 */
export const AttentionState = z.enum(['none', 'working', 'waiting', 'done']);
export type AttentionState = z.infer<typeof AttentionState>;

export const Attention = z.object({
  state: AttentionState.default('none'),
  /** A short reason, for example what the agent is asking. */
  message: z.string().max(500).nullable().default(null),
  at: Timestamp.nullable().default(null),
});
export type Attention = z.infer<typeof Attention>;

export const NO_ATTENTION: Attention = Attention.parse({});

/** Whether a session with this attention state belongs in the "waiting for you" queue. */
export function needsUser(attention: Attention): boolean {
  return attention.state === 'waiting' || attention.state === 'done';
}

export const NOTE_LOG_LIMIT = 1000;
export const NoteText = z.string().trim().min(1).max(20_000);

/**
 * One entry in a session's note log. The log only grows; the pinned note
 * (`Session.note`) is the part the user edits freely.
 */
export const NoteEntry = z.object({
  id: Id,
  at: Timestamp,
  /** Who wrote it: the user, or the agent running in the session. */
  author: z.enum(['user', 'agent']),
  /** `prompt`: what the user asked an agent. `event`: something that happened. `note`: anything else. */
  kind: z.enum(['note', 'prompt', 'event']).default('note'),
  text: NoteText,
});
export type NoteEntry = z.infer<typeof NoteEntry>;

/** Agents the canvas knows how to start. */
export const AgentKind = z.enum(['claude-code']);
export type AgentKind = z.infer<typeof AgentKind>;

/**
 * An agent's own ID for a conversation. It ends up on a command line, so
 * only plain ID characters are accepted.
 */
export const ConversationId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/);

/** The agent last seen running in a session, and the conversation it was in. */
export const AgentInfo = z.object({
  kind: AgentKind,
  conversationId: ConversationId.nullable().default(null),
});
export type AgentInfo = z.infer<typeof AgentInfo>;

export const TAG_MAX_LENGTH = 32;
export const TAGS_MAX = 12;

/** Trims tags and drops empty ones and repeats. Capitals are kept, but `Api` and `api` are the same tag. */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag === '' || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    result.push(tag);
  }
  return result;
}

/** A session's tags: a short list of short strings, without repeats. */
export const Tags = z
  .array(z.string().trim().min(1).max(TAG_MAX_LENGTH))
  .max(TAGS_MAX)
  .transform((tags) => normaliseTags(tags));

/** A terminal session. The running shell itself is owned by the session runtime. */
export const Session = z.object({
  id: Id,
  projectId: Id,
  name: SessionName,
  createdAt: Timestamp,
  state: SessionState.default('open'),
  /** Last known working folder of the foreground process. */
  cwd: z.string().nullable().default(null),
  /** Name of the foreground command, when known. */
  command: z.string().nullable().default(null),
  /** A Markdown note kept with the session. */
  note: SessionNote.default(''),
  status: ShellStatus.prefault({}),
  attention: Attention.prefault({}),
  /** Append-only log of notes, oldest first. */
  noteLog: z.array(NoteEntry).default([]),
  agent: AgentInfo.nullable().default(null),
  /**
   * When input last reached the session. Recorded at most once every few
   * seconds, never per keystroke. Input that does not pass through the server
   * (a view opened in another terminal) is only seen as the start of a command.
   */
  lastInputAt: Timestamp.nullable().default(null),
  /** When the session last printed something. Recorded at most once every few seconds. */
  lastOutputAt: Timestamp.nullable().default(null),
  tags: Tags.default([]),
  /** For a parked session: the canvas it came from and where it sat there. */
  parkedFrom: ParkedPlace.nullable().default(null),
});
export type Session = z.infer<typeof Session>;

/**
 * A node on the canvas. Layout is kept apart from sessions and points at a
 * session by ID, so either side can change without rewriting the other.
 */
export const LayoutNode = NodeRect.extend({ id: Id, sessionId: Id, color: NodeColor.default('none') });
export type LayoutNode = z.infer<typeof LayoutNode>;

export const FRAME_MIN_WIDTH = 200;
export const FRAME_MIN_HEIGHT = 120;

export const FrameRect = z.object({
  x: Coordinate,
  y: Coordinate,
  width: z.number().finite().min(FRAME_MIN_WIDTH).max(100000),
  height: z.number().finite().min(FRAME_MIN_HEIGHT).max(100000),
});
export type FrameRect = z.infer<typeof FrameRect>;

export const FrameLabel = z.string().trim().max(80);

/** A labeled rectangle behind the nodes, used to group them. */
export const Frame = FrameRect.extend({ id: Id, label: FrameLabel, color: NodeColor.default('none') });
export type Frame = z.infer<typeof Frame>;

export const Layout = z.object({ nodes: z.array(LayoutNode), frames: z.array(Frame).default([]) });
export type Layout = z.infer<typeof Layout>;

/** The nodes a frame carries with it when it moves: those lying entirely inside it. */
export function nodesInside<T extends NodeRect>(frame: FrameRect, nodes: readonly T[]): T[] {
  return nodes.filter(
    (n) =>
      n.x >= frame.x &&
      n.y >= frame.y &&
      n.x + n.width <= frame.x + frame.width &&
      n.y + n.height <= frame.y + frame.height,
  );
}

export const CanvasName = z.string().trim().min(1).max(80);

/**
 * Free-form key and value pairs that other tools can attach their own meaning
 * to. Kept small: a handful of short entries.
 */
export const Labels = z
  .record(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,62}$/), z.string().max(256))
  .refine((labels) => Object.keys(labels).length <= 20, 'At most 20 labels');
export type Labels = z.infer<typeof Labels>;

/**
 * A canvas: a named space with its own nodes and frames, shown as a tab.
 * Sessions belong to the project, not to a canvas; a session is on a canvas
 * because a node there points at it, and it is on at most one.
 */
export const Canvas = z.object({
  id: Id,
  projectId: Id,
  name: CanvasName,
  color: NodeColor.default('none'),
  /** Position among the tabs; lower comes first. Any number: reordering picks one between its neighbours. */
  order: z.number().finite(),
  labels: Labels.default({}),
  createdAt: Timestamp,
  layout: Layout,
});
export type Canvas = z.infer<typeof Canvas>;

/** Everything there is: the default hierarchy, the sessions, and the canvases with their layouts. */
export const AppState = z.object({
  organization: Organization,
  workspace: Workspace,
  project: Project,
  sessions: z.array(Session),
  canvases: z.array(Canvas).min(1),
  /** API tokens. Their hashes are blanked before the state is sent to a browser. */
  tokens: z.array(ApiToken).default([]),
});
export type AppState = z.infer<typeof AppState>;

export const FIRST_CANVAS_NAME = 'Main';

/** A new, empty canvas. */
export function newCanvas(projectId: string, name: string, order: number, now: Date = new Date()): Canvas {
  return {
    id: newId(),
    projectId,
    name,
    color: 'none',
    order,
    labels: {},
    createdAt: now.toISOString(),
    layout: { nodes: [], frames: [] },
  };
}

/** A fresh state with one default organization, workspace, project and canvas. */
export function createInitialState(now: Date = new Date()): AppState {
  const createdAt = now.toISOString();
  const organization: Organization = { id: newId(), name: 'Personal', createdAt };
  const workspace: Workspace = {
    id: newId(),
    organizationId: organization.id,
    name: 'Default',
    createdAt,
  };
  const project: Project = { id: newId(), workspaceId: workspace.id, name: 'Default', createdAt };
  return { organization, workspace, project, sessions: [], canvases: [newCanvas(project.id, FIRST_CANVAS_NAME, 0, now)], tokens: [] };
}

/** Canvases in tab order. */
export function sortedCanvases(state: AppState): Canvas[] {
  return [...state.canvases].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The canvas a session is on, with its node there. Null for a parked session. */
export function placeOfSession(state: AppState, sessionId: string): { canvas: Canvas; node: LayoutNode } | null {
  for (const canvas of state.canvases) {
    const node = canvas.layout.nodes.find((n) => n.sessionId === sessionId);
    if (node) return { canvas, node };
  }
  return null;
}

/** The canvas that holds a node. */
export function canvasOfNode(state: AppState, nodeId: string): { canvas: Canvas; node: LayoutNode } | null {
  for (const canvas of state.canvases) {
    const node = canvas.layout.nodes.find((n) => n.id === nodeId);
    if (node) return { canvas, node };
  }
  return null;
}

export interface CanvasCounts {
  /** Sessions on the canvas. */
  sessions: number;
  /** Of those, how many are waiting for the user. */
  waiting: number;
  /** Of those, how many have printed something the user has not seen. */
  unread: number;
}

export function canvasCounts(state: AppState, canvas: Canvas): CanvasCounts {
  const here = new Set(canvas.layout.nodes.map((n) => n.sessionId));
  const sessions = state.sessions.filter((s) => here.has(s.id));
  return {
    sessions: sessions.length,
    waiting: sessions.filter((s) => s.state !== 'exited' && needsUser(s.attention)).length,
    unread: sessions.filter((s) => s.status.unread).length,
  };
}
