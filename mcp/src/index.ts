import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { findServer, type Env } from './config';
import { askWho, buildServer, clientFor, toolsFor, type ServerParts } from './server';

export { findServer } from './config';
export { quoted, shownDeep } from './quote';
export { sentenceFor, ToolProblem } from './errors';
export { TOOLS, mayUse, offered } from './tools';
export { CLIENT_NAME, askWho, buildServer, clientFor, toolsFor, whoOf } from './server';
export { MCP_VERSION } from './version';

/**
 * Runs the MCP server on standard input and output until the client closes
 * standard input.
 *
 * Standard output carries protocol messages and nothing else, whatever goes
 * wrong: a missing address, a refused credential and a server that is down
 * all leave a working MCP server with one tool that says what is wrong.
 * Diagnostics go to standard error, and never include the credential.
 */
export async function runMcp(args: readonly string[], env: Env): Promise<number> {
  // Nothing this process loads may write to standard output by accident.
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  const say = (text: string): void => void process.stderr.write(`aubergine mcp: ${text}\n`);

  const found = findServer(args, env);
  const parts: ServerParts = { found: null, client: null, caller: null, problem: null };
  if ('problem' in found) {
    parts.problem = found.problem;
    say(found.problem);
  } else {
    parts.found = found;
    parts.client = clientFor(found);
    const who = await askWho(parts.client, found.url);
    if ('problem' in who) {
      parts.problem = who.problem;
      say(who.problem);
    } else {
      parts.caller = who.caller;
      say(`serving ${toolsFor(parts).length + 1} tools for ${who.caller.kind === 'token' ? `the API token "${who.caller.name}"` : who.caller.kind === 'session' ? "a session's own token" : 'the owner'} (credential from ${found.tokenFrom}) at ${found.url}`);
    }
  }

  const ended = new Promise<void>((resolve) => {
    process.stdin.once('end', resolve);
    process.stdin.once('close', resolve);
  });
  const handle = serveStdio(() => buildServer(parts), { onerror: (error) => say(`protocol error: ${error.message.slice(0, 300)}`) });
  await ended;
  await handle.close().catch(() => undefined);
  return 0;
}
