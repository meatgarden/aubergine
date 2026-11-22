import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  FEATURES,
  PROJECT_HEADER,
  firstProject,
  ofProject,
  openProjects,
  reachesProject,
  sortedProjects,
  visibleIn,
  type ProjectScope,
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
  scopeFor,
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
  type AppearanceAnswer,
  type ThemeSetting,
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
import type { TerminalAccess, TerminalTrace, Typist } from './terminal-access';
import { isTerminalContentEvent, withoutTerminalContent } from './terminal-redact';
import { actorOf, type Workflows } from './workflows';
import { MessageRefusal, type Messages } from './messages';
import type { Library } from './library';
import type { Environments } from './environments';
import type { Asker, Queue } from './queue';
import type { Desktop } from './desktop';
import type { Described } from './described';
import type { DescribingSettings } from '@aubergine/shared';
import { inProject } from './project-context';
import { ProjectMemory, namesOutOfReach, projectOfId, withinReach } from './project-reach';
import type { ProjectFiles } from './project-files';
import type { Projects } from './projects';
import type { Schedules } from './schedules';
import { fingerprintOf } from './terminal-access';

export interface PublicRouteDeps {
  hub: StateHub;
  sessions: Sessions;
  tokens: Tokens;
  workflows: Workflows;
  drafts: Drafts;
  repositories: Repositories;
  terminals: TerminalAccess;
  messages: Messages;
  library: Library;
  environments: Environments;
  queue: Queue;
  schedules: Schedules;
  desktop: Desktop;
  described: Described;
  /** Writes the one key that says whether agents are reminded to describe their terminal. */
  changeDescribing: (remind: boolean) => Promise<DescribingSettings>;
  /** Writes the one key that says how the page looks, and answers with what the settings say afterwards. */
  changeTheme: (theme: ThemeSetting) => Promise<AppearanceAnswer>;
  projects: Projects;
  projectFiles: ProjectFiles;
  activity: ActivityLog;
  viewers: Viewers;
  limiter: RateLimiter;
  /** The version the capability endpoint reports. */
  version: string;
  /** Checks every answer against the shape its route declares, and fails loudly when it differs. On in tests. */
  validateResponses: boolean;
  /** Who a request was found to be, when the checks let it through. */
  principalOf(request: FastifyRequest): Principal | null;
  /** Where a request came in: under this computer's own name, or an outside address. */
  cameIn(request: FastifyRequest): 'here' | 'outside';
  /** Keeps what is held open for a request (a stream) to be closed at once if the device it came from is revoked. Returns what lets it go. */
  holdOpen(request: FastifyRequest, close: () => void): () => void;
  /** Asks `authorize`, without refusing: for an answer that depends on what else the caller may do. */
  may(principal: Principal, action: Action, resource: Resource): boolean;
  /** What `authorize` needs to know about a session to decide about its terminal. */
  resourceOf(sessionId: string): Resource;
  /** Notes, for the activity log, how much text a terminal call read or typed. Never the text. */
  trace(request: FastifyRequest, trace: TerminalTrace): void;
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
/** The project a request is about: `id` is where a new thing goes; `scope` is what a list shows (null: every project). */
export interface RequestProject {
  id: string;
  scope: ProjectScope;
}
type Context<I extends RouteId> = RouteInput<I> & { principal: Principal; request: FastifyRequest; reply: FastifyReply; project: RequestProject };
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
  const { hub, sessions, workflows, drafts, repositories, terminals, parse } = deps;

  /** Who is typing, for the limits and for what the owner is shown. */
  const typist = (principal: Principal): Typist => (principal.kind === 'token' ? { tokenId: principal.tokenId, name: principal.name } : { tokenId: null, name: 'owner' });
  /**
   * Whether the fixed kickoff sentence may be typed for this caller: the owner, or a token that may type into that very session.
   * Nothing else is ever typed for starting a run.
   */
  const mayKickoff = (principal: Principal, sessionId: string | undefined): boolean =>
    principal.kind === 'user' || (sessionId !== undefined && principal.kind === 'token' && deps.may(principal, 'terminal.input', deps.resourceOf(sessionId)));
  /** Whether a caller may be given what a session's terminal shows. */
  /** Who is writing about a terminal: the owner in the browser, or a program (the agent in it, or one with a token, by its name). */
  const writerOf = (principal: Principal): { source: 'owner' | 'agent'; by?: string } => (principal.kind === 'user' ? { source: 'owner' } : principal.kind === 'token' ? { source: 'agent', by: principal.name } : { source: 'agent' });
  const mayReadTerminal = (principal: Principal, sessionId: string): boolean => principal.kind === 'user' || deps.may(principal, 'terminal.read', deps.resourceOf(sessionId));
  const remembered = new IdempotencyStore();

