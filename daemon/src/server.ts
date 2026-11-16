import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  SESSION_HEADER,
  type OwnerCaller,
  AppendNoteRequest,
  CLOSE_BAD_MESSAGE,
  CLOSE_SESSION_ENDED,
  CreateFrameRequest,
  CreateSessionRequest,
  EventsClientMessage,
  Id,
  OutsideAddRequest,
  OutsideMoveRequest,
  PROTOCOL_VERSION,
  RestoreSessionRequest,
  RevealRequest,
  SearchQuery,
  UpdateSessionRequest,
  TerminalClientMessage,
  TerminalSize,
  UpdateFrameRequest,
  UpdateNodeRequest,
  canvasAddress,
  paths,
  placeOfSession,
  type AppendNoteResponse,
  type CreateSessionResponse,
  type ErrorCode,
  type ErrorResponse,
  type EventsServerMessage,
  type OutsideResponse,
  type OutsideResult,
  type SearchResponse,
  type ShowResponse,
  type Settings,
  type SnapshotResponse,
  type StateResponse,
  type TerminalServerMessage,
} from '@aubergine/shared';
import { MemoryActivityLog, BadActivityCursorError, type ActivityLog } from './activity';
import { authorize, bearerOf, peopleOnlyRefusal, principalFromBearer, type Action, type Principal, type Resource } from './auth';
import { RateLimiter } from './rate-limit';
import { TokenNotFoundError, Tokens } from './tokens';
import { BadCursorError } from './public-api';
import { registerPublicRoutes } from './v1';
import { Viewers } from './viewers';
import type { StateHub } from './state-hub';
import type { Outside } from './migrate/outside';
import { SessionNotFoundError, type Attachment, type SessionRuntime } from './runtime/runtime';
import { isTerminalReply } from './terminal-replies';
import { BadInputError, ConflictError, NotFoundError, RuntimeUnavailableError, type Sessions } from './sessions';
import { tokensMatch } from './token';
import { MemoryRunArchive, type RunArchive } from './run-archive';
import type { DraftLog } from './draft-log';
import { Drafts } from './drafts';
import { Repositories } from './repositories';
import { noInputAudit, type InputAudit } from './input-audit';
import { TerminalAccess, TerminalRefusal, type TerminalTrace } from './terminal-access';
import { Workflows } from './workflows';

export interface ServerOptions {
  hub: StateHub;
  sessions: Sessions;
  runtime: SessionRuntime;
  /** Connected browser tabs. Passed in so that the rest of the daemon can ask which canvas was looked at last. */
  viewers?: Viewers;
  /** Terminals outside the canvas. Left out, those routes answer that the feature is not available. */
  outside?: Outside;
  /** Returns the current settings, re-reading the settings file. */
  settings: () => Promise<Settings>;
  token: string;
  devOrigin: string | null;
  webDist: string;
  /** Where calls made with API tokens are recorded. Left out, they are kept in memory only. */
  activity?: ActivityLog;
  /** The folder the search for a repository stops at. Left out, the home folder. For tests. */
  homeFolder?: string;
  /** Where typed text is kept in full, when the owner switched that on. Left out, nowhere. */
  inputAudit?: InputAudit;
  /** Where what became of drafts is recorded. Left out, in memory only. */
  draftLog?: DraftLog;
  /** Where runs that are over are kept. Left out, in memory only. */
  runArchive?: RunArchive;
  /** The version this server reports about itself. */
  version?: string;
  /** Check every /v1 answer against the shape its route declares. On by default under the test runner. */
  validateResponses?: boolean;
}

/** A route of the public API, as the tests walk them. */
export interface PublicRoute {
  method: string;
  url: string;
}

const routeLists = new WeakMap<FastifyInstance, PublicRoute[]>();

