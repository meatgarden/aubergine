/**
 * What a session or an event carries that is terminal content, taken out for
 * a caller that may not read that terminal:
 *
 * - `status.commandLine`: the command line being run;
 * - note-log entries of kind `prompt`: what was typed to an agent;
 * - links marked `fromTerminal`: addresses the server saw on the terminal's screen.
 *
 * Everything else about a session (its name, folder, the name of the program
 * in front, whether it is busy, its notes) is not what the terminal shows.
 * Pure, and it works on whatever shape an answer has: a session, a list, an
 * answer with a session inside, an event.
 */
export function withoutTerminalContent<T>(value: T, mayRead: (sessionId: string) => boolean): T {
  const walk = (node: unknown, sessionId: string | null): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, sessionId));
    if (node === null || typeof node !== 'object') return node;
    const record = node as Record<string, unknown>;
    // A session carries its own ID; an event names the session it is about.
    const own = typeof record.sessionId === 'string' ? record.sessionId : isSession(record) ? (record.id as string) : sessionId;
    const closed = own !== null && !mayRead(own);
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      if (closed && key === 'commandLine' && isStatus(record)) out[key] = null;
      else if (closed && key === 'noteLog' && Array.isArray(child)) out[key] = child.filter((entry) => !isPrompt(entry));
      // A link that was seen in what the terminal showed is terminal content too.
      else if (closed && key === 'links' && Array.isArray(child)) out[key] = child.filter((link) => !isSeenLink(link));
      else out[key] = walk(child, own);
    }
    return out;
  };
  return walk(value, null) as T;
}

/** An event that is itself terminal content for a caller that may not read the session: a prompt added to the note log. */
export function isTerminalContentEvent(event: { type: string; entry?: unknown }): boolean {
  return event.type === 'session.note.appended' && isPrompt(event.entry);
}

const isStatus = (record: Record<string, unknown>): boolean => 'commandLine' in record && 'lastExit' in record;
const isSession = (record: Record<string, unknown>): boolean => typeof record.id === 'string' && typeof record.status === 'object' && record.status !== null && 'noteLog' in record;
const isSeenLink = (link: unknown): boolean => typeof link === 'object' && link !== null && (link as { fromTerminal?: unknown }).fromTerminal === true;
const isPrompt = (entry: unknown): boolean => typeof entry === 'object' && entry !== null && (entry as { kind?: unknown }).kind === 'prompt';
