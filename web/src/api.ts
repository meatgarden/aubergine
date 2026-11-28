import { CLOSE_DEVICE_REVOKED, PROJECT_HEADER, type LinkKind, type ThemeSetting, type ChangeAppearanceRequest, type ChangePluginRequest } from '@aubergine/shared';
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
  DeviceList,
  PairedPage,
  ProjectRow,
  SocketTicket,
  TICKET_PARAM,
  PairingCodeAnswer,
  RevokedDevice,
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

/**
 * Everything the web app says to a server goes through this module.
 *
 * The page talks to one server at a time, the *server shown*: the one that served the page (the *own* server: paths
 * relative to the page, the page's own cookie), or one this browser linked (absolute addresses at its origin, its
 * credential as a bearer, no cookie, no redirect followed). `api` goes to the server shown; `ownApi` goes to the own
 * server whatever is shown, for what a person set about the page itself. Nothing about a linked server is ever sent
 * to the own server.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
    /** From `Retry-After`, where the server said how long to wait. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

/**
 * The answer to a call asked of a server that is no longer the one shown: dropped. It is not a failure to show
 * anyone; wherever a failure is said, this one is not (`isSuperseded`).
 */
export class Superseded extends Error {
  override readonly name = 'Superseded';
  constructor() {
    super('Asked of a server that is no longer shown.');
  }
}
export const isSuperseded = (error: unknown): error is Superseded => error instanceof Superseded;

/** The server answered with something this page does not understand: another version of Aubergine, most likely. */
export class NotUnderstood extends Error {
  override readonly name = 'NotUnderstood';
  constructor() {
    super('The server answered with something this page does not understand.');
  }
}

/** A linked server, as a target of requests: its origin and the credential that is sent there and nowhere else. */
export interface LinkedTarget {
  id: string;
  address: string;
  credential: string;
}

/** The server shown: null for the own one. */
let shown: LinkedTarget | null = null;
/** Changes on every switch: a call notes it when it starts, and an answer that comes back under another is dropped. */
let generation = 0;

/** Makes a linked server the one shown, or (null) the own one. Called by the store's `showServer` and nothing else. */
export function showTarget(target: LinkedTarget | null): void {
  shown = target === null ? null : { id: target.id, address: target.address, credential: target.credential };
  generation += 1;
  // What a module kept of the server shown before (a list read from it, digests it showed) is about that server.
  for (const forget of forgetters) forget();
}
const forgetters = new Set<() => void>();
/** For a module that keeps something read from the server shown, outside the store: forgotten when another server is shown. */
export function forgetOnSwitch(forget: () => void): void {
  forgetters.add(forget);
}
/** The short name of the linked server shown; null for the own one. */
export const shownLink = (): string | null => shown?.id ?? null;
export const targetGeneration = (): number => generation;

/**
 * The one place a request is made: for the own server, a path relative to the page with the page's cookie; for a
 * linked server, an absolute address at its origin with its credential, no cookie and no redirect. The credential
 * goes to a request whose origin is exactly that server's address, and to nothing else: anything else throws.
 */
