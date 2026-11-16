import { realpath, stat } from 'node:fs/promises';
import type { AgentKind, ConversationSummary, HistoryHit, HistoryList, HistoryNote, HistorySearch, OpenConversationRequest, Session, Transcript, TranscriptEntry } from '@aubergine/shared';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from '../sessions';

/**
 * Past conversations, by kind of agent.
 *
 * An `AgentHistory` reads what one kind of agent keeps of its conversations
 * in a folder. There is one implementation, for Claude Code; another agent
 * is another class beside it.
 *
 * `Histories` is what the routes use. It decides which folder may be looked
 * at, says which conversation a canvas terminal is on, and opens one on the
 * canvas through the launch line every agent session is started with.
 * Nothing it is given or reads is stored, logged or cached.
 */

export type ConversationFound = Omit<ConversationSummary, 'onCanvas'>;
export interface HistoryFound {
  conversations: ConversationFound[];
  notes: HistoryNote[];
}
export interface TranscriptFound {
  name: string | null;
  entries: TranscriptEntry[];
  notes: HistoryNote[];
}
export interface SearchLimits {
  /** The most conversations looked at. */
  files: number;
  /** The most text read, in bytes. */
  bytes: number;
  /** The longest it may take. */
  milliseconds: number;
  /** The most matches given. */
  hits: number;
}
export interface SearchFound {
  hits: HistoryHit[];
  cutShort: boolean;
  why: string;
  searched: number;
  notes: HistoryNote[];
}

export interface AgentHistory {
  kind: AgentKind;
  list(folder: string): Promise<HistoryFound>;
  has(folder: string, id: string): Promise<boolean>;
  /** One conversation in a few words; null when it is not there or cannot be read. */
  summary(folder: string, id: string): Promise<ConversationFound | null>;
  /** Null when the folder has no conversation by that ID. */
  read(folder: string, id: string): Promise<TranscriptFound | null>;
  search(folders: readonly string[], query: string, limits?: SearchLimits): Promise<SearchFound>;
}

const AGENT_NAME: Record<string, string> = { 'claude-code': 'Claude Code' };

export class Histories {
  constructor(
    private readonly history: AgentHistory,
    private readonly sessions: Sessions,
  ) {}

  /**
   * The folder as the file system knows it, when it is a folder. The owner
   * names it; it is only ever used to work out where the agent keeps that
   * folder's conversations, never read itself.
   */
  private async folder(given: string): Promise<string> {
    let resolved: string;
    try {
      resolved = await realpath(given);
      if (!(await stat(resolved)).isDirectory()) throw new Error('not a folder');
    } catch {
      throw new BadInputError('That is not a folder on this computer.');
    }
    return resolved;
  }

  /** The canvas terminal that is on a conversation right now, if one is. */
  private onCanvas(id: string): Session | null {
    return this.sessions.all().find((session) => session.state !== 'exited' && session.agent?.conversationId === id) ?? null;
  }

  async list(folder: string): Promise<HistoryList> {
    const resolved = await this.folder(folder);
    const found = await this.history.list(resolved);
    return {
      folder: resolved,
      agent: AGENT_NAME[this.history.kind] ?? this.history.kind,
      conversations: found.conversations.map((conversation) => {
        const session = this.onCanvas(conversation.id);
        return { ...conversation, onCanvas: session ? { sessionId: session.id, name: session.name } : null };
      }),
      notes: [...found.notes, { level: 'gap', text: 'A conversation open in a terminal that is not on the canvas is not marked: only canvas terminals are known here.' }],
    };
  }

  /** One conversation to read. Fetched now; nothing of it is kept. */
  async transcript(folder: string, id: string): Promise<Transcript> {
    const resolved = await this.folder(folder);
    const found = await this.history.read(resolved, id);
    if (!found) throw new NotFoundError('No conversation by that ID is kept for this folder.');
    return { folder: resolved, id, name: found.name, entries: found.entries, notes: found.notes };
  }

  /** The folders of the terminals on the canvases, each once: what a search looks through when no folder is named. */
  folders(): string[] {
    return [...new Set(this.sessions.all().flatMap((session) => (session.cwd ? [session.cwd] : [])))].sort();
  }

  async search(query: string, folder: string | undefined, limits?: SearchLimits): Promise<HistorySearch> {
    const folders = folder === undefined ? this.folders() : [await this.folder(folder)];
    if (folders.length === 0) return { hits: [], cutShort: false, why: '', searched: 0, notes: [{ level: 'gap', text: 'No terminal on the canvas has a folder to look in.' }] };
    return this.history.search(folders, query, limits);
  }

  /**
   * Opens a conversation on the canvas: a new terminal in its folder, with
   * the agent started in that conversation, or in a copy of it. Refused when
   * a canvas terminal is on it already, unless the owner said to all the
   * same: two agents in one conversation lose each other's messages.
   */
  async open(request: OpenConversationRequest): Promise<{ session: Session }> {
    const resolved = await this.folder(request.folder);
    if (!(await this.history.has(resolved, request.id))) throw new NotFoundError('No conversation by that ID is kept for this folder.');
    const already = this.onCanvas(request.id);
    if (already && !request.copy && !request.evenIfOpen) {
      throw new ConflictError(`The terminal "${already.name}" is on this conversation already. Two agents in one conversation lose each other's messages: go to that terminal, or open a copy.`);
    }
    // The ID was checked as a plain ID by the request's schema and is quoted again when the launch line is built.
    const made = await this.sessions.create({
      agent: this.history.kind,
      cwd: resolved,
      agentArgs: ['--resume', request.id, ...(request.copy ? ['--fork-session'] : [])],
      ...(request.canvasId ? { canvasId: request.canvasId } : {}),
    });
    return { session: made.session };
  }
}
