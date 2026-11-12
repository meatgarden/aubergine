import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  AppendNoteRequest,
  CLOSE_BAD_MESSAGE,
  CLOSE_SESSION_ENDED,
  CreateFrameRequest,
  CreateSessionRequest,
  Id,
  PROTOCOL_VERSION,
  RevealRequest,
  SearchQuery,
  SetAttentionRequest,
  UpdateSessionRequest,
  TerminalClientMessage,
  TerminalSize,
  UpdateFrameRequest,
  UpdateNodeRequest,
  paths,
  type AppendNoteResponse,
  type CreateSessionResponse,
  type ErrorCode,
  type ErrorResponse,
  type EventsServerMessage,
  type SearchResponse,
  type Settings,
  type SnapshotResponse,
  type StateResponse,
  type TerminalServerMessage,
} from '@aubergine/shared';
import { authorize, principalFromBearer, type Action, type Principal } from './auth';
import type { Canvas } from './canvas';
import { SessionNotFoundError, type Attachment, type SessionRuntime } from './runtime/runtime';
import { ConflictError, NotFoundError, RuntimeUnavailableError, type Sessions } from './sessions';
import { tokensMatch } from './token';

export interface ServerOptions {
  canvas: Canvas;
  sessions: Sessions;
  runtime: SessionRuntime;
  /** Returns the current settings, re-reading the settings file. */
  settings: () => Promise<Settings>;
  token: string;
  devOrigin: string | null;
  webDist: string;
}

/** Pause reading from a terminal when this much output is waiting to be sent. */
const HIGH_WATER = 1024 * 1024;
const LOW_WATER = 128 * 1024;

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'bad_request', result.error.issues[0]?.message ?? 'Invalid request');
  }
  return result.data;
}

