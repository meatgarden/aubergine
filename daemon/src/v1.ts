import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  ActivityQuery,
  CloseCanvasQuery,
  CreateCanvasRequest,
  CreateFrameBody,
  CreateTokenRequest,
  EventsQuery,
  FEATURES,
  GRANTABLE_SCOPES,
  Id,
  KnownScope,
  RestoreSessionBody,
  SCOPE_MEANING,
  SessionsQuery,
  viewOfToken,
  type ActivityList,
  type AppState,
  type Capabilities,
  type ChangeEvent,
  type CreatedToken,
  type ShownResponse,
  type TokenList,
  type TokenView,
  MoveSessionRequest,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  PageQuery,
  PatchFrameRequest,
  PatchNodeRequest,
  PatchSessionRequest,
  StartSessionRequest,
  UpdateCanvasRequest,
  canvasCounts,
  canvasOfNode,
  placeOfSession,
  publicPaths,
  type Canvas,
  type CanvasDetail,
  type CanvasList,
  type CanvasSummary,
  type ErrorCode,
  type Frame,
  type LayoutNode,
  type PlacedSession,
  type SessionList,
} from '@aubergine/shared';
import type { ActivityLog } from './activity';
import type { Action, Principal, Resource } from './auth';
import type { RateLimiter } from './rate-limit';
import type { Tokens } from './tokens';
import type { Viewers } from './viewers';
import { IdempotencyStore, idempotencyKey, paginate, sendRemembered } from './public-api';
import type { Session } from '@aubergine/shared';
import type { Sessions } from './sessions';
import type { StateHub } from './state-hub';

export interface PublicRouteDeps {
  hub: StateHub;
  sessions: Sessions;
  tokens: Tokens;
  activity: ActivityLog;
  viewers: Viewers;
  limiter: RateLimiter;
  /** The version the capability endpoint reports. */
  version: string;
  /** Who a request was found to be, when the checks let it through. */
  principalOf(request: FastifyRequest): Principal | null;
  /** Records a token's call now, for a route whose response does not end for a long time. */
  recordNow(request: FastifyRequest): void;
  /** Refuses the request unless its principal may do the action. Every route here calls it first. */
  allow(request: FastifyRequest, action: Action, resource: Resource): Principal;
  parse<T>(schema: ZodType<T>, value: unknown): T;
  fail(status: number, code: ErrorCode, message: string): Error;
}

