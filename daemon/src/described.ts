import {
  DESCRIBE_LINES,
  SEEN_MAX,
  addLink,
  addressesIn,
  changeLink,
  describeReminder,
  keptBySeeing,
  newId,
  rememberSeen,
  removeLink,
  removeOwnField,
  setOwnField,
  sortedLinks,
  useSuggestedField,
  tellLink,
  undescribed,
  useSuggestedLink,
  type ChangeEvent,
  type DescribeCheckAnswer,
  type DescribeCheckRequest,
  type DescribeRequest,
  type DescribedAnswer,
  type DescribedBy,
  type Found,
  type LinkInput,
  type SeenLink,
  type Session,
  type SessionLink,
  type Settings,
  type TerminalField,
  type UseSuggestionRequest,
} from '@aubergine/shared';
import { folderFacts, type FolderFacts } from './found/folder';
import type { PullRequestFinder } from './found/pull-request';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { SessionRuntime } from './runtime/runtime';

/** The folder is looked at no more often than this, and the pull request is asked for no more often than once a minute. */
export const LOOK_EVERY_MS = 10_000;
export const PULL_REQUEST_EVERY_MS = 60_000;
/** How many lines of a terminal's screen and history are read for addresses. */
const LINES_READ = 300;

export interface DescribedOptions {
  /** Reads a terminal without attaching to it. Left out: nothing is seen in terminals. */
  runtime?: Pick<SessionRuntime, 'lines'> | null;
  /** Asks for a branch's pull request. Left out: none is ever asked for. */
  finder?: PullRequestFinder | null;
  /** The facts of a folder. Left out: Git is asked. */
  facts?: (folder: string) => Promise<FolderFacts>;
  settings: () => Promise<Settings>;
  now?: () => number;
  onError?: (error: unknown) => void;
}

/**
 * What a terminal says about itself: its links, who wrote its name and summary, and what the server finds by
 * looking. Three sources, one record: the owner's own words always win, and what anyone else says about the same
 * thing is kept beside them as a suggestion.
 *
 * Addresses that were only seen in a terminal are held in memory here, never in the state: they are what the
 * terminal showed, and may hold anything.
 */
export class Described {
  private readonly seenBy = new Map<string, string[]>();
  private readonly lookedAt = new Map<string, number>();
  private readonly askedAt = new Map<string, number>();
  /** Sessions whose agent was told once in the turn it is in. */
  private readonly reminded = new Set<string>();
  private readonly now: () => number;
  private stop: (() => void) | null = null;

  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly options: DescribedOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Follows the change events: a command that ended is a moment to look again; a new prompt begins a new turn. */
  start(): void {
    this.stop ??= this.hub.subscribe((event: ChangeEvent) => {
      if (event.type === 'session.status' && event.status.state === 'idle') void this.look(event.sessionId).catch((error: unknown) => this.options.onError?.(error));
      else if (event.type === 'session.attention' && event.attention.state === 'working') this.reminded.delete(event.sessionId);
      else if (event.type === 'session.closed') this.forget(event.sessionId);
    });
  }

  close(): void {
    this.stop?.();
    this.stop = null;
  }

  private forget(sessionId: string): void {
    this.seenBy.delete(sessionId);
    this.lookedAt.delete(sessionId);
    this.askedAt.delete(sessionId);
    this.reminded.delete(sessionId);
  }

  private stamp(): string {
    return new Date(this.now()).toISOString();
  }

  private emit(sessionId: string, change: Extract<ChangeEvent, { type: 'session.described' }>['change']): void {
    this.hub.emit({ type: 'session.described', sessionId, change });
  }

  links(sessionId: string): SessionLink[] {
    return sortedLinks(this.sessions.get(sessionId).links);
  }

  add(sessionId: string, input: LinkInput, who: { source: DescribedBy; by?: string | undefined; fromTerminal?: boolean }): { link: SessionLink; kept: boolean } {
    const session = this.sessions.get(sessionId);
    const result = addLink(session.links, input, who, this.stamp(), newId);
    if ('problem' in result) throw new ConflictError(result.problem);
    if (JSON.stringify(result.links) !== JSON.stringify(session.links)) this.emit(sessionId, { links: result.links });
    // Not kept: the owner's own words stand, and what was sent is beside them.
    return { link: result.link, kept: !(who.source !== 'owner' && result.link.ownerSet === true && result.link.suggested !== undefined) };
  }

  change(sessionId: string, linkId: string, change: { label?: string | undefined; kind?: SessionLink['kind'] | undefined }, who: DescribedBy): { link: SessionLink; kept: boolean } {
    const session = this.sessions.get(sessionId);
    const result = changeLink(session.links, linkId, change, who, this.stamp());
    if ('problem' in result) throw session.links.some((link) => link.id === linkId) ? new ConflictError(result.problem) : new NotFoundError(result.problem);
    this.emit(sessionId, { links: result.links });
    return { link: result.link, kept: who === 'owner' || result.link.suggested === undefined };
  }