export function cookieName(port: number): string {
  // Cookies are shared across ports on one host, so each instance gets its own name.
  return `aubergine_token_${port}`;
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const { canvas, sessions, runtime, token } = options;
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  const port = (): number => (app.server.address() as AddressInfo).port;

  /** `host:port` values this server answers to, and the matching origins. */
  const allowed = (): { hosts: Set<string>; origins: Set<string> } => {
    const hosts = new Set([`127.0.0.1:${port()}`, `localhost:${port()}`]);
    if (options.devOrigin) hosts.add(new URL(options.devOrigin).host);
    return { hosts, origins: new Set([...hosts].map((h) => `http://${h}`)) };
  };

  const principals = new WeakMap<FastifyRequest, Principal>();

  /** Refuses the request unless its principal may do `action` on the session. */
  const allow = (request: FastifyRequest, action: Action, sessionId: string): Principal => {
    const principal = principals.get(request);
    if (!principal || !authorize(principal, action, { sessionId })) {
      throw new HttpError(403, 'forbidden', 'This token may not do that');
    }
    return principal;
  };

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 2 * 1024 * 1024 } });

  // Every request, including WebSocket upgrades, passes these checks.
  app.addHook('onRequest', async (request, reply) => {
    const { hosts, origins } = allowed();

    // A page on another site can only reach this server under a different
    // Host name (DNS rebinding) or with a foreign Origin. Refuse both.
    if (!request.headers.host || !hosts.has(request.headers.host)) {
      return reply.code(403).send(errorBody('forbidden', 'Host not allowed'));
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !origins.has(origin)) {
      return reply.code(403).send(errorBody('forbidden', 'Origin not allowed'));
    }
    const pathname = request.url.split('?')[0] ?? '';

    // Routes for programs inside a session. They are not called by a browser,
    // so there is no Origin to require; a bearer token says who is calling,
    // and the cookie is not accepted here.
    if (pathname.startsWith('/v1/')) {
      const principal = principalFromBearer(token, request.headers.authorization);
      if (!principal) return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong bearer token'));
      principals.set(request, principal);
      return;
    }

    const isUpgrade = request.headers.upgrade?.toLowerCase() === 'websocket';
    const isSafeMethod = request.method === 'GET' || request.method === 'HEAD';
    if (origin === undefined && (isUpgrade || !isSafeMethod)) {
      return reply.code(403).send(errorBody('forbidden', 'Origin header required'));
    }

    if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) {
      if (!tokensMatch(token, request.cookies[cookieName(port())])) {
        return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong access token'));
      }
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message));
    }
    if (error instanceof NotFoundError || error instanceof SessionNotFoundError) {
      return reply.code(404).send(errorBody('not_found', error.message));
    }
    if (error instanceof ConflictError) {
      return reply.code(409).send(errorBody('conflict', error.message));
    }
    if (error instanceof RuntimeUnavailableError) {
      return reply.code(503).send(errorBody('runtime_unavailable', error.message));
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.code(status).send(errorBody('bad_request', (error as Error).message));
    }
    console.error(error);
    return reply.code(500).send(errorBody('internal', 'Internal error'));
  });

  /* ---------- Token → cookie ---------- */

  app.get(paths.auth, async (request, reply) => {
    const given = (request.query as { token?: string }).token;
    if (!tokensMatch(token, given)) {
      return reply.code(401).send(errorBody('unauthorized', 'Wrong access token'));
    }
    return reply
      .setCookie(cookieName(port()), token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .redirect('/');
  });

  /* ---------- HTTP API ---------- */

  const idParam = (request: FastifyRequest, name: string): string =>
    parse(Id, (request.params as Record<string, string>)[name]);

  app.get(paths.state, async (): Promise<StateResponse> => ({
    protocolVersion: PROTOCOL_VERSION,
    runtime: await sessions.status(),
    settings: await options.settings(),
    state: canvas.state,
  }));

  app.post(paths.sessions, async (request, reply): Promise<CreateSessionResponse> => {
    const body = parse(CreateSessionRequest, request.body ?? {});
    reply.code(201);
    return sessions.create(body);
  });

  app.patch(paths.session(':sessionId'), async (request) => {
    const body = parse(UpdateSessionRequest, request.body);
    return sessions.update(idParam(request, 'sessionId'), body);
  });

  app.post(paths.parkSession(':sessionId'), async (request) => sessions.park(idParam(request, 'sessionId')));
  app.post(paths.restoreSession(':sessionId'), async (request) => sessions.restore(idParam(request, 'sessionId')));
  app.post(paths.seenSession(':sessionId'), async (request) => sessions.seen(idParam(request, 'sessionId')));
  app.post(paths.restartSession(':sessionId'), async (request) => sessions.restart(idParam(request, 'sessionId')));

  app.delete(paths.session(':sessionId'), async (request, reply: FastifyReply) => {
    await sessions.close(idParam(request, 'sessionId'));
    return reply.code(204).send();
  });

  app.put(paths.node(':nodeId'), async (request) => {
    const body = parse(UpdateNodeRequest, request.body);
    return sessions.updateNode(idParam(request, 'nodeId'), body);
  });

  app.get(paths.snapshot(':sessionId'), async (request): Promise<SnapshotResponse> => {
    const sessionId = idParam(request, 'sessionId');
    if (!sessions.isRunning(sessionId)) throw new HttpError(404, 'not_found', 'This session is not running');
    return { text: await runtime.snapshot(sessionId) };
  });

  app.post(paths.frames, async (request, reply) => {
    reply.code(201);
    return sessions.createFrame(parse(CreateFrameRequest, request.body));
  });

  app.put(paths.frame(':frameId'), async (request) =>
    sessions.updateFrame(idParam(request, 'frameId'), parse(UpdateFrameRequest, request.body)),
  );

  app.delete(paths.frame(':frameId'), async (request, reply: FastifyReply) => {
    sessions.removeFrame(idParam(request, 'frameId'));
    return reply.code(204).send();
  });

  app.get(paths.search, async (request): Promise<SearchResponse> => {
    const { q } = parse(SearchQuery, request.query);
    return sessions.searchHistory(q);
  });

  app.post(paths.revealInSession(':sessionId'), async (request, reply: FastifyReply) => {
    const body = parse(RevealRequest, request.body);
    await sessions.reveal(idParam(request, 'sessionId'), body.text);
    return reply.code(204).send();
  });

  app.post(paths.sessionNotes(':sessionId'), async (request, reply): Promise<AppendNoteResponse> => {
    const body = parse(AppendNoteRequest, request.body);
    reply.code(201);
    return { entry: sessions.appendNote(idParam(request, 'sessionId'), { author: 'user', text: body.text }) };
  });

  /* ---------- Agent API: bearer token, checked by authorize() ---------- */

  app.put(paths.agent.attention(':sessionId'), async (request) => {
    const sessionId = idParam(request, 'sessionId');
    allow(request, 'attention.set', sessionId);
    const body = parse(SetAttentionRequest, request.body);
    return sessions.setAttention(sessionId, body.state, body.message);
  });

  app.post(paths.agent.notes(':sessionId'), async (request, reply): Promise<AppendNoteResponse> => {
    const sessionId = idParam(request, 'sessionId');
    const principal = allow(request, 'note.append', sessionId);
    const body = parse(AppendNoteRequest, request.body);
    reply.code(201);
    return {
      entry: sessions.appendNote(sessionId, {
        author: principal.kind === 'session' ? 'agent' : 'user',
        kind: body.kind,
        text: body.text,
      }),
    };
  });

  /* ---------- WebSocket: change events ---------- */

  app.get(paths.events, { websocket: true }, (socket) => {
    const send = (message: EventsServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const unsubscribe = canvas.subscribe((event) => send({ type: 'event', event }));
    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
    send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
  });

  /* ---------- WebSocket: one terminal viewer ---------- */

  app.get(paths.terminal(':sessionId'), { websocket: true }, (socket, request) => {
    const control = (message: TerminalServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const id = Id.safeParse((request.params as { sessionId?: string }).sessionId);
    const size = TerminalSize.safeParse(request.query);
    if (!id.success || !size.success) {
      socket.close(CLOSE_BAD_MESSAGE, 'Bad session ID or size');
      return;
    }
    const sessionId = id.data;

    let attachment: Attachment | null = null;
    let socketClosed = false;
    let drainTimer: NodeJS.Timeout | null = null;
    // Messages can arrive before the attachment is ready; keep them in order.
    const early: TerminalClientMessage[] = [];

    const handle = (message: TerminalClientMessage): void => {
      if (!attachment) {
        early.push(message);
      } else if (message.t === 'input') {
        attachment.write(message.data);
      } else {
        attachment.resize({ cols: message.cols, rows: message.rows });
      }
    };

    socket.on('message', (raw, isBinary) => {
      if (isBinary) return socket.close(CLOSE_BAD_MESSAGE, 'Unexpected binary frame');
      let message: TerminalClientMessage;
      try {
        message = TerminalClientMessage.parse(JSON.parse(raw.toString()));
      } catch {
        return socket.close(CLOSE_BAD_MESSAGE, 'Bad message');
      }
      handle(message);
    });

    const cleanup = (): void => {
      socketClosed = true;
      if (drainTimer) clearInterval(drainTimer);
      attachment?.close();
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    const sessionEnded = (): void => {
      sessions.shellEnded(sessionId);
      control({ t: 'exit', reason: 'session_ended' });
      socket.close(CLOSE_SESSION_ENDED, 'Session ended');
    };

    void (async () => {
      if (!sessions.isRunning(sessionId)) return sessionEnded();
      let attached: Attachment;
      try {
        attached = await runtime.attach(sessionId, size.data);
      } catch (error) {
        if (error instanceof SessionNotFoundError) return sessionEnded();
        console.error(error);
        return socket.close(1011, 'Could not attach');
      }
      if (socketClosed) return attached.close();
      attachment = attached;

      attached.onData((chunk) => {
        if (socket.readyState !== socket.OPEN) return;
        socket.send(chunk, { binary: true });
        if (socket.bufferedAmount > HIGH_WATER && !drainTimer) {
          attached.pause();
          drainTimer = setInterval(() => {
            if (socket.bufferedAmount < LOW_WATER) {
              if (drainTimer) clearInterval(drainTimer);
              drainTimer = null;
              attached.resume();
            }
          }, 20);
        }
      });

      attached.onExit(() => {
        if (socketClosed) return;
        void runtime
          .has(sessionId)
          .catch(() => true)
          .then((stillRunning) => {
            if (!stillRunning) return sessionEnded();
            control({ t: 'exit', reason: 'detached' });
            socket.close(1011, 'Viewer detached');
          });
      });

      for (const message of early.splice(0)) handle(message);
    })();
  });

  /* ---------- The web app ---------- */

  if (existsSync(options.webDist)) {
    await app.register(fastifyStatic, { root: options.webDist });
  } else {
    app.get('/', async (_request, reply) =>
      reply
        .type('text/plain; charset=utf-8')
        .send(
          options.devOrigin
            ? `The web app is served by the development server at ${options.devOrigin}\n`
            : 'The web app has not been built yet. Run `pnpm build` and restart.\n',
        ),
    );
  }

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(errorBody('not_found', 'Not found')),
  );

  return app;
}
