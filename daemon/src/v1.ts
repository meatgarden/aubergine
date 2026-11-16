import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  FEATURES,
  GRANTABLE_SCOPES,
  KnownScope,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  ROUTES,
  ROUTE_IDS,
  SCOPE_MEANING,
  canvasCounts,
  canvasOfNode,
  detailOfWorkflow,
  summaryOfWorkflow,
  openApiDocument,
  placeOfSession,
  viewOfToken,
  type Action,
  type AppState,
  type Canvas,
  type CanvasDetail,
  type CanvasSummary,
  type ChangeEvent,
  type ErrorCode,
  type OwnerCaller,
  type Frame,
  type RouteId,
  type RouteInput,
  type RouteOutput,
  type RouteSpec,
} from '@aubergine/shared';
import type { ActivityLog } from './activity';
import type { Principal, Resource } from './auth';
import { IdempotencyStore, idempotencyKey, paginate, sendRemembered } from './public-api';
import type { RateLimiter } from './rate-limit';
import type { Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { Tokens } from './tokens';
import type { Viewers } from './viewers';
import type { Drafts } from './drafts';
import type { Repositories } from './repositories';
import { actorOf, type Workflows } from './workflows';

export interface PublicRouteDeps {
  hub: StateHub;
  sessions: Sessions;
  tokens: Tokens;
  workflows: Workflows;
  drafts: Drafts;
  repositories: Repositories;
  activity: ActivityLog;
  viewers: Viewers;
  limiter: RateLimiter;
  /** The version the capability endpoint reports. */
  version: string;
  /** Checks every answer against the shape its route declares, and fails loudly when it differs. On in tests. */
  validateResponses: boolean;
  /** Who a request was found to be, when the checks let it through. */
  principalOf(request: FastifyRequest): Principal | null;
  /** Whether an owner's call came from a browser page or from outside one, and from which session it says it came. */
  ownerCaller(request: FastifyRequest): OwnerCaller;
  /** Records a token's call now, for a route whose response does not end for a long time. */
  recordNow(request: FastifyRequest): void;
  /** Refuses the request unless its principal may do the action. Asked for every route before anything else. */
  allow(request: FastifyRequest, action: Action, resource: Resource): Principal;
  parse<T>(schema: ZodType<T>, value: unknown): T;
  fail(status: number, code: ErrorCode, message: string): Error;
}

/** What a handler is given: the route's input, already checked, and who is asking. */
type Context<I extends RouteId> = RouteInput<I> & { principal: Principal; request: FastifyRequest; reply: FastifyReply };
type Handlers = { [I in RouteId]: (context: Context<I>) => RouteOutput<I> | Promise<RouteOutput<I>> };

/**
 * The public API, under /v1.
 *
 * The routes themselves are declared in `shared/src/routes.ts`. This file
 * holds what each one does, and one loop that registers them all the same
 * way: parameters are checked, then `authorize` is asked, then the query and
 * the body are checked, then the handler runs. No handler decides who may
 * call it, and no route exists that is not declared.
 */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRouteDeps): void {
  const { hub, sessions, workflows, drafts, repositories, parse } = deps;
  const remembered = new IdempotencyStore();

  const summary = (canvas: Canvas): CanvasSummary => {
    const { layout: _layout, ...rest } = canvas;
    return { ...rest, counts: canvasCounts(hub.state, canvas) };
  };
  const detail = (canvas: Canvas): CanvasDetail => ({ ...summary(canvas), nodes: canvas.layout.nodes, frames: canvas.layout.frames });

  /** Who is asking, for keeping one caller's idempotency keys apart from another's. */
  const caller = (principal: Principal): string =>
    principal.kind === 'user' ? 'user' : principal.kind === 'token' ? `token:${principal.tokenId}` : `session:${principal.sessionId}`;

  const handlers: Handlers = {
    /* ---------- The server itself ---------- */

    getCapabilities: ({ principal }) => {
      const token = principal.kind === 'token' ? hub.state.tokens.find((t) => t.id === principal.tokenId) : undefined;
      return {
        name: 'aubergine',
        version: deps.version,
        api: 'v1',
        description: ROUTES.getDescription.path,
        features: [...FEATURES],
        scopes: KnownScope.options.map((name) => ({ name, grantable: (GRANTABLE_SCOPES as readonly string[]).includes(name), meaning: SCOPE_MEANING[name] })),
        caller:
          principal.kind === 'user'
            ? { kind: 'user' }
            : principal.kind === 'session'
              ? { kind: 'session', sessionId: principal.sessionId }
              : { kind: 'token', id: principal.tokenId, name: principal.name, scopes: [...principal.scopes], expiresAt: token?.expiresAt ?? null },
      };
    },

    getDescription: () => ({ ...openApiDocument({ version: deps.version }) }),

    /* ---------- Canvases ---------- */

    listCanvases: ({ query }) => {
      const page = paginate(sessions.listCanvases(), (c) => c.id, query);
      return { items: page.items.map(summary), nextCursor: page.nextCursor };
    },

    createCanvas: ({ body }) => detail(sessions.createCanvas(body)),

    getCanvas: ({ params }) => detail(sessions.getCanvas(params.canvasId)),

    updateCanvas: ({ params, body }) => detail(sessions.updateCanvas(params.canvasId, body)),

    closeCanvas: ({ params, query }) => {
      const choice =
        query.sessions === 'move' && query.to !== undefined
          ? ({ sessions: 'move', to: query.to } as const)
          : query.sessions === 'park'
            ? ({ sessions: 'park' } as const)
            : null;
      sessions.removeCanvas(params.canvasId, choice);
    },

    showCanvas: ({ params }) => {
      sessions.getCanvas(params.canvasId);
      return { shown: deps.viewers.showCanvas(params.canvasId) };
    },

    /* ---------- Sessions ---------- */

    listCanvasSessions: ({ params, query }) => {
      const canvas = sessions.getCanvas(params.canvasId);
      const byId = new Map(hub.state.sessions.map((s) => [s.id, s]));
      return paginate(
        canvas.layout.nodes.flatMap((node) => byId.get(node.sessionId) ?? []),
        (s) => s.id,
        query,
      );
    },

    startSession: async ({ params, body }) => {
      // A clear 404 before anything is started.
      sessions.getCanvas(params.canvasId);
      const { position, ...rest } = body;
      const created = await sessions.create({
        ...rest,
        canvasId: params.canvasId,
        ...(position
          ? { rect: { x: position.x, y: position.y, width: position.width ?? NODE_DEFAULT_WIDTH, height: position.height ?? NODE_DEFAULT_HEIGHT } }
          : {}),
      });
      return { session: created.session, canvasId: params.canvasId, node: created.node };
    },

    listSessions: ({ query }) => {
      const wanted = query.state === undefined ? hub.state.sessions : hub.state.sessions.filter((s) => s.state === query.state);
      return paginate(wanted, (s) => s.id, query);
    },

    getSession: ({ params }) => {
      const session = hub.state.sessions.find((s) => s.id === params.sessionId);
      if (!session) throw deps.fail(404, 'not_found', `No session ${params.sessionId}`);
      return session;
    },

    updateSession: ({ params, body }) => sessions.update(params.sessionId, body),

    endSession: async ({ params }) => {
      await sessions.close(params.sessionId);
    },

    moveSession: ({ params, body }) => {
      const moved = sessions.moveToCanvas(params.sessionId, body.canvasId, body.position);
      return { session: moved.session, canvasId: placeOfSession(hub.state, params.sessionId)?.canvas.id ?? body.canvasId, node: moved.node };
    },

    parkSession: ({ params }) => sessions.park(params.sessionId),

    restoreSession: ({ params, body }) => {
      const restored = sessions.restore(params.sessionId, body.canvasId ?? null);
      return { session: restored.session, canvasId: placeOfSession(hub.state, params.sessionId)?.canvas.id ?? body.canvasId ?? '', node: restored.node };
    },

    showSession: ({ params }) => {
      if (!sessions.has(params.sessionId)) throw deps.fail(404, 'not_found', `No session ${params.sessionId}`);
      return { shown: deps.viewers.show(params.sessionId, placeOfSession(hub.state, params.sessionId)?.canvas.id ?? null) };
    },

    /* ---------- Notes ---------- */

    appendNote: ({ params, body, principal }) => ({
      entry: sessions.appendNote(params.sessionId, {
        // Anything that is not the owner in the browser is a program.
        author: principal.kind === 'user' ? 'user' : 'agent',
        kind: body.kind,
        text: body.text,
      }),
    }),

    /* ---------- Layout ---------- */

    updateNode: ({ params, body }) => {
      const place = canvasOfNode(hub.state, params.nodeId);
      if (!place || place.canvas.id !== params.canvasId) throw deps.fail(404, 'not_found', `No node ${params.nodeId} on that canvas`);
      const { color, ...rect } = body;
      const { x, y, width, height } = { ...place.node, ...rect };
      return sessions.updateNode(params.nodeId, { x, y, width, height, ...(color ? { color } : {}) }, params.canvasId);
    },

    createFrame: ({ params, body }) => {
      const { label, color, ...rect } = body;
      sessions.getCanvas(params.canvasId);
      let frame: Frame = sessions.createFrame({ rect, canvasId: params.canvasId, ...(label !== undefined ? { label } : {}) });
      if (color) frame = sessions.updateFrame(frame.id, { ...rect, color }, params.canvasId);
      return frame;
    },

    updateFrame: ({ params, body }) => {
      const existing = sessions.getCanvas(params.canvasId).layout.frames.find((f) => f.id === params.frameId);
      if (!existing) throw deps.fail(404, 'not_found', `No frame ${params.frameId} on that canvas`);
      const { label, color, carry, ...rect } = body;
      const { x, y, width, height } = { ...existing, ...rect };
      return sessions.updateFrame(
        params.frameId,
        { x, y, width, height, ...(label !== undefined ? { label } : {}), ...(color ? { color } : {}), ...(carry ? { carry } : {}) },
        params.canvasId,
      );
    },

    removeFrame: ({ params }) => {
      sessions.removeFrame(params.frameId, params.canvasId);
    },

    /* ---------- Workflows ---------- */

    listWorkflows: ({ query }) => {
      const page = paginate(workflows.list(), (w) => w.id, query);
      return { items: page.items.map(summaryOfWorkflow), nextCursor: page.nextCursor };
    },

    createWorkflow: ({ body }) => detailOfWorkflow(workflows.create(body)),

    getWorkflow: ({ params }) => detailOfWorkflow(workflows.get(params.workflowId)),

    updateWorkflow: ({ params, body }) => detailOfWorkflow(workflows.update(params.workflowId, body)),

    removeWorkflow: ({ params }) => {
      workflows.remove(params.workflowId);
    },

    copyWorkflow: ({ params, body }) => detailOfWorkflow(workflows.copy(params.workflowId, body.name)),

    listWorkflowVersions: ({ params, query }) => paginate(workflows.versions(params.workflowId), (v) => String(v.number), query),

    listWorkflowTemplates: ({ query }) => paginate(workflows.templates(), (t) => t.name, query),

    useWorkflowTemplate: ({ params, body }) => detailOfWorkflow(workflows.useTemplate(params.template, body.name)),

    /* ---------- Runs ---------- */

    listRuns: ({ query }) => workflows.listRuns(query),

    // The line that tells an agent about its run is typed for the owner only: typing into a terminal is not something a token may cause.
    startRun: ({ body, principal }) => workflows.start({ ...body, typeKickoff: body.kickoff && principal.kind === 'user' }, actorOf(principal)),

    startSessionRun: ({ params, body, principal }) =>
      workflows.start({ ...body, sessionId: params.sessionId, typeKickoff: body.kickoff && principal.kind === 'user' }, actorOf(principal)),

    getRun: ({ params }) => workflows.getRun(params.runId),

    reportRun: ({ params, body, principal }) => workflows.report(params.runId, body, actorOf(principal)),

    /* ---------- Drafts ---------- */

    listDrafts: ({ query }) => paginate(drafts.list(), (d) => d.id, query),

    getDraft: ({ params }) => drafts.detail(drafts.get(params.draftId)),

    // What comes in here is kept as a draft and nothing more: no run, no workflow, nothing typed.
    proposeDraft: ({ body, principal }) =>
      drafts.detail(drafts.propose(body, principal.kind === 'token' ? { kind: 'token', tokenId: principal.tokenId, name: principal.name } : principal.kind === 'session' ? { kind: 'session', sessionId: principal.sessionId } : { kind: 'person' })),

    reviseDraft: ({ params, body }) => drafts.detail(drafts.revise(params.draftId, body)),

    acceptDraft: ({ params, body, request }) => drafts.accept(params.draftId, body, deps.ownerCaller(request)),

    listDraftRecords: async ({ query }) => paginate(await drafts.records(), (r) => `${r.at} ${r.draftId}`, query),

    returnDraft: ({ params, body }) => drafts.sendBack(params.draftId, body.comment),

    discardDraft: ({ params, request }) => {
      drafts.discard(params.draftId, deps.ownerCaller(request));
    },

    requestDraft: ({ body }) => drafts.request(body),

    /* ---------- The shelf ---------- */

    listElements: ({ query }) => paginate(drafts.shelf(), (e) => e.id, query),

    createElement: ({ body }) => drafts.createOnShelf(body),

    updateElement: ({ params, body }) => drafts.updateOnShelf(params.elementId, body),

    removeElement: ({ params }) => {
      drafts.removeFromShelf(params.elementId);
    },

    copyElement: ({ params }) => drafts.copyOnShelf(params.elementId),

    runElement: ({ params, body, principal }) => {
      const { kickoff, ...rest } = body;
      return workflows.startElement(drafts.shelfElement(params.elementId).element, { ...rest, typeKickoff: kickoff && principal.kind === 'user' }, actorOf(principal));
    },

    tickRunItem: ({ params, body, principal }) => workflows.tick(params.runId, body, actorOf(principal)),

    /* ---------- Workflows kept in a repository ---------- */

    listRepositoryWorkflows: async ({ query }) => paginate(await repositories.listing(), (r) => r.root, query),

    getRepositoryWorkflow: ({ query }) => repositories.detail(query.root, query.file),

    acceptRepositoryWorkflow: ({ body }) => repositories.accept(body.root, body.file, body.hash),

    saveToRepository: ({ body }) => repositories.save(body.sessionId, body.workflowId, body.overwrite),

    runRepositoryWorkflow: ({ params, body, principal }) => {
      const { file, kickoff, ...rest } = body;
      return repositories.run(params.sessionId, file, { ...rest, typeKickoff: kickoff && principal.kind === 'user' }, actorOf(principal));
    },

    /* ---------- The stream of changes ---------- */

    // Server-sent events: one `data:` line of JSON per change. It needs nothing but an HTTP client,
    // and a bearer token goes in a header as on every other route.
    streamEvents: ({ query, request, reply }) => {
      const { canvasId } = query;
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
    },

    /* ---------- Tokens, and what they did: the owner in the browser only ---------- */

    listTokens: ({ query }) => paginate(deps.tokens.list().map(viewOfToken), (t) => t.id, query),

    createToken: ({ body, reply }) => {
      const created = deps.tokens.create(body);
      // The one and only time the secret leaves the server. It must not be cached anywhere on the way.
      reply.header('cache-control', 'no-store');
      return { token: viewOfToken(created.token), secret: created.secret };
    },

    revokeToken: ({ params }) => {
      const revoked = deps.tokens.revoke(params.tokenId);
      deps.limiter.forget(params.tokenId);
      return viewOfToken(revoked);
    },

    listActivity: ({ query }) => deps.activity.read(query),

    /* ---------- What a session reports about itself ---------- */

    setAttention: ({ params, body }) => sessions.setAttention(params.sessionId, body.state, body.message),

    reportAgent: ({ params, body }) => sessions.reportAgent(params.sessionId, body),

    // The run a session is on. The address names the session, and `authorize` has already
    // made sure a session's token is that session's own: there is no way from here to another run.
    getSessionRun: ({ params }) => workflows.ownRun(params.sessionId),

    // What a session was asked to write, and what it wrote: its own, by its own address. It cannot accept anything.
    getSessionBrief: ({ params }) => drafts.brief(params.sessionId),

    listSessionDrafts: ({ params, query }) => paginate(drafts.ofSession(params.sessionId), (d) => d.id, query),

    proposeSessionDraft: ({ params, body }) => drafts.proposeFromSession(params.sessionId, body),

    // What the repository of the session's own folder offers, and whether each was accepted. Reading only.
    getSessionRepositoryWorkflows: ({ params }) => repositories.offer(params.sessionId),

    reportSessionRun: ({ params, body, principal }) => workflows.reportOwn(params.sessionId, body, actorOf(principal)),
  };

  /** Which actions a request asks for: the route's own, and those of the fields it sends that need another. */
  const actionsFor = (spec: RouteSpec, body: unknown): Action[] => {
    if (spec.action === null) return [];
    if (!spec.fieldActions) return [spec.action];
    const sent = body && typeof body === 'object' ? Object.keys(body).filter((key) => (body as Record<string, unknown>)[key] !== undefined) : [];
    const special = sent.filter((key) => spec.fieldActions?.[key] !== undefined);
    const actions = new Set<Action>(special.map((key) => spec.fieldActions?.[key] as Action));
    // Anything else in the body, or nothing at all, is the route's own business.
    if (special.length < sent.length || special.length === 0) actions.add(spec.action);
    return [...actions];
  };

  for (const id of ROUTE_IDS) {
    const spec: RouteSpec = ROUTES[id];
    // Typed per route above; here every route is handled alike.
    const handle = handlers[id] as (context: { params: unknown; query: unknown; body: unknown; principal: Principal; request: FastifyRequest; reply: FastifyReply }) => unknown;

    app.route({
      method: spec.method,
      url: spec.path,
      handler: async (request, reply) => {
        const params = spec.params ? (parse(spec.params, request.params) as Record<string, string>) : {};

        // Who may: decided before the query or the body is looked at closely, and before anything is looked up.
        const resource: Resource = { ...(params.sessionId ? { sessionId: params.sessionId } : {}), ...(params.canvasId ? { canvasId: params.canvasId } : {}) };
        let principal = deps.principalOf(request);
        for (const action of actionsFor(spec, request.body)) principal = deps.allow(request, action, resource);
        if (!principal) throw deps.fail(401, 'unauthorized', 'Not signed in');

        const query = spec.query ? parse(spec.query, request.query) : undefined;
        const body = spec.body ? parse(spec.body, request.body ?? (spec.bodyOptional ? {} : undefined)) : undefined;
        const context = { params, query, body, principal, request, reply };

        if (spec.stream) return handle(context);

        const checked = async (): Promise<unknown> => {
          const result = await handle(context);
          // A handler that answers with something its route does not declare is a bug: say so at once, in tests.
          if (deps.validateResponses && spec.response) {
            const outcome = spec.response.safeParse(result);
            if (!outcome.success) throw new Error(`${spec.method} ${spec.path} answered with something its declaration does not allow: ${outcome.error.issues[0]?.path.join('.')}: ${outcome.error.issues[0]?.message}`);
          }
          return result;
        };

        if (spec.idempotent) {
          const answer = await remembered.run(idempotencyKey(request, `${caller(principal)}:${id}`), async () => ({ status: spec.status, body: await checked() }));
          return sendRemembered(reply, answer);
        }
        const result = await checked();
        if (spec.status === 204) return reply.code(204).send();
        return reply.code(spec.status).send(result);
      },
    });
  }
}

/** Whether a change concerns a canvas: it names that canvas, or a session that is on it. */
function concerns(state: AppState, event: ChangeEvent, canvasId: string): boolean {
  if ('canvasId' in event) return event.canvasId === canvasId;
  if ('canvas' in event) return event.canvas.id === canvasId;
  if ('sessionId' in event) return placeOfSession(state, event.sessionId)?.canvas.id === canvasId;
  return false;
}
