import type { ZodType } from 'zod';
import {
  AppendNoteResponse,
  CreateSessionResponse,
  ErrorResponse,
  Frame,
  EventsServerMessage,
  LayoutNode,
  SearchResponse,
  Session,
  SnapshotResponse,
  StateResponse,
  paths,
  type ChangeEvent,
  type CreateSessionRequest,
  type ErrorCode,
  type CreateFrameRequest,
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
  restoreSession: (sessionId: string) => call(Session, 'POST', paths.restoreSession(sessionId), {}),
  searchHistory: (query: string) =>
    call(SearchResponse, 'GET', `${paths.search}?q=${encodeURIComponent(query)}`),
  revealInSession: (sessionId: string, text: string) =>
    call<void>(null, 'POST', paths.revealInSession(sessionId), { text }),
  appendNote: (sessionId: string, text: string) =>
    call(AppendNoteResponse, 'POST', paths.sessionNotes(sessionId), { text }),
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
  /** The daemon asks this canvas to bring a session into view. */
  onShow: (sessionId: string) => void;
  onDown: () => void;
}): () => void {
  let socket: WebSocket | null = null;
  let timer: number | undefined;
  let stopped = false;

  const connect = (): void => {
    socket = new WebSocket(socketUrl(paths.events));
    socket.onmessage = (message) => {
      const parsed = EventsServerMessage.safeParse(JSON.parse(String(message.data)));
      if (!parsed.success) return;
      if (parsed.data.type === 'hello') handlers.onReady();
      else if (parsed.data.type === 'show') handlers.onShow(parsed.data.sessionId);
      else handlers.onEvent(parsed.data.event);
    };
    socket.onclose = () => {
      if (stopped) return;
      handlers.onDown();
      timer = window.setTimeout(connect, 1000);
    };
  };
  connect();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    socket?.close();
  };
}