/**
 * The public API for canvases, under /v1. The shapes are a promise to other
 * programs (see the note in shared/src/protocol.ts): add, never rename.
 *
 * Who may call what is not decided here: each route asks `allow`, which asks
 * `authorize`. Today that lets the signed-in browser through and refuses
 * session tokens.
 */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRouteDeps): void {
  const { hub, sessions, allow, parse } = deps;
  const remembered = new IdempotencyStore();

  const param = (request: FastifyRequest, name: string): string => parse(Id, (request.params as Record<string, string>)[name]);

  const summary = (canvas: Canvas): CanvasSummary => {
    const { layout: _layout, ...rest } = canvas;
    return { ...rest, counts: canvasCounts(hub.state, canvas) };
  };
  const detail = (canvas: Canvas): CanvasDetail => ({ ...summary(canvas), nodes: canvas.layout.nodes, frames: canvas.layout.frames });

  /** Who is asking, for keeping one caller's idempotency keys apart from another's. */
  const caller = (principal: Principal): string =>
    principal.kind === 'user' ? 'user' : principal.kind === 'token' ? `token:${principal.tokenId}` : `session:${principal.sessionId}`;

  /* ---------- What this server can do ---------- */

  // Needs no scope: any caller that got this far may ask what the server offers and who it is taken to be.
  app.get(publicPaths.root, async (request): Promise<Capabilities> => {
    const principal = deps.principalOf(request);
    if (!principal) throw deps.fail(401, 'unauthorized', 'Not signed in');
    const token = principal.kind === 'token' ? hub.state.tokens.find((t) => t.id === principal.tokenId) : undefined;
    return {
      name: 'aubergine',
      version: deps.version,
      api: 'v1',
      features: [...FEATURES],
      scopes: KnownScope.options.map((name) => ({ name, grantable: (GRANTABLE_SCOPES as readonly string[]).includes(name), meaning: SCOPE_MEANING[name] })),
      caller:
        principal.kind === 'user'
          ? { kind: 'user' }
          : principal.kind === 'session'
            ? { kind: 'session', sessionId: principal.sessionId }
            : { kind: 'token', id: principal.tokenId, name: principal.name, scopes: [...principal.scopes], expiresAt: token?.expiresAt ?? null },
    };
  });

  /* ---------- Tokens, and what they did: the owner in the browser only ---------- */

  app.get(publicPaths.tokens, async (request): Promise<TokenList> => {
    allow(request, 'tokens.manage', {});
    return paginate(deps.tokens.list().map(viewOfToken), (t) => t.id, parse(PageQuery, request.query));
  });

  app.post(publicPaths.tokens, async (request, reply): Promise<CreatedToken> => {
    allow(request, 'tokens.manage', {});
    const created = deps.tokens.create(parse(CreateTokenRequest, request.body));
    // The one and only time the secret leaves the server. It must not be cached anywhere on the way.
    reply.code(201).header('cache-control', 'no-store');
    return { token: viewOfToken(created.token), secret: created.secret };
  });

  app.delete(publicPaths.token(':tokenId'), async (request): Promise<TokenView> => {
    const tokenId = param(request, 'tokenId');
    allow(request, 'tokens.manage', {});
    const revoked = deps.tokens.revoke(tokenId);
    deps.limiter.forget(tokenId);
    return viewOfToken(revoked);
  });

  app.get(publicPaths.activity, async (request): Promise<ActivityList> => {
    allow(request, 'activity.read', {});
    return deps.activity.read(parse(ActivityQuery, request.query));
  });

  /* ---------- Sessions ---------- */

  app.get(publicPaths.sessions, async (request): Promise<SessionList> => {
    allow(request, 'sessions.read', {});
    const query = parse(SessionsQuery, request.query);
    const wanted = query.state === undefined ? hub.state.sessions : hub.state.sessions.filter((s) => s.state === query.state);
    return paginate(wanted, (s) => s.id, query);
  });

  app.get(publicPaths.session(':sessionId'), async (request): Promise<Session> => {
    const sessionId = param(request, 'sessionId');
    allow(request, 'sessions.read', { sessionId });
    const session = hub.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw deps.fail(404, 'not_found', `No session ${sessionId}`);
    return session;
  });

  app.delete(publicPaths.session(':sessionId'), async (request, reply) => {
    const sessionId = param(request, 'sessionId');
    allow(request, 'sessions.write', { sessionId });
    await sessions.close(sessionId);
    return reply.code(204).send();
  });

  app.post(publicPaths.parkSession(':sessionId'), async (request): Promise<Session> => {
    const sessionId = param(request, 'sessionId');
    allow(request, 'sessions.write', { sessionId });
    return sessions.park(sessionId);
  });

  app.post(publicPaths.restoreSession(':sessionId'), async (request): Promise<PlacedSession> => {
    const sessionId = param(request, 'sessionId');
    allow(request, 'sessions.write', { sessionId });
    const body = parse(RestoreSessionBody, request.body ?? {});
    const restored = sessions.restore(sessionId, body.canvasId ?? null);
    return { session: restored.session, canvasId: placeOfSession(hub.state, sessionId)?.canvas.id ?? body.canvasId ?? '', node: restored.node };
  });

  /* ---------- Bringing something up in an open browser ---------- */

  app.post(publicPaths.showSession(':sessionId'), async (request): Promise<ShownResponse> => {
    const sessionId = param(request, 'sessionId');
    allow(request, 'sessions.show', { sessionId });
    if (!sessions.has(sessionId)) throw deps.fail(404, 'not_found', `No session ${sessionId}`);
    return { shown: deps.viewers.show(sessionId, placeOfSession(hub.state, sessionId)?.canvas.id ?? null) };
  });

  app.post(publicPaths.showCanvas(':canvasId'), async (request): Promise<ShownResponse> => {
    const canvasId = param(request, 'canvasId');
    allow(request, 'canvases.show', { canvasId });
    sessions.getCanvas(canvasId);
    return { shown: deps.viewers.showCanvas(canvasId) };
  });

  /* ---------- The stream of changes ---------- */

  // Server-sent events: one `data:` line of JSON per change. It needs nothing but an HTTP client,
  // and a bearer token goes in a header as on every other route.
  app.get(publicPaths.events, async (request, reply) => {
    allow(request, 'events.read', {});
    const { canvasId } = parse(EventsQuery, request.query);
    if (canvasId !== undefined) sessions.getCanvas(canvasId);
    deps.recordNow(request);

    reply.hijack();
    const out = reply.raw;
    out.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    out.write(': connected\n\n');
    const unsubscribe = hub.subscribe((event) => {
      // Tokens and what they did are the owner's business, not a stream's.
      if (event.type.startsWith('token.')) return;
      if (canvasId !== undefined && !concerns(hub.state, event, canvasId)) return;
      out.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const beat = setInterval(() => out.write(': still here\n\n'), 25_000);
    const end = (): void => {
      clearInterval(beat);
      unsubscribe();
    };
    request.raw.on('close', end);
    out.on('error', end);
  });

  /* ---------- Canvases ---------- */

  app.get(publicPaths.canvases, async (request): Promise<CanvasList> => {
    allow(request, 'canvases.read', {});
    const page = paginate(sessions.listCanvases(), (c) => c.id, parse(PageQuery, request.query));
    return { items: page.items.map(summary), nextCursor: page.nextCursor };
  });

  app.post(publicPaths.canvases, async (request, reply) => {
    const principal = allow(request, 'canvases.write', {});
    const body = parse(CreateCanvasRequest, request.body);
    const answer = await remembered.run(idempotencyKey(request, caller(principal)), async () => ({
      status: 201,
      body: detail(sessions.createCanvas(body)),
    }));
    return sendRemembered(reply, answer);
  });

  app.get(publicPaths.canvas(':canvasId'), async (request): Promise<CanvasDetail> => {
    const canvasId = param(request, 'canvasId');
    allow(request, 'canvases.read', { canvasId });
    return detail(sessions.getCanvas(canvasId));
  });

  app.patch(publicPaths.canvas(':canvasId'), async (request): Promise<CanvasDetail> => {
    const canvasId = param(request, 'canvasId');
    allow(request, 'canvases.write', { canvasId });
    return detail(sessions.updateCanvas(canvasId, parse(UpdateCanvasRequest, request.body)));
  });

  app.delete(publicPaths.canvas(':canvasId'), async (request, reply) => {
    const canvasId = param(request, 'canvasId');
    allow(request, 'canvases.write', { canvasId });
    const query = parse(CloseCanvasQuery, request.query);
    const choice =
      query.sessions === 'move' && query.to !== undefined
        ? ({ sessions: 'move', to: query.to } as const)
        : query.sessions === 'park'
          ? ({ sessions: 'park' } as const)
          : null;
    sessions.removeCanvas(canvasId, choice);
    return reply.code(204).send();
  });

  /* ---------- Sessions on a canvas ---------- */

  app.get(publicPaths.canvasSessions(':canvasId'), async (request): Promise<SessionList> => {
    const canvasId = param(request, 'canvasId');
    allow(request, 'sessions.read', { canvasId });
    const canvas = sessions.getCanvas(canvasId);
    const byId = new Map(hub.state.sessions.map((s) => [s.id, s]));
    const here = canvas.layout.nodes.flatMap((node) => byId.get(node.sessionId) ?? []);
    return paginate(here, (s) => s.id, parse(PageQuery, request.query));
  });

  app.post(publicPaths.canvasSessions(':canvasId'), async (request, reply) => {
    const canvasId = param(request, 'canvasId');
    const principal = allow(request, 'sessions.write', { canvasId });
    const body = parse(StartSessionRequest, request.body ?? {});
    sessions.getCanvas(canvasId); // a clear 404 before anything is remembered or started
    const answer = await remembered.run(idempotencyKey(request, caller(principal)), async () => {
      const { position, ...rest } = body;
      const created = await sessions.create({
        ...rest,
        canvasId,
        ...(position
          ? { rect: { x: position.x, y: position.y, width: position.width ?? NODE_DEFAULT_WIDTH, height: position.height ?? NODE_DEFAULT_HEIGHT } }
          : {}),
      });
      const placed: PlacedSession = { session: created.session, canvasId, node: created.node };
      return { status: 201, body: placed };
    });
    return sendRemembered(reply, answer);
  });

  app.patch(publicPaths.session(':sessionId'), async (request): Promise<Session> => {
    const sessionId = param(request, 'sessionId');
    // Decided before the body is looked at closely: the name and tags are the session's, the pinned note is notes.
    const fields = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {};
    const touchesNote = fields.note !== undefined;
    const touchesSession = fields.name !== undefined || fields.tags !== undefined || !touchesNote;
    if (touchesSession) allow(request, 'sessions.write', { sessionId });
    if (touchesNote) allow(request, 'notes.write', { sessionId });
    return sessions.update(sessionId, parse(PatchSessionRequest, request.body));
  });

  app.post(publicPaths.moveSession(':sessionId'), async (request): Promise<PlacedSession> => {
    const sessionId = param(request, 'sessionId');
    allow(request, 'sessions.write', { sessionId });
    const body = parse(MoveSessionRequest, request.body);
    const moved = sessions.moveToCanvas(sessionId, body.canvasId, body.position);
    return { session: moved.session, canvasId: placeOfSession(hub.state, sessionId)?.canvas.id ?? body.canvasId, node: moved.node };
  });

  /* ---------- Nodes and frames of a canvas ---------- */

  app.patch(publicPaths.canvasNode(':canvasId', ':nodeId'), async (request): Promise<LayoutNode> => {
    const canvasId = param(request, 'canvasId');
    const nodeId = param(request, 'nodeId');
    allow(request, 'layout.write', { canvasId });
    const changes = parse(PatchNodeRequest, request.body);
    const place = canvasOfNode(hub.state, nodeId);
    if (!place || place.canvas.id !== canvasId) throw deps.fail(404, 'not_found', `No node ${nodeId} on that canvas`);
    const { color, ...rect } = changes;
    const { x, y, width, height } = { ...place.node, ...rect };
    return sessions.updateNode(nodeId, { x, y, width, height, ...(color ? { color } : {}) }, canvasId);
  });

  app.post(publicPaths.canvasFrames(':canvasId'), async (request, reply) => {
    const canvasId = param(request, 'canvasId');
    const principal = allow(request, 'layout.write', { canvasId });
    const { label, color, ...rect } = parse(CreateFrameBody, request.body);
    sessions.getCanvas(canvasId);
    const answer = await remembered.run(idempotencyKey(request, caller(principal)), async () => {
      let frame: Frame = sessions.createFrame({ rect, canvasId, ...(label !== undefined ? { label } : {}) });
      if (color) frame = sessions.updateFrame(frame.id, { ...rect, color }, canvasId);
      return { status: 201, body: frame };
    });
    return sendRemembered(reply, answer);
  });

  app.patch(publicPaths.canvasFrame(':canvasId', ':frameId'), async (request): Promise<Frame> => {
    const canvasId = param(request, 'canvasId');
    const frameId = param(request, 'frameId');
    allow(request, 'layout.write', { canvasId });
    const changes = parse(PatchFrameRequest, request.body);
    const existing = sessions.getCanvas(canvasId).layout.frames.find((f) => f.id === frameId);
    if (!existing) throw deps.fail(404, 'not_found', `No frame ${frameId} on that canvas`);
    const { label, color, carry, ...rect } = changes;
    const { x, y, width, height } = { ...existing, ...rect };
    return sessions.updateFrame(
      frameId,
      { x, y, width, height, ...(label !== undefined ? { label } : {}), ...(color ? { color } : {}), ...(carry ? { carry } : {}) },
      canvasId,
    );
  });

  app.delete(publicPaths.canvasFrame(':canvasId', ':frameId'), async (request, reply) => {
    const canvasId = param(request, 'canvasId');
    const frameId = param(request, 'frameId');
    allow(request, 'layout.write', { canvasId });
    sessions.removeFrame(frameId, canvasId);
    return reply.code(204).send();
  });
}

/** Whether a change concerns a canvas: it names that canvas, or a session that is on it. */
function concerns(state: AppState, event: ChangeEvent, canvasId: string): boolean {
  if ('canvasId' in event) return event.canvasId === canvasId;
  if ('canvas' in event) return event.canvas.id === canvasId;
  if ('sessionId' in event) return placeOfSession(state, event.sessionId)?.canvas.id === canvasId;
  return false;
}