export function requestFor(target: LinkedTarget | null, path: string, init: RequestInit = {}): { url: string; init: RequestInit } {
  if (!isServerPath(path)) throw new Error('A request names a path of the server, beginning with one /.');
  if (target === null) {
    const headers = new Headers(init.headers);
    headers.delete('authorization');
    return { url: path, init: { ...init, headers, credentials: 'same-origin' } };
  }
  const url = new URL(path, target.address);
  if (url.origin !== target.address) throw new Error('A request to a linked server went somewhere else; nothing was sent.');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${target.credential}`);
  return { url: url.href, init: { ...init, headers, credentials: 'omit', redirect: 'error', mode: 'cors', referrerPolicy: 'no-referrer' } };
}

/** A path of a server: one `/`, then not another nor a backslash (which a browser reads as one), so never another host. */
const isServerPath = (path: string): boolean => /^\/(?![/\\])/.test(path);

/** `fetch`, at a target, through the one place above. */
const fetchAt = (target: LinkedTarget | null) => (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const made = requestFor(target, typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init);
  return fetch(made.url, made.init);
};

/** The public API (/v1), at the server shown. */
/** Sent with every call: which project the page is looking at, so that what it lists and what it makes are that project's unless a call says otherwise. */
const pageHeaders: Record<string, string> = {};
// One client: each request is made through `requestFor` with the server shown as it is when the call starts.
const v1 = createClient({ useCookie: true, headers: pageHeaders, fetch: (input, init) => fetchAt(shown)(input, init) });
/** The public API at the own server, whatever is shown: for what is the page's own. No project is named. */
const ownV1 = createClient({ useCookie: true, fetch: fetchAt(null) });
/** The public API at one linked server, shown or not: for the project menu, and for unlinking. */
const v1At = (target: LinkedTarget) => createClient({ fetch: fetchAt(target) });

async function callAt<T>(target: LinkedTarget | null, schema: ZodType<T> | null, method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    const made = requestFor(target, path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    response = await fetch(made.url, made.init);
  } catch (error) {
    throw new ApiError(0, 'network', target === null ? (error as Error).message : 'The server could not be reached.');
  }
  if (!response.ok) {
    const parsed = ErrorResponse.safeParse(await response.json().catch(() => null));
    const wait = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message, Number.isFinite(wait) && wait >= 0 ? wait : null);
    // No well-formed error body: the daemon itself did not answer (for example a proxy did).
    throw new ApiError(response.status, 'network', `HTTP ${response.status}`);
  }
  if (!schema) return undefined as T;
  const read = schema.safeParse(await response.json().catch(() => undefined));
  if (!read.success) throw new NotUnderstood();
  return read.data;
}

/** A call at the server shown, as it is when the call starts. */
const call = <T>(schema: ZodType<T> | null, method: string, path: string, body?: unknown): Promise<T> => callAt(shown, schema, method, path, body);

/** Told when the server shown no longer takes this page's credential: the device was revoked there, or went unused. */
let refused: () => void = () => {};
export function whenRefused(listener: () => void): void {
  refused = listener;
}

/**
 * A call that belongs to the server shown when it started: an answer, or a failure, that arrives after another server
 * was shown is `Superseded`, and lands nowhere. A linked server that refuses the credential is said once, to the store.
 */
function guarded<A extends unknown[], R>(work: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const at = generation;
    const linked = shown !== null;
    try {
      const answer = await work(...args);
      if (at !== generation) throw new Superseded();
      return answer;
    } catch (error) {
      if (at !== generation || error instanceof Superseded) throw new Superseded();
      if (linked && (error as { status?: unknown }).status === 401) refused();
      throw error;
    }
  };
}

type Guarded<T> = { [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<R> : T[K] };
function guardAll<T extends Record<string, (...args: never[]) => Promise<unknown>>>(calls: T): Guarded<T> {
  return Object.fromEntries(Object.entries(calls).map(([name, work]) => [name, guarded(work as (...args: unknown[]) => Promise<unknown>)])) as Guarded<T>;
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

export const api = guardAll({
  getState: () => call(StateResponse, 'GET', paths.state),
  createSession: (request: CreateSessionRequest) =>
    call(CreateSessionResponse, 'POST', paths.sessions, request),
  openOnDesktop: (sessionId: string) => v1.openSessionOnDesktop({ sessionId }),
  setDesktopOpenNew: (openNew: boolean) => v1.changeDesktopSettings({ body: { openNew } }),
  setDescribing: (remind: boolean) => v1.changeDescribing({ body: { remind } }),
  // Typing into a terminal from its details: the same route a program uses, as the owner.
  sendInput: (sessionId: string, body: Parameters<typeof v1.sendInput>[0]['body']) => v1.sendInput({ sessionId, body }),
  // What a terminal says about itself: its links, what was seen in it, what is found by looking.
  addLink: (sessionId: string, body: { url: string; label?: string; kind?: LinkKind }) => v1.addLink({ sessionId, body }),
  changeLink: (sessionId: string, linkId: string, body: { label?: string; kind?: LinkKind }) => v1.changeLink({ sessionId, linkId, body }),
  removeLink: (sessionId: string, linkId: string) => v1.removeLink({ sessionId, linkId }),
  seenLinks: (sessionId: string) => v1.listSeenLinks({ sessionId }),
  keepSeen: (sessionId: string, url: string) => v1.keepSeenLink({ sessionId, body: { url } }),
  lookAgain: (sessionId: string) => v1.lookAgain({ sessionId }),
  useSuggestion: (sessionId: string, body: { what: 'name' | 'summary' | 'link' | 'field'; linkId?: string; label?: string }) => v1.useSuggestion({ sessionId, body }),
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
  /** Signs this browser in with a code (204), or says why not. The code is sent in the body only, never in an address. */
  pair: (code: string) => callAt(null, null, 'POST', paths.pair, { code }),
  // Devices paired from an outside address: the owner's alone.
  listDevices: () => call(DeviceList, 'GET', paths.devices),
  makePairingCode: (name: string) => call(PairingCodeAnswer, 'POST', paths.pairingCodes, { name, kind: 'browser' }),
  revokeDevice: (deviceId: string) => call(RevokedDevice, 'DELETE', paths.device(deviceId)),
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
  acceptThemeProposal: (proposalId: string, digest: string) => v1.acceptThemeProposal({ proposalId, body: { digest } }),
  declineThemeProposal: (proposalId: string) => v1.declineThemeProposal({ proposalId }),
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
});

/**
 * The own server, whatever is shown: what a person set about the page itself (the theme), the settings the page is
 * drawn with, and its projects for the menu. Nothing about a linked server is in any of these.
 */
export const ownApi = {
  getState: () => callAt(null, StateResponse, 'GET', paths.state),
  setTheme: (theme: ThemeSetting) => ownV1.changeAppearance({ body: { theme } }),
  /** How the page looks: only the fields that are sent are written. */
  setLook: (change: ChangeAppearanceRequest) => ownV1.changeAppearance({ body: change }),
  /** The owner's theme files, read again by the own server: they are about the page, as the theme is. */
  readThemes: () => ownV1.readThemes(),
  /** The owner's own stylesheet, read again by the own server: it is the page's own, as the theme files are. */
  readStylesheet: () => ownV1.readStylesheet(),
  /** The owner's plugins, read again by the own server: code of the page, so the own server's whatever is shown. */
  readPlugins: () => ownV1.readPlugins(),
  /** Switches one plugin on (by the digest just read, or `follow`) or off (null), on the own server. */
  changePlugin: (change: ChangePluginRequest) => ownV1.changePlugin({ body: change }),
  projects: async () => z.array(ProjectRow).parse((await ownV1.listProjects({ query: { limit: 200 } })).items),
};

/* ---------- Linked servers that are not (or not yet) shown ---------- */

/** Its projects, read when the project menu opens: memory only. A failure is an ApiError (401: not taken any more), or NotUnderstood. */
export async function projectsAt(target: LinkedTarget): Promise<ProjectRow[]> {
  let answer: unknown;
  try {
    answer = await v1At(target).listProjects({ query: { limit: 200 } });
  } catch (error) {
    const failed = error as { status?: number; code?: string; message?: string };
    throw new ApiError(failed.status ?? 0, failed.status === 0 || failed.status === undefined ? 'network' : ((failed.code ?? 'network') as ErrorCode), failed.status === 0 ? 'The server could not be reached.' : (failed.message ?? ''));
  }
  const read = z.object({ items: z.array(ProjectRow) }).safeParse(answer);
  if (!read.success) throw new NotUnderstood();
  return read.data.items;
}

/** Asks a linked server to revoke this page's device there: unlinking. Best effort; true when it was done. */
export async function revokeAt(target: LinkedTarget, deviceId: string): Promise<boolean> {
  try {
    await callAt(target, null, 'DELETE', paths.device(deviceId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns a code into a page device at another Aubergine: across origins, with no credential, no cookie and no
 * redirect. The code goes in the body only. Fails with an ApiError: the server's own sentence, or `network` where
 * no answer could be read (not reachable, or the browser refused it because that server does not list this page).
 */
export async function pairWith(address: string, code: string): Promise<PairedPage> {
  const url = new URL(paths.pair, address);
  if (url.origin !== address) throw new ApiError(0, 'network', 'That is not an address of a server.');
  let response: Response;
  try {
    response = await fetch(url.href, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }), credentials: 'omit', redirect: 'error', mode: 'cors', referrerPolicy: 'no-referrer', cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'network', 'No answer.');
  }
  if (!response.ok) {
    const parsed = ErrorResponse.safeParse(await response.json().catch(() => null));
    const wait = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message, Number.isFinite(wait) && wait >= 0 ? wait : null);
    throw new ApiError(response.status, 'network', `HTTP ${response.status}`);
  }
  const read = PairedPage.safeParse(await response.json().catch(() => null));
  if (!read.success) throw new NotUnderstood();
  return read.data;
}

/* ---------- Sockets ---------- */

/** The address of a socket at a linked server: its own origin, `ws` for plain http, with the ticket beside any query the path has. Pure. */
export function socketAddress(address: string, path: string, ticket: string): string {
  if (!isServerPath(path)) throw new Error('A socket names a path of the server, beginning with one /.');
  const url = new URL(path, address);
  if (url.origin !== address) throw new Error('A socket to a linked server went somewhere else; nothing was opened.');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set(TICKET_PARAM, ticket);
  return url.href;
}

/** The generation each socket was opened under: one opened for a server no longer shown is closed, and what it says is ignored. */
const openedUnder = new WeakMap<WebSocket, number>();
export const socketIsCurrent = (socket: WebSocket): boolean => openedUnder.get(socket) === generation;

/** A socket could not be had because the linked server does not take this page's credential: trying again will not help. */
export const isRefusal = (error: unknown): boolean => error instanceof ApiError && error.status === 401;

/**
 * Opens a socket at the server shown. At the own server, with the page's cookie. At a linked server, which cannot be
 * sent a header on a socket, with a ticket asked for first: a fresh one for every connection, since a ticket works once.
 */
export async function openSocket(path: string): Promise<WebSocket> {
  const at = generation;
  const target = shown;
  let url: string;
  if (target === null) {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (!isServerPath(path)) throw new Error('A socket names a path of the server, beginning with one /.');
    url = `${scheme}//${location.host}${path}`;
  } else {
    let ticket: string;
    try {
      ticket = (await callAt(target, SocketTicket, 'POST', paths.socketTickets, {})).ticket;
    } catch (error) {
      if (at !== generation) throw new Superseded();
      if (isRefusal(error)) refused();
      throw error;
    }
    if (at !== generation) throw new Superseded();
    url = socketAddress(target.address, path, ticket);
  }
  const socket = new WebSocket(url);
  openedUnder.set(socket, at);
  return socket;
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
  /** The server closed the stream because this page's device was revoked: it is not opened again. */
  onRevoked?: () => void;
}): { stop: () => void; viewing: (canvasId: string) => void } {
  let socket: WebSocket | null = null;
  let timer: number | undefined;
  let stopped = false;
  let canvasId: string | null = null;

  const say = (message: EventsClientMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const connect = (): void => {
    void openSocket(paths.events).then(
      (opened) => {
        if (stopped) return opened.close();
        socket = opened;
        opened.onmessage = (message) => {
          // Opened for a server that is no longer shown: what it says is not about what is shown now.
          if (!socketIsCurrent(opened)) return opened.close();
          let data: unknown;
          try {
            data = JSON.parse(String(message.data));
          } catch {
            return;
          }
          const parsed = EventsServerMessage.safeParse(data);
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
        opened.onclose = (closed?: { code?: number }) => {
          if (stopped || !socketIsCurrent(opened)) return;
          handlers.onDown();
          // Signed out: trying again would be refused every second for as long as the page is open.
          if (closed?.code === CLOSE_DEVICE_REVOKED) return handlers.onRevoked?.();
          timer = window.setTimeout(connect, 1000);
        };
      },
      (error: unknown) => {
        if (stopped || isSuperseded(error)) return;
        handlers.onDown();
        // A linked server that no longer takes the credential has been told to the store; asking again would not help.
        if (!isRefusal(error)) timer = window.setTimeout(connect, 1000);
      },
    );
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
