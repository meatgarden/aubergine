import { z } from 'zod';
import { Id } from './ids';
import { Reach } from './terminal';

/**
 * API tokens: credentials the owner creates for programs of their own. Each
 * has a name and a list of scopes. The secret is shown once, when the token
 * is made; only a hash of it is kept.
 */

/** What a token can be allowed to do. Smallest first. */
export const GRANTABLE_SCOPES = ['read', 'canvases:write', 'sessions:write', 'notes:write', 'workflows:write', 'runs:write', 'terminal:read', 'terminal:input', 'messages:read', 'messages:write'] as const;

/** The scopes that reach into terminals. Neither is implied by any other scope; a token that asks for one must say which sessions it may reach. */
export const TERMINAL_SCOPES = ['terminal:read', 'terminal:input'] as const;

/** The scopes that apply only to the sessions a token may reach: the terminal scopes and the message scopes. A token that asks for one must say which sessions. */
export const REACH_SCOPES = [...TERMINAL_SCOPES, 'messages:read', 'messages:write'] as const;

/** Names kept for what comes later. There are none at present. */
export const RESERVED_SCOPES = [] as const;

export const Scope = z.enum(GRANTABLE_SCOPES);
export type Scope = z.infer<typeof Scope>;

export const KnownScope = z.enum([...GRANTABLE_SCOPES, ...RESERVED_SCOPES]);
export type KnownScope = z.infer<typeof KnownScope>;

export const SCOPE_MEANING: Record<KnownScope, string> = {
  read: 'See canvases, sessions, layout and notes, and follow changes. See the sources of the library, with their addresses, and what they list.',
  'canvases:write': 'Create, rename, reorder and close canvases; move and resize nodes; add and change frames; show a canvas in the browser.',
  'sessions:write': 'Start, rename, tag, move, park, restore and end sessions; show a session in the browser. By itself it starts plain shells: starting a session with a command also needs terminal:input.',
  'notes:write': 'Change the pinned note of a session and add entries to its note log.',
  'terminal:read': 'Read what the terminals it may reach show and have printed, and search that. Whatever is on those screens, secrets included, is readable to this token.',
  'terminal:input': 'Type into the terminals it may reach, press keys there and run commands. This scope can run any command on this computer as you, in any terminal it may reach.',
  'messages:read': 'Read the messages to and from the sessions it may reach, the ones you sent among them. Reading does not mark them read.',
  'messages:write': 'Send messages to the sessions it may reach, under the name of the token. A message is never typed into a terminal. By itself this scope types nothing at all; with terminal:input on that terminal, one fixed sentence saying that a message waits is typed where an agent is idle.',
  'workflows:write': 'Propose workflows and elements as drafts for you to review, and ask for an item of the library to be installed, which waits for you in the same way. With review switched off for the token: create, change, copy and remove workflows and shelf elements directly.',
  'runs:write': 'Start runs of workflows on sessions, and report on them: done, blocked, go to, pause, resume, stop. By itself it types nothing into a terminal; with terminal:input on that terminal, the one fixed kickoff sentence is typed.',
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
  /** What this token writes about workflows needs the owner's review: it may propose drafts, and may not create or change workflows or shelf elements directly. */
  reviewWorkflowChanges: z.boolean().default(false),
  /** Which sessions its terminal scopes apply to. Null for a token without those scopes: it reaches no terminal. */
  reach: Reach.nullable().default(null),
  /** For a token made for one agent's session: that session. It is revoked when the session is ended for good. */
  sessionId: Id.nullable().default(null),
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
    name: TokenName.describe('What will use it.'),
    scopes: Scopes.describe('What it may do. At least one.'),
    expiresAt: Timestamp.optional().describe('When it stops working. Never, when neither this nor `expiresInDays` is given.'),
    expiresInDays: z.number().int().min(1).max(TOKEN_MAX_DAYS).optional().describe('In how many days it stops working.'),
    reviewWorkflowChanges: z
      .boolean()
      .default(true)
      .describe('Changes to workflows need your review: with `workflows:write` the token may propose drafts, and may not create or change workflows directly. On unless you switch it off.'),
    reach: Reach.optional().describe('Which sessions the terminal scopes and the message scopes apply to: all, those on named canvases, or those with a tag. Required when `terminal:read`, `terminal:input`, `messages:read` or `messages:write` is asked for; there is no default.'),
  })
  .refine((body) => body.reach !== undefined || !body.scopes.some((scope) => (REACH_SCOPES as readonly string[]).includes(scope)), 'A token with a terminal scope or a message scope must say which sessions it may reach: give `reach`')
  .refine((body) => body.expiresAt === undefined || body.expiresInDays === undefined, 'Give expiresAt or expiresInDays, not both');
export type CreateTokenRequest = z.infer<typeof CreateTokenRequest>;

/**
 * What the owner chose to give a new agent session of the Aubergine tools.
 * `own`: the MCP server with the session's own credential, and no token.
 * `token`: an API token made for that one session, with these scopes and this reach.
 */
export const AgentToolsChoice = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('own') }),
  z
    .object({ kind: z.literal('token'), scopes: Scopes, reach: Reach.optional() })
    .refine((choice) => choice.reach !== undefined || !choice.scopes.some((scope) => (REACH_SCOPES as readonly string[]).includes(scope)), 'A token with a terminal scope or a message scope must say which sessions it may reach: give `reach`'),
]);
export type AgentToolsChoice = z.infer<typeof AgentToolsChoice>;

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
  /**
   * `token`: a call made with an API token. `owner-cli`: a call made as the owner from outside a browser page
   * (the command line, a script), recorded for the few things only the owner may do.
   */
  caller: z.enum(['token', 'owner-cli']).default('token'),
  /** The token; null for a call that was not made with one. */
  tokenId: Id.nullable(),
  tokenName: z.string(),
  /** For an owner's call from the command line that says it came from inside a session: that session. */
  fromSessionId: Id.nullable().default(null),
  /** For reading or typing in a terminal: how much text, as a number of characters. Never the text. */
  chars: z.number().int().nullable().default(null),
  /** For typing: the first characters of a hash of what was typed, so that two entries can be seen to be the same text without keeping it. */
  fingerprint: z.string().max(32).nullable().default(null),
  /** What the calling program said it was (`mcp/0.1.0`), when it said so. Its own word, not checked. */
  client: z.string().max(64).nullable().default(null),
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
    z.object({
      kind: z.literal('token'),
      id: Id,
      name: z.string(),
      scopes: z.array(Scope),
      expiresAt: Timestamp.nullable(),
      /** Which sessions its terminal scopes reach; null when it has none of those scopes. */
      reach: Reach.nullable().default(null),
      /** Whether what it writes about workflows needs the owner's review. */
      reviewWorkflowChanges: z.boolean().default(false),
    }),
    z.object({ kind: z.literal('session'), sessionId: Id }),
  ]),
});
export type Capabilities = z.infer<typeof Capabilities>;

/** The features a client may look for in `Capabilities.features`. */
export const FEATURES = ['canvases', 'sessions', 'layout', 'notes', 'tags', 'events', 'show', 'tokens', 'activity', 'openapi', 'workflows', 'runs', 'drafts', 'elements', 'outputs', 'repository-workflows', 'terminal'] as const;
