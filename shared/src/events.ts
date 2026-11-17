import { Ask, QUEUE_LIMIT_MAX, Rule, Task } from './tasks';
import { Schedule } from './schedules';
import { SessionEnvironment } from './environment';
import { z } from 'zod';
import {
  AgentInfo,
  Untold,
  Attention,
  Canvas,
  CanvasName,
  Frame,
  Labels,
  LayoutNode,
  NOTE_LOG_LIMIT,
  NO_ATTENTION,
  NO_STATUS,
  NodeColor,
  NoteEntry,
  Session,
  SessionName,
  SessionNote,
  ShellStatus,
  Tags,
  Timestamp,
  placeOfSession,
  type AppState,
  type Layout,
} from './entities';
import { ApiToken } from './tokens';
import { Id } from './ids';
import { SessionMessages } from './messages';
import { InstallRequest, InstalledItem, LibrarySource } from './library';
import { Draft, ShelfElement } from './drafts';
import { AcceptedRepositoryWorkflow, REPOSITORY_ACCEPTED_MAX } from './repository';
import { TypedBy } from './terminal';
import { Run, Workflow } from './workflows';

/**
 * Every change to canvas state is one of these events. The daemon applies an
 * event to its own state, saves it and broadcasts it; the browser applies the
 * same event to its copy with the same reducer.
 */
/** What can be changed about a canvas itself. */
export const CanvasChanges = z
  .object({ name: CanvasName, color: NodeColor, order: z.number().finite(), labels: Labels })
  .partial();
export type CanvasChanges = z.infer<typeof CanvasChanges>;

