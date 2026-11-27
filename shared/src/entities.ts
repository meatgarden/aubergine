import { SchedulesState } from './schedules';
import { QueueState } from './tasks';
import { SessionEnvironment } from './environment';
import { z } from 'zod';
import { ApiToken } from './tokens';
import { Device } from './devices';
import { Id, newId } from './ids';
import { SessionMessages } from './messages';
import { LibraryState } from './library';
import { Draft, ShelfElement } from './drafts';
import { AcceptedRepositoryWorkflow } from './repository';
import { TypedBy } from './terminal';
import { Run, Workflow } from './workflows';
import { TerminalFields } from './fields';
import { ColorThemeId } from './themes';

import { Found, LINKS_MAX, SessionLink, Suggested, Written } from './links';

export const Timestamp = z.iso.datetime();
const Name = z.string().trim().min(1).max(80);

export const Organization = z.object({ id: Id, name: Name, createdAt: Timestamp });
export type Organization = z.infer<typeof Organization>;

export const Workspace = z.object({ id: Id, organizationId: Id, name: Name, createdAt: Timestamp });
export type Workspace = z.infer<typeof Workspace>;

const PlaceKind = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
/**
 * Which server owns a project's record. Today there is one answer, "this server", set by the server and never by a
 * caller. Nothing looks at it but `isLocalHome`, which everything asks before it touches a folder or reads a file
 * for a project. Open on purpose: a later kind adds its own fields.
 */
export const ProjectHome = z.looseObject({ kind: PlaceKind });
export type ProjectHome = z.infer<typeof ProjectHome>;
export const LOCAL_HOME: ProjectHome = { kind: 'local' };
/** Whether this server owns the project's record, and may touch its folders and files. */
export const isLocalHome = (thing: { home?: ProjectHome | undefined }): boolean => (thing.home ?? LOCAL_HOME).kind === 'local';

/**
 * Which machine a session's shell runs on. Today there is one answer, "this computer", set by the server and never
 * by a caller. Nothing looks at it but `isLocalHost`, which everything asks before it starts a shell, types into
 * one or reads its files.
 */
export const SessionHost = z.looseObject({ kind: PlaceKind });
export type SessionHost = z.infer<typeof SessionHost>;
export const LOCAL_HOST: SessionHost = { kind: 'local' };
/** Whether the session's shell runs on this computer. */
export const isLocalHost = (thing: { host?: SessionHost | undefined }): boolean => (thing.host ?? LOCAL_HOST).kind === 'local';

export const PROJECTS_MAX = 50;
export const PROJECT_FOLDERS_MAX = 20;
const Folder = z.string().startsWith('/').max(4096);

