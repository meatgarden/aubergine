import { packageRoot } from './package-root';
import { DEVICE_UNUSED_DAYS, LINKED_PAGE_HEADERS, PROJECT_HEADER, PairRequest, PairingCodeRequest, TICKET_PARAM, ThemeSetting, accessEntries, accessProblem, deviceStatus, isLocalHost, viewOfDevice, type DeviceList, type OpenedOnDesktop, type PairedPage, type PairingCodeAnswer, type RevokedDevice, type SocketTicket } from '@aubergine/shared';
import { DeviceNotFoundError, Devices } from './devices';
import { Pairing } from './pairing';
import { SocketTickets } from './socket-tickets';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { SettingsUnreadableError } from './settings';
import type { AddressInfo } from 'node:net';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  SESSION_HEADER,
  RECAP_LINE,
  AwayQuery,
  HistoryQuery,
  BlockSenderRequest,
  CanvasMessagingRequest,
  OwnerMessageRequest,
  ThreadAction,
  ThreadId,
  ThreadsQuery,
  type Message,
  type ThreadDetail,
  type ThreadList,
  HistorySearchQuery,
  OpenConversationRequest,
  TranscriptQuery,
  type AwayDigest,
  type HistoryList,
  type HistorySearch,
  type Session,
  type Transcript,
  type DemoStatus,
  type Inventory,
  CLIENT_HEADER,
  ClientName,
  type OwnerCaller,
  AppendNoteRequest,
  CLOSE_BAD_MESSAGE,
  CLOSE_DEVICE_REVOKED,
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
  projectCanvasAddress,
  linkedAddress,
  PAGE_NAMES,
  pageAddress,
  terminalAddress,
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
import type { Histories } from './agents/history';
import { NotAnAgentError, type Inventories } from './agents/inventory';
import { Away } from './away';
import { Demo } from './demo';
import { authorize, bearerOf, peopleOnlyRefusal, projectRefusal, reachRefusal, principalFromBearer, type Action, type Principal, type Resource } from './auth';
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
import os from 'node:os';
import path from 'node:path';
import { MessageRefusal, Messages } from './messages';
import { Library } from './library';
import { Environments } from './environments';
import { Desktop } from './desktop';
import { Described } from './described';
import type { PullRequestFinder } from './found/pull-request';
import type { FolderFacts } from './found/folder';
import { inProject } from './project-context';
import { ProjectFiles } from './project-files';
import { Projects } from './projects';
import type { DesktopOpener } from './desktop/open';
import { Queue } from './queue';
import { REAL_CLOCK, Schedules, ownZone, type ScheduleClock } from './schedules';
import { MemoryTaskArchive, type TaskArchive } from './task-archive';
import { FetchRefusal, type LibraryFetcher } from './library/git';
import type { MessageLog } from './message-log';
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
  /** Where tasks that are over are kept. Left out, in memory only. */
  taskArchive?: TaskArchive;
  /** Where the owner's templates of projects are kept. Left out: this server keeps none. */
  templatesDir?: string;
  /** The templates that come with the app. Left out: this copy's own `templates` folder. */
  appTemplatesDir?: string | null;
  /** What opens a terminal on the owner's desktop. Left out: this server opens none, and says so. */
  desktop?: DesktopOpener;
  /** Writes `desktop.openNew` into the settings file. Left out: the page cannot change it. */
  setDesktopOpenNew?: (value: boolean) => Promise<void>;
  /** Writes `theme` into the settings file. Left out: the page cannot change it. */
  setTheme?: (value: ThemeSetting) => Promise<void>;
  /** Writes `describe.remind` into the settings file. Left out: the page cannot change it. */
  setDescribeRemind?: (value: boolean) => Promise<void>;
  /** Asks a signed-in local tool for a branch's pull request. Left out: none is ever asked for. */
  pullRequests?: PullRequestFinder | null;
  /** The branch and repository of a folder. Left out: Git is asked. A test passes its own. */
  folderFacts?: (folder: string) => Promise<FolderFacts>;
  /** The clock and the timer schedules use. A test passes its own. */
  scheduleClock?: ScheduleClock;
  /** The time zone schedules are written in. Left out: this computer's own. */
  scheduleZone?: string;
  /** Fetches Git sources of the library. Left out, one that refuses: a server without a data folder fetches nothing. */
  libraryFetcher?: LibraryFetcher;
  /** Where fetched library sources are kept. Left out, nothing can be fetched. */
  libraryCache?: string;
  /** Where working copies are kept: a folder of the data folder. Left out, none can be made. */
  copiesDir?: string;
  /** The folder new sessions start in when none is named. Left out, the home folder. */
  defaultFolder?: () => string | null;
  /** The folder of the library that ships with the app. Left out, this copy's. For tests. */
  libraryBuiltin?: string;
  /** Where messages between sessions are kept. Left out, in memory only. */
  messageLog?: MessageLog;
  /** Reads an agent's past conversations. Left out, those routes answer that it is not available. */
  histories?: (sessions: Sessions) => Histories;
  /** Reads what is switched on for an agent. Left out, that route answers that it is not available. */
  inventories?: Inventories;
  /** The folder the demo may fill and remove. Left out, there is no demo. */
  demoFolder?: string;
  /** Where the demo's stand-in scripts are. Left out, this checkout's. For tests. */
  demoSource?: string;
  /** The version this server reports about itself. */
  version?: string;
  /** Check every /v1 answer against the shape its route declares. On by default under the test runner. */
  validateResponses?: boolean;
  /** The clock devices and pairing codes are judged by. A test passes its own, so that it never waits. */
  now?: () => number;
}

/** Where a request came in, worked out from its `Host` alone: under this computer's own name, or an outside address. */
export type CameIn = 'here' | 'outside';