export const ChangeEvent = z.discriminatedUnion('type', [
  /** A session started, with its node on a canvas. */
  z.object({ type: z.literal('session.created'), session: Session, canvasId: Id, node: LayoutNode }),
  z.object({ type: z.literal('session.renamed'), sessionId: Id, name: SessionName }),
  /** Moved off its canvas; the shell keeps running. It remembers where it sat. */
  z.object({ type: z.literal('session.parked'), sessionId: Id }),
  /** A parked session put back onto a canvas. */
  z.object({ type: z.literal('session.restored'), sessionId: Id, canvasId: Id, node: LayoutNode }),
  /** Moved from one canvas to another. The shell is untouched. */
  z.object({ type: z.literal('session.moved'), sessionId: Id, canvasId: Id, node: LayoutNode }),
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
  /** When the session was last typed into, or last printed. Sent at most once every few seconds per session. */
  z.object({
    type: z.literal('session.times'),
    sessionId: Id,
    lastInputAt: Timestamp.optional(),
    lastOutputAt: Timestamp.optional(),
  }),
  z.object({ type: z.literal('session.tagged'), sessionId: Id, tags: Tags }),
  /** "People only" was switched on or off. */
  z.object({ type: z.literal('session.protected'), sessionId: Id, peopleOnly: z.boolean() }),
  /** The owner changed whether the session takes messages from other terminals while it is "people only". */
  /** A fixed sentence could not be typed for the agent there, or that is over. */
  z.object({ type: z.literal('session.untold'), sessionId: Id, untold: Untold.nullable() }),
  z.object({ type: z.literal('session.takesMessages'), sessionId: Id, takesMessages: z.boolean() }),
  /** A token typed into the session through the API. Sent at most once every few seconds per session; never what was typed. */
  z.object({ type: z.literal('session.typed'), sessionId: Id, by: TypedBy }),
  /** The number of viewers attached to a session from outside this server changed: a window was opened on the desktop, or closed. */
  z.object({ type: z.literal('session.viewers'), sessionId: Id, outside: z.number().int().min(0).max(999) }),
  /** The session's agent handed in a recap; it takes the place of the one before. */
  z.object({ type: z.literal('session.recap'), sessionId: Id, recap: z.object({ text: z.string().max(2000), at: Timestamp }) }),
  z.object({ type: z.literal('session.attention'), sessionId: Id, attention: Attention }),
  /** The counts about a session's messages changed. Nothing a message said is in an event. */
  z.object({ type: z.literal('session.messages'), sessionId: Id, messages: SessionMessages }),
  z.object({ type: z.literal('session.note.appended'), sessionId: Id, entry: NoteEntry }),
  /** Which agent runs in the session, and in which conversation. */
  z.object({ type: z.literal('session.agent'), sessionId: Id, agent: AgentInfo.nullable() }),
  /** What the shell reports changed: busy or idle, exit code, unread output. */
  z.object({ type: z.literal('session.status'), sessionId: Id, status: ShellStatus }),
  /** Ended for good and removed. */
  z.object({ type: z.literal('session.closed'), sessionId: Id }),
  z.object({ type: z.literal('node.updated'), canvasId: Id, node: LayoutNode }),
  z.object({ type: z.literal('frame.created'), canvasId: Id, frame: Frame }),
  z.object({ type: z.literal('frame.updated'), canvasId: Id, frame: Frame }),
  z.object({ type: z.literal('frame.removed'), canvasId: Id, frameId: Id }),
  z.object({ type: z.literal('canvas.created'), canvas: Canvas }),
  /** Renamed, recolored, reordered or relabeled. */
  z.object({ type: z.literal('canvas.updated'), canvasId: Id, changes: CanvasChanges }),
  /** Closed. Its sessions were moved or parked first; anything still on it is parked here. */
  z.object({ type: z.literal('canvas.removed'), canvasId: Id }),
  /** The owner changed which canvases' terminals may message the terminals on this one. */
  z.object({ type: z.literal('canvas.messaging'), canvasId: Id, messagesFrom: z.array(Id).max(200) }),
  /** A library source was added, or read again. */
  z.object({ type: z.literal('library.source.changed'), source: LibrarySource }),
  z.object({ type: z.literal('library.source.removed'), sourceId: Id }),
  /** Something from the library was installed or brought up to date, or what its source says about it changed. */
  z.object({ type: z.literal('library.installed.changed'), item: InstalledItem }),
  z.object({ type: z.literal('library.installed.removed'), installedId: Id }),
  /** An install waits for the owner, or no longer does. */
  z.object({ type: z.literal('library.request.changed'), request: InstallRequest }),
  z.object({ type: z.literal('library.request.removed'), requestId: Id }),
  /** Something was prepared for a session to work in, or what is known about it changed: what changed there, its session, whether it is whole. */
  z.object({ type: z.literal('environment.changed'), environment: SessionEnvironment }),
  z.object({ type: z.literal('environment.removed'), environmentId: Id }),
  /** A task was added to the queue, or moved: proposed, accepted, started, following its run, over. */
  z.object({ type: z.literal('task.changed'), task: Task }),
  /** A task left the state: withdrawn, declined, or looked at after it was over. It is in the archive. */
  z.object({ type: z.literal('task.removed'), taskId: Id }),
  /** Something was written on the owner's list, or taken off it. */
  z.object({ type: z.literal('ask.changed'), ask: Ask }),
  z.object({ type: z.literal('ask.removed'), askId: Id }),
  z.object({ type: z.literal('rule.changed'), rule: Rule }),
  z.object({ type: z.literal('rule.removed'), ruleId: Id }),
  /** How tasks are started: how many at once, whether new starts are held, whether they start by themselves; and which runs a rule started. */
  z.object({ type: z.literal('queue.settings'), limit: z.number().int().min(1).max(QUEUE_LIMIT_MAX), hold: z.boolean(), automatic: z.boolean(), ruleRuns: z.array(Id).max(200) }),
  /** A schedule was made or changed, or one of its times was answered for: fired, late, skipped, missed, could not run. */
  z.object({ type: z.literal('schedule.changed'), schedule: Schedule }),
  z.object({ type: z.literal('schedule.removed'), scheduleId: Id }),
  /** The schedules were looked at and at least one had a time to answer for. Not sent for a look that found nothing. */
  z.object({ type: z.literal('schedules.checked'), at: Timestamp }),
  z.object({ type: z.literal('token.created'), token: ApiToken }),
  z.object({ type: z.literal('token.revoked'), tokenId: Id, at: Timestamp }),
  /** Recorded at most about once a minute per token. */
  z.object({ type: z.literal('token.used'), tokenId: Id, at: Timestamp }),
  /** A workflow was created, or saved as a new version. */
  z.object({ type: z.literal('workflow.changed'), workflow: Workflow }),
  z.object({ type: z.literal('workflow.removed'), workflowId: Id }),
  z.object({ type: z.literal('run.started'), run: Run }),
  /** A report moved a run. One event per report, carrying that one run. */
  z.object({ type: z.literal('run.moved'), run: Run }),
  /** A run finished or was stopped: it leaves the state for the archive. */
  z.object({ type: z.literal('run.finished'), run: Run }),
  /** A draft was asked for, handed in, revised or sent back. */
  z.object({ type: z.literal('draft.changed'), draft: Draft }),
  /** Accepted or discarded: it leaves. */
  z.object({ type: z.literal('draft.removed'), draftId: Id }),
  z.object({ type: z.literal('shelf.changed'), item: ShelfElement }),
  z.object({ type: z.literal('shelf.removed'), elementId: Id }),
  /** The owner accepted a repository workflow as it is now. */
  z.object({ type: z.literal('repository.accepted'), entry: AcceptedRepositoryWorkflow }),
  /** An item of what an element produced was ticked or unticked. The run did not move. */
  z.object({ type: z.literal('run.ticked'), run: Run }),
]);
export type ChangeEvent = z.infer<typeof ChangeEvent>;

