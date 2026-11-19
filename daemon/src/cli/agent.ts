import { AppendNoteResponse, DescribeCheckAnswer, DescribedAnswer, LinkAnswer, LinksAnswer, SESSION_ENV, paths, type AgentKind, type AttentionState, type LinkKind, type NoteEntry, type SessionLink } from '@aubergine/shared';
import { UsageError } from './commands';

/**
 * The agent API as seen from inside a session: the address, session ID and
 * token come from the environment the daemon gave the session's shell.
 */
export interface AgentClient {
  sessionId: string;
  appendNote(text: string, kind?: NoteEntry['kind']): Promise<NoteEntry | null>;
  setAttention(state: AttentionState, message?: string): Promise<void>;
  reportAgent(kind: AgentKind, conversationId: string): Promise<void>;
  /** Reports a moment of the agent's work; the answer is what it is to be told. */
  check(event: 'start' | 'stop' | 'tool', again?: boolean): Promise<DescribeCheckAnswer>;
  describe(input: { name?: string; summary?: string }): Promise<DescribedAnswer>;
  links(): Promise<SessionLink[]>;
  addLink(input: { url: string; label?: string; kind?: LinkKind }): Promise<LinkAnswer>;
  removeLink(linkId: string): Promise<SessionLink[]>;
}

export function agentClient(env: NodeJS.ProcessEnv = process.env, timeoutMs = 5000): AgentClient {
  const url = env[SESSION_ENV.url];
  const sessionId = env[SESSION_ENV.sessionId];
  const token = env[SESSION_ENV.token];
  if (!url || !sessionId || !token) {
    throw new UsageError('This command only works inside an Aubergine session (its environment is not set here).');
  }

  const send = async (method: string, path: string, body: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetch(url + path, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error(`The Aubergine server is not answering on ${url}.`);
    }
    if (!response.ok) {
      // The server's own sentence, where it gave one.
      const text = await response.text();
      let said = '';
      try {
        said = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? '';
      } catch {
        // Not the usual shape.
      }
      throw new Error(said || `The server answered HTTP ${response.status}: ${text}`);
    }
    return response.json();
  };

  return {
    sessionId,
    appendNote: async (text, kind) =>
      AppendNoteResponse.parse(await send('POST', paths.agent.notes(sessionId), { text, ...(kind ? { kind } : {}) })).entry,
    reportAgent: async (kind, conversationId) => {
      await send('PUT', paths.agent.report(sessionId), { kind, conversationId });
    },
    check: async (event, again) => DescribeCheckAnswer.parse(await send('POST', `/v1/sessions/${sessionId}/described/check`, { event, ...(again ? { again } : {}) })),
    describe: async (input) => DescribedAnswer.parse(await send('PUT', `/v1/sessions/${sessionId}/described`, input)),
    links: async () => LinksAnswer.parse(await send('GET', `/v1/sessions/${sessionId}/links`, undefined)).links,
    addLink: async (input) => LinkAnswer.parse(await send('POST', `/v1/sessions/${sessionId}/links`, input)),
    removeLink: async (linkId) => LinksAnswer.parse(await send('DELETE', `/v1/sessions/${sessionId}/links/${encodeURIComponent(linkId)}`, undefined)).links,
    setAttention: async (state, message) => {
      await send('PUT', paths.agent.attention(sessionId), { state, ...(message ? { message } : {}) });
    },
  };
}