/** Said where a window on this computer's desktop was asked for from another device. */
export const NOT_AT_THIS_COMPUTER = 'Not opened: this was asked for from another device, and a window is opened on this computer only for a request made at this computer.';

/** A route of the public API, as the tests walk them. */
export interface PublicRoute {
  method: string;
  url: string;
}

const routeLists = new WeakMap<FastifyInstance, PublicRoute[]>();
const everyRouteLists = new WeakMap<FastifyInstance, PublicRoute[]>();

/** Every route a server has, under any address: for the walk that tries each one as a stranger from outside. */
export function everyRouteOf(app: FastifyInstance): PublicRoute[] {
  return everyRouteLists.get(app) ?? [];
}

/** Every route under /v1 that a server has, so that a test can try each one and none is forgotten. */
export function publicRoutesOf(app: FastifyInstance): PublicRoute[] {
  return routeLists.get(app) ?? [];
}

/** Pause reading from a terminal when this much output is waiting to be sent. */
const HIGH_WATER = 1024 * 1024;
/** Closes a socket whose device was revoked, and cuts it if the other end does not answer the close within a second. */
function closeAtOnce(socket: { close: (code: number, reason: string) => void; terminate: () => void }): void {
  socket.close(CLOSE_DEVICE_REVOKED, 'Device revoked');
  setTimeout(() => socket.terminate(), 1000).unref();
}
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

/** The cookie a paired device signs in with. Never the access token's name, so that neither is taken for the other. */
export function deviceCookieName(port: number): string {
  return `aubergine_device_${port}`;
}

/** The one answer to every code that did not work, whatever the reason. */
const PAIRING_REFUSED = errorBody('unauthorized', 'That code did not work. A code works once, for three minutes: make a new one where Aubergine runs, with aubergine device add.');