function patchSession(state: AppState, sessionId: string, patch: Partial<Session>): AppState {
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
  };
}

/** Changes one canvas's layout. An unknown canvas leaves the state as it is. */
function patchLayout(state: AppState, canvasId: string, change: (layout: Layout) => Layout): AppState {
  return {
    ...state,
    canvases: state.canvases.map((c) => (c.id === canvasId ? { ...c, layout: change(c.layout) } : c)),
  };
}

/** Takes a session's node off whatever canvas it is on. */
function withoutNodeOf(state: AppState, sessionId: string): AppState {
  return {
    ...state,
    canvases: state.canvases.map((c) =>
      c.layout.nodes.some((n) => n.sessionId === sessionId)
        ? { ...c, layout: { ...c.layout, nodes: c.layout.nodes.filter((n) => n.sessionId !== sessionId) } }
        : c,
    ),
  };
}

/** Puts a session's node on a canvas, and nowhere else: a session is on at most one. */
function placeNode(state: AppState, canvasId: string, node: LayoutNode): AppState {
  if (!state.canvases.some((c) => c.id === canvasId)) return state;
  return patchLayout(withoutNodeOf(state, node.sessionId), canvasId, (layout) => ({
    ...layout,
    nodes: [...layout.nodes.filter((n) => n.id !== node.id), node],
  }));
}

/** Marks a session as parked, remembering where it sat. */
function park(state: AppState, sessionId: string): AppState {
  const place = placeOfSession(state, sessionId);
  const parkedFrom = place
    ? {
        canvasId: place.canvas.id,
        rect: { x: place.node.x, y: place.node.y, width: place.node.width, height: place.node.height },
        color: place.node.color,
      }
    : null;
  return patchSession(withoutNodeOf(state, sessionId), sessionId, {
    state: 'parked',
    ...(parkedFrom ? { parkedFrom } : {}),
  });
}

