import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  CloseCanvasQuery,
  CreateCanvasRequest,
  CreateFrameBody,
  Id,
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
import type { Action, Principal, Resource } from './auth';
import { IdempotencyStore, idempotencyKey, paginate, sendRemembered } from './public-api';
import type { Session } from '@aubergine/shared';
import type { Sessions } from './sessions';
import type { StateHub } from './state-hub';

export interface PublicRouteDeps {
  hub: StateHub;
  sessions: Sessions;
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
  const caller = (principal: Principal): string => (principal.kind === 'user' ? 'user' : `session:${principal.sessionId}`);

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
    allow(request, 'sessions.write', { sessionId });
    return sessions.update(sessionId, parse(PatchSessionRequest, request.body));
  });

  app.post(publicPaths.moveSession(':sessionId'), async (request): Promise<PlacedSession> => {
    const sessionId = param(request, 'sessionId');
    const body = parse(MoveSessionRequest, request.body);
    allow(request, 'sessions.write', { sessionId, canvasId: body.canvasId });
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
