import { PROJECT_HEADER } from '@aubergine/shared';
import { z, type ZodType } from 'zod';
import { createClient } from '@aubergine/client';
import {
  Message,
  ThreadDetail,
  ThreadList,
  type Reach,
  type Scope,
  AppendNoteResponse,
  type CreateCanvasRequest,
  type EventsClientMessage,
  type UpdateCanvasRequest,
  CreateSessionResponse,
  AwayDigest,
  HistoryList,
  HistorySearch,
  Transcript,
  DemoStatus,
  Inventory,
  ErrorResponse,
  Frame,
  EventsServerMessage,
  LayoutNode,
  OutsideResponse,
  OutsideResult,
  SearchResponse,
  Session,
  SnapshotResponse,
  StateResponse,
  paths,
  type ChangeEvent,
  type CreateSessionRequest,
  type ErrorCode,
  type CreateFrameRequest,
  type OutsideAddRequest,
  type OutsideMoveRequest,
  type UpdateFrameRequest,
  type UpdateNodeRequest,
  type UpdateSessionRequest,
} from '@aubergine/shared';

/** Everything the web app says to the daemon goes through this module. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
  ) {
    super(message);
  }
}

/** The public API (/v1), as the page calls it: with its own cookie. */
/** Sent with every call: which project the page is looking at, so that what it lists and what it makes are that project's unless a call says otherwise. */
const pageHeaders: Record<string, string> = {};
const v1 = createClient({ useCookie: true, headers: pageHeaders });

async function call<T>(schema: ZodType<T> | null, method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    throw new ApiError(0, 'network', (error as Error).message);
  }
  if (!response.ok) {
    const parsed = ErrorResponse.safeParse(await response.json().catch(() => null));
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
    // No well-formed error body: the daemon itself did not answer (for example a proxy did).
    throw new ApiError(response.status, 'network', `HTTP ${response.status}`);
  }
  if (!schema) return undefined as T;
  return schema.parse(await response.json());
}

const AskedRecap = z.object({ asked: z.boolean(), line: z.string() });
const OpenedConversation = z.object({ session: Session });

/** Which project the page is looking at, as the store says; asked at each call. */
let lookingAt: () => string | null = () => null;
export function askAbout(project: () => string | null): void {
  lookingAt = project;
}
/** Called when the project being looked at changes. */
export function lookAt(projectId: string | null): void {
  if (projectId) pageHeaders[PROJECT_HEADER] = projectId;
  else delete pageHeaders[PROJECT_HEADER];
}
/** The project to name in a request: the one being looked at. */
const here = (): { projectId?: string } => {
  const projectId = lookingAt();
  return projectId ? { projectId } : {};
};

