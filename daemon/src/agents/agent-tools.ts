import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Id, type AgentToolsChoice, type ApiToken } from '@aubergine/shared';
import { stableNodePath } from '../node-path';
import type { StateHub } from '../state-hub';
import type { Tokens } from '../tokens';

/**
 * Giving an agent the Aubergine tools: the file that tells it about the MCP
 * server, and, when the owner chose more than the session's own work, the
 * API token made for that one session.
 *
 * The file is ours, in the data folder, readable by the owner only, and is
 * passed to the agent on its launch line. The agent's own configuration is
 * never written. A token's secret is in that one file and nowhere else: it
 * is not in the state (only its hash is), not on the launch line, and not in
 * any log.
 *
 * What removes it: ending the session for good removes the file and revokes
 * the token; revoking the token removes the file; and at start, whatever was
 * left behind by a session that is gone is cleared.
 */

/** The name the MCP server goes by in the agent: its tools are `mcp__aubergine__<tool>`. */
export const MCP_SERVER_NAME = 'aubergine';

const FOLDER = path.join('agents', 'mcp');

/** The command that starts `aubergine mcp` from this checkout, with a Node that survives an upgrade. */
function mcpCommand(): { command: string; args: string[] } {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  return { command: stableNodePath(), args: [path.join(root, 'bin', 'aubergine.mjs'), 'mcp'] };
}

/** What the file says. Without a secret, the MCP server uses the session's own token from its environment. */
export function mcpConfig(secret: string | null, command: { command: string; args: string[] } = mcpCommand()): { mcpServers: Record<string, unknown> } {
  return { mcpServers: { [MCP_SERVER_NAME]: { type: 'stdio', command: command.command, args: command.args, ...(secret === null ? {} : { env: { AUBERGINE_API_TOKEN: secret } }) } } };
}

export class AgentTools {
  private readonly dir: string;

  constructor(
    private readonly hub: StateHub,
    private readonly tokens: Tokens,
    dataDir: string,
    private readonly warn: (message: string) => void = () => undefined,
  ) {
    this.dir = path.join(dataDir, FOLDER);
    // The session ended for good: its token stops working and its file goes. A token revoked by hand takes its file with it.
    hub.subscribe((event) => {
      if (event.type === 'session.closed') void this.forget(event.sessionId);
      if (event.type === 'token.revoked') {
        const token = this.hub.state.tokens.find((t) => t.id === event.tokenId);
        if (token?.sessionId) void this.removeFile(token.sessionId);
      }
    });
  }

  private fileOf(sessionId: string): string {
    return path.join(this.dir, `${Id.parse(sessionId)}.json`);
  }

  private tokensOf(sessionId: string): ApiToken[] {
    return this.hub.state.tokens.filter((token) => token.sessionId === sessionId && token.revokedAt === null);
  }

  /**
   * Makes what the owner chose for a new agent session. Called only on the
   * owner's own request to start that session; nothing here is reachable by
   * a token or a session.
   */
  async prepare(session: { id: string; name: string }, choice: AgentToolsChoice): Promise<void> {
    let secret: string | null = null;
    if (choice.kind === 'token') {
      const made = this.tokens.create({
        name: `Agent in "${session.name}"`.slice(0, 80),
        scopes: choice.scopes,
        ...(choice.reach ? { reach: choice.reach } : {}),
        // What an agent writes about workflows is read by the owner first. There is no choice about this here.
        reviewWorkflowChanges: true,
        sessionId: session.id,
      });
      secret = made.secret;
    }
    try {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      const file = this.fileOf(session.id);
      await writeFile(file, `${JSON.stringify(mcpConfig(secret), null, 2)}\n`, { mode: 0o600, flag: 'w' });
      // The mode given to writeFile is only used when the file is made: say it again for one that was there.
      await chmod(file, 0o600);
    } catch (error) {
      // Without the file the token is of no use to anyone: do not leave it behind.
      for (const token of this.tokensOf(session.id)) this.tokens.revoke(token.id);
      throw error;
    }
  }

  /** The file to pass to the agent in this session, when it was given tools. Also on resuming, so that it keeps them. */
  async fileFor(sessionId: string): Promise<string | null> {
    const file = this.fileOf(sessionId);
    try {
      return (await stat(file)).isFile() ? file : null;
    } catch {
      return null;
    }
  }

  /** Which choice the owner made for this session: its own credential, a token of its own, or nothing. Says only which; never the token. */
  async choiceFor(sessionId: string): Promise<'own' | 'token' | null> {
    if ((await this.fileFor(sessionId)) === null) return null;
    return this.hub.state.tokens.some((token) => token.sessionId === sessionId) ? 'token' : 'own';
  }

  private async removeFile(sessionId: string): Promise<void> {
    await rm(this.fileOf(sessionId), { force: true }).catch((error) => this.warn(`Could not remove an agent's MCP configuration: ${String(error)}`));
  }

  /** Revokes the session's token and removes its file. */
  async forget(sessionId: string): Promise<void> {
    for (const token of this.tokensOf(sessionId)) this.tokens.revoke(token.id);
    await this.removeFile(sessionId);
  }

  /** At start: clears what belongs to sessions that are no longer there, and files whose token was revoked meanwhile. */
  async sweep(): Promise<void> {
    const live = new Set(this.hub.state.sessions.map((session) => session.id));
    for (const token of this.hub.state.tokens) {
      if (token.sessionId && token.revokedAt === null && !live.has(token.sessionId)) this.tokens.revoke(token.id);
    }
    const names = await readdir(this.dir).catch(() => [] as string[]);
    for (const name of names) {
      const sessionId = name.replace(/\.json$/, '');
      if (!Id.safeParse(sessionId).success) continue;
      const hadToken = this.hub.state.tokens.some((token) => token.sessionId === sessionId);
      const hasToken = this.tokensOf(sessionId).length > 0;
      if (!live.has(sessionId) || (hadToken && !hasToken)) await this.removeFile(sessionId);
    }
  }
}