  const { messages, library, environments, queue, schedules } = deps;
  /** Who adds to one of the two lists. Only the owner, and a token the owner made with review switched off, add without waiting for a yes. */
  const askerOf = (principal: Principal, projectId: string): Asker => ({ ...askerIn(principal), projectId });
  const askerIn = (principal: Principal): Omit<Asker, 'projectId'> =>
    principal.kind === 'user'
      ? { by: { kind: 'person' }, trusted: true, owner: true }
      : principal.kind === 'token'
        ? { by: { kind: 'token', name: principal.name.slice(0, 120), tokenId: principal.tokenId }, trusted: principal.reviewWorkflows === false, owner: false }
        : { by: { kind: 'agent', name: sessions.get(principal.sessionId).name.slice(0, 120), sessionId: principal.sessionId }, trusted: false, owner: false };
  /** What `authorize` is asked about one session messaging another: where the receiver is, and which canvases its canvas lets in. */
  const deliveryTo = (fromSessionId: string, toSessionId: string): Resource => {
    const toCanvasId = messages.canvasOf(toSessionId);
    return { ...deps.resourceOf(toSessionId), delivery: { fromCanvasId: messages.canvasOf(fromSessionId), messagesFrom: hub.state.canvases.find((c) => c.id === toCanvasId)?.messagesFrom ?? [] } };
  };
  /** Said about a terminal a session may not message, and in the same words about one that does not exist. */
  const NOT_TO_THAT = 'No terminal by that name or ID may be messaged from this one. Terminals may message each other only on a canvas where the owner switched that on, and not one marked "people only" unless your owner said it takes messages. A message from your owner can always be answered with `aubergine reply`. If you need to reach that terminal, ask your owner.';

  const summary = (canvas: Canvas): CanvasSummary => {
    const { layout: _layout, ...rest } = canvas;
    return { ...rest, counts: canvasCounts(hub.state, canvas) };
  };
  const detail = (canvas: Canvas): CanvasDetail => ({ ...summary(canvas), nodes: canvas.layout.nodes, frames: canvas.layout.frames });