export const api = {
  getState: () => call(StateResponse, 'GET', paths.state),
  createSession: (request: CreateSessionRequest) =>
    call(CreateSessionResponse, 'POST', paths.sessions, request),
  openOnDesktop: (sessionId: string) => v1.openSessionOnDesktop({ sessionId }),
  setDesktopOpenNew: (openNew: boolean) => v1.changeDesktopSettings({ body: { openNew } }),
  updateSession: (sessionId: string, request: UpdateSessionRequest) =>
    call(Session, 'PATCH', paths.session(sessionId), request),
  parkSession: (sessionId: string) => call(Session, 'POST', paths.parkSession(sessionId), {}),
  restoreSession: (sessionId: string, canvasId?: string | null) =>
    call(CreateSessionResponse, 'POST', paths.restoreSession(sessionId), canvasId ? { canvasId } : {}),
  searchHistory: (query: string) =>
    call(SearchResponse, 'GET', `${paths.search}?q=${encodeURIComponent(query)}`),
  revealInSession: (sessionId: string, text: string) =>
    call<void>(null, 'POST', paths.revealInSession(sessionId), { text }),
  appendNote: (sessionId: string, text: string) =>
    call(AppendNoteResponse, 'POST', paths.sessionNotes(sessionId), { text }),
  /** Past conversations of the agent in a folder. Read by the server when asked; nothing is kept. */
  history: (folder: string) => call(HistoryList, 'GET', `${paths.history}?folder=${encodeURIComponent(folder)}`),
  historyTranscript: (folder: string, id: string) => call(Transcript, 'GET', `${paths.historyTranscript}?folder=${encodeURIComponent(folder)}&id=${encodeURIComponent(id)}`),
  searchConversations: (query: string, folder?: string) => call(HistorySearch, 'GET', `${paths.historySearch}?q=${encodeURIComponent(query)}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`),
  openConversation: (request: { folder: string; id: string; copy: boolean; evenIfOpen: boolean; canvasId?: string }) => call(OpenedConversation, 'POST', paths.historyOpen, request),
  /** Messages, as the owner sees and sends them. */
  messageThreads: (sessionId?: string) => call(ThreadList, 'GET', `${paths.messageThreads}${sessionId ? `?sessionId=${sessionId}` : ''}`),
  messageThread: (threadId: string) => call(ThreadDetail, 'GET', paths.messageThread(threadId)),
  threadAct: (threadId: string, action: 'look' | 'read' | 'pause' | 'continue' | 'stop') => call(ThreadDetail, 'POST', paths.messageThread(threadId), { action }),
  sendMessage: (sessionId: string, text: string) => call(Message, 'POST', paths.sessionMessages(sessionId), { text }),
  blockSender: (sessionId: string, sender: string, blocked: boolean) => call(null, 'POST', paths.sessionMessageBlocks(sessionId), { sender, blocked }),
  /** Whether the terminals on a canvas may message each other. The owner's alone. */
  setCanvasMessaging: (canvasId: string, sessions: boolean) => call(null, 'PUT', paths.canvasMessaging(canvasId), { sessions }),
  /** What changed since a time, for someone who was away. */
  away: (since: string) => call(AwayDigest, 'GET', `${paths.away}?since=${encodeURIComponent(since)}`),
  /** Asks the agent in a session for a recap: the server types its one fixed sentence for that. */
  askRecap: (sessionId: string) => call(AskedRecap, 'POST', paths.askRecap(sessionId), {}),
  /** What is switched on for the agent in a session. Read by the server when asked; names only. */
  inventory: (sessionId: string) => call(Inventory, 'GET', paths.inventory(sessionId)),
  makeDemo: () => call(DemoStatus, 'POST', paths.demo, {}),
  removeDemo: () => call(DemoStatus, 'DELETE', paths.demo),
  getOutside: () => call(OutsideResponse, 'GET', paths.outside),
  outsideAdd: (request: OutsideAddRequest) => call(OutsideResult, 'POST', paths.outsideAdd, request),
  outsideMove: (request: OutsideMoveRequest) => call(OutsideResult, 'POST', paths.outsideMove, request),
  // What follows goes through the public API, with the client generated from its description.
  createCanvas: (request: CreateCanvasRequest) => v1.createCanvas({ body: { ...here(), ...request } }),
  addProject: (body: Parameters<typeof v1.addProject>[0]['body']) => v1.addProject({ body }),
  changeProject: (projectId: string, body: Parameters<typeof v1.changeProject>[0]['body']) => v1.changeProject({ projectId, body }),
  archiveProject: (projectId: string, sessions?: 'park' | 'end') => v1.archiveProject({ projectId, body: sessions ? { sessions } : {} }),
  reopenProject: (projectId: string) => v1.reopenProject({ projectId }),
  removeProject: (projectId: string) => v1.removeProject({ projectId }),
  moveCanvasToProject: (canvasId: string, projectId: string) => v1.moveCanvasToProject({ canvasId, body: { projectId } }),
  exportProject: (projectId: string, template = false) => v1.exportProject({ projectId, query: template ? { template: 'true' } : {} }),
  readProjectFile: (text: string) => v1.readProjectFile({ body: { text } }),
  importProjectFile: (body: Parameters<typeof v1.importProjectFile>[0]['body']) => v1.importProjectFile({ body }),
  projectTemplates: async () => (await v1.listProjectTemplates()).templates,
  projectTemplate: async (templateId: string) => (await v1.getProjectTemplate({ templateId })).text,
  saveProjectTemplate: (projectId: string, notes: boolean) => v1.saveProjectTemplate({ projectId, body: { notes } }),
  switchRule: (ruleId: string, on: boolean) => v1.switchRule({ ruleId, body: { on } }),
  getSharing: () => v1.getSharing(),
  changeSharing: (kind: string, value: 'shared' | 'project') => v1.changeSharing({ body: { kind, default: value } }),
  moveSharedThing: (kind: string, id: string, projectId: string | null) => v1.moveSharedThing({ body: { kind, id, projectId } }),
  updateCanvas: (canvasId: string, request: UpdateCanvasRequest) => v1.updateCanvas({ canvasId, body: request }),
  /** Closes a canvas. Its sessions are moved to `to`, or parked when `to` is null. */
  closeCanvas: (canvasId: string, to: string | null) => v1.closeCanvas({ canvasId, query: to ? { sessions: 'move', to } : { sessions: 'park' } }),
  createToken: (request: { name: string; scopes: Scope[]; expiresInDays?: number; reviewWorkflowChanges?: boolean; reach?: Reach }) => v1.createToken({ body: request }),
  revokeToken: (tokenId: string) => v1.revokeToken({ tokenId }),
  /** Marks a session "people only", or opens it to tokens again. */
  /** Whether a "people only" session still takes messages from other terminals. */
  setTakesMessages: (sessionId: string, takesMessages: boolean) => v1.setTakesMessages({ sessionId, body: { takesMessages } }),
  protectSession: (sessionId: string, peopleOnly: boolean) => v1.protectSession({ sessionId, body: { peopleOnly } }),
  getActivity: (query: { tokenId?: string | undefined; sessionId?: string | undefined; cursor?: string | undefined; limit?: number }) =>
    v1.listActivity({ query: { limit: query.limit ?? 50, ...(query.tokenId ? { tokenId: query.tokenId } : {}), ...(query.sessionId ? { sessionId: query.sessionId } : {}), ...(query.cursor ? { cursor: query.cursor } : {}) } }),
  listWorkflowTemplates: () => v1.listWorkflowTemplates({ query: { limit: 100 } }),
  workflowFromTemplate: (template: string) => v1.useWorkflowTemplate({ template }),
  createWorkflow: (body: Parameters<typeof v1.createWorkflow>[0]['body']) => v1.createWorkflow({ body }),
  updateWorkflow: (workflowId: string, body: Parameters<typeof v1.updateWorkflow>[0]['body']) => v1.updateWorkflow({ workflowId, body }),
  copyWorkflow: (workflowId: string) => v1.copyWorkflow({ workflowId }),
  removeWorkflow: (workflowId: string) => v1.removeWorkflow({ workflowId }),
  /** Starts a run on a session. The line that tells the agent is typed by the server where an agent is running. */
  startRun: (sessionId: string, body: { workflowId: string; inputs: Record<string, string>; replace?: boolean; kickoff?: boolean }) =>
    v1.startSessionRun({ sessionId, body: { replace: false, kickoff: true, ...body } }),
  reportRun: (runId: string, body: Parameters<typeof v1.reportRun>[0]['body']) => v1.reportRun({ runId, body }),
  approveRun: (runId: string, body: { elementId?: string; comment?: string }) => v1.approveRun({ runId, body }),
  sendBackRun: (runId: string, body: { elementId: string; comment: string }) => v1.sendBackRun({ runId, body }),
  startRuns: (workflowId: string, body: { sessionIds: string[]; inputs: Record<string, string>; inputsBySession?: Record<string, Record<string, string>>; replace?: boolean }) =>
    v1.startRuns({ workflowId, body: { replace: false, kickoff: true, ...body } }),
  /** Runs that ended lately, for the board: newest first, a bounded number. */
  // Of every project: what is shown of them is chosen by whoever shows it.
  listEndedRunsPage: (limit: number) => v1.listRuns({ query: { projectId: 'all', status: 'ended', limit } }),
  getRun: (runId: string) => v1.getRun({ runId }),
  /** The runs that ended most recently, from the archive. */
  listEndedRuns: (limit: number) => v1.listRuns({ query: { projectId: 'all', status: 'ended', limit } }),
  tickRunItem: (runId: string, body: { elementId: string; item: number; ticked: boolean }) => v1.tickRunItem({ runId, body }),
  getDraft: (draftId: string) => v1.getDraft({ draftId }),
  acceptDraft: (draftId: string, body: Parameters<typeof v1.acceptDraft>[0]['body'] = {}) => v1.acceptDraft({ draftId, body }),
  returnDraft: (draftId: string, comment: string) => v1.returnDraft({ draftId, body: { comment } }),
  discardDraft: (draftId: string) => v1.discardDraft({ draftId }),
  requestDraft: (body: { kind: 'workflow' | 'element'; description: string; sessionId: string; tell?: boolean }) => v1.requestDraft({ body: { tell: true, ...body } }),
  listRepositoryWorkflows: () => v1.listRepositoryWorkflows({ query: { limit: 100 } }),
  getRepositoryWorkflow: (root: string, file: string) => v1.getRepositoryWorkflow({ query: { root, file } }),
  acceptRepositoryWorkflow: (root: string, file: string, hash: string) => v1.acceptRepositoryWorkflow({ body: { root, file, hash } }),
  getSessionRepositoryWorkflows: (sessionId: string) => v1.getSessionRepositoryWorkflows({ sessionId }),
  runRepositoryWorkflow: (sessionId: string, body: { file: string; inputs: Record<string, string>; replace?: boolean; kickoff?: boolean }) =>
    v1.runRepositoryWorkflow({ sessionId, body: { replace: false, kickoff: true, ...body } }),
  saveToRepository: (sessionId: string, workflowId: string, overwrite: boolean) => v1.saveToRepository({ body: { sessionId, workflowId, overwrite } }),
  listDraftRecords: (limit: number) => v1.listDraftRecords({ query: { limit } }),
  createElement: (body: Parameters<typeof v1.createElement>[0]['body']) => v1.createElement({ body }),
  updateElement: (elementId: string, body: Parameters<typeof v1.updateElement>[0]['body']) => v1.updateElement({ elementId, body }),
  copyElement: (elementId: string) => v1.copyElement({ elementId }),
  /** The library. Adding and refreshing a source are the only things that fetch; accepting names the digest of what was shown. */
  libraryItems: () => v1.listLibraryItems(),
  /** Where a new session in a folder could work: each kind, whether it can be had there, and what to know first. */
  environmentOffers: (folder: string | undefined) => v1.getEnvironmentOffers({ query: folder ? { folder } : {} }),
  environment: (environmentId: string) => v1.getEnvironment({ environmentId }),
  environmentDifference: (environmentId: string, file: string) => v1.getEnvironmentDifference({ environmentId, query: { file } }),
  environmentEndings: (environmentId: string) => v1.getEnvironmentEndings({ environmentId }),
  endEnvironment: (environmentId: string, choice: string, confirm: boolean) => v1.endEnvironment({ environmentId, body: { choice, confirm } }),
  listEnvironments: () => v1.listEnvironments({ query: { ...here(), limit: 200 } }),
  addTask: (body: Parameters<typeof v1.addTask>[0]['body']) => v1.addTask({ body: { ...here(), ...body } }),
  taskDo: (taskId: string, what: 'accept' | 'decline' | 'withdraw' | 'again' | 'clear') =>
    what === 'accept' ? v1.acceptTask({ taskId }) : what === 'decline' ? v1.declineTask({ taskId }) : what === 'withdraw' ? v1.withdrawTask({ taskId }) : what === 'again' ? v1.retryTask({ taskId }) : v1.clearTask({ taskId }),
  reorderTasks: (taskIds: string[]) => v1.reorderTasks({ body: { taskIds } }),
  startTasks: (taskId?: string) => v1.startTasks({ body: taskId ? { taskId } : here() }),
  changeQueue: (body: { limit?: number; hold?: boolean; automatic?: boolean }) => v1.changeQueue({ body: { ...here(), ...body } }),
  /** Tasks that were put away, newest first: for "finished today". */
  endedTasks: () => v1.listTasks({ query: { ...here(), state: 'ended', limit: 100 } }),
  addAsk: (text: string) => v1.addAsk({ body: { ...here(), text } }),
  askDo: (askId: string, what: 'done' | 'dismiss') => (what === 'done' ? v1.finishAsk({ askId }) : v1.dismissAsk({ askId })),
  listRules: () => v1.listRules({ query: here() }),
  addRule: (body: Parameters<typeof v1.addRule>[0]['body']) => v1.addRule({ body: { ...here(), ...body } }),
  removeRule: (ruleId: string) => v1.removeRule({ ruleId }),
  listSchedules: async () => (await v1.listSchedules({ query: { ...here(), limit: 200 } })).items,
  addSchedule: (body: Parameters<typeof v1.addSchedule>[0]['body']) => v1.addSchedule({ body: { ...here(), ...body } }),
  changeSchedule: (scheduleId: string, body: Parameters<typeof v1.changeSchedule>[0]['body']) => v1.changeSchedule({ scheduleId, body }),
  removeSchedule: (scheduleId: string) => v1.removeSchedule({ scheduleId }),
  runSchedule: (scheduleId: string) => v1.runSchedule({ scheduleId }),
  libraryItem: (sourceId: string, itemId: string) => v1.getLibraryItem({ sourceId, itemId }),
  addLibrarySource: (kind: string, address: string) => v1.addLibrarySource({ body: { kind, address } }),
  removeLibrarySource: (sourceId: string) => v1.removeLibrarySource({ sourceId }),
  refreshLibrarySource: (sourceId: string) => v1.refreshLibrarySource({ sourceId }),
  requestLibraryInstall: (sourceId: string, itemId: string) => v1.requestLibraryInstall({ body: { sourceId, itemId } }),
  libraryRequests: () => v1.listLibraryRequests(),
  libraryRequest: (requestId: string) => v1.getLibraryRequest({ requestId }),
  acceptLibraryRequest: (requestId: string, digest: string, edited?: { workflow?: unknown; element?: unknown }) => v1.acceptLibraryRequest({ requestId, body: { digest, ...(edited?.workflow ? { workflow: edited.workflow } : {}), ...(edited?.element ? { element: edited.element } : {}) } }),
  discardLibraryRequest: (requestId: string) => v1.discardLibraryRequest({ requestId }),
  libraryInstalledUsage: (installedId: string) => v1.getLibraryInstalledUsage({ installedId }),
  removeLibraryInstalled: (installedId: string) => v1.removeLibraryInstalled({ installedId }),
  /** The life of a shelf element: its versions, where it is used, retiring it and bringing it back. */
  elementVersions: (elementId: string) => v1.listElementVersions({ elementId, query: { limit: 100 } }),
  elementUsage: (elementId: string) => v1.getElementUsage({ elementId }),
  retireElement: (elementId: string, replacedBy: string | null) => v1.retireElement({ elementId, body: replacedBy ? { replacedBy } : {} }),
  restoreElement: (elementId: string) => v1.restoreElement({ elementId }),
  removeElement: (elementId: string) => v1.removeElement({ elementId }),
  runElement: (elementId: string, body: { sessionId: string; inputs: Record<string, string>; replace?: boolean; kickoff?: boolean }) =>
    v1.runElement({ elementId, body: { replace: false, kickoff: true, ...body } }),
  moveSession: (sessionId: string, canvasId: string) => v1.moveSession({ sessionId, body: { canvasId } }),
  resumeAgent: (sessionId: string) => call(Session, 'POST', paths.resumeAgent(sessionId), {}),
  seenSession: (sessionId: string) => call(Session, 'POST', paths.seenSession(sessionId), {}),
  restartSession: (sessionId: string) => call(Session, 'POST', paths.restartSession(sessionId), {}),
  closeSession: (sessionId: string) => call<void>(null, 'DELETE', paths.session(sessionId)),
  getSnapshot: (sessionId: string) => call(SnapshotResponse, 'GET', paths.snapshot(sessionId)),
  updateNode: (nodeId: string, request: UpdateNodeRequest) =>
    call(LayoutNode, 'PUT', paths.node(nodeId), request),
  createFrame: (request: CreateFrameRequest) => call(Frame, 'POST', paths.frames, request),
  updateFrame: (frameId: string, request: UpdateFrameRequest) =>
    call(Frame, 'PUT', paths.frame(frameId), request),
  removeFrame: (frameId: string) => call<void>(null, 'DELETE', paths.frame(frameId)),
};

