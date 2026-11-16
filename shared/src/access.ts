import type { Scope } from './tokens';

/**
 * What can be asked of the server, and what a caller needs to be allowed it.
 * This is the table `authorize` in the daemon decides by, and the one the
 * description of the API reads, so that the two say the same thing.
 */

/** What a session may do, to itself only. */
export const SESSION_ACTIONS = ['attention.set', 'note.append', 'agent.report', 'run.own.read', 'run.own.report', 'draft.own.read', 'draft.own.propose', 'repository.own.read', 'recap.own.write', 'message.own.read', 'message.own.send'] as const;

/** For a token, each of these needs the scope beside it. */
export const SCOPE_OF = {
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
  'workflows.read': 'read',
  'runs.read': 'read',
  'workflows.write': 'workflows:write',
  'runs.write': 'runs:write',
  // The run a session is on: the session may read it and report on it, for itself only. A token needs the scope, and may for any session.
  'run.own.read': 'read',
  'run.own.report': 'runs:write',
  // Drafts: reading them is reading; proposing one needs the scope to write workflows, and makes nothing that can be run.
  'drafts.read': 'read',
  'drafts.propose': 'workflows:write',
  // What a repository offers: a session may list what is offered to itself; a token with `read`, to any session.
  'repository.own.read': 'read',
  'repository.read': 'read',
  // Terminals. Neither is implied by anything else, `read` included, and no session's own token has them.
  'terminal.read': 'terminal:read',
  'terminal.input': 'terminal:input',
  // Messages. Neither is implied by anything else, and both apply only within the token's reach. A session's own inbox is not open to tokens.
  // The library: seeing sources and items is reading. Asking for an install needs the scope to write workflows, and installs nothing: it waits for the owner.
  'library.read': 'read',
  'library.request': 'workflows:write',
  'messages.read': 'messages:read',
  'messages.write': 'messages:write',
} as const satisfies Record<string, Scope>;

/**
 * What no token may ever do, whatever its scopes: these stay with the owner
 * in the signed-in browser. Making or revoking credentials, reading what
 * tokens did, changing settings, and anything that reaches processes outside
 * Aubergine.
 */
export const NEVER_BY_TOKEN = ['tokens.manage', 'activity.read', 'settings.write', 'processes.signal', 'outside.read', 'outside.move', 'drafts.review', 'repository.review', 'repository.write', 'sessions.protect', 'demo.manage', 'inventory.read', 'recap.ask', 'away.read', 'history.read', 'history.open', 'messages.manage', 'shelf.manage', 'library.manage', 'runs.approve'] as const;

export type Action = (typeof SESSION_ACTIONS)[number] | keyof typeof SCOPE_OF | (typeof NEVER_BY_TOKEN)[number];

/** Every action there is. */
export const ACTIONS: readonly Action[] = [...new Set<Action>([...SESSION_ACTIONS, ...(Object.keys(SCOPE_OF) as (keyof typeof SCOPE_OF)[]), ...NEVER_BY_TOKEN])];

/** The scope a token needs for an action, or null when no token may do it. */
export function scopeFor(action: Action): Scope | null {
  return (SCOPE_OF as Partial<Record<Action, Scope>>)[action] ?? null;
}

/** Who may do an action, for the description of a route. */
export interface Access {
  /** The scope an API token needs; null when no token may. */
  scope: Scope | null;
  /** Whether a session's own token may, for its own session. */
  session: boolean;
}

export function accessOf(action: Action): Access {
  return { scope: scopeFor(action), session: (SESSION_ACTIONS as readonly string[]).includes(action) };
}

/**
 * The actions that are about one session's terminal or its messages: for a
 * token the scope is not enough. The session must be within the token's
 * reach and not "people only".
 */
export const REACH_ACTIONS: readonly Action[] = ['terminal.read', 'terminal.input', 'messages.read', 'messages.write'];
