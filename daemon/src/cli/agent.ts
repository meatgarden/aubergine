import { AppendNoteResponse, SESSION_ENV, paths, type AgentKind, type AttentionState, type NoteEntry } from '@aubergine/shared';
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
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error(`The Aubergine server is not answering on ${url}.`);
    }
    if (!response.ok) throw new Error(`The server answered HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  };

  return {
    sessionId,
    appendNote: async (text, kind) =>
      AppendNoteResponse.parse(await send('POST', paths.agent.notes(sessionId), { text, ...(kind ? { kind } : {}) })).entry,
    reportAgent: async (kind, conversationId) => {
      await send('PUT', paths.agent.report(sessionId), { kind, conversationId });
    },
    setAttention: async (state, message) => {
      await send('PUT', paths.agent.attention(sessionId), { state, ...(message ? { message } : {}) });
    },
  };
}
