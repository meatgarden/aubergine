import type { ZodType } from 'zod';
import { createClient } from '@aubergine/client';
import {
  type Reach,
  type Scope,
  AppendNoteResponse,
  type CreateCanvasRequest,
  type EventsClientMessage,
  type UpdateCanvasRequest,
  CreateSessionResponse,
  DemoStatus,
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
const v1 = createClient({ useCookie: true });

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

export const api = {
  getState: () => call(StateResponse, 'GET', paths.state),
  createSession: (request: CreateSessionRequest) =>
    call(CreateSessionResponse, 'POST', paths.sessions, request),
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
  makeDemo: () => call(DemoStatus, 'POST', paths.demo, {}),
  removeDemo: () => call(DemoStatus, 'DELETE', paths.demo),
  getOutside: () => call(OutsideResponse, 'GET', paths.outside),
  outsideAdd: (request: OutsideAddRequest) => call(OutsideResult, 'POST', paths.outsideAdd, request),
  outsideMove: (request: OutsideMoveRequest) => call(OutsideResult, 'POST', paths.outsideMove, request),
  // What follows goes through the public API, with the client generated from its description.
  createCanvas: (request: CreateCanvasRequest) => v1.createCanvas({ body: request }),
  updateCanvas: (canvasId: string, request: UpdateCanvasRequest) => v1.updateCanvas({ canvasId, body: request }),
  /** Closes a canvas. Its sessions are moved to `to`, or parked when `to` is null. */
  closeCanvas: (canvasId: string, to: string | null) => v1.closeCanvas({ canvasId, query: to ? { sessions: 'move', to } : { sessions: 'park' } }),
  createToken: (request: { name: string; scopes: Scope[]; expiresInDays?: number; reviewWorkflowChanges?: boolean; reach?: Reach }) => v1.createToken({ body: request }),
  revokeToken: (tokenId: string) => v1.revokeToken({ tokenId }),
  /** Marks a session "people only", or opens it to tokens again. */
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
  getRun: (runId: string) => v1.getRun({ runId }),
  /** The runs that ended most recently, from the archive. */
  listEndedRuns: (limit: number) => v1.listRuns({ query: { status: 'ended', limit } }),
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
  onEvent: (event: ChangeEvent) => void;
  /** The daemon asks this page to bring a session into view. */
  onShow: (sessionId: string) => void;
  /** Asked to switch to a canvas (by a program, through the public API). */
  onShowCanvas: (canvasId: string) => void;
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
      else handlers.onEvent(parsed.data.event);
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