export function socketUrl(path: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${path}`;
}

/**
 * Subscribes to change events and reconnects for as long as it is open.
 * `onReady` fires on every (re)connection: state may have changed while
 * disconnected, so the caller should load it again.
 */
export function subscribeToEvents(handlers: {
  onReady: () => void;
  /** `revision`: the change's number, as the server counts them. */
  onEvent: (event: ChangeEvent, revision?: number) => void;
  /** The daemon asks this page to bring a session into view. */
  onShow: (sessionId: string) => void;
  /** Asked to switch to a canvas (by a program, through the public API). */
  onShowCanvas: (canvasId: string) => void;
  /** A rule of the owner's asks this page to notify them. */
  onNotify?: (title: string, body: string) => void;
  onDown: () => void;
}): { stop: () => void; viewing: (canvasId: string) => void } {
  let socket: WebSocket | null = null;
  let timer: number | undefined;
  let stopped = false;
  let canvasId: string | null = null;

  const say = (message: EventsClientMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const connect = (): void => {
    socket = new WebSocket(socketUrl(paths.events));
    socket.onmessage = (message) => {
      const parsed = EventsServerMessage.safeParse(JSON.parse(String(message.data)));
      if (!parsed.success) return;
      if (parsed.data.type === 'hello') {
        // Tell a fresh connection which canvas this page is showing.
        if (canvasId) say({ type: 'viewing', canvasId });
        handlers.onReady();
      } else if (parsed.data.type === 'show') handlers.onShow(parsed.data.sessionId);
      else if (parsed.data.type === 'show-canvas') handlers.onShowCanvas(parsed.data.canvasId);
      else if (parsed.data.type === 'notify') handlers.onNotify?.(parsed.data.title, parsed.data.body);
      else handlers.onEvent(parsed.data.event, parsed.data.revision);
    };
    socket.onclose = () => {
      if (stopped) return;
      handlers.onDown();
      timer = window.setTimeout(connect, 1000);
    };
  };
  connect();

  return {
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
      socket?.close();
    },
    /** Says which canvas this page shows; call it on switching, and when the page is used again. */
    viewing: (id) => {
      canvasId = id;
      say({ type: 'viewing', canvasId: id });
    },
  };
}
