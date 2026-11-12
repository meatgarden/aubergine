import type { ZodType } from 'zod';
import {
  CreateSessionResponse,
  ErrorResponse,
  EventsServerMessage,
  LayoutNode,
  Session,
  StateResponse,
  paths,
  type ChangeEvent,
  type CreateSessionRequest,
  type ErrorCode,
  type NodeRect,
  type RenameSessionRequest,
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
  renameSession: (sessionId: string, request: RenameSessionRequest) =>
    call(Session, 'PATCH', paths.session(sessionId), request),
  closeSession: (sessionId: string) => call<void>(null, 'DELETE', paths.session(sessionId)),
  updateNode: (nodeId: string, rect: NodeRect) => call(LayoutNode, 'PUT', paths.node(nodeId), rect),
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
