/**
 * Where the server is and which credential to use. Both come from the
 * environment the process was started in (or `--url`): this program never
 * reads the owner's access file, and never looks for a credential anywhere
 * else.
 */

export interface Found {
  url: string;
  token: string;
  /** Which variable the credential came from, for the diagnostics. Never the credential. */
  tokenFrom: 'AUBERGINE_API_TOKEN' | 'AUBERGINE_TOKEN';
  /** The session this process runs in, when it runs in one. */
  ownSessionId: string | null;
}

export type Env = Record<string, string | undefined>;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function findServer(args: readonly string[], env: Env): Found | { problem: string } {
  let url = env.AUBERGINE_URL?.trim() ?? '';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--url') {
      url = args[i + 1]?.trim() ?? '';
      i += 1;
    } else if (arg.startsWith('--url=')) url = arg.slice(6).trim();
    else return { problem: `"${arg.slice(0, 40)}" is not an option of aubergine mcp. The only one is --url <address of the server>.` };
  }
  if (url === '') return { problem: 'No server address. Set AUBERGINE_URL (it is set in every Aubergine session) or pass --url, for example --url http://127.0.0.1:4600.' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { problem: 'The server address is not a URL. It looks like http://127.0.0.1:4600.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { problem: 'The server address must start with http:// or https://.' };
  const api = env.AUBERGINE_API_TOKEN?.trim() ?? '';
  const own = env.AUBERGINE_TOKEN?.trim() ?? '';
  if (api === '' && own === '') return { problem: "No credential. Set AUBERGINE_API_TOKEN to an API token's secret; inside an Aubergine session the session's own AUBERGINE_TOKEN is used when that is not set." };
  const session = env.AUBERGINE_SESSION_ID?.trim() ?? '';
  return {
    url: parsed.origin,
    token: api !== '' ? api : own,
    tokenFrom: api !== '' ? 'AUBERGINE_API_TOKEN' : 'AUBERGINE_TOKEN',
    ownSessionId: ID.test(session) ? session : null,
  };
}