/** A project: its own canvases, terminals, queue, schedules and rules. A control room of its own in the one server. */
export const Project = z.object({
  id: Id,
  workspaceId: Id,
  name: Name.regex(/^[^\p{Cc}\u202a-\u202e\u2066-\u2069]*$/u, 'A name is one line of plain text'),
  color: z.string().max(20).default('none').describe('A named color, or `#rrggbb`.'),
  order: z.number().finite().default(0).describe('Its place among the projects; lower comes first.'),
  labels: z.record(z.string().max(63), z.string().max(256)).default({}),
  folders: z.array(Folder).max(PROJECT_FOLDERS_MAX).default([]).describe('The folders its work is in. May be empty.'),
  defaultFolder: Folder.nullable().default(null).describe('One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway.'),
  home: ProjectHome.default(LOCAL_HOME).describe('Which server owns its record. Set by the server.'),
  state: z.enum(['open', 'archived']).default('open'),
  /** Fields of the file it was read from that this version does not know: written out again when it is written to a file. */
  fileExtra: z.record(z.string(), z.unknown()).optional(),
  createdAt: Timestamp,
});
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
/** The colors that have a name. `none` is no color. */
export const NAMED_COLORS = ['none', 'red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray'] as const;
export const NamedColor = z.enum(NAMED_COLORS);
export type NamedColor = z.infer<typeof NamedColor>;
/** A color of one's own: six hexadecimal digits after `#`, in lower case. */
export const CustomColor = z.string().regex(/^#[0-9a-f]{6}$/, 'A color is one of the named colors, or # and six hexadecimal digits in lower case');
/** The color of a terminal, a frame or a canvas tab: a named one, or one of the owner's own. */
export const NodeColor = z.union([NamedColor, CustomColor]);
export type NodeColor = z.infer<typeof NodeColor>;
export const isNamedColor = (color: string): color is NamedColor => (NAMED_COLORS as readonly string[]).includes(color);

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
  /**
   * The program that was in front in the terminal when the agent last reported, as the server saw it then.
   * Never from a caller. Null until an agent has reported while a program other than a shell was in front.
   */
  program: z.string().max(200).nullable().default(null),
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
  // `overwrite`, not `transform`: the value is tidied but its kind stays the same, so it can still be described.
  .overwrite((tags) => normaliseTags(tags));

/** Which of the fixed sentences. */
export const ToldKind = z.enum(['kickoff', 'brief', 'recap', 'inbox']);
export type ToldKind = z.infer<typeof ToldKind>;

/**
 * Why a fixed sentence was not typed. `no-report`: no agent has reported from this terminal yet, so it is not known
 * which program it is. `at-shell`: a shell has the keyboard, where the sentence would be run as a command.
 * `other-program`: something other than the agent is in front. `unknown`: what is in front could not be read.
 */
export const UntoldWhy = z.enum(['no-report', 'at-shell', 'other-program', 'unknown']);
export type UntoldWhy = z.infer<typeof UntoldWhy>;

export const Untold = z.object({ what: ToldKind, why: UntoldWhy, at: Timestamp });
export type Untold = z.infer<typeof Untold>;

/** What the owner is told on the terminal about a sentence that was not typed. */
export function untoldWords(untold: Untold): string {
  const what = { kickoff: 'that a workflow was started here', brief: 'that it was asked to write something', recap: 'that you asked for a recap', inbox: 'that a message waits' }[untold.what];
  const why = {
    'no-report': 'no agent has reported from this terminal yet, so it cannot be told which program is the agent',
    'at-shell': 'a shell has the keyboard there, and the sentence would be run as a command',
    'other-program': 'a program other than the agent is in front there',
    unknown: 'what is in front in that terminal could not be read',
  }[untold.why];
  return `The agent was not told ${what}: ${why}. Nothing was typed. It is told when the agent is seen in front again; or tell it yourself.`;
}

/** The names a shell goes by as the program in front of a terminal. */
export const SHELL_NAMES: readonly string[] = ['zsh', 'bash', 'fish', 'sh', 'dash', 'ksh', 'tcsh', 'csh'];

/** A terminal session. The running shell itself is owned by the session runtime. */
export const Session = z.object({
  id: Id,
  projectId: Id,
  /** Which machine its shell runs on. Set by the server; today always this computer. */
  host: SessionHost.optional(),
  /**
   * For a terminal that came in a project file and whose shell was not started with it: what it was where the file
   * was written. Said on the terminal until its shell is started; nothing is done because of it.
   */
  meantFor: z.object({ agent: z.string().max(40).nullable(), environment: z.string().max(40).nullable(), placeUnset: z.boolean() }).optional(),
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
  /** Its fields, in order: a label and a value each, and who set it (the owner, or the agent in it). The owner's win. */
  fields: TerminalFields.default([]),
  /** The color theme its body is drawn in, whatever the page is drawn in. Null: the default for terminals (`terminalThemeOf`). */
  theme: ColorThemeId.nullable().default(null),
  /** For a parked session: the canvas it came from and where it sat there. */
  parkedFrom: ParkedPlace.nullable().default(null),
  /** "People only": no token may read this terminal or type into it, whatever its scopes. Only the owner changes this. */
  peopleOnly: z.boolean().default(false),
  /** The token that last typed into it through the API, and when. Not what it typed. */
  typedBy: TypedBy.nullable().default(null),
  /**
   * How many viewers are attached to it that this server did not attach itself: a window of a terminal application, or
   * any other program attached to the same session. Which program is not known. Left out: none.
   */
  outsideViewers: z.number().int().min(0).max(999).optional(),
  /** What its agent wrote when the owner asked for a recap, and when. The agent's words: other people's text wherever it is shown. */
  recap: z.object({ text: z.string().max(2000), at: Timestamp }).nullable().default(null),
  /**
   * Messages while "people only" is on. False: people only closes it to messages too, which is how every terminal starts.
   * True: it still takes messages from terminals the owner let message it (never from tokens), while staying closed to reading and typing.
   * Only the owner changes this.
   */
  takesMessages: z.boolean().default(false),
  /**
   * A fixed sentence that was to be typed for the agent here and was not, because it could not be told that the
   * agent has the keyboard. Which sentence and why; nothing else. Cleared when it is typed, or put away by the owner.
   */
  untold: Untold.nullable().default(null),
  /** Counts about its messages, for a mark on the canvas. The messages themselves are not state. */
  messages: SessionMessages.prefault({}),
  /** The links that belong to its work: each with its kind, a short label, who added it and when. */
  links: z.array(SessionLink).max(LINKS_MAX).default([]),
  /** Who last wrote its name and its summary. Nothing for the name means it is still the one it was made with. */
  written: Written.prefault({}),
  /** What the agent would have written where the owner's own words stand: a suggestion, used only when the owner says. */
  suggested: Suggested.prefault({}),
  /** What the server found about its folder by looking: the branch, the repository, the pull request of that branch. */
  found: Found.nullable().default(null),
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
  /**
   * The canvases whose terminals may message the terminals on this one. Empty: none, which is how every canvas starts.
   * Its own ID in the list: its terminals may message each other. Only the owner changes this.
   */
  messagesFrom: z.array(Id).max(200).default([]),
});
export type Canvas = z.infer<typeof Canvas>;

/** Everything there is: the default hierarchy, the sessions, and the canvases with their layouts. */
export const AppState = z.object({
  organization: Organization,
  workspace: Workspace,
  /** The projects, at least one. Everything on a canvas, in the queue or on a schedule belongs to one. */
  projects: z.array(Project).min(1).max(PROJECTS_MAX),
  /** For each kind of thing that can be shared: whether a new one is shared with every project, or belongs to the project it is made in. */
  sharing: z.record(z.string().max(40), z.enum(['shared', 'project'])).default({}),
  sessions: z.array(Session),
  canvases: z.array(Canvas).min(1),
  /** API tokens. Their hashes are blanked before the state is sent to a browser. */
  tokens: z.array(ApiToken).default([]),
  /** Browsers paired from an outside address. The server's, of no project. Their hashes are blanked before the state is sent to a browser. */
  devices: z.array(Device).default([]),
  workflows: z.array(Workflow).default([]),
  /** Runs that are still going. One that finishes or is stopped leaves for the archive. */
  runs: z.array(Run).default([]),
  /** Proposals waiting for the owner. One that is accepted or discarded leaves. */
  drafts: z.array(Draft).default([]),
  /** Elements kept for reuse. */
  shelf: z.array(ShelfElement).default([]),
  /** The repository workflows the owner accepted, each with the content that was accepted. */
  repositoryAccepted: z.array(AcceptedRepositoryWorkflow).default([]),
  /** The library: its sources as they were last read, what is installed, and installs that wait for the owner. */
  library: LibraryState.prefault({}),
  /** What was prepared for sessions to work in: today, working copies. A session that works in the folder it was started in has none. */
  environments: z.array(SessionEnvironment).default([]),
  /** The queue of tasks for agents, what is asked of the owner in writing, the rules, and how tasks are started. */
  queue: QueueState.prefault({}),
  /** Schedules: at these times, run this there. Each of their times becomes a task of the queue. */
  schedules: SchedulesState.prefault({}),
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
    messagesFrom: [],
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
  const project: Project = { id: newId(), workspaceId: workspace.id, name: 'Default', color: 'none', order: 0, labels: {}, folders: [], defaultFolder: null, home: LOCAL_HOME, state: 'open', createdAt };
  return { organization, workspace, projects: [project], sharing: {}, sessions: [], canvases: [newCanvas(project.id, FIRST_CANVAS_NAME, 0, now)], tokens: [], devices: [], workflows: [], runs: [], drafts: [], shelf: [], repositoryAccepted: [], library: { sources: [], installed: [], requests: [] }, environments: [], queue: QueueState.parse({}), schedules: SchedulesState.parse({}) };
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
