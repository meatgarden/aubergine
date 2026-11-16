import { z } from 'zod';
import { Id } from './ids';

/**
 * API tokens: credentials the owner creates for programs of their own. Each
 * has a name and a list of scopes. The secret is shown once, when the token
 * is made; only a hash of it is kept.
 */

/** What a token can be allowed to do. Smallest first. */
export const GRANTABLE_SCOPES = ['read', 'canvases:write', 'sessions:write', 'notes:write'] as const;

/**
 * Names kept for what comes later, so that there is one list of scopes from
 * the start. A token cannot be given these yet.
 */
export const RESERVED_SCOPES = ['terminal:read', 'terminal:input', 'workflows:write', 'runs:write'] as const;

export const Scope = z.enum(GRANTABLE_SCOPES);
export type Scope = z.infer<typeof Scope>;

export const KnownScope = z.enum([...GRANTABLE_SCOPES, ...RESERVED_SCOPES]);
export type KnownScope = z.infer<typeof KnownScope>;

export const SCOPE_MEANING: Record<KnownScope, string> = {
  read: 'See canvases, sessions, layout and notes, and follow changes.',
  'canvases:write': 'Create, rename, reorder and close canvases; move and resize nodes; add and change frames; show a canvas in the browser.',
  'sessions:write': 'Start, rename, tag, move, park, restore and end sessions; show a session in the browser. A session can be started with a command, so this scope can run any command on this computer as you.',
  'notes:write': 'Change the pinned note of a session and add entries to its note log.',
  'terminal:read': 'Read what a terminal shows. Not available yet.',
  'terminal:input': 'Type into a terminal. Not available yet.',
  'workflows:write': 'Create and change workflows. Not available yet.',
  'runs:write': 'Start and steer runs of workflows. Not available yet.',
};

/** Every secret starts with this, so that one found in a file or a log can be recognised for what it is. */
export const TOKEN_PREFIX = 'aubt_';

const Timestamp = z.iso.datetime();
export const TokenName = z.string().trim().min(1).max(80);
const Scopes = z
  .array(Scope)
  .min(1)
  .max(GRANTABLE_SCOPES.length)
  // Always in the same order, smallest first. `overwrite` keeps the kind of value, so it can still be described.
  .overwrite((scopes) => GRANTABLE_SCOPES.filter((scope) => scopes.includes(scope)));

/** A token as it is stored. `hash` is the SHA-256 of the secret; the secret itself is never stored. */
export const ApiToken = z.object({
  id: Id,
  name: TokenName,
  scopes: Scopes,
  hash: z.string(),
  createdAt: Timestamp,
  /** Recorded at most about once a minute, not on every call. */
  lastUsedAt: Timestamp.nullable().default(null),
  expiresAt: Timestamp.nullable().default(null),
  revokedAt: Timestamp.nullable().default(null),
});
export type ApiToken = z.infer<typeof ApiToken>;

export type TokenStatus = 'active' | 'revoked' | 'expired';

export function tokenStatus(token: Pick<ApiToken, 'revokedAt' | 'expiresAt'>, now: number = Date.now()): TokenStatus {
  if (token.revokedAt !== null) return 'revoked';
  if (token.expiresAt !== null && Date.parse(token.expiresAt) <= now) return 'expired';
  return 'active';
}

/** A token as the owner sees it: everything but the hash. */
export const TokenView = ApiToken.omit({ hash: true });
export type TokenView = z.infer<typeof TokenView>;

export const viewOfToken = (token: ApiToken): TokenView => {
  const { hash: _hash, ...view } = token;
  return view;
};

export const TOKEN_MAX_DAYS = 3650;

/** Body of creating a token. It may expire on a date, or after a number of days, or never. */
export const CreateTokenRequest = z
  .object({
    name: TokenName,
    scopes: Scopes,
    expiresAt: Timestamp.optional(),
    expiresInDays: z.number().int().min(1).max(TOKEN_MAX_DAYS).optional(),
  })
  .refine((body) => body.expiresAt === undefined || body.expiresInDays === undefined, 'Give expiresAt or expiresInDays, not both');
export type CreateTokenRequest = z.infer<typeof CreateTokenRequest>;

/** The answer to creating a token: the only time its secret is ever sent. */
export const CreatedToken = z.object({ token: TokenView, secret: z.string() });
export type CreatedToken = z.infer<typeof CreatedToken>;

/** How a call by a token ended. */
export const ActivityOutcome = z.enum([
  /** It did what was asked. */
  'ok',
  /** The token's scopes do not allow it. */
  'denied',
  /** The token was revoked or has expired. */
  'refused',
  /** Too many calls in a short time. */
  'limited',
  /** The request itself was wrong, or something failed. */
  'error',
]);
export type ActivityOutcome = z.infer<typeof ActivityOutcome>;

/**
 * One call made with a token. It records who, what and how it ended, never
 * the secret and never what was sent.
 */
export const ActivityEntry = z.object({
  at: Timestamp,
  tokenId: Id,
  tokenName: z.string(),
  /** What was asked for, as `authorize` names it; empty when the call never got that far. */
  action: z.string(),
  resource: z.object({ sessionId: z.string().optional(), canvasId: z.string().optional() }),
  method: z.string(),
  /** The route, with placeholders for IDs: `/v1/canvases/:canvasId`. */
  route: z.string(),
  status: z.number().int(),
  outcome: ActivityOutcome,
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;

/** What this server can do, for clients that want to work with more than one version of it. */
export const Capabilities = z.object({
  name: z.literal('aubergine'),
  version: z.string(),
  api: z.literal('v1'),
  /** Where the description of the API is served, as an OpenAPI document. */
  description: z.string(),
  features: z.array(z.string()),
  scopes: z.array(z.object({ name: KnownScope, grantable: z.boolean(), meaning: z.string() })),
  /** Who is asking. A token learns its own name and scopes here and nowhere else. */
  caller: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('user') }),
    z.object({ kind: z.literal('token'), id: Id, name: z.string(), scopes: z.array(Scope), expiresAt: Timestamp.nullable() }),
    z.object({ kind: z.literal('session'), sessionId: Id }),
  ]),
});
export type Capabilities = z.infer<typeof Capabilities>;

/** The features a client may look for in `Capabilities.features`. */
export const FEATURES = ['canvases', 'sessions', 'layout', 'notes', 'tags', 'events', 'show', 'tokens', 'activity', 'openapi'] as const;
