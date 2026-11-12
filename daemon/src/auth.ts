import { createHmac, timingSafeEqual } from 'node:crypto';
import { Id } from '@aubergine/shared';

/** Who is making a request. */
export type Principal =
  /** The owner of this machine: the browser with its cookie, or the access token itself. */
  | { kind: 'user' }
  /** A program running inside one session, holding that session's token. */
  | { kind: 'session'; sessionId: string };

export type Action = 'attention.set' | 'note.append';

export interface Resource {
  sessionId: string;
}

/**
 * The one place that decides what a principal may do. Every route that acts
 * for a principal asks here, so when scopes grow, this function changes and
 * its callers do not.
 *
 * Today: the user may do anything; a session may set its own attention state
 * and append to its own note log, and nothing else.
 */
export function authorize(principal: Principal, action: Action, resource: Resource): boolean {
  if (principal.kind === 'user') return true;
  switch (action) {
    case 'attention.set':
    case 'note.append':
      return principal.sessionId === resource.sessionId;
    default:
      return false;
  }
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

/** Works out who a bearer token belongs to, or null when it is not valid. */
export function principalFromBearer(secret: string, header: string | undefined): Principal | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  const token = match?.[1];
  if (!token) return null;
  if (equal(token, secret)) return { kind: 'user' };

  const [prefix, sessionId, given, ...extra] = token.split('.');
  if (prefix !== PREFIX || !sessionId || !given || extra.length > 0) return null;
  if (!Id.safeParse(sessionId).success) return null;
  return equal(given, mac(secret, sessionId)) ? { kind: 'session', sessionId } : null;
}
