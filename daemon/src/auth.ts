import { createHmac, timingSafeEqual } from 'node:crypto';
import { Id, type Scope } from '@aubergine/shared';

/** Who is making a request. Exactly one of these, decided once per request. */
export type Principal =
  /** The owner of this machine, signed in with the browser's cookie. */
  | { kind: 'user' }
  /** A program running inside one session, holding that session's token. */
  | { kind: 'session'; sessionId: string }
  /** A program holding an API token the owner created, with the scopes the owner gave it. */
  | { kind: 'token'; tokenId: string; name: string; scopes: readonly Scope[] };

/** What a session may do, to itself only. */
const SESSION_ACTIONS = ['attention.set', 'note.append', 'agent.report'] as const;

/** The public API. For a token, each needs the scope beside it. */
const SCOPE_OF = {
  'canvases.read': 'read',
  'sessions.read': 'read',
  'events.read': 'read',
  'canvases.write': 'canvases:write',
  'layout.write': 'canvases:write',
  'canvases.show': 'canvases:write',
  'sessions.write': 'sessions:write',
  'sessions.show': 'sessions:write',
  'notes.write': 'notes:write',
  // Adding to a note log: a session may for itself; a token with `notes:write` may for any session.
  'note.append': 'notes:write',
} as const satisfies Record<string, Scope>;

/**
 * What no token may ever do, whatever its scopes: these stay with the owner
 * in the signed-in browser. Making or revoking credentials, reading what
 * tokens did, changing settings, and anything that reaches processes outside
 * Aubergine.
 */
export const NEVER_BY_TOKEN = ['tokens.manage', 'activity.read', 'settings.write', 'processes.signal', 'outside.read', 'outside.move'] as const;

export type Action = (typeof SESSION_ACTIONS)[number] | keyof typeof SCOPE_OF | (typeof NEVER_BY_TOKEN)[number];

/** Every action there is, for tests that walk the whole table. */
export const ACTIONS: readonly Action[] = [...new Set<Action>([...SESSION_ACTIONS, ...(Object.keys(SCOPE_OF) as (keyof typeof SCOPE_OF)[]), ...NEVER_BY_TOKEN])];

/** What the action is about. Either may be absent when the action is not about one. */
export interface Resource {
  sessionId?: string;
  canvasId?: string;
}

/**
 * The one place that decides what a principal may do. Every route asks here;
 * no route looks at scopes or at the kind of caller by itself.
 *
 * - The signed-in user may do anything.
 * - A session may set its own attention state, append to its own note log and
 *   say which agent conversation it is in. Nothing else, and nothing about
 *   any other session.
 * - A token may do what its scopes allow, and never anything in
 *   `NEVER_BY_TOKEN`. An action that is not listed for tokens is refused:
 *   a new action is closed to tokens until a line here opens it.
 */
export function authorize(principal: Principal, action: Action, resource: Resource): boolean {
  if (principal.kind === 'user') return true;
  if (principal.kind === 'session') {
    return (SESSION_ACTIONS as readonly string[]).includes(action) && resource.sessionId !== undefined && principal.sessionId === resource.sessionId;
  }
  if ((NEVER_BY_TOKEN as readonly string[]).includes(action)) return false;
  const scope = (SCOPE_OF as Partial<Record<Action, Scope>>)[action];
  return scope !== undefined && principal.scopes.includes(scope);
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