  remove(sessionId: string, linkId: string, who: DescribedBy): SessionLink[] {
    const session = this.sessions.get(sessionId);
    const result = removeLink(session.links, linkId, who);
    if ('problem' in result) throw session.links.some((link) => link.id === linkId) ? new ConflictError(result.problem) : new NotFoundError(result.problem);
    this.emit(sessionId, { links: result.links });
    return sortedLinks(result.links);
  }

  /** A terminal's fields, each saying who set it. */
  fields(sessionId: string): TerminalField[] {
    return this.sessions.get(sessionId).fields;
  }

  /** The agent in a terminal sets one of its fields: `setOwnField` decides, and the owner's win. */
  setField(sessionId: string, label: string, value: string): { field: TerminalField; kept: boolean } {
    const session = this.sessions.get(sessionId);
    const result = setOwnField(session.fields, label, value, this.stamp());
    if ('problem' in result) throw result.reason === 'input' ? new BadInputError(result.problem) : new ConflictError(result.problem);
    if (JSON.stringify(result.fields) !== JSON.stringify(session.fields)) this.hub.emit({ type: 'session.fields', sessionId, fields: result.fields });
    return { field: result.field, kept: result.kept };
  }

  /** The agent in a terminal removes one of its own fields; the owner's stay. */
  removeField(sessionId: string, label: string): TerminalField[] {
    const session = this.sessions.get(sessionId);
    const result = removeOwnField(session.fields, label);
    if ('problem' in result) throw result.reason === 'none' ? new NotFoundError(result.problem) : new ConflictError(result.problem);
    this.hub.emit({ type: 'session.fields', sessionId, fields: result.fields });
    return result.fields;
  }

  /** The addresses seen in the terminal that are not links of it, newest last. Read again first. */
  async seen(sessionId: string): Promise<SeenLink[]> {
    await this.read(sessionId);
    const kept = new Set(this.sessions.get(sessionId).links.map((link) => link.url));
    return (this.seenBy.get(sessionId) ?? []).filter((url) => !kept.has(url)).map((url) => ({ url, ...tellLink(url) }));
  }

  /** The owner keeps one of the seen addresses as a link. */
  keep(sessionId: string, url: string): { link: SessionLink; kept: boolean } {
    if (!(this.seenBy.get(sessionId) ?? []).includes(url)) throw new ConflictError('That address is not among those seen in this terminal.');
    return this.add(sessionId, { url }, { source: 'found', fromTerminal: true });
  }

  /**
   * A name or a summary, from the owner or from the agent. The owner's is put in place. The agent's is put in place
   * unless the owner wrote what is there: then it is kept as a suggestion.
   */
  describe(sessionId: string, input: DescribeRequest, who: 'owner' | 'agent'): DescribedAnswer {
    const kept = { name: false, summary: false };
    const at = this.stamp();
    this.hub.atomically(() => {
      const before = this.sessions.get(sessionId);
      let written = before.written;
      let suggested = before.suggested;
      if (input.name !== undefined && input.name !== before.name) {
        if (who === 'agent' && before.written.name?.by === 'owner') suggested = { ...suggested, name: { value: input.name, at } };
        else {
          this.hub.emit({ type: 'session.renamed', sessionId, name: input.name });
          written = { ...written, name: { by: who, at } };
          const { name: _name, ...rest } = suggested;
          suggested = rest;
          kept.name = true;
        }
      } else if (input.name !== undefined) {
        // The same name said again: it is a name someone gave it now.
        if (!before.written.name) written = { ...written, name: { by: who, at } };
        kept.name = true;
      }
      if (input.summary !== undefined && input.summary !== before.note) {
        if (who === 'agent' && before.written.summary?.by === 'owner' && before.note.trim() !== '') suggested = { ...suggested, summary: { value: input.summary, at } };
        else {
          this.hub.emit({ type: 'session.noted', sessionId, note: input.summary });
          written = { ...written, summary: { by: who, at } };
          const { summary: _summary, ...rest } = suggested;
          suggested = rest;
          kept.summary = true;
        }
      } else if (input.summary !== undefined) {
        // Said again as it stands: it is still true, as of now.
        if (who === 'agent' || !before.written.summary) written = { ...written, summary: { by: before.written.summary?.by ?? who, at } };
        kept.summary = true;
      }
      if (written !== before.written || suggested !== before.suggested) this.emit(sessionId, { written, suggested });
    });
    const after = this.sessions.get(sessionId);
    return { name: after.name, summary: after.note, kept, missing: undescribed(after) };
  }

  /** The owner uses what was suggested, for the name, the summary, one link or one field. */
  use(sessionId: string, body: UseSuggestionRequest): SessionLink[] {
    const session = this.sessions.get(sessionId);
    const at = this.stamp();
    if (body.what === 'field') {
      const result = useSuggestedField(session.fields, body.label ?? '');
      if ('problem' in result) throw new ConflictError(result.problem);
      this.hub.emit({ type: 'session.fields', sessionId, fields: result.fields });
      return this.links(sessionId);
    }
    if (body.what === 'link') {
      if (!session.links.some((link) => link.id === body.linkId && link.suggested)) throw new ConflictError('Nothing was suggested for that link.');
      this.emit(sessionId, { links: useSuggestedLink(session.links, body.linkId ?? '') });
      return this.links(sessionId);
    }
    const what: 'name' | 'summary' = body.what;
    const suggestion = session.suggested[what];
    if (!suggestion) throw new ConflictError('Nothing was suggested for that.');
    this.hub.atomically(() => {
      if (what === 'name') this.hub.emit({ type: 'session.renamed', sessionId, name: suggestion.value });
      else this.hub.emit({ type: 'session.noted', sessionId, note: suggestion.value });
      const rest = { ...session.suggested };
      delete rest[what];
      // The owner chose it: it is the owner's now.
      this.emit(sessionId, { suggested: rest, written: { ...session.written, [what]: { by: 'owner', at } } });
    });
    return this.links(sessionId);
  }