  /** Who is asking, for keeping one caller's idempotency keys apart from another's. */
  /**
   * The project a request is made in, and which projects its lists show. A session: its own, always. Otherwise the
   * project of what the address names; else the one the request names (`all`: every project, for a caller that
   * reaches every project); else the first project the caller reaches.
   */
  const projectFor = (principal: Principal, named: string | undefined, asked: unknown): RequestProject => {
    const state = hub.state;
    if (principal.kind === 'session') {
      const own = state.sessions.find((s) => s.id === principal.sessionId)?.projectId ?? firstProject(state).id;
      return { id: own, scope: own };
    }
    const reach = principal.kind === 'token' ? (principal.projects ?? null) : null;
    const reachable = openProjects(state).filter((p) => reachesProject(reach, p.id));
    const first = (reachable[0] ?? sortedProjects(state).find((p) => reachesProject(reach, p.id)) ?? firstProject(state)).id;
    if (named !== undefined) return { id: named, scope: named };
    if (asked === 'all') {
      if (reach !== null && reach.kind !== 'all' && reach.projectIds.length > 1) throw deps.fail(400, 'bad_request', 'This token reaches some projects, not all: name one of them with projectId.');
      return { id: first, scope: reach !== null && reach.kind !== 'all' ? first : null };
    }
    if (typeof asked === 'string') {
      if (!state.projects.some((p) => p.id === asked)) throw deps.fail(404, 'not_found', `No project ${asked}`);
      return { id: asked, scope: asked };
    }
    return { id: first, scope: first };
  };

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
              : { kind: 'token', id: principal.tokenId, name: principal.name, scopes: [...principal.scopes], expiresAt: token?.expiresAt ?? null, reach: token?.reach ?? null, reviewWorkflowChanges: token?.reviewWorkflowChanges ?? false },
      };
    },

    getDescription: () => ({ ...openApiDocument({ version: deps.version }) }),

    /* ---------- Canvases ---------- */

    listCanvases: ({ query, project }) => {
      const page = paginate(sessions.listCanvases().filter((c) => ofProject(c, project.scope)), (c) => c.id, query);
      return { items: page.items.map(summary), nextCursor: page.nextCursor };
    },

    createCanvas: ({ body, project }) => detail(sessions.createCanvas(body, project.id)),

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

    listSessions: ({ query, project }) => {
      const wanted = hub.state.sessions.filter((s) => ofProject(s, project.scope) && (query.state === undefined || s.state === query.state));
      return paginate(wanted, (s) => s.id, query);
    },

    getSession: ({ params }) => {
      const session = hub.state.sessions.find((s) => s.id === params.sessionId);
      if (!session) throw deps.fail(404, 'not_found', `No session ${params.sessionId}`);
      return session;
    },

    // A name or a summary says who wrote it: the owner's own words are not replaced by a program's, which are kept as a suggestion.
    updateSession: ({ params, body, principal }) => {
      const { name, note, ...rest } = body;
      if (name !== undefined || note !== undefined) deps.described.describe(params.sessionId, { ...(name !== undefined ? { name } : {}), ...(note !== undefined ? { summary: note } : {}) }, principal.kind === 'user' ? 'owner' : 'agent');
      return sessions.update(params.sessionId, rest);
    },

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

    listWorkflows: ({ query, project }) => {
      const page = paginate(workflows.list(project.scope), (w) => w.id, query);
      return { items: page.items.map(summaryOfWorkflow), nextCursor: page.nextCursor };
    },

    // Where a copy came from is the owner's to say: anyone else's elements carry no such mark.
    createWorkflow: ({ body, principal }) => detailOfWorkflow(workflows.create(body, principal.kind === 'user')),

    getWorkflow: ({ params }) => detailOfWorkflow(workflows.get(params.workflowId)),

    updateWorkflow: ({ params, body, principal }) => detailOfWorkflow(workflows.update(params.workflowId, body, principal.kind === 'user')),

    removeWorkflow: ({ params }) => {
      workflows.remove(params.workflowId);
    },

    copyWorkflow: ({ params, body }) => detailOfWorkflow(workflows.copy(params.workflowId, body.name)),

    listWorkflowVersions: ({ params, query }) => paginate(workflows.versions(params.workflowId), (v) => String(v.number), query),

    listWorkflowTemplates: ({ query }) => paginate(workflows.templates(), (t) => t.name, query),

    useWorkflowTemplate: ({ params, body }) => detailOfWorkflow(workflows.useTemplate(params.template, body.name)),

    /* ---------- Runs ---------- */

    /* ---------- The queue, the owner's list, rules ---------- */

    listTasks: ({ query, project }) => queue.list(query, project.scope),
    addTask: ({ body, principal, project }) => queue.add(body, askerOf(principal, project.id)),
    getTask: ({ params }) => queue.get(params.taskId),
    // Everything from here to the rules that changes what was decided is the owner's: `authorize` has refused everyone else.
    changeTask: ({ params, body }) => queue.change(params.taskId, body),
    withdrawTask: ({ params, principal, project }) => queue.withdraw(params.taskId, askerOf(principal, project.id)),
    acceptTask: ({ params }) => queue.accept(params.taskId),
    declineTask: ({ params }) => queue.decline(params.taskId),
    retryTask: ({ params }) => queue.again(params.taskId),
    clearTask: ({ params }) => queue.clear(params.taskId),
    reorderTasks: ({ body }) => queue.reorder(body.taskIds),
    startTasks: ({ body, project }) => queue.start(body?.taskId, project.id),
    getQueue: ({ project }) => queue.settings(project.id),
    changeQueue: ({ body: { projectId: _of, ...change }, project }) => queue.changeSettings(project.id, change),
    getForYou: ({ project }) => queue.forYou(project.scope),
    addAsk: ({ body, principal, project }) => queue.addAsk(body, askerOf(principal, project.id)),
    finishAsk: ({ params }) => queue.removeAsk(params.askId),
    dismissAsk: ({ params }) => queue.removeAsk(params.askId),
    listRules: ({ project }) => queue.rules(project.scope),
    addRule: ({ body, project }) => queue.addRule(body, project.id),
    switchRule: ({ params, body }) => queue.switchRule(params.ruleId, body.on),
    removeRule: ({ params }) => queue.removeRule(params.ruleId),
    // A window on the owner's desktop, and the one setting about it: `authorize` has refused everyone but the owner.
    openSessionOnDesktop: ({ params, request }) => {
      // Never for a request from another device: a window on this computer's desktop is for someone at this computer.
      if (deps.cameIn(request) !== 'here') throw deps.fail(403, 'forbidden', 'A terminal is opened on this computer\u2019s desktop only for a request made at this computer, not from another device.');
      return deps.desktop.open(params.sessionId);
    },
    changeDesktopSettings: ({ body }) => deps.desktop.setOpenNew(body.openNew),
    changeAppearance: ({ body }) => deps.changeTheme(body.theme),
    /* ---------- Projects, and what is shared between them ---------- */

    // Which projects there are: the ones the caller reaches. Everything that changes one is the owner's alone.
    listProjects: ({ query, principal }) => paginate(deps.projects.list((projectId) => principal.kind !== 'token' || reachesProject(principal.projects, projectId)), (p) => p.id, query),
    getProject: ({ params }) => deps.projects.get(params.projectId),
    addProject: ({ body }) => deps.projects.add(body),
    changeProject: ({ params, body }) => deps.projects.change(params.projectId, body),
    moveCanvasToProject: ({ params, body }) => deps.projects.moveCanvas(params.canvasId, body.projectId),
    archiveProject: ({ params, body }) => deps.projects.archive(params.projectId, body ?? {}),
    reopenProject: ({ params }) => deps.projects.reopen(params.projectId),
    removeProject: ({ params }) => deps.projects.remove(params.projectId),
    // A project as a file, and templates. Writing out, reading and taking in are the owner's alone.
    exportProject: ({ params, query }) => deps.projectFiles.export(params.projectId, { template: query.template === 'true', ...(query.notes !== undefined ? { notes: query.notes === 'true' } : {}), ...(query.description !== undefined ? { description: query.description } : {}) }),
    readProjectFile: ({ body }) => deps.projectFiles.read(body.text),
    importProjectFile: ({ body }) => deps.projectFiles.import(body),
    listProjectTemplates: async () => ({ templates: await deps.projectFiles.templates() }),
    getProjectTemplate: ({ params }) => deps.projectFiles.template(params.templateId),
    saveProjectTemplate: ({ params, body }) => deps.projectFiles.saveTemplate(params.projectId, body ?? {}),
    getSharing: () => deps.projects.sharing(),
    changeSharing: ({ body }) => deps.projects.setDefault(body.kind, body.default),
    moveSharedThing: ({ body }) => deps.projects.moveThing(body.kind, body.id, body.projectId),
    // A session, about itself: the project its terminal is in.
    getSessionProject: ({ params }) => deps.projects.get(sessions.get(params.sessionId).projectId),
    listSchedules: ({ query, project }) => schedules.list(query, project.scope),
    addSchedule: ({ body, project }) => schedules.add(body, project.id),
    changeSchedule: ({ params, body }) => schedules.change(params.scheduleId, body),
    removeSchedule: ({ params }) => schedules.remove(params.scheduleId),
    runSchedule: ({ params }) => schedules.runNow(params.scheduleId),
    // A session, about itself: what it proposes waits for its owner, and it reads only what is its own of the owner's list.
    proposeSessionTask: ({ params, body }) => queue.add(body, { by: { kind: 'agent', name: sessions.get(params.sessionId).name.slice(0, 120), sessionId: params.sessionId }, trusted: false, owner: false, projectId: sessions.get(params.sessionId).projectId }),
    addSessionAsk: ({ params, body }) => queue.addAsk(body, { by: { kind: 'agent', name: sessions.get(params.sessionId).name.slice(0, 120), sessionId: params.sessionId }, trusted: false, owner: false, projectId: sessions.get(params.sessionId).projectId }),
    getSessionQueue: ({ params }) => queue.ownQueue(params.sessionId),

    /* ---------- Environments ---------- */

    getEnvironmentOffers: ({ query }) => environments.offers(query.folder),
    listEnvironments: ({ query, project }) => environments.list(query, project.scope),
    getEnvironment: ({ params }) => environments.detail(params.environmentId),
    // The owner's own: `authorize` has refused everyone else. For an environment whose session is gone, this is the only way to its text.
    getEnvironmentDifference: ({ params, query }) => environments.difference(params.environmentId, query.file),
    getEnvironmentEndings: ({ params }) => environments.endings(params.environmentId),
    endEnvironment: ({ params, body }) => environments.end(params.environmentId, body),
    getSessionEnvironment: ({ params }) => {
      sessions.get(params.sessionId);
      return environments.ofSessionDetail(params.sessionId);
    },
    // Content: asked as reading a terminal is, with the session's canvas, tags and people-only switch, before this is reached.
    getSessionDifference: ({ params, query }) => {
      sessions.get(params.sessionId);
      return environments.differenceForSession(params.sessionId, query.file);
    },

    listRuns: ({ query, project }) => workflows.listRuns(query, project.scope),

    // The line that tells an agent about its run is typed for the owner only: typing into a terminal is not something a token may cause.
    startRun: ({ body, principal }) => workflows.start({ ...body, typeKickoff: body.kickoff && mayKickoff(principal, body.sessionId) }, actorOf(principal)),

    startSessionRun: ({ params, body, principal }) =>
      workflows.start({ ...body, sessionId: params.sessionId, typeKickoff: body.kickoff && mayKickoff(principal, params.sessionId) }, actorOf(principal)),

    getRun: ({ params }) => workflows.getRun(params.runId),

    reportRun: ({ params, body, principal }) => workflows.report(params.runId, body, actorOf(principal)),

    // A person's decision. `authorize` has refused every token and every session before this is reached.
    approveRun: ({ params, body, principal }) => workflows.decide(params.runId, { type: 'approve', ...(body.elementId !== undefined ? { elementId: body.elementId } : {}), ...(body.comment !== undefined ? { comment: body.comment } : {}) }, actorOf(principal)),
    sendBackRun: ({ params, body, principal }) => workflows.decide(params.runId, { type: 'send-back', elementId: body.elementId, comment: body.comment }, actorOf(principal)),

    startRuns: ({ params, body, principal }) => workflows.startMany(params.workflowId, body, actorOf(principal), (sessionId) => mayKickoff(principal, sessionId)),

    getBoard: ({ query, project }) => workflows.board({ ...query, projectId: project.scope ?? 'all' }),

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

    /* ---------- The library ---------- */

    listLibrarySources: ({ project }) => ({ sources: library.sources().filter((source) => visibleIn(source, project.scope)) }),

    // The owner's alone, and with `refreshLibrarySource` the only two things that can fetch.
    addLibrarySource: ({ body }) => library.addSource(body),

    removeLibrarySource: async ({ params }) => {
      await library.removeSource(params.sourceId);
    },

    refreshLibrarySource: ({ params }) => library.refresh(params.sourceId),

    listLibraryItems: () => ({ items: library.items() }),

    getLibraryItem: ({ params }) => library.detail(params.sourceId, params.itemId),

    // A request and nothing more: nothing is installed until the owner has read it and accepted.
    requestLibraryInstall: ({ body, principal }) => library.request(body.sourceId, body.itemId, principal.kind === 'token' ? { kind: 'token', tokenId: principal.tokenId, name: principal.name } : { kind: 'owner' }),

    listLibraryRequests: () => ({ requests: library.requests() }),

    getLibraryRequest: ({ params }) => library.requestDetail(params.requestId),

    acceptLibraryRequest: async ({ params, body }) => {
      const { content: _content, ...item } = await library.accept(params.requestId, body.digest, { ...(body.workflow !== undefined ? { workflow: body.workflow } : {}), ...(body.element !== undefined ? { element: body.element } : {}) });
      return item;
    },

    discardLibraryRequest: ({ params }) => {
      library.discard(params.requestId);
    },

    listLibraryInstalled: () => ({ installed: library.installed() }),

    getLibraryInstalledUsage: ({ params }) => library.usage(params.installedId),

    removeLibraryInstalled: ({ params }) => {
      library.remove(params.installedId);
    },

    /* ---------- The shelf ---------- */

    listElements: ({ query, project }) => paginate(drafts.shelf().filter((item) => visibleIn(item, project.scope)), (e) => e.id, query),

    createElement: ({ body, principal }) => drafts.createOnShelf(body, actorOf(principal)),

    // A change is a new version: what the element said before stays, and no copy in a workflow is touched.
    updateElement: ({ params, body, principal }) => drafts.updateOnShelf(params.elementId, body, actorOf(principal)),

    listElementVersions: ({ params, query }) => paginate(drafts.shelfVersions(params.elementId), (v) => String(v.version), query),

    getElementUsage: ({ params }) => drafts.shelfUsage(params.elementId),

    retireElement: ({ params, body }) => drafts.retire(params.elementId, body.replacedBy ?? null),

    restoreElement: ({ params }) => drafts.restore(params.elementId),

    // The owner's decision about a newer version on the shelf, for one copy. `authorize` has made sure it is the owner.
    updateFromShelf: ({ params, body }) => detailOfWorkflow(workflows.decideCopy(params.workflowId, params.elementId, body.decision)),

    removeElement: ({ params }) => {
      drafts.removeFromShelf(params.elementId);
    },

    copyElement: ({ params, principal }) => drafts.copyOnShelf(params.elementId, actorOf(principal)),

    runElement: ({ params, body, principal, project }) => {
      const { kickoff, ...rest } = body;
      // An element is run in the project of the terminal it runs on: one that is another project's own is not there for it.
      const inProjectOf = (rest.sessionId ? hub.state.sessions.find((s) => s.id === rest.sessionId)?.projectId : undefined) ?? project.id;
      return workflows.startElement(drafts.runnable(params.elementId, inProjectOf), { ...rest, typeKickoff: kickoff && mayKickoff(principal, rest.sessionId) }, actorOf(principal));
    },

    tickRunItem: ({ params, body, principal }) => workflows.tick(params.runId, body, actorOf(principal)),

    /* ---------- Workflows kept in a repository ---------- */

    listRepositoryWorkflows: async ({ query }) => paginate(await repositories.listing(), (r) => r.root, query),

    getRepositoryWorkflow: ({ query }) => repositories.detail(query.root, query.file),

    acceptRepositoryWorkflow: ({ body }) => repositories.accept(body.root, body.file, body.hash),

    saveToRepository: ({ body }) => repositories.save(body.sessionId, body.workflowId, body.overwrite),

    runRepositoryWorkflow: ({ params, body, principal }) => {
      const { file, kickoff, ...rest } = body;
      return repositories.run(params.sessionId, file, { ...rest, typeKickoff: kickoff && mayKickoff(principal, params.sessionId) }, actorOf(principal));
    },

    /* ---------- Terminals ---------- */

    getScreen: async ({ params, request }) => {
      const { answer, trace } = await terminals.screen(params.sessionId);
      deps.trace(request, trace);
      return answer;
    },

    getOutput: async ({ params, query, request }) => {
      const { answer, trace } = await terminals.output(params.sessionId, query);
      deps.trace(request, trace);
      return answer;
    },

    // Each session is asked about again: a token is given matches only from the sessions it may read.
    searchTerminals: async ({ query, principal, request }) => {
      const { answer, trace } = await terminals.search(query.q, query.limit, (session) => mayReadTerminal(principal, session.id));
      deps.trace(request, trace);
      return answer;
    },

    sendInput: async ({ params, body, principal, request }) => {
      const { answer, trace } = await terminals.input(params.sessionId, body, typist(principal));
      deps.trace(request, trace);
      return answer;
    },

    // The output of the command is terminal text: it is given only to a caller that may also read this terminal.
    runCommand: async ({ params, body, principal, request }) => {
      const { answer, trace } = await terminals.run(params.sessionId, body, typist(principal), mayReadTerminal(principal, params.sessionId));
      deps.trace(request, trace);
      return answer;
    },

    protectSession: ({ params, body }) => sessions.protect(params.sessionId, body.peopleOnly),

    setTakesMessages: ({ params, body }) => sessions.setTakesMessages(params.sessionId, body.takesMessages),

    /* ---------- The stream of changes ---------- */

    // Server-sent events: one `data:` line of JSON per change. It needs nothing but an HTTP client,
    // and a bearer token goes in a header as on every other route.
    streamEvents: ({ query, request, reply, principal }) => {
      const { canvasId } = query;
      if (canvasId !== undefined) sessions.getCanvas(canvasId);
      deps.recordNow(request);

      reply.hijack();
      const out = reply.raw;
      // Written by hand: what the request's checks put on the answer (that an outside address is HTTPS) goes too.
      const hsts = reply.getHeader('strict-transport-security');
      out.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no', ...(hsts !== undefined ? { 'strict-transport-security': String(hsts) } : {}) });
      out.write(': connected\n\n');
      // A token limited to some projects hears nothing of another. What each ID was of is remembered from the start,
      // so that a change which only says "this was removed" can still be told apart.
      const limited = principal.kind === 'token' && principal.projects && principal.projects.kind !== 'all' ? principal.projects : null;
      const memory = limited ? new ProjectMemory(() => hub.state) : null;
      memory?.note(hub.state);
      const unsubscribe = hub.subscribe((whole) => {
        // Tokens, devices and what they did are the owner's business, not a stream's.
        if (whole.type.startsWith('token.') || whole.type.startsWith('device.')) return;
        let event = whole;
        if (limited && memory) {
          memory.note(whole);
          // Projects themselves, and what is shared, are not for a limited token to follow change by change.
          if (whole.type.startsWith('project.') || whole.type.startsWith('sharing.') || whole.type === 'canvas.project') return;
          const within = withinReach(whole, limited, (id) => memory.of(id));
          if (within === null) return;
          event = within;
        }
        if (canvasId !== undefined && !concerns(hub.state, event, canvasId)) return;
        // What a terminal shows is not for a caller that may not read that terminal.
        const about = 'sessionId' in event ? event.sessionId : 'session' in event ? event.session.id : null;
        if (about !== null && !mayReadTerminal(principal, about) && isTerminalContentEvent(event)) return;
        out.write(`data: ${JSON.stringify(withoutTerminalContent(event, (sessionId) => mayReadTerminal(principal, sessionId)))}\n\n`);
      });
      const beat = setInterval(() => out.write(': still here\n\n'), 25_000);
      const release = deps.holdOpen(request, () => {
        end();
        out.end();
      });
      const end = (): void => {
        clearInterval(beat);
        unsubscribe();
        release();
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

    /* ---------- Messages ---------- */

    listSessionMessages: ({ params, query, request }) => {
      const all = messages.of(params.sessionId);
      // How much was read, for the record of what tokens did. Never the text.
      deps.trace(request, { chars: all.reduce((sum, m) => sum + m.text.length, 0) });
      return paginate(all, (m) => m.id, query);
    },

    sendMessage: ({ params, body, principal, request }) => {
      deps.trace(request, { chars: body.text.length, fingerprint: fingerprintOf(body.text) });
      // The fixed sentence is typed for a token's message only where that token may type into this very session, as for a run.
      if (principal.kind === 'token') return messages.fromToken(principal, params.sessionId, body.text, body.replyTo ?? null, mayKickoff(principal, params.sessionId));
      return messages.fromOwner(params.sessionId, body.text, body.replyTo ?? null, deps.ownerCaller(request).kind === 'owner-cli' ? 'command' : 'page');
    },

    // A session's own inbox, by its own address: `authorize` has made sure the token is that session's.
    takeInbox: ({ params }) => messages.take(params.sessionId),

    replyToMessage: ({ params, body, principal }) => {
      const received = messages.received(params.sessionId, params.messageId);
      // An answer to another session passes only where a message to it would: the owner may have switched that off since.
      if (received.from.kind === 'session' && !deps.may(principal, 'messages.write', deliveryTo(params.sessionId, received.from.sessionId))) throw new MessageRefusal(403, 'forbidden', NOT_TO_THAT);
      return messages.fromSession(params.sessionId, received.from, body.text, received.id);
    },

    sendFromSession: ({ params, body, principal }) => {
      // By ID, or by its exact name among the terminals on the same canvas. Nothing is said about any other.
      const here = messages.canvasOf(params.sessionId);
      const wanted = body.to.toLowerCase();
      const found = hub.state.sessions.filter((s) => s.id !== params.sessionId && (s.id === body.to || (here !== null && s.name.toLowerCase() === wanted && messages.canvasOf(s.id) === here)));
      const target = found.length === 1 ? found[0] : undefined;
      if (!target || !deps.may(principal, 'messages.write', deliveryTo(params.sessionId, target.id))) throw new MessageRefusal(403, 'forbidden', NOT_TO_THAT);
      return messages.fromSession(params.sessionId, messages.party(target.id), body.text);
    },

    /* ---------- What a session reports about itself ---------- */

    setAttention: ({ params, body }) => sessions.setAttention(params.sessionId, body.state, body.message),

    reportAgent: ({ params, body }) => sessions.reportAgent(params.sessionId, body),

    // What the session's agent wrote when asked for a recap. Kept as its words; nothing is typed or run for it.
    writeRecap: ({ params, body }) => sessions.writeRecap(params.sessionId, body.text),

    /* ---------- What a terminal says about itself ---------- */

    // A link that was seen on the terminal's screen is terminal content: left out for a caller who may not read that terminal.
    listLinks: ({ params, principal }) => ({ links: deps.described.links(params.sessionId).filter((link) => link.fromTerminal !== true || mayReadTerminal(principal, params.sessionId)) }),
    addLink: ({ params, body, principal }) => deps.described.add(params.sessionId, body, writerOf(principal)),
    changeLink: ({ params, body, principal }) => deps.described.change(params.sessionId, params.linkId, body, writerOf(principal).source),
    removeLink: ({ params, principal }) => ({ links: deps.described.remove(params.sessionId, params.linkId, writerOf(principal).source).filter((link) => link.fromTerminal !== true || mayReadTerminal(principal, params.sessionId)) }),
    listSeenLinks: async ({ params }) => ({ seen: await deps.described.seen(params.sessionId) }),
    keepSeenLink: ({ params, body }) => deps.described.keep(params.sessionId, body.url),
    // A session's own: the address names the session, and `authorize` has made sure its token is that session's.
    describeSession: ({ params, body }) => deps.described.describe(params.sessionId, body, 'agent'),
    checkDescribed: ({ params, body }) => deps.described.check(params.sessionId, body),
    lookAgain: async ({ params }) => ({ found: await deps.described.lookAgain(params.sessionId) }),
    useSuggestion: ({ params, body }) => ({ links: deps.described.use(params.sessionId, body) }),
    changeDescribing: ({ body }) => deps.changeDescribing(body.remind),

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
        // For a session: what decides about its terminal is handed to `authorize` with the question, not looked up after it.
        // Which project the request is about: the one of a thing it names in its address, else the one it names itself.
        // Looked at as it was sent; worked out before anyone is let in, so that `authorize` is asked about that project.
        const state = hub.state;
        const named = Object.values(params)
          .map((value) => projectOfId(state, value))
          .find((found) => typeof found === 'string') as string | undefined;
        const sent = (from: unknown): unknown => (from !== null && typeof from === 'object' ? (from as Record<string, unknown>).projectId : undefined);
        // In its query, in its body, or (for a client that means one project for everything it asks) in a header.
        const inHeader = request.headers[PROJECT_HEADER];
        const asked = sent(request.query) ?? sent(request.body) ?? (typeof inHeader === 'string' && inHeader !== '' ? inHeader : undefined);
        const askedId = typeof asked === 'string' && asked !== 'all' ? asked : undefined;
        const resource: Resource = { ...(params.sessionId ? deps.resourceOf(params.sessionId) : {}), ...(params.canvasId ? { canvasId: params.canvasId } : {}), ...(named !== undefined ? { projectId: named } : askedId !== undefined ? { projectId: askedId } : {}) };
        let principal = deps.principalOf(request);
        // A token limited to some projects: anything its body or its query names must be within them, whatever the route does with it.
        if (principal?.kind === 'token' && principal.projects && principal.projects.kind !== 'all' && namesOutOfReach([request.body, request.query, asked], principal.projects, (id) => projectOfId(state, id))) throw deps.fail(404, 'not_found', 'Not found');
        for (const action of actionsFor(spec, request.body)) principal = deps.allow(request, action, resource);
        // A field that needs a further permission: asked as well, about the session this call would make.
        for (const [field, action] of Object.entries(spec.fieldAlso ?? {})) {
          const raw = request.body as Record<string, unknown> | null | undefined;
          if (!raw || typeof raw !== 'object' || raw[field] === undefined) continue;
          const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [];
          const about: Resource = spec.makesSession && params.canvasId ? { canvasId: params.canvasId, session: { canvasId: params.canvasId, tags, peopleOnly: sessions.startsProtected(false) } } : resource;
          try {
            principal = deps.allow(request, action, about);
          } catch {
            throw deps.fail(403, 'forbidden', `Sending \`${field}\` types into the new terminal, so it needs the scope \`${scopeFor(action)}\` with a reach that covers the session being made (its canvas and its tags), and the session must not start as "people only". Without \`${field}\` the session starts as a plain shell.`);
          }
        }
        if (!principal) throw deps.fail(401, 'unauthorized', 'Not signed in');

        const query = spec.query ? parse(spec.query, request.query) : undefined;
        const body = spec.body ? parse(spec.body, request.body ?? (spec.bodyOptional ? {} : undefined)) : undefined;
        const project = projectFor(principal, named, asked);
        const context = { params, query, body, principal, request, reply, project };

        if (spec.stream) return inProject(project.id, () => handle(context));

        const checked = async (): Promise<unknown> => {
          // Run as a request made in that project: what it makes is made there.
          const answered = await inProject(project.id, () => handle(context));
          const caller = principal;
          // A token limited to some projects is given nothing of another, whatever the route: what a handler let through is taken out here.
          const limited = caller.kind === 'token' && caller.projects && caller.projects.kind !== 'all' ? caller.projects : null;
          const answer = limited ? withinReach(answered, limited, (id) => projectOfId(hub.state, id)) : answered;
          if (limited && answer === null && answered !== null && answered !== undefined) throw deps.fail(404, 'not_found', 'Not found');
          // A token is not given terminal content of sessions whose terminal it may not read, whatever the route.
          const result = caller.kind === 'user' ? answer : withoutTerminalContent(answer, (sessionId) => mayReadTerminal(caller, sessionId));
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
