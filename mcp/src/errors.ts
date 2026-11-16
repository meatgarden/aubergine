import { AubergineError } from '@aubergine/client';
import { showControl } from '@aubergine/shared';

/** A refusal this program makes itself, about how a tool was called. Never about who may do what: that is the server's to say. */
export class ToolProblem extends Error {
  override readonly name = 'ToolProblem';
}

export interface Who {
  /** `a session's own token` or `the API token "name"`. */
  credential: string;
  scopes: readonly string[];
  /** The reach of its terminal scopes, in words; empty when it has none. */
  reach: string;
  url: string;
}

/**
 * A failed call as a sentence a model can act on. It is made from the
 * server's error code and the server's own message; nothing here works out
 * whether the call should have been allowed.
 */
export function sentenceFor(error: unknown, who: Who): string {
  if (error instanceof ToolProblem) return error.message;
  if (!(error instanceof AubergineError)) return `This tool failed before it could ask the server: ${showControl(error instanceof Error ? error.message : String(error)).slice(0, 300)}`;
  const said = showControl(error.message).slice(0, 600);
  switch (error.code as string) {
    case 'people_only':
      return 'The owner has marked that terminal "people only": no program may read it or type into it, whatever its scopes. Only the owner can open it to programs, in the browser or with `aubergine unprotect`. Do not look for another way in: use a different terminal, or ask the owner.';
    case 'out_of_reach':
      return `This credential does not cover that terminal. ${who.reach ? `Its terminal scopes reach ${who.reach}.` : ''} Use a terminal within its reach, or ask the owner for a token that covers this one.`.replace('  ', ' ');
    case 'forbidden':
      return `The server refused: ${said}${/[.!?]$/.test(said) ? '' : '.'} This credential is ${who.credential}${who.scopes.length > 0 ? ` with the scopes ${who.scopes.join(', ')}` : ''}. Calling again will not help; the owner decides what a credential may do.`;
    case 'unauthorized':
      return 'The server does not accept this credential: it is wrong, expired or revoked. Nothing can be done from here; tell the owner.';
    case 'rate_limited':
      return `Too many calls in a short time. ${error.retryAfterSeconds ? `Try again in ${error.retryAfterSeconds} second${error.retryAfterSeconds === 1 ? '' : 's'}` : 'Wait a little and try again'}, and call less often.`;
    case 'too_large':
      return `What was sent is larger than the server accepts. Send less at a time. (${said})`;
    case 'not_at_prompt':
      return `${said} A command can only be run while the shell is waiting at its prompt. Read the screen to see what is running, and wait or choose another terminal; this tool never interrupts a program.`;
    case 'no_shell_integration':
      return `${said} Without the shell's report a command cannot be waited for in that terminal.`;
    case 'run_in_progress':
      return `${said} Wait for the earlier command to finish, then try again.`;
    case 'not_found':
      return `The server knows nothing by that ID: ${said}`;
    case 'bad_request':
    case 'conflict':
      return `The server did not accept that: ${said}`;
    case 'runtime_unavailable':
      return `The server cannot reach its terminals just now: ${said}`;
    case 'network':
      return `The Aubergine server at ${who.url} cannot be reached. It may not be running. Nothing was done; the owner can start it with \`aubergine start\`.`;
    default:
      return `The server failed${error.status ? ` (HTTP ${error.status})` : ''}. This is not something a different call will fix; try again later, and tell the owner if it keeps happening.`;
  }
}