  /** A moment of an agent's work, from its hooks. What it is told is fixed text; with the reminder off, nothing. */
  async check(sessionId: string, body: DescribeCheckRequest): Promise<DescribeCheckAnswer> {
    const session = this.sessions.get(sessionId);
    if (body.event === 'tool') {
      // A command of the agent's may have made a branch or a pull request: look, and ask for the pull request afresh.
      this.lookedAt.delete(sessionId);
      this.askedAt.delete(sessionId);
      await this.look(sessionId).catch((error: unknown) => this.options.onError?.(error));
      return { say: null, hold: false };
    }
    const remind = (await this.options.settings()).describe.remind;
    if (!remind) return { say: null, hold: false };
    if (body.event === 'start') return { say: DESCRIBE_LINES.join('\n'), hold: false };
    const missing = undescribed(session);
    // Once in a turn, and never when the agent is already going on because it was told.
    if (missing.length === 0 || body.again === true || this.reminded.has(sessionId)) return { say: null, hold: false };
    this.reminded.add(sessionId);
    return { say: describeReminder(missing), hold: true };
  }

  /** Looks at the folder and the screen again, and says what is found. For the owner, when the details are opened. */
  async lookAgain(sessionId: string): Promise<Found | null> {
    await this.look(sessionId, { details: true });
    return this.sessions.get(sessionId).found;
  }

  /** Addresses on the terminal's screen and in the end of its history. Those of a kind that is known are kept as links by themselves. */
  private async read(sessionId: string): Promise<void> {
    const runtime = this.options.runtime;
    if (!runtime) return;
    let session: Session;
    try {
      session = this.sessions.here(sessionId);
    } catch {
      return;
    }
    if (session.state === 'exited') return;
    let text: string;
    try {
      text = (await runtime.lines(sessionId, { count: LINES_READ, skip: 0 })).lines.join('\n');
    } catch {
      return;
    }
    const found = addressesIn(text).slice(-SEEN_MAX * 2);
    if (found.length === 0) return;
    this.seenBy.set(sessionId, rememberSeen(this.seenBy.get(sessionId) ?? [], found));
    for (const url of found) {
      if (!keptBySeeing(url)) continue;
      const now = this.sessions.get(sessionId);
      if (now.links.some((link) => link.url === url)) continue;
      try {
        this.add(sessionId, { url }, { source: 'found', fromTerminal: true });
      } catch {
        // Full, or not an address after all: it stays among those seen.
      }
    }
  }

  /** The branch, the repository and the pull request of the terminal's folder; and what its screen shows. Not more often than every few seconds. */
  private async look(sessionId: string, how: { details?: boolean } = {}): Promise<void> {
    let session: Session;
    try {
      session = this.sessions.here(sessionId);
    } catch {
      return;
    }
    const at = this.now();
    if (at - (this.lookedAt.get(sessionId) ?? -Infinity) < LOOK_EVERY_MS) return;
    this.lookedAt.set(sessionId, at);
    await this.read(sessionId);
    if (!session.cwd) return;
    const facts = await (this.options.facts ?? folderFacts)(session.cwd);
    const before = this.sessions.get(sessionId).found;
    const branchChanged = (before?.branch ?? null) !== facts.branch;
    let pullRequest = branchChanged ? null : (before?.pullRequest ?? null);
    // The pull request is asked for where there is a branch, the setting allows it, and either the branch changed or the details are open; at most once a minute.
    const finder = this.options.finder;
    const due = at - (this.askedAt.get(sessionId) ?? -Infinity) >= PULL_REQUEST_EVERY_MS;
    if (finder && facts.branch !== null && (branchChanged || how.details === true) && due && (await this.options.settings()).describe.pullRequests) {
      this.askedAt.set(sessionId, at);
      pullRequest = await finder.find(session.cwd);
    }
    // The session may have gone while Git was asked.
    if (!this.sessions.has(sessionId)) return;
    const found: Found | null = facts.branch === null && facts.repository === null && pullRequest === null ? null : { branch: facts.branch, repository: facts.repository, repositoryUrl: facts.repositoryUrl as Found['repositoryUrl'], pullRequest, at: new Date(at).toISOString() };
    const same = (a: Found | null, b: Found | null): boolean => JSON.stringify(a && { ...a, at: '' }) === JSON.stringify(b && { ...b, at: '' });
    if (!same(before, found)) this.emit(sessionId, { found });
  }
}