/** For a server that was given no fetcher: it fetches nothing, and says so. */
const NO_FETCHER: LibraryFetcher = {
  fetch: async () => {
    throw new FetchRefusal('This server was started without a place to keep fetched sources, so it fetches nothing.');
  },
  forget: async () => undefined,
};

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const { hub, sessions, runtime, token } = options;
  // Limits are read once, when the server starts.
  const limits = (await options.settings()).api;
  const app = Fastify({ logger: false, bodyLimit: limits.maxBodyBytes });
  const tokens = new Tokens(hub);
  const clock = options.now ?? Date.now;
  // The outside addresses, read once, when the server starts. A wrong entry was reported where the settings were read, and is skipped.
  const outsideAddresses = accessEntries('addresses', (await options.settings()).access.addresses).entries;
  const outsideByHost = new Map(outsideAddresses.map((entry) => [entry.host, entry.origin]));
  // The origins of linked pages: pages of another Aubergine that may show this server. Read once, at start, like the addresses.
  const pageOrigins = new Set(accessEntries('pages', (await options.settings()).access.pages).entries.map((entry) => entry.origin));
  const outsideOrigins = new Set(outsideAddresses.map((entry) => entry.origin));
  const devices = new Devices(hub, clock);
  const pairing = new Pairing(clock);
  const tickets = new SocketTickets(clock);
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
  const messageSettings = (await options.settings()).messages;
  const messages = new Messages(hub, sessions, () => messageSettings, options.messageLog);
  await messages.load();
  const library = new Library(hub, sessions, workflows, drafts, {
    cacheDir: options.libraryCache ?? path.join(os.tmpdir(), 'aubergine-no-library-cache'),
    fetcher: options.libraryFetcher ?? NO_FETCHER,
    limits: workflowLimits,
    inventories: options.inventories,
    builtin: options.libraryBuiltin,
  });
  // Where sessions work. The session code asks this for a place by the name of a kind, and knows no kind itself.
  const environments = new Environments(hub, { keptIn: options.copiesDir ?? null, defaultFolder: () => options.defaultFolder?.() ?? os.homedir(), onError: (error) => console.error('Could not read a working copy:', error) });
  sessions.usePlaces(environments);
  // The queue of tasks, the owner's list and the rules. A rule's notification goes to the pages that are open, and nowhere else.
  const queue = new Queue(hub, sessions, workflows, drafts, environments, options.taskArchive ?? new MemoryTaskArchive(), { notify: (title, body) => viewers.notify(title, body), activity, onError: (error) => console.error('Could not start a task:', error) });
  await queue.reconcile();
  // Projects: several in the one server, and what is shared between them. Changing any of it is the owner's alone.
  const projects = new Projects(hub, sessions);
  // A terminal in a window of the owner's own terminal application: the owner's alone to ask for.
  const desktop = new Desktop(hub, sessions, { opener: options.desktop ?? null, setOpenNew: options.setDesktopOpenNew ?? null, openNew: async () => (await options.settings()).desktop.openNew, onError: (error) => console.error('Could not open a terminal on the desktop:', error) });
  await desktop.sweep();
  // What a terminal says about itself: its links, who wrote its name and summary, what is found by looking.
  const described = new Described(hub, sessions, { runtime: options.runtime, finder: options.pullRequests ?? null, ...(options.folderFacts ? { facts: options.folderFacts } : {}), settings: options.settings, onError: (error) => console.error('Could not look at a terminal\u2019s folder:', error) });
  described.start();
  // Schedules, and the one timer that starts something. It is on only while a schedule is switched on.
  const schedules = new Schedules(hub, queue, {
    clock: options.scheduleClock ?? REAL_CLOCK,
    zone: options.scheduleZone ?? ownZone(),
    lateWithinMs: (await options.settings()).schedules.lateWithinHours * 3600 * 1000,
    activity,
    onError: (error) => console.error('Could not answer for a schedule:', error),
  });
  // A project as a file, and templates: the ones that come with this copy, and the owner's own in the data folder.
  const projectFiles = new ProjectFiles(hub, sessions, workflows, drafts, queue, schedules, projects, {
    templatesDir: options.templatesDir ?? null,
    appTemplatesDir: options.appTemplatesDir === undefined ? path.join(packageRoot(), 'templates') : options.appTemplatesDir,
  });
  // The library that ships with the app is read from this copy's own files. Nothing is fetched at start, or ever without the owner asking.
  await library.start();
  const terminals = new TerminalAccess(sessions, runtime, () => terminalSettings, options.inputAudit ?? noInputAudit);
  /** How much a terminal call read or typed, for the activity log. */
  const traces = new WeakMap<FastifyRequest, TerminalTrace>();
  /** What `authorize` is told about a session: where it is, its tags, whether it is closed to programs. */
  const resourceOf = (sessionId: string): Resource => {
    const session = hub.state.sessions.find((s) => s.id === sessionId);
    if (!session) return { sessionId };
    return { sessionId, projectId: session.projectId, session: { canvasId: placeOfSession(hub.state, sessionId)?.canvas.id ?? null, tags: session.tags, peopleOnly: session.peopleOnly, takesMessages: session.takesMessages } };
  };

  const routes: PublicRoute[] = [];
  routeLists.set(app, routes);
  const everyRoute: PublicRoute[] = [];
  everyRouteLists.set(app, everyRoute);
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) {
      if (method !== 'HEAD' && method !== 'OPTIONS') everyRoute.push({ method, url: route.url });
    }
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
      if (principal && peopleOnlyRefusal(principal, action, resource)) throw new HttpError(403, 'people_only', 'This session is marked "people only": no token may read it, type into it or message it.');
      // Of a project this token does not reach: answered as for a thing that is not there.
      if (principal && projectRefusal(principal, resource)) throw new HttpError(404, 'not_found', 'Not found');
      if (principal && reachRefusal(principal, action, resource)) throw new HttpError(403, 'out_of_reach', "This token's reach does not cover that session.");
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
  /** What the calling program says it is, when it says so in the form asked for. A trace: nothing is decided by it. */
  const clientOf = (request: FastifyRequest): string | null => {
    const said = request.headers[CLIENT_HEADER];
    return typeof said === 'string' && ClientName.safeParse(said).success ? said : null;
  };
  /** What only the owner may do and is worth seeing when it was not done in the browser. */
  const WATCHED: readonly Action[] = ['desktop.open', 'settings.write', 'drafts.review', 'repository.review', 'repository.write', 'tokens.manage', 'terminal.input', 'sessions.protect', 'messages.manage', 'runs.approve'];
  /** Reading a terminal is watched too, though it changes nothing. */
  const WATCHED_READS: readonly Action[] = ['terminal.read'];
  const ownerLogged = new WeakSet<FastifyRequest>();

  /** Records one call made with a token, or one of the owner's own from outside the browser. Who, what and how it ended: never the secret, never what was sent. */
  const record = (request: FastifyRequest, status: number): void => {
    const call = tokenCalls.get(request);
    if (!call) {
      const what = asked.get(request);
      if (principals.get(request)?.kind !== 'user' || !what || !(WATCHED_READS.includes(what.action) || (WATCHED.includes(what.action) && request.method !== 'GET')) || ownerLogged.has(request)) return;
      // Through a linked page the owner is a device: said so, with which one. Otherwise only a call from outside the page is written.
      const viaPage = fromLinkedPage.has(request) ? deviceOf.get(request) : undefined;
      const caller = ownerCaller(request);
      if (viaPage === undefined && caller.kind !== 'owner-cli') return;
      ownerLogged.add(request);
      void activity.append({
        at: new Date().toISOString(),
        caller: viaPage !== undefined ? 'device' : 'owner-cli',
        ...(viaPage !== undefined ? { byDeviceId: viaPage } : {}),
        tokenId: null,
        tokenName: '',
        fromSessionId: viaPage !== undefined ? null : caller.sessionId,
        client: clientOf(request),
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
      client: clientOf(request),
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

  /** Where each request came in, and the device it was signed in with, when it was. */
  const cameIn = new WeakMap<FastifyRequest, CameIn>();
  const deviceOf = new WeakMap<FastifyRequest, string>();
  /** The requests that came from a linked page: whatever their Host, never at this computer. */
  const fromLinkedPage = new WeakSet<FastifyRequest>();
  /** Whether a request was made by someone at this computer: under its own name, and not from a linked page. */
  const atThisComputer = (request: FastifyRequest): boolean => cameIn.get(request) === 'here' && !fromLinkedPage.has(request);
  /** What closes what each device holds open: its sockets and streams, closed at once when it is revoked. */
  const heldOpen = new Map<string, Set<() => void>>();
  const holdOpen = (request: FastifyRequest, close: () => void): (() => void) => {
    const deviceId = deviceOf.get(request);
    if (deviceId === undefined) return () => undefined;
    const held = heldOpen.get(deviceId) ?? new Set<() => void>();
    heldOpen.set(deviceId, held);
    held.add(close);
    return () => void held.delete(close);
  };
  const stopClosing = hub.subscribe((event) => {
    if (event.type !== 'device.revoked') return;
    const held = heldOpen.get(event.deviceId);
    heldOpen.delete(event.deviceId);
    for (const close of held ?? []) close();
  });
  app.addHook('onClose', async () => stopClosing());

  /** Gives a device its cookie: the secret's one way out of the server. */
  const setDeviceCookie = (reply: FastifyReply, secret: string, place: CameIn): void => {
    void reply.setCookie(deviceCookieName(port()), secret, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      // From outside the address is HTTPS: the cookie is never sent over anything else.
      secure: place === 'outside',
      maxAge: DEVICE_UNUSED_DAYS * 24 * 60 * 60,
    });
  };

  /**
   * Whether a request from outside carries the cookie of a device that may sign in: a browser, not revoked, used
   * within the last 90 days. Nothing else signs in from outside. Noting that it was used is written at most once a
   * minute, and then the cookie is given again, so that a device in use keeps it.
   */
  const deviceSignedIn = (request: FastifyRequest, reply: FastifyReply, isUpgrade: boolean): boolean => {
    const secret = request.cookies[deviceCookieName(port())];
    if (secret === undefined) return false;
    const found = devices.authenticate(secret);
    if (!found || found.status !== 'active' || found.device.kind !== 'browser') return false;
    deviceOf.set(request, found.device.id);
    if (devices.touch(found.device.id) && !isUpgrade) setDeviceCookie(reply, secret, 'outside');
    return true;
  };

  // Every request, including WebSocket upgrades, passes these checks.
  app.addHook('onRequest', async (request, reply) => {
    const { hosts, origins } = allowed();

    // Where the request came in, from Host alone: this computer's own name, or one of the outside addresses written
    // in the settings. No forwarded header is believed, for this or anything else. A page on another site can only
    // reach this server under a different Host name (DNS rebinding) or with a foreign Origin. Refuse both.
    const host = request.headers.host;
    const outsideOrigin = host === undefined ? undefined : outsideByHost.get(host.toLowerCase());
    const place: CameIn | null = host !== undefined && hosts.has(host) ? 'here' : outsideOrigin !== undefined ? 'outside' : null;
    if (place === null) {
      return reply.code(403).send(errorBody('forbidden', 'Host not allowed'));
    }
    cameIn.set(request, place);
    // An outside address is HTTPS: every answer under it says so, refusals included.
    if (place === 'outside') void reply.header('strict-transport-security', 'max-age=31536000');
    const origin = request.headers.origin;
    const pathname = request.url.split('?')[0] ?? '';
    const isUpgrade = request.headers.upgrade?.toLowerCase() === 'websocket';

    // A linked page: the page of another Aubergine, at an origin written in access.pages (and not one of this server's
    // own), calling across origins with a credential it holds itself. Judged by that credential alone, whatever the Host
    // and whatever cookie came with it: no cookie is looked at, none is set, and no other kind of credential is taken.
    if (origin !== undefined && pageOrigins.has(origin) && !origins.has(origin) && !outsideOrigins.has(origin)) {
      fromLinkedPage.add(request);
      // That exact origin, on every answer: never "*", never "credentials allowed".
      void reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
      // A preflight carries no credential and reaches no route: it is answered here, for every path alike.
      if (request.method === 'OPTIONS' && request.headers['access-control-request-method'] !== undefined) {
        return reply
          .code(204)
          .header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE')
          .header('access-control-allow-headers', LINKED_PAGE_HEADERS.join(', '))
          .header('access-control-max-age', '600')
          .send();
      }
      void reply.header('access-control-expose-headers', 'retry-after');
      // A code is the sign-in: the route takes only a code made for this very origin.
      if (pathname === paths.pair) return;
      // A WebSocket cannot carry a header: a ticket in its address, made for a page device of this origin, spent here.
      if (pathname.startsWith('/ws/')) {
        const offered = isUpgrade ? new URLSearchParams(request.url.slice(pathname.length)).get(TICKET_PARAM) : null;
        const deviceId = offered === null ? null : tickets.spend(offered, origin);
        const device = deviceId === null ? undefined : devices.find(deviceId);
        if (!device || device.kind !== 'page' || device.origin !== origin || deviceStatus(device, clock()) !== 'active') {
          return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong socket ticket'));
        }
        deviceOf.set(request, device.id);
        devices.touch(device.id);
        principals.set(request, { kind: 'user' });
        return;
      }
      if (pathname === '/v1' || pathname.startsWith('/v1/') || pathname.startsWith('/api/')) {
        // A page device's credential, from the origin it was paired from, and nothing else: not an API token, not a
        // session's token, not a browser device's secret. A wrong one is refused, never tried as anything else.
        const bearer = bearerOf(request.headers.authorization);
        const found = bearer === null ? null : devices.authenticate(bearer);
        if (!found || found.status !== 'active' || found.device.kind !== 'page' || found.device.origin !== origin) {
          return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong credential for a linked page'));
        }
        deviceOf.set(request, found.device.id);
        devices.touch(found.device.id);
        principals.set(request, { kind: 'user' });
        return;
      }
      return reply.code(403).send(errorBody('forbidden', 'A linked page reaches /v1, /api, /ws and pairing, and nothing else.'));
    }

    // Here: one of this computer's own origins, as before. From outside: exactly the address it came in under.
    if (origin !== undefined && !(place === 'here' ? origins.has(origin) : origin === outsideOrigin)) {
      return reply.code(403).send(errorBody('forbidden', 'Origin not allowed'));
    }

    const isSafeMethod = request.method === 'GET' || request.method === 'HEAD';
    // The owner's sign-in. Here: the access token's cookie, and nothing else. From outside: a device's cookie, and
    // nothing else; the access token is never accepted there, in any form. Looked at only where it is needed.
    const ownerSignedIn = (): boolean => (place === 'here' ? tokensMatch(token, request.cookies[cookieName(port())]) : deviceSignedIn(request, reply, isUpgrade));

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
          principals.set(request, { kind: 'token', tokenId: found.token.id, name: found.token.name, scopes: found.token.scopes, reviewWorkflows: found.token.reviewWorkflowChanges, reach: found.token.reach, projects: found.token.projects });
          return;
        }
        // A session's own token. The access token itself is not a bearer credential, here or from outside:
        // this gives a session principal or nothing, never the owner.
        const principal = principalFromBearer(token, request.headers.authorization);
        if (!principal || principal.kind !== 'session') return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong bearer token'));
        principals.set(request, principal);
        return;
      }
      if (!ownerSignedIn()) return reply.code(401).send(errorBody('unauthorized', 'Not signed in'));
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
      if (!ownerSignedIn()) return reply.code(401).send(errorBody('unauthorized', 'Missing or wrong access token'));
      // Only the owner's sign-in opens these, so the caller is the owner: at this computer, or on a paired device.
      principals.set(request, { kind: 'user' });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    // A body that could not even be read is, on the route for codes, one more code that did not work: the same answer.
    if (request.routeOptions?.url === paths.pair && request.method === 'POST' && !pairingTried.has(request)) return tryPairing(request, reply, undefined);
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message));
    }
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE' || (error as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).send(errorBody('too_large', `The request body is larger than this server accepts (${limits.maxBodyBytes} bytes).`));
    }
    if (error instanceof NotFoundError || error instanceof SessionNotFoundError || error instanceof TokenNotFoundError || error instanceof DeviceNotFoundError) {
      return reply.code(404).send(errorBody('not_found', error.message));
    }
    if (error instanceof BadInputError || error instanceof BadCursorError || error instanceof BadActivityCursorError) {
      return reply.code(400).send(errorBody('bad_request', error.message));
    }
    if (error instanceof MessageRefusal) {
      if (error.retryAfterSeconds !== undefined) void reply.header('retry-after', String(error.retryAfterSeconds));
      return reply.code(error.status).send(errorBody(error.code, error.message));
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
    // From outside, there is no such address: the access token is never taken there, and is not even compared.
    if (cameIn.get(request) !== 'here') return reply.code(404).send(errorBody('not_found', 'Not found'));
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

  /* ---------- Devices: pairing, and the owner's list ---------- */

  /** The requests a code was already tried for: a failure while answering one is not tried again. */
  const pairingTried = new WeakSet<FastifyRequest>();
  /** When a try refused for being one too many was last written to the activity log. */
  let limitedSaidAt = Number.NEGATIVE_INFINITY;
  /** One line in the activity log about devices and codes. Who, what and how it ended: never a code, never a secret, never a body. */
  const recordDevices = (request: FastifyRequest, line: { caller: 'owner' | 'owner-cli' | 'device' | 'pairing'; action: string; status: number; outcome: 'ok' | 'denied' | 'limited'; device?: { id: string; name: string } }): void => {
    void activity.append({
      at: new Date(clock()).toISOString(),
      caller: line.caller,
      tokenId: null,
      tokenName: '',
      byDeviceId: line.caller === 'device' ? (deviceOf.get(request) ?? null) : null,
      deviceId: line.device?.id ?? null,
      deviceName: line.device?.name ?? null,
      client: clientOf(request),
      action: line.action,
      resource: {},
      method: request.method,
      route: request.routeOptions?.url ?? '(no such route)',
      status: line.status,
      outcome: line.outcome,
    });
  };
  /** Who the owner is, for that log: on a device, at this computer in the page, or from a command line. */
  const ownerOnDevices = (request: FastifyRequest): 'owner' | 'owner-cli' | 'device' => (deviceOf.has(request) ? 'device' : ownerCaller(request).kind === 'owner-cli' ? 'owner-cli' : 'owner');

  /**
   * Tries a pairing code. A browser's code is spent only from outside, with the address's own Origin: from here the
   * comparisons are made all the same and the answer is that it did not work, since a device's cookie is not taken
   * here. A page's code is spent only from a linked page at the origin it was made for, whatever the Host. Every
   * failure is one answer.
   */
  function tryPairing(request: FastifyRequest, reply: FastifyReply, code: unknown): FastifyReply {
    pairingTried.add(request);
    const place = cameIn.get(request) ?? 'here';
    void reply.header('cache-control', 'no-store');
    const page = fromLinkedPage.has(request) ? (request.headers.origin ?? null) : null;
    const tried = pairing.try(code, page !== null ? { accept: true, kinds: ['page'], origin: page } : { accept: place === 'outside', kinds: ['browser'] });
    if (tried.result === 'limited') {
      // Needs no sign-in, so anyone can be refused here as often as they like: one line a minute says so, not one a try.
      if (clock() - limitedSaidAt >= 60_000) {
        limitedSaidAt = clock();
        recordDevices(request, { caller: 'pairing', action: 'devices.pair', status: 429, outcome: 'limited' });
      }
      return reply.code(429).header('retry-after', String(tried.retryAfterSeconds)).send(errorBody('rate_limited', `Too many tries at a code in a minute. Try again in ${tried.retryAfterSeconds} s.`));
    }
    if (tried.result === 'wrong') {
      recordDevices(request, { caller: 'pairing', action: 'devices.pair', status: 401, outcome: 'denied' });
      return reply.code(401).send(PAIRING_REFUSED);
    }
    if (tried.kind === 'page') {
      const { device, secret } = devices.create({ name: tried.name, kind: 'page', origin: tried.origin });
      recordDevices(request, { caller: 'pairing', action: 'devices.pair', status: 200, outcome: 'ok', device: { id: device.id, name: device.name } });
      // The credential's one way out of the server: in this answer, never in a cookie, never again.
      const paired: PairedPage = { credential: secret, device: { id: device.id, name: device.name }, protocolVersion: PROTOCOL_VERSION };
      return reply.code(200).send(paired);
    }
    const { device, secret } = devices.create({ name: tried.name, kind: tried.kind });
    recordDevices(request, { caller: 'pairing', action: 'devices.pair', status: 204, outcome: 'ok', device: { id: device.id, name: device.name } });
    setDeviceCookie(reply, secret, place);
    return reply.code(204).send();
  }

  // Needs no sign-in: a code is the sign-in. The hook has checked Host and Origin as for every request.
  app.post(paths.pair, async (request, reply) => {
    const body = PairRequest.safeParse(request.body);
    return tryPairing(request, reply, body.success ? body.data.code : undefined);
  });

  app.get(paths.devices, async (request): Promise<DeviceList> => {
    allowOn(request, 'devices.manage', {});
    const now = clock();
    return { devices: devices.list().map((device) => viewOfDevice(device, now, deviceOf.get(request) ?? null)) };
  });

  app.post(paths.pairingCodes, async (request, reply): Promise<PairingCodeAnswer> => {
    allowOn(request, 'devices.manage', {});
    const body = parse(PairingCodeRequest, request.body);
    let made: { code: string; expiresAt: number };
    if (body.kind === 'page') {
      // Only a page at an origin the owner wrote down can use it. Two servers on one computer link under their own names, so no outside address is needed.
      const checked = accessProblem('pages', body.origin);
      if (!checked.ok || !pageOrigins.has(checked.origin)) throw new HttpError(409, 'conflict', 'That origin is not written in access.pages in config.json, so a page there could not use a code. Write it there, start the server again, and ask for a code then.');
      made = pairing.make(body.name, 'page', checked.origin);
    } else {
      if (outsideAddresses.length === 0) throw new HttpError(409, 'conflict', 'No outside address is written in the settings, so a code could not be used anywhere. Write one in access.addresses in config.json, start the server again, and ask for a code then.');
      made = pairing.make(body.name, 'browser');
    }
    recordDevices(request, { caller: ownerOnDevices(request), action: 'devices.manage', status: 201, outcome: 'ok' });
    // Shown once, and never kept anywhere on the way.
    void reply.code(201).header('cache-control', 'no-store');
    return { code: made.code, expiresAt: new Date(made.expiresAt).toISOString(), addresses: outsideAddresses.map((entry) => entry.origin) };
  });

  // A linked page cannot put its credential on a WebSocket: it asks for a ticket here, and puts that in the socket's address.
  app.post(paths.socketTickets, async (request, reply): Promise<SocketTicket> => {
    allowOn(request, 'devices.manage', {});
    const deviceId = deviceOf.get(request);
    const origin = request.headers.origin;
    if (!fromLinkedPage.has(request) || deviceId === undefined || origin === undefined) {
      throw new HttpError(403, 'forbidden', 'Only a linked page needs a ticket for a socket: a page this server served opens its sockets with its own sign-in.');
    }
    const made = tickets.make(deviceId, origin);
    void reply.code(201).header('cache-control', 'no-store');
    return { ticket: made.ticket, expiresAt: new Date(made.expiresAt).toISOString() };
  });

  app.delete(paths.device(':deviceId'), async (request): Promise<RevokedDevice> => {
    allowOn(request, 'devices.manage', {});
    const deviceId = parse(Id, (request.params as { deviceId?: string }).deviceId);
    // Who asked, before the device is revoked: a device may revoke itself.
    const caller = ownerOnDevices(request);
    // Its sockets and streams are closed by the change itself (above), whoever revoked it.
    const device = devices.revoke(deviceId);
    recordDevices(request, { caller, action: 'devices.manage', status: 200, outcome: 'ok', device: { id: device.id, name: device.name } });
    return { device: viewOfDevice(device, clock(), deviceOf.get(request) ?? null) };
  });

  /* ---------- HTTP API ---------- */

  const idParam = (request: FastifyRequest, name: string): string =>
    parse(Id, (request.params as Record<string, string>)[name]);

  app.get(paths.state, async (request): Promise<StateResponse> => {
    const [runtimeNow, settingsNow] = [await sessions.status(), await options.settings()];
    // The state and its number are read together, after everything that waits: a change cannot come between the two.
    return {
      protocolVersion: PROTOCOL_VERSION,
      runtime: runtimeNow,
      settings: settingsNow,
      // A browser has no use for the hashes of token secrets, so they stay here.
      state: { ...hub.state, tokens: hub.state.tokens.map((t) => ({ ...t, hash: '' })), devices: hub.state.devices.map((d) => ({ ...d, hash: '' })) },
      epoch: hub.epoch,
      revision: hub.revision,
      defaultCanvasId: sessions.defaultCanvasId(),
      here: atThisComputer(request),
    };
  });

  app.post(paths.sessions, async (request, reply): Promise<CreateSessionResponse> => {
    const { desktop: alsoOnDesktop, ...body } = parse(CreateSessionRequest, request.body ?? {});
    reply.code(201);
    // Where it names no canvas: of the project the caller means (a command line says so in a header), else the first.
    const meant = request.headers[PROJECT_HEADER];
    const created = await (typeof meant === 'string' && hub.state.projects.some((p) => p.id === meant) ? inProject(meant, () => sessions.create(body)) : sessions.create(body));
    // Only here, on the owner's own route, and only when the request says so: a session a token, a task or a schedule
    // makes goes through other code and never opens a window. The session is made whether or not the window opens.
    // Never from another device: a window on this computer's desktop is for someone at this computer.
    if (alsoOnDesktop !== true) return created;
    const notHere: OpenedOnDesktop = { opened: false, says: NOT_AT_THIS_COMPUTER };
    return { ...created, desktop: atThisComputer(request) ? await desktop.openNew(created.session.id) : notHere };
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
  /* ---------- Past conversations ---------- */

  // Everything the owner and an agent said is in these, so they are the owner's alone, read when asked for and never kept.
  const histories = (): Histories => {
    if (!options.histories) throw new HttpError(404, 'not_found', 'Past conversations are not available on this server');
    return options.histories(sessions);
  };
  app.get(paths.history, async (request): Promise<HistoryList> => {
    allowOn(request, 'history.read', {});
    return histories().list(parse(HistoryQuery, request.query).folder);
  });
  app.get(paths.historyTranscript, async (request): Promise<Transcript> => {
    allowOn(request, 'history.read', {});
    const query = parse(TranscriptQuery, request.query);
    return histories().transcript(query.folder, query.id);
  });
  app.get(paths.historySearch, async (request): Promise<HistorySearch> => {
    allowOn(request, 'history.read', {});
    const query = parse(HistorySearchQuery, request.query);
    return histories().search(query.q, query.folder);
  });
  app.post(paths.historyOpen, async (request, reply): Promise<{ session: Session }> => {
    allowOn(request, 'history.open', {});
    const body = parse(OpenConversationRequest, request.body);
    reply.code(201);
    return histories().open(body);
  });

  /* ---------- While you were away ---------- */

  // A window of what changed lately, kept in memory for whoever comes back to the page. Not state, not a log.
  const away = new Away(hub);
  app.addHook('onClose', async () => away.close());
  app.addHook('onClose', async () => messages.close());
  app.addHook('onClose', async () => environments.close());
  app.addHook('onClose', async () => {
    desktop.close();
    schedules.close();
    await schedules.settled();
    queue.close();
    await queue.settled();
  });
  app.get(paths.away, async (request): Promise<AwayDigest> => {
    allowOn(request, 'away.read', {});
    const query = parse(AwayQuery, request.query);
    return away.digest(query.since);
  });

  /* ---------- Messages, as the owner sees and sends them ---------- */

  app.get(paths.messageThreads, async (request): Promise<ThreadList> => {
    allowOn(request, 'messages.manage', {});
    return { threads: messages.list(parse(ThreadsQuery, request.query).sessionId) };
  });
  const threadParam = (request: FastifyRequest): string => parse(ThreadId, (request.params as { threadId?: string }).threadId);
  app.get(paths.messageThread(':threadId'), async (request): Promise<ThreadDetail> => {
    allowOn(request, 'messages.manage', {});
    return messages.detail(threadParam(request));
  });
  app.post(paths.messageThread(':threadId'), async (request): Promise<ThreadDetail> => {
    allowOn(request, 'messages.manage', {});
    return messages.act(threadParam(request), parse(ThreadAction, request.body).action);
  });
  // The owner's own message. Nothing limits it; it is kept and shown like any other, and never typed.
  app.post(paths.sessionMessages(':sessionId'), async (request, reply): Promise<Message> => {
    const sessionId = idParam(request, 'sessionId');
    allowOn(request, 'messages.manage', { sessionId });
    const body = parse(OwnerMessageRequest, request.body);
    void reply.code(201);
    // Said with the message: whether it came from the page, or from a command line, where whoever types acts as the owner.
    return messages.fromOwner(sessionId, body.text, body.replyTo ?? null, ownerCaller(request).kind === 'owner-cli' ? 'command' : 'page');
  });
  app.post(paths.sessionMessageBlocks(':sessionId'), async (request): Promise<{ sessionId: string; sender: string; blocked: boolean }> => {
    const sessionId = idParam(request, 'sessionId');
    allowOn(request, 'messages.manage', { sessionId });
    const body = parse(BlockSenderRequest, request.body);
    return messages.block(sessionId, body.sender, body.blocked);
  });
  // Whether the terminals on a canvas may message each other: the canvas's own ID in its own list, and nothing else can be put there here.
  app.put(paths.canvasMessaging(':canvasId'), async (request): Promise<{ canvasId: string; sessions: boolean }> => {
    const canvasId = idParam(request, 'canvasId');
    allowOn(request, 'messages.manage', { canvasId });
    const body = parse(CanvasMessagingRequest, request.body);
    const canvas = hub.state.canvases.find((c) => c.id === canvasId);
    if (!canvas) throw new HttpError(404, 'not_found', 'No canvas by that ID.');
    const others = canvas.messagesFrom.filter((id) => id !== canvasId);
    const messagesFrom = body.sessions ? [canvasId, ...others] : others;
    if (canvas.messagesFrom.includes(canvasId) !== body.sessions) hub.emit({ type: 'canvas.messaging', canvasId, messagesFrom });
    return { canvasId, sessions: body.sessions };
  });

  /* ---------- Recaps ---------- */

  app.post(paths.askRecap(':sessionId'), async (request): Promise<{ asked: boolean; line: string }> => {
    const sessionId = idParam(request, 'sessionId');
    allowOn(request, 'recap.ask', { sessionId });
    try {
      return { asked: await sessions.askForRecap(sessionId), line: RECAP_LINE };
    } catch (error) {
      if (error instanceof ConflictError) throw new HttpError(409, 'conflict', error.message);
      throw error;
    }
  });

  /* ---------- What is switched on ---------- */

  app.get(paths.inventory(':sessionId'), async (request): Promise<Inventory> => {
    const sessionId = idParam(request, 'sessionId');
    allowOn(request, 'inventory.read', { sessionId });
    if (!options.inventories) throw new HttpError(404, 'not_found', 'Reading what is switched on is not available on this server');
    try {
      // Read now, from the files; nothing of it is kept.
      return await options.inventories.of(sessions.get(sessionId));
    } catch (error) {
      if (error instanceof NotAnAgentError) throw new HttpError(409, 'conflict', error.message);
      throw error;
    }
  });

  /* ---------- The demo ---------- */

  const demo = options.demoFolder === undefined ? null : new Demo(hub, sessions, workflows, drafts, { folder: options.demoFolder, ...(options.demoSource ? { source: options.demoSource } : {}) });
  const theDemo = (): Demo => {
    if (!demo) throw new HttpError(404, 'not_found', 'The demo is not available on this server');
    return demo;
  };
  app.get(paths.demo, async (request): Promise<DemoStatus> => {
    allowOn(request, 'demo.manage', {});
    return theDemo().status();
  });
  app.post(paths.demo, async (request, reply): Promise<DemoStatus> => {
    allowOn(request, 'demo.manage', {});
    reply.code(201);
    return theDemo().make();
  });
  app.delete(paths.demo, async (request): Promise<DemoStatus> => {
    allowOn(request, 'demo.manage', {});
    await theDemo().remove(ownerCaller(request));
    return theDemo().status();
  });

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
    messages,
    library,
    environments,
    queue,
    schedules,
    desktop,
    described,
    changeDescribing: async (remind) => {
      if (!options.setDescribeRemind) throw new ConflictError('This server has no settings file to write.');
      try {
        await options.setDescribeRemind(remind);
      } catch (error) {
        if (error instanceof SettingsUnreadableError) throw new ConflictError(error.message);
        throw error;
      }
      return { remind: (await options.settings()).describe.remind };
    },
    // How the page looks: the one key is written, and the answer is what the file says afterwards.
    changeTheme: async (theme) => {
      if (!options.setTheme) throw new ConflictError('This server has no settings file to write.');
      try {
        await options.setTheme(theme);
      } catch (error) {
        if (error instanceof SettingsUnreadableError) throw new ConflictError(error.message);
        throw error;
      }
      return { theme: (await options.settings()).theme };
    },
    projects,
    projectFiles,
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
    atThisComputer,
    holdOpen,
    recordNow: (request) => record(request, 200),
    ownerCaller,
    allow: allowOn,
    parse,
    fail: (status, code, message) => new HttpError(status, code, message),
  });

  /* ---------- WebSocket: change events ---------- */

  app.get(paths.events, { websocket: true }, (socket, request) => {
    const send = (message: EventsServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const unsubscribe = hub.subscribe((event, revision) =>
      send({ type: 'event', revision, event: event.type === 'token.created' ? { ...event, token: { ...event.token, hash: '' } } : event.type === 'device.added' ? { ...event, device: { ...event.device, hash: '' } } : event }),
    );
    const viewer = viewers.add(send);
    // Closed at once if the device it was opened with is revoked.
    const release = holdOpen(request, () => closeAtOnce(socket));
    const leave = (): void => {
      unsubscribe();
      viewers.remove(viewer);
      release();
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

    const release = holdOpen(request, () => closeAtOnce(socket));
    const cleanup = (): void => {
      release();
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
      // A viewer is attached to a shell on this computer; one that runs elsewhere has nothing here to attach to.
      if (!sessions.isRunning(sessionId) || !isLocalHost(sessions.get(sessionId))) return sessionEnded();
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
    await app.register(fastifyStatic, { root: options.webDist, index: false });
    // The page is sent with the theme that is chosen already written on it, so that it is never drawn in the other
    // one first. Only that one word of the settings is in it. Never kept by a browser: the choice may change.
    const pageFile = path.join(options.webDist, 'index.html');
    const sendPage = async (_request: unknown, reply: FastifyReply): Promise<FastifyReply> => {
      const html = await readFile(pageFile, 'utf8');
      const theme = ThemeSetting.safeParse((await options.settings()).theme);
      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-cache')
        // The page is never shown inside another page.
        .header('content-security-policy', "frame-ancestors 'none'")
        .header('x-frame-options', 'DENY')
        .send(html.replace('<html lang="en"', `<html lang="en" data-theme-setting="${theme.success ? theme.data : 'system'}"`));
    };
    app.get('/', sendPage);
    app.get('/index.html', sendPage);
    // The address of a canvas is a page of the same web app.
    app.get(canvasAddress(':canvasId'), sendPage);
    app.get(projectCanvasAddress(':projectId', ':canvasId'), sendPage);
    // And the address of one terminal by itself, shown as one more viewer of the same running terminal.
    app.get(terminalAddress(':sessionId'), sendPage);
    // And so is the address of each page that is about a whole project.
    for (const page of PAGE_NAMES) {
      app.get(pageAddress(canvasAddress(':canvasId'), page), sendPage);
      app.get(pageAddress(projectCanvasAddress(':projectId', ':canvasId'), page), sendPage);
    }
    // The same addresses after `/s/<link>`: the page showing a server this browser linked. The server is told nothing
    // by them: what `<link>` names is known to that browser alone, and the page is the same page.
    app.get(linkedAddress(':link', ''), sendPage);
    app.get(linkedAddress(':link', canvasAddress(':canvasId')), sendPage);
    app.get(linkedAddress(':link', projectCanvasAddress(':projectId', ':canvasId')), sendPage);
    app.get(linkedAddress(':link', terminalAddress(':sessionId')), sendPage);
    for (const page of PAGE_NAMES) {
      app.get(linkedAddress(':link', pageAddress(canvasAddress(':canvasId'), page)), sendPage);
      app.get(linkedAddress(':link', pageAddress(projectCanvasAddress(':projectId', ':canvasId'), page)), sendPage);
    }
  } else {
    app.get('/', async (_request, reply) =>
      reply
        .type('text/plain; charset=utf-8')
        .header('content-security-policy', "frame-ancestors 'none'")
        .header('x-frame-options', 'DENY')
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

  // Last, when everything a firing may reach is there: one look for times that passed while the server was stopped.
  await schedules.start();
  return app;
}