/** Every route under /v1 that a server has, so that a test can try each one and none is forgotten. */
export function publicRoutesOf(app: FastifyInstance): PublicRoute[] {
  return routeLists.get(app) ?? [];
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
  const { hub, sessions, runtime, token } = options;
  // Limits are read once, when the server starts.
  const limits = (await options.settings()).api;
  const app = Fastify({ logger: false, bodyLimit: limits.maxBodyBytes });
  const tokens = new Tokens(hub);
  const limiter = new RateLimiter(limits.rateLimitPerMinute);
  const activity = options.activity ?? new MemoryActivityLog();
  const workflowSettings = (await options.settings()).workflows;
  const workflows = new Workflows(hub, sessions, options.runArchive ?? new MemoryRunArchive(), {
    limits: () => ({ maxElements: workflowSettings.maxElements, maxElementChars: workflowSettings.maxElementChars }),
    onError: (error) => console.error('Could not move a run:', error),
  });
  await workflows.reconcile();
  const workflowLimits = (): { maxElements: number; maxElementChars: number } => ({ maxElements: workflowSettings.maxElements, maxElementChars: workflowSettings.maxElementChars });
  const drafts = new Drafts(hub, sessions, workflows, workflowLimits, options.draftLog);
  const repositories = new Repositories(hub, sessions, workflows, workflowLimits, options.homeFolder);
  const terminalSettings = (await options.settings()).terminal;
  const terminals = new TerminalAccess(sessions, runtime, () => terminalSettings, options.inputAudit ?? noInputAudit);
  /** How much a terminal call read or typed, for the activity log. */
  const traces = new WeakMap<FastifyRequest, TerminalTrace>();
  /** What `authorize` is told about a session: where it is, its tags, whether it is closed to programs. */
  const resourceOf = (sessionId: string): Resource => {
    const session = hub.state.sessions.find((s) => s.id === sessionId);
    if (!session) return { sessionId };
    return { sessionId, session: { canvasId: placeOfSession(hub.state, sessionId)?.canvas.id ?? null, tags: session.tags, peopleOnly: session.peopleOnly } };
  };

  const routes: PublicRoute[] = [];
  routeLists.set(app, routes);
  app.addHook('onRoute', (route) => {
    if (route.url !== '/v1' && !route.url.startsWith('/v1/')) return;
    for (const method of [route.method].flat()) {
      if (method !== 'HEAD' && method !== 'OPTIONS') routes.push({ method, url: route.url });
    }
  });

  const port = (): number => (app.server.address() as AddressInfo).port;

  /** `host:port` values this server answers to, and the matching origins. */
  const allowed = (): { hosts: Set<string>; origins: Set<string> } => {
    const hosts = new Set([`127.0.0.1:${port()}`, `localhost:${port()}`]);
    if (options.devOrigin) hosts.add(new URL(options.devOrigin).host);
    return { hosts, origins: new Set([...hosts].map((h) => `http://${h}`)) };
  };

  const principals = new WeakMap<FastifyRequest, Principal>();
  /** The browser tabs that are connected, and which canvas each is showing. */
  const viewers = options.viewers ?? new Viewers();

  /** Refuses the request unless its principal may do `action` on the session. */
  const allowOn = (request: FastifyRequest, action: Action, resource: Resource): Principal => {
    const principal = principals.get(request);
    // Remembered for the activity log: what was asked for, whether or not it is allowed.
    asked.set(request, { action, resource });
    if (!principal || !authorize(principal, action, resource)) {
      // One clear answer for a token that would otherwise have been allowed: the owner closed this session to programs.
      if (principal && peopleOnlyRefusal(principal, action, resource)) throw new HttpError(403, 'people_only', 'This session is marked "people only": no token may read it or type into it.');
      throw new HttpError(403, 'forbidden', 'These credentials may not do that');
    }
    return principal;
  };

  /** What each request asked `authorize` for, and how a token call ended when that was decided before any route ran. */
  const asked = new WeakMap<FastifyRequest, { action: Action; resource: Resource }>();
  const tokenCalls = new WeakMap<FastifyRequest, { tokenId: string; tokenName: string; outcome?: 'refused' | 'limited'; logged?: boolean }>();

  /**
   * Whether an owner's call came from a page in a browser or from outside one.
   *
   * A browser adds `Sec-Fetch-Site` to every request a page makes, and a page
   * cannot leave it out. The command line does not send it. So an owner's
   * call without it did not come from the page. This tells apart, it does not
   * prevent: a program that runs as the owner can add the header, and can
   * leave out the session it runs in. It makes the ordinary case visible.
   */
  const ownerCaller = (request: FastifyRequest): OwnerCaller => {
    if (request.headers['sec-fetch-site'] !== undefined) return { kind: 'owner', sessionId: null };
    const said = request.headers[SESSION_HEADER];
    const sessionId = typeof said === 'string' && Id.safeParse(said).success && sessions.has(said) ? said : null;
    return { kind: 'owner-cli', sessionId };
  };
  /** What only the owner may do and is worth seeing when it was not done in the browser. */
  const WATCHED: readonly Action[] = ['drafts.review', 'repository.review', 'repository.write', 'tokens.manage', 'terminal.input', 'sessions.protect'];
  /** Reading a terminal is watched too, though it changes nothing. */
  const WATCHED_READS: readonly Action[] = ['terminal.read'];
  const ownerLogged = new WeakSet<FastifyRequest>();

  /** Records one call made with a token, or one of the owner's own from outside the browser. Who, what and how it ended: never the secret, never what was sent. */
  const record = (request: FastifyRequest, status: number): void => {
    const call = tokenCalls.get(request);
    if (!call) {
      const what = asked.get(request);
      if (principals.get(request)?.kind !== 'user' || !what || !(WATCHED_READS.includes(what.action) || (WATCHED.includes(what.action) && request.method !== 'GET')) || ownerLogged.has(request)) return;
      const caller = ownerCaller(request);
      if (caller.kind !== 'owner-cli') return;
      ownerLogged.add(request);
      void activity.append({
        at: new Date().toISOString(),
        caller: 'owner-cli',
        tokenId: null,
        tokenName: '',
        fromSessionId: caller.sessionId,
        chars: traces.get(request)?.chars ?? null,
        fingerprint: traces.get(request)?.fingerprint ?? null,
        action: what.action,
        resource: what.resource,
        method: request.method,
        route: request.routeOptions?.url ?? '(no such route)',
        status,
        outcome: status < 400 ? 'ok' : status === 403 ? 'denied' : 'error',
      });
      return;
    }
    if (call.logged) return;
    call.logged = true;
    const what = asked.get(request);
    void activity.append({
      at: new Date().toISOString(),
      caller: 'token',
      fromSessionId: null,
      chars: traces.get(request)?.chars ?? null,
      fingerprint: traces.get(request)?.fingerprint ?? null,
      tokenId: call.tokenId,
      tokenName: call.tokenName,
      action: what?.action ?? '',
      resource: what?.resource ?? {},
      method: request.method,
      route: request.routeOptions?.url ?? '(no such route)',
      status,
      outcome: call.outcome ?? (status < 400 ? 'ok' : status === 403 ? 'denied' : 'error'),
    });
  };
  app.addHook('onResponse', async (request, reply) => record(request, reply.statusCode));

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

    const isUpgrade = request.headers.upgrade?.toLowerCase() === 'websocket';
    const isSafeMethod = request.method === 'GET' || request.method === 'HEAD';
    const signedIn = tokensMatch(token, request.cookies[cookieName(port())]);

    // The public API. Three kinds of caller, and exactly one per request:
    // a program with an API token the owner made; a program inside a session,
    // with that session's token; and the signed-in browser, with its cookie
    // and the same Origin rule as /api. What each may do is decided per
    // route, by authorize().
    //
    // A bearer credential comes first and decides alone. A request that
    // carries one is never also the browser, whatever cookie came with it:
    // if the credential is wrong, the request is refused, not retried as the
    // cookie's owner.
    if (pathname === '/v1' || pathname.startsWith('/v1/')) {
      if (request.headers.authorization !== undefined) {
        const bearer = bearerOf(request.headers.authorization);
        const found = bearer ? tokens.authenticate(bearer) : null;
        if (found) {
          const call: { tokenId: string; tokenName: string; outcome?: 'refused' | 'limited' } = { tokenId: found.token.id, tokenName: found.token.name };
          tokenCalls.set(request, call);
          if (found.status !== 'active') {
            call.outcome = 'refused';
            return reply.code(401).send(errorBody('unauthorized', found.status === 'revoked' ? 'This token has been revoked' : 'This token has expired'));
          }
          const turn = limiter.take(found.token.id);
          if (!turn.ok) {
            call.outcome = 'limited';
            return reply
              .code(429)
              .header('retry-after', String(turn.retryAfterSeconds))
              .send(errorBody('rate_limited', `Too many calls with this token. Try again in ${turn.retryAfterSeconds} s.`));
          }
          tokens.touch(found.token.id);
          principals.set(request, { kind: 'token', tokenId: found.token.id, name: found.token.name, scopes: found.token.scopes, reviewWorkflows: found.token.reviewWorkflowChanges, reach: found.token.reach });
          return;
        }
        const principal = principalFromBearer(token, request.headers.authorization);
        if (!principal) return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong bearer token'));
        principals.set(request, principal);
        return;
      }
      if (!signedIn) return reply.code(401).send(errorBody('unauthorized', 'Not signed in'));
      if (origin === undefined && !isSafeMethod) {
        return reply.code(403).send(errorBody('forbidden', 'Origin header required'));
      }
      principals.set(request, { kind: 'user' });
      return;
    }

    if (origin === undefined && (isUpgrade || !isSafeMethod)) {
      return reply.code(403).send(errorBody('forbidden', 'Origin header required'));
    }

    if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) {
      if (!signedIn) return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong access token'));
      // Only the cookie opens these, so the caller is the owner.
      principals.set(request, { kind: 'user' });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message));
    }
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE' || (error as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).send(errorBody('too_large', `The request body is larger than this server accepts (${limits.maxBodyBytes} bytes).`));
    }
    if (error instanceof NotFoundError || error instanceof SessionNotFoundError || error instanceof TokenNotFoundError) {
      return reply.code(404).send(errorBody('not_found', error.message));
    }
    if (error instanceof BadInputError || error instanceof BadCursorError || error instanceof BadActivityCursorError) {
      return reply.code(400).send(errorBody('bad_request', error.message));
    }
    if (error instanceof TerminalRefusal) {
      if (error.retryAfterSeconds !== undefined) void reply.header('retry-after', String(error.retryAfterSeconds));
      return reply.code(error.status).send(errorBody(error.code, error.message));
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
    // A browser has no use for the hashes of token secrets, so they stay here.
    state: { ...hub.state, tokens: hub.state.tokens.map((t) => ({ ...t, hash: '' })) },
    defaultCanvasId: sessions.defaultCanvasId(),
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
  app.post(paths.restoreSession(':sessionId'), async (request): Promise<CreateSessionResponse> => {
    const body = parse(RestoreSessionRequest, request.body ?? {});
    return sessions.restore(idParam(request, 'sessionId'), body.canvasId ?? null);
  });
  /* ---------- Terminals outside the canvas (cookie only, like everything under /api) ---------- */

  const outside = (): Outside => {
    if (!options.outside) throw new HttpError(503, 'runtime_unavailable', 'Looking at outside terminals is not available');
    return options.outside;
  };

  // Looking at, bringing in and stopping what runs outside Aubergine is the owner's alone: authorize() refuses it to every token.
  app.get(paths.outside, async (request): Promise<OutsideResponse> => {
    allowOn(request, 'outside.read', {});
    return { terminals: await outside().list() };
  });

  app.post(paths.outsideAdd, async (request, reply): Promise<OutsideResult> => {
    allowOn(request, 'outside.move', {});
    const body = parse(OutsideAddRequest, request.body);
    reply.code(201);
    return outside().add(body);
  });

  app.post(paths.outsideMove, async (request): Promise<OutsideResult> => {
    allowOn(request, 'outside.move', {});
    const body = parse(OutsideMoveRequest, request.body);
    // Stop-and-resume sends a signal to a process the user started elsewhere.
    if (body.mode === 'stop') allowOn(request, 'processes.signal', {});
    return outside().move(body);
  });

  app.post(paths.resumeAgent(':sessionId'), async (request) => {
    const sessionId = idParam(request, 'sessionId');
    // An agent started again in a session that is on a run is told about the run again.
    const kickoff = workflows.kickoffFor(sessionId);
    return sessions.resumeAgent(sessionId, kickoff ? [kickoff] : []);
  });

  app.post(paths.showSession(':sessionId'), async (request): Promise<ShowResponse> => {
    const sessionId = idParam(request, 'sessionId');
    if (!sessions.has(sessionId)) throw new HttpError(404, 'not_found', `No session ${sessionId}`);
    // A tab already on the session's canvas if there is one; otherwise the tab used most recently.
    return { viewers: viewers.show(sessionId, placeOfSession(hub.state, sessionId)?.canvas.id ?? null) };
  });

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

  /* ---------- The public API, under /v1: declared in shared/src/routes.ts, handled in v1.ts ---------- */

  registerPublicRoutes(app, {
    hub,
    sessions,
    tokens,
    workflows,
    drafts,
    repositories,
    terminals,
    may: (principal, action, resource) => authorize(principal, action, resource),
    resourceOf,
    trace: (request, trace) => void traces.set(request, trace),
    activity,
    viewers,
    limiter,
    version: options.version ?? 'unknown',
    // In tests every answer is held against what its route declares.
    validateResponses: options.validateResponses ?? process.env.VITEST !== undefined,
    principalOf: (request) => principals.get(request) ?? null,
    recordNow: (request) => record(request, 200),
    ownerCaller,
    allow: allowOn,
    parse,
    fail: (status, code, message) => new HttpError(status, code, message),
  });

  /* ---------- WebSocket: change events ---------- */

  app.get(paths.events, { websocket: true }, (socket) => {
    const send = (message: EventsServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const unsubscribe = hub.subscribe((event) =>
      send({ type: 'event', event: event.type === 'token.created' ? { ...event, token: { ...event.token, hash: '' } } : event }),
    );
    const viewer = viewers.add(send);
    const leave = (): void => {
      unsubscribe();
      viewers.remove(viewer);
    };
    socket.on('close', leave);
    socket.on('error', leave);
    socket.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let message: EventsClientMessage;
      try {
        message = EventsClientMessage.parse(JSON.parse(raw.toString()));
      } catch {
        return; // Not something this version understands; a newer page may send more.
      }
      if (hub.state.canvases.some((c) => c.id === message.canvasId)) viewers.viewing(viewer, message.canvasId);
    });
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
        // Throttled inside: this is called for every key. What the terminal sends by itself
        // (answers to the program's queries, focus reports) is not typing.
        if (!isTerminalReply(message.data)) sessions.noteInput(sessionId);
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
    // The address of a canvas is a page of the same web app.
    app.get(canvasAddress(':canvasId'), async (_request, reply) => reply.sendFile('index.html'));
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
