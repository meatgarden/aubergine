import { createHmac, timingSafeEqual } from 'node:crypto';
import { Id, NEVER_BY_TOKEN, REACH_ACTIONS, SESSION_ACTIONS, canvasAdmits, reaches, reachesProject, scopeFor, type Action, type ProjectReach, type Reach, type Scope, type SessionFacts } from '@aubergine/shared';

/** Who is making a request. Exactly one of these, decided once per request. */
export type Principal =
  /** The owner of this machine, signed in with the browser's cookie. */
  | { kind: 'user' }
  /** A program running inside one session, holding that session's token. */
  | { kind: 'session'; sessionId: string }
  /** A program holding an API token the owner created, with the scopes the owner gave it. */
  | { kind: 'token'; tokenId: string; name: string; scopes: readonly Scope[]; /** What it writes about workflows needs the owner's review: it may propose, not change. */ reviewWorkflows?: boolean; /** Which projects it reaches at all, for every scope. Left out: all. */ projects?: ProjectReach; /** Which sessions its terminal scopes apply to. Absent or null: none. */ reach?: Reach | null };

export { ACTIONS, NEVER_BY_TOKEN, type Action } from '@aubergine/shared';

/** What the action is about. Either may be absent when the action is not about one. */
export interface Resource {
  sessionId?: string;
  canvasId?: string;
  /**
   * The project of what is asked about: of the thing the request names, or the project it names. Null: a thing shared
   * with every project. Left out: nothing of a project is named. Given by whoever asks; never looked up afterwards.
   */
  projectId?: string | null;
  /** For a question about a session's terminal: what decides it. Given by whoever asks; never looked up afterwards. */
  session?: SessionFacts;
  /**
   * For a question about one session messaging another (`sessionId` and `session` are then the receiver's):
   * the canvas the sender is on, and which canvases the receiver's canvas lets message it.
   */
  delivery?: { fromCanvasId: string | null; messagesFrom: readonly string[] };
}

/** The actions that reach into a terminal or its messages: a scope is not enough for them, the session must be within reach and not "people only". */
export const TERMINAL_ACTIONS: readonly Action[] = REACH_ACTIONS;

/**
 * The one place that decides what a principal may do. Every route asks here;
 * no route looks at scopes or at the kind of caller by itself.
 *
 * - The signed-in user may do anything.
 * - A session may set its own attention state, append to its own note log and
 *   say which agent conversation it is in. Nothing else, and nothing about
 *   any other session.
 * - A session may message another session only where the owner opened the
 *   receiver's canvas to the sender's, and never one that is "people only".
 * - Nobody but the user reads or types in a terminal marked "people only".
 *   A token with a terminal scope reaches only the sessions its reach names.
 * - A token may do what its scopes allow (with one switch per token: changes
 *   to workflows that need review can only be proposed as drafts), and never anything in
 *   `NEVER_BY_TOKEN`. An action that is not listed for tokens is refused:
 *   a new action is closed to tokens until a line here opens it.
 */
export function authorize(principal: Principal, action: Action, resource: Resource): boolean {
  if (principal.kind === 'user') return true;
  if (principal.kind === 'session') {
    // One session messaging another: only where the owner let the sender's canvas message the receiver's,
    // never a terminal that is "people only" unless the owner said it still takes messages, never itself. With nothing switched on, this is always no.
    if (action === 'messages.write') {
      const to = resource.session;
      const delivery = resource.delivery;
      return to !== undefined && delivery !== undefined && resource.sessionId !== undefined && resource.sessionId !== principal.sessionId && (!to.peopleOnly || to.takesMessages === true) && to.canvasId !== null && canvasAdmits(delivery.messagesFrom, delivery.fromCanvasId);
    }
    return (SESSION_ACTIONS as readonly string[]).includes(action) && resource.sessionId !== undefined && principal.sessionId === resource.sessionId;
  }
  if ((NEVER_BY_TOKEN as readonly string[]).includes(action)) return false;
  // A token limited to some projects reaches nothing of another, whatever its scopes: not to read it either.
  if (!reachesProject(principal.projects, resource.projectId)) return false;
  // A token whose changes to workflows need review may propose drafts, and may not write workflows or the shelf itself.
  if (action === 'workflows.write' && principal.reviewWorkflows) return false;
  const scope = scopeFor(action);
  if (scope === null || !principal.scopes.includes(scope)) return false;
  if (!TERMINAL_ACTIONS.includes(action)) return true;
  // A terminal: the scope is not enough. The session must be within the token's reach, and not marked "people only".
  if (resource.session === undefined) {
    // No particular session (a search over many, decided again for each), or one that does not exist:
    // only a token that may reach every session is let through to be told so.
    return resource.sessionId === undefined || principal.reach?.kind === 'all';
  }
  return !resource.session.peopleOnly && reaches(principal.reach ?? null, resource.session);
}

/**
 * Whether a token was refused only because what it asked about is of a project outside its reach. The route then
 * answers as for a thing that is not there, so that the token learns nothing about what other projects hold.
 */
export function projectRefusal(principal: Principal, resource: Resource): boolean {
  return principal.kind === 'token' && !reachesProject(principal.projects, resource.projectId);
}

/**
 * Why a token that holds the scope was still refused a terminal: because the
 * session is "people only". Said only to a token that could otherwise have
 * reached it, so that it learns nothing about sessions outside its reach.
 */
export function peopleOnlyRefusal(principal: Principal, action: Action, resource: Resource): boolean {
  if (principal.kind !== 'token' || !TERMINAL_ACTIONS.includes(action) || resource.session === undefined) return false;
  const scope = scopeFor(action);
  return scope !== null && principal.scopes.includes(scope) && resource.session.peopleOnly && reaches(principal.reach ?? null, resource.session);
}

/**
 * Why a token that holds the scope was still refused a terminal, when it is
 * not "people only": the session is outside its reach. Said about a session
 * that does not exist too, so that it tells nothing about which sessions there are.
 */
export function reachRefusal(principal: Principal, action: Action, resource: Resource): boolean {
  if (principal.kind !== 'token' || !TERMINAL_ACTIONS.includes(action) || resource.sessionId === undefined) return false;
  const scope = scopeFor(action);
  return scope !== null && principal.scopes.includes(scope) && !authorize(principal, action, resource) && !peopleOnlyRefusal(principal, action, resource);
}

const PREFIX = 'aub1';

function mac(secret: string, sessionId: string): string {
  return createHmac('sha256', secret).update(`session:${sessionId}`).digest('hex');
}

/**
 * A session's token is derived from the daemon's secret and the session ID,
 * so nothing extra is stored and it cannot be turned into another session's.
 */
export function sessionToken(secret: string, sessionId: string): string {
  return `${PREFIX}.${sessionId}.${mac(secret, sessionId)}`;
}

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The credential in an `Authorization: Bearer …` header, or null when the header is not one. */
export function bearerOf(header: string | undefined): string | null {
  return /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1] ?? null;
}

/** Works out which session a bearer token belongs to, or null when it is not a valid session token. */
export function principalFromBearer(secret: string, header: string | undefined): Principal | null {
  const token = bearerOf(header);
  if (!token) return null;
  // The daemon's own secret is not a bearer credential: the user signs in with the cookie.

  const [prefix, sessionId, given, ...extra] = token.split('.');
  if (prefix !== PREFIX || !sessionId || !given || extra.length > 0) return null;
  if (!Id.safeParse(sessionId).success) return null;
  return equal(given, mac(secret, sessionId)) ? { kind: 'session', sessionId } : null;
}