/** Pure reducer: returns the state after `event`. Applying an event twice is harmless. */
export function applyEvent(state: AppState, event: ChangeEvent): AppState {
  switch (event.type) {
    case 'session.created': {
      const withSession = {
        ...state,
        sessions: [...state.sessions.filter((s) => s.id !== event.session.id), event.session],
      };
      return placeNode(withSession, event.canvasId, event.node);
    }
    case 'session.renamed':
      return patchSession(state, event.sessionId, { name: event.name });
    case 'session.parked':
      return state.sessions.some((s) => s.id === event.sessionId && s.state === 'parked') ? state : park(state, event.sessionId);
    case 'session.restored':
      return patchSession(placeNode(state, event.canvasId, event.node), event.sessionId, { state: 'open', parkedFrom: null, peopleOnly: false, typedBy: null, recap: null });
    case 'session.moved':
      return placeNode(state, event.canvasId, event.node);
    case 'session.restarted':
      return patchSession(state, event.sessionId, { state: 'open' });
    case 'session.exited':
      return patchSession(state, event.sessionId, {
        state: 'exited',
        command: null,
        status: { ...NO_STATUS, lastExit: null },
        attention: NO_ATTENTION,
      });
    case 'session.activity':
      return patchSession(state, event.sessionId, { cwd: event.cwd, command: event.command });
    case 'session.times':
      return patchSession(state, event.sessionId, {
        ...(event.lastInputAt !== undefined ? { lastInputAt: event.lastInputAt } : {}),
        ...(event.lastOutputAt !== undefined ? { lastOutputAt: event.lastOutputAt } : {}),
      });
    case 'session.tagged':
      return patchSession(state, event.sessionId, { tags: event.tags });
    case 'session.untold':
      return patchSession(state, event.sessionId, { untold: event.untold });
    case 'session.takesMessages':
      return patchSession(state, event.sessionId, { takesMessages: event.takesMessages });
    case 'session.protected':
      return patchSession(state, event.sessionId, { peopleOnly: event.peopleOnly });
    case 'session.viewers':
      return patchSession(state, event.sessionId, { outsideViewers: event.outside });
    case 'session.typed':
      return patchSession(state, event.sessionId, { typedBy: event.by });
    case 'session.recap':
      return patchSession(state, event.sessionId, { recap: event.recap });
    case 'session.messages':
      return patchSession(state, event.sessionId, { messages: event.messages });
    case 'canvas.messaging':
      return { ...state, canvases: state.canvases.map((c) => (c.id === event.canvasId ? { ...c, messagesFrom: event.messagesFrom } : c)) };
    case 'session.attention':
      return patchSession(state, event.sessionId, { attention: event.attention });
    case 'session.note.appended': {
      const session = state.sessions.find((s) => s.id === event.sessionId);
      if (!session || session.noteLog.some((e) => e.id === event.entry.id)) return state;
      return patchSession(state, event.sessionId, {
        noteLog: [...session.noteLog, event.entry].slice(-NOTE_LOG_LIMIT),
      });
    }
    case 'session.agent':
      return patchSession(state, event.sessionId, { agent: event.agent });
    case 'session.status':
      return patchSession(state, event.sessionId, { status: event.status });
    case 'session.noted':
      return patchSession(state, event.sessionId, { note: event.note });
    case 'session.closed':
      return { ...withoutNodeOf(state, event.sessionId), sessions: state.sessions.filter((s) => s.id !== event.sessionId) };
    case 'node.updated':
      return patchLayout(state, event.canvasId, (layout) => ({
        ...layout,
        nodes: layout.nodes.map((n) => (n.id === event.node.id ? event.node : n)),
      }));
    case 'frame.created':
      return patchLayout(state, event.canvasId, (layout) => ({
        ...layout,
        frames: [...layout.frames.filter((f) => f.id !== event.frame.id), event.frame],
      }));
    case 'frame.updated':
      return patchLayout(state, event.canvasId, (layout) => ({
        ...layout,
        frames: layout.frames.map((f) => (f.id === event.frame.id ? event.frame : f)),
      }));
    case 'frame.removed':
      return patchLayout(state, event.canvasId, (layout) => ({
        ...layout,
        frames: layout.frames.filter((f) => f.id !== event.frameId),
      }));
    case 'canvas.created':
      return state.canvases.some((c) => c.id === event.canvas.id) ? state : { ...state, canvases: [...state.canvases, event.canvas] };
    case 'canvas.updated':
      return { ...state, canvases: state.canvases.map((c) => (c.id === event.canvasId ? { ...c, ...event.changes } : c)) };
    case 'task.changed':
      return { ...state, queue: { ...state.queue, tasks: [...state.queue.tasks.filter((t) => t.id !== event.task.id), event.task] } };
    case 'task.removed':
      return { ...state, queue: { ...state.queue, tasks: state.queue.tasks.filter((t) => t.id !== event.taskId) } };
    case 'ask.changed':
      return { ...state, queue: { ...state.queue, asks: [...state.queue.asks.filter((a) => a.id !== event.ask.id), event.ask] } };
    case 'ask.removed':
      return { ...state, queue: { ...state.queue, asks: state.queue.asks.filter((a) => a.id !== event.askId) } };
    case 'rule.changed':
      return { ...state, queue: { ...state.queue, rules: [...state.queue.rules.filter((r) => r.id !== event.rule.id), event.rule] } };
    case 'rule.removed':
      return { ...state, queue: { ...state.queue, rules: state.queue.rules.filter((r) => r.id !== event.ruleId) } };
    case 'schedule.changed':
      return { ...state, schedules: { ...state.schedules, items: [...state.schedules.items.filter((s) => s.id !== event.schedule.id), event.schedule] } };
    case 'schedule.removed':
      return { ...state, schedules: { ...state.schedules, items: state.schedules.items.filter((s) => s.id !== event.scheduleId) } };
    case 'schedules.checked':
      return { ...state, schedules: { ...state.schedules, checkedAt: event.at } };
    case 'queue.settings':
      return { ...state, queue: { ...state.queue, limit: event.limit, hold: event.hold, automatic: event.automatic, ruleRuns: event.ruleRuns } };
    case 'environment.changed':
      return { ...state, environments: [...state.environments.filter((e) => e.id !== event.environment.id), event.environment] };
    case 'environment.removed':
      return { ...state, environments: state.environments.filter((e) => e.id !== event.environmentId) };
    case 'library.source.changed':
      return { ...state, library: { ...state.library, sources: [...state.library.sources.filter((s) => s.id !== event.source.id), event.source] } };
    case 'library.source.removed':
      return { ...state, library: { ...state.library, sources: state.library.sources.filter((s) => s.id !== event.sourceId), requests: state.library.requests.filter((r) => r.sourceId !== event.sourceId) } };
    case 'library.installed.changed':
      return { ...state, library: { ...state.library, installed: [...state.library.installed.filter((i) => i.id !== event.item.id), event.item] } };
    case 'library.installed.removed':
      return { ...state, library: { ...state.library, installed: state.library.installed.filter((i) => i.id !== event.installedId), requests: state.library.requests.filter((r) => r.updates !== event.installedId) } };
    case 'library.request.changed':
      return { ...state, library: { ...state.library, requests: [...state.library.requests.filter((r) => r.id !== event.request.id), event.request] } };
    case 'library.request.removed':
      return { ...state, library: { ...state.library, requests: state.library.requests.filter((r) => r.id !== event.requestId) } };
    case 'token.created':
      return { ...state, tokens: [...state.tokens.filter((t) => t.id !== event.token.id), event.token] };
    case 'token.revoked':
      return { ...state, tokens: state.tokens.map((t) => (t.id === event.tokenId && t.revokedAt === null ? { ...t, revokedAt: event.at } : t)) };
    case 'token.used':
      return { ...state, tokens: state.tokens.map((t) => (t.id === event.tokenId ? { ...t, lastUsedAt: event.at } : t)) };
    case 'workflow.changed':
      return { ...state, workflows: [...state.workflows.filter((w) => w.id !== event.workflow.id), event.workflow] };
    case 'workflow.removed':
      return { ...state, workflows: state.workflows.filter((w) => w.id !== event.workflowId) };
    case 'run.started':
      return { ...state, runs: [...state.runs.filter((r) => r.id !== event.run.id), event.run] };
    case 'run.ticked':
    case 'run.moved':
      return { ...state, runs: state.runs.map((r) => (r.id === event.run.id ? event.run : r)) };
    case 'run.finished':
      return { ...state, runs: state.runs.filter((r) => r.id !== event.run.id) };
    case 'draft.changed':
      return { ...state, drafts: [...state.drafts.filter((d) => d.id !== event.draft.id), event.draft] };
    case 'draft.removed':
      return { ...state, drafts: state.drafts.filter((d) => d.id !== event.draftId) };
    case 'shelf.changed':
      return { ...state, shelf: [...state.shelf.filter((e) => e.id !== event.item.id), event.item] };
    case 'shelf.removed':
      return { ...state, shelf: state.shelf.filter((e) => e.id !== event.elementId) };
    case 'repository.accepted':
      // One acceptance per file of a repository: a newer one takes the place of the older. The oldest go when there are too many.
      return { ...state, repositoryAccepted: [...state.repositoryAccepted.filter((e) => !(e.root === event.entry.root && e.file === event.entry.file)), event.entry].slice(-REPOSITORY_ACCEPTED_MAX) };
    case 'canvas.removed': {
      const canvas = state.canvases.find((c) => c.id === event.canvasId);
      // The last canvas stays: there is always one to look at.
      if (!canvas || state.canvases.length === 1) return state;
      // Nothing is ever lost with a canvas: sessions still on it are parked.
      let next = state;
      for (const node of canvas.layout.nodes) next = park(next, node.sessionId);
      return { ...next, canvases: next.canvases.filter((c) => c.id !== event.canvasId) };
    }
  }
}
