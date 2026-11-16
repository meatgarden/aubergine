import {
  INBOX_LINE,
  NO_MESSAGES,
  newId,
  partyKey,
  partyWords,
  placeOfSession,
  threadIdOf,
  type Inbox,
  type Message,
  type MessageBlock,
  type Party,
  type Session,
  type SessionMessages,
  type Settings,
  type ThreadAction,
  type ThreadDetail,
  type ThreadState,
  type ThreadSummary,
} from '@aubergine/shared';
import { MemoryMessageLog, type MessageLine, type MessageLog } from './message-log';
import { NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';

/**
 * Messages between sessions: who may be told what, how often, and when a
 * thread waits for the owner.
 *
 * Nothing a sender wrote is ever typed. A message is kept, the receiver's
 * counts go up, and where an agent is idle in the receiving terminal the
 * one fixed sentence `INBOX_LINE` is typed, at most once for a batch of
 * unread messages, and only for a sender who may cause that: the owner, a
 * session the owner let message this one, or a token that may type into
 * this very terminal.
 *
 * Who may send at all is decided before anything here is called, by
 * `authorize`. What is decided here is what holds for every sender but the
 * owner: blocks, a paused or stopped thread, and the limits.
 */

/** A refusal with the server's one error shape, in a sentence an agent can act on. */
export class MessageRefusal extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 429,
    readonly code: 'forbidden' | 'not_found' | 'conflict' | 'rate_limited',
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export type MessageSettings = Settings['messages'];

/** How many messages one answer carries at most. */
const TAKE_AT_MOST = 20;
/** How many messages are held at most; the oldest read ones go first. */
const HELD_AT_MOST = 5000;
/** Input this recent means a person is typing there: the sentence is not typed on top of it. */
const QUIET_INPUT_MS = 15_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface Thread {
  state: ThreadState;
  /** Messages exchanged since the owner last looked. Counted only where the owner is not one of the two. */
  turns: number;
}

/**
 * Whether the fixed sentence may be typed into a session now: an agent is
 * known to run there, the shell is not at its own prompt (where the sentence
 * would be run as a command), the agent is not working and not waiting on a
 * question of its own, and nobody typed there a moment ago.
 */
export function nudgeable(session: Session, now: number): boolean {
  if (session.state === 'exited' || session.agent === null) return false;
  if (session.status.state === 'idle') return false;
  if (session.attention.state !== 'done' && session.attention.state !== 'none') return false;
  return session.lastInputAt === null || now - Date.parse(session.lastInputAt) >= QUIET_INPUT_MS;
}

export class Messages {
  private readonly messages = new Map<string, Message>();
  private readonly threads = new Map<string, Thread>();
  private readonly blocks = new Set<string>();
  /** Per session: when the sentence was last typed, and whether it was for the unread batch there is now. */
  private readonly nudges = new Map<string, { at: number; batch: boolean }>();
  /** Messages no sentence is ever typed for: those of a token that may not type into the receiving terminal. */
  private readonly quiet = new Set<string>();
  private readonly retries = new Map<string, NodeJS.Timeout>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly settings: () => MessageSettings,
    private readonly log: MessageLog = new MemoryMessageLog(),
    private readonly now: () => number = Date.now,
  ) {
    // An agent that has just finished, or a shell that changed, may now be told about what waits for it.
    this.unsubscribe = hub.subscribe((event) => {
      if (event.type === 'session.attention' || event.type === 'session.status') void this.nudge(event.sessionId);
    });
  }

  close(): void {
    this.unsubscribe();
    for (const timer of this.retries.values()) clearTimeout(timer);
    this.retries.clear();
  }

  /** Reads what was kept, and puts the counts in the state right. Called once, at the start. */
  async load(): Promise<void> {
    for (const line of await this.log.read()) this.fold(line);
    // Whether a token could type is not kept with a message: after a start, none of a token's is announced.
    for (const message of this.messages.values()) if (message.from.kind === 'token') this.quiet.add(message.id);
    for (const session of this.hub.state.sessions) this.count(session.id);
  }

  private fold(line: MessageLine): void {
    if (line.type === 'sent') this.messages.set(line.message.id, line.message);
    else if (line.type === 'read') {
      for (const id of line.ids) {
        const message = this.messages.get(id);
        if (message && message.readAt === null) this.messages.set(id, { ...message, readAt: line.at });
      }
    } else if (line.type === 'thread') this.threads.set(line.threadId, { state: line.state, turns: line.turns });
    else if (line.blocked) this.blocks.add(`${line.sessionId}|${line.sender}`);
    else this.blocks.delete(`${line.sessionId}|${line.sender}`);
  }

  /** Everything that is current, as lines: what a file started again begins with. */
  private carry(): MessageLine[] {
    const at = new Date(this.now()).toISOString();
    return [
      ...this.kept().map((message): MessageLine => ({ type: 'sent', message })),
      ...[...this.threads].map(([threadId, thread]): MessageLine => ({ type: 'thread', threadId, state: thread.state, turns: thread.turns, at })),
      ...[...this.blocks].map((key): MessageLine => {
        const [sessionId, sender] = key.split('|') as [string, string];
        return { type: 'block', sessionId, sender, blocked: true, at };
      }),
    ];
  }

  private write(lines: MessageLine[]): void {
    for (const line of lines) this.fold(line);
    void this.log.append(lines, () => this.carry());
  }

  /** The messages still held: every unread one, and read ones that are not too old. Oldest first. */
  private kept(): Message[] {
    const oldest = this.now() - this.settings().keepDays * DAY;
    const kept = [...this.messages.values()].filter((message) => message.readAt === null || Date.parse(message.sentAt) >= oldest);
    if (kept.length !== this.messages.size || kept.length > HELD_AT_MOST) {
      const held = kept.length > HELD_AT_MOST ? [...kept.filter((m) => m.readAt === null), ...kept.filter((m) => m.readAt !== null).slice(-(HELD_AT_MOST / 2))].sort((a, b) => a.sentAt.localeCompare(b.sentAt)) : kept;
      this.messages.clear();
      for (const message of held) this.messages.set(message.id, message);
      return held;
    }
    return kept;
  }

  private session(sessionId: string): Session | undefined {
    return this.hub.state.sessions.find((s) => s.id === sessionId);
  }

  private partyOf(session: Session): Party {
    return { kind: 'session', sessionId: session.id, name: session.name };
  }

  /** Whether a party is still there to be shown: a session that was ended for good takes its threads out of every list. */
  private there(party: Party): boolean {
    return party.kind !== 'session' || this.session(party.sessionId) !== undefined;
  }

  private thread(threadId: string): Thread {
    return this.threads.get(threadId) ?? { state: 'open', turns: 0 };
  }

  /** Works out a session's counts again and says so when they changed. */
  private count(sessionId: string): void {
    const session = this.session(sessionId);
    if (!session) return;
    const mine = `s.${sessionId}`;
    let unread = 0;
    let forOwner = 0;
    let from: string | null = null;
    const paused = new Set<string>();
    for (const message of this.messages.values()) {
      if (!this.there(message.from) || !this.there(message.to)) continue;
      if (message.readAt === null && partyKey(message.to) === mine) {
        unread += 1;
        from = message.from.kind === 'owner' ? 'you' : message.from.name.slice(0, 200);
      }
      if (message.readAt === null && message.to.kind === 'owner' && partyKey(message.from) === mine) forOwner += 1;
      if ((partyKey(message.to) === mine || partyKey(message.from) === mine) && this.thread(message.threadId).state === 'paused') paused.add(message.threadId);
    }
    const before = session.messages ?? NO_MESSAGES;
    if (before.unread === unread && before.forOwner === forOwner && before.paused === paused.size && before.from === from) return;
    const messages: SessionMessages = { unread, from, forOwner, paused: paused.size, at: new Date(this.now()).toISOString() };
    this.hub.emit({ type: 'session.messages', sessionId, messages });
  }

  /* ---------- Sending ---------- */

  /**
   * Keeps a message for a session. The caller has already been allowed to
   * send to it. For every sender but the owner: refused when the owner
   * closed the session to this sender, when the thread between the two is
   * paused or stopped, when the session has too many unread, and when the
   * sender, or the two together, have sent too many.
   */
  send(from: Party, to: Party, text: string, replyTo: string | null = null, announce = true): Message {
    if (partyKey(from) === partyKey(to)) throw new MessageRefusal(409, 'conflict', 'A session cannot message itself.');
    const limits = this.settings();
    const now = this.now();
    const threadId = threadIdOf(from, to);
    const thread = this.thread(threadId);
    const ownerIn = from.kind === 'owner' || to.kind === 'owner';
    const all = [...this.messages.values()];

    if (from.kind !== 'owner') {
      if (to.kind === 'session' && this.blocks.has(`${to.sessionId}|${partyKey(from)}`)) {
        throw new MessageRefusal(403, 'forbidden', 'The owner has closed that terminal to your messages. Do not look for another way to reach it; if it matters, tell your owner.');
      }
      if (thread.state === 'stopped') {
        throw new MessageRefusal(409, 'conflict', 'The owner has stopped this thread: no more messages pass between the two of you. Do not look for another way; if it matters, tell your owner.');
      }
      if (thread.state === 'paused') {
        throw new MessageRefusal(409, 'conflict', `This thread is paused until the owner has looked at it${thread.turns > 0 ? `: ${thread.turns} messages have passed between the two of you` : ''}. The owner has been told. Wait; do not send it another way.`);
      }
      const mine = partyKey(from);
      const lastMinute = all.filter((m) => partyKey(m.from) === mine && now - Date.parse(m.sentAt) < MINUTE);
      if (lastMinute.length >= limits.perSenderPerMinute) {
        const wait = Math.max(1, Math.ceil((MINUTE - (now - Date.parse((lastMinute[0] as Message).sentAt))) / 1000));
        throw new MessageRefusal(429, 'rate_limited', `You have sent ${lastMinute.length} messages in the last minute, which is the most allowed. Try again in ${wait} seconds, and send fewer, longer messages.`, wait);
      }
      if (!ownerIn) {
        const lastHour = all.filter((m) => m.threadId === threadId && now - Date.parse(m.sentAt) < HOUR);
        if (lastHour.length >= limits.perPairPerHour) {
          const wait = Math.max(1, Math.ceil((HOUR - (now - Date.parse((lastHour[0] as Message).sentAt))) / 1000));
          throw new MessageRefusal(429, 'rate_limited', `${lastHour.length} messages have passed between the two of you in the last hour, which is the most allowed. Try again in ${Math.ceil(wait / 60)} minutes. If the work needs more than that, tell your owner.`, wait);
        }
      }
      if (to.kind === 'owner') {
        const waiting = all.filter((m) => m.readAt === null && m.to.kind === 'owner' && partyKey(m.from) === mine).length;
        if (waiting >= limits.maxUnread) throw new MessageRefusal(409, 'conflict', `Your owner has ${waiting} messages from this session that they have not read, which is the most that may wait. Sending more will not help; they will read them when they look.`);
      }
      if (to.kind === 'session') {
        const waiting = all.filter((m) => m.readAt === null && m.to.kind === 'session' && m.to.sessionId === to.sessionId).length;
        if (waiting >= limits.maxUnread) {
          throw new MessageRefusal(409, 'conflict', `That terminal has ${waiting} unread messages, which is the most it may have waiting. It has not read them; sending more will not help. If it matters, tell your owner.`);
        }
      }
    }

    const message: Message = { id: newId(), threadId, from, to, text, replyTo, sentAt: new Date(now).toISOString(), readAt: null };
    const lines: MessageLine[] = [{ type: 'sent', message }];
    // Two that are not the owner: counted, and paused when they have gone on long enough without the owner looking.
    let paused = false;
    if (!ownerIn) {
      const turns = thread.turns + 1;
      paused = turns >= limits.pauseAfter;
      lines.push({ type: 'thread', threadId, state: paused ? 'paused' : thread.state, turns, at: message.sentAt });
    }
    if (!announce) this.quiet.add(message.id);
    this.write(lines);
    for (const party of [from, to]) if (party.kind === 'session') this.count(party.sessionId);
    // The message that reaches the limit is kept, and nobody is told to go and read it until the owner has looked.
    if (to.kind === 'session' && !paused && announce) void this.nudge(to.sessionId);
    return message;
  }

  /** The owner's message to a session. Nothing limits the owner. */
  fromOwner(sessionId: string, text: string, replyTo: string | null = null, via: 'page' | 'command' = 'page'): Message {
    return this.send({ kind: 'owner', via }, this.partyOf(this.sessions.get(sessionId)), text, this.answered(replyTo, sessionId));
  }

  /**
   * A program's message to a session, under the name of its token. `announce`: whether the fixed sentence may be
   * typed for it, which is so only for a token that may type into that very session. Otherwise the message waits
   * to be read, and causes no typing now or later.
   */
  fromToken(token: { tokenId: string; name: string }, sessionId: string, text: string, replyTo: string | null, announce: boolean): Message {
    return this.send({ kind: 'token', tokenId: token.tokenId, name: token.name }, this.partyOf(this.sessions.get(sessionId)), text, this.answered(replyTo, sessionId), announce);
  }

  /** `replyTo` is kept only when it names a message that session sent: nothing else is said about any other message. */
  private answered(replyTo: string | null, sessionId: string): string | null {
    if (replyTo === null) return null;
    const message = this.messages.get(replyTo);
    return message && message.from.kind === 'session' && message.from.sessionId === sessionId ? replyTo : null;
  }

  /**
   * The message a session wants to answer: one that was sent to that session.
   * Any other, and one that does not exist, are refused in the same words.
   */
  received(sessionId: string, messageId: string): Message {
    const message = this.messages.get(messageId);
    if (!message || message.to.kind !== 'session' || message.to.sessionId !== sessionId) throw new MessageRefusal(404, 'not_found', 'No message by that ID was sent to this session. `aubergine inbox` shows the ID of each message as it is read.');
    return message;
  }

  /** A session's message: to the owner, to a program that wrote to it, or to another session the caller was allowed to reach. */
  fromSession(sessionId: string, to: Party, text: string, replyTo: string | null = null): Message {
    return this.send(this.partyOf(this.sessions.get(sessionId)), to, text, replyTo);
  }

  /** The party a session is: for whoever has to say whom a message is for. */
  party(sessionId: string): Party {
    return this.partyOf(this.sessions.get(sessionId));
  }

  /* ---------- Reading ---------- */

  /** The unread messages of a session, oldest first. They are now read. */
  take(sessionId: string): Inbox {
    this.sessions.get(sessionId);
    const unread = [...this.messages.values()].filter((m) => m.readAt === null && m.to.kind === 'session' && m.to.sessionId === sessionId);
    const taken = unread.slice(0, TAKE_AT_MOST);
    const at = new Date(this.now()).toISOString();
    if (taken.length > 0) this.write([{ type: 'read', ids: taken.map((m) => m.id), at }]);
    // The batch the sentence was typed for is over: the next message starts another.
    const nudged = this.nudges.get(sessionId);
    if (nudged && unread.length === taken.length) this.nudges.set(sessionId, { at: nudged.at, batch: false });
    this.count(sessionId);
    for (const message of taken) if (message.from.kind === 'session') this.count(message.from.sessionId);
    return { messages: taken.map((m) => ({ ...m, readAt: at })), more: unread.length - taken.length };
  }

  /** Every message to or from a session, newest first. Marks nothing. */
  of(sessionId: string): Message[] {
    this.sessions.get(sessionId);
    const mine = `s.${sessionId}`;
    return this.kept()
      .filter((m) => partyKey(m.to) === mine || partyKey(m.from) === mine)
      .reverse();
  }

  /* ---------- What the owner sees and does ---------- */

  private summary(threadId: string, messages: readonly Message[]): ThreadSummary {
    const thread = this.thread(threadId);
    const first = messages[0] as Message;
    // The newest names: a session may have been renamed since.
    const parties = [first.from, first.to].sort((a, b) => partyKey(a).localeCompare(partyKey(b))).map((party) => {
      const session = party.kind === 'session' ? this.session(party.sessionId) : undefined;
      return session ? this.partyOf(session) : party;
    }) as [Party, Party];
    const blocks: MessageBlock[] = [];
    for (const receiver of parties) {
      if (receiver.kind !== 'session') continue;
      for (const sender of parties) if (sender !== receiver && this.blocks.has(`${receiver.sessionId}|${partyKey(sender)}`)) blocks.push({ sessionId: receiver.sessionId, sender: partyKey(sender) });
    }
    return {
      id: threadId,
      parties,
      state: thread.state,
      turns: thread.turns,
      pauseAfter: this.settings().pauseAfter,
      total: messages.length,
      unread: messages.filter((m) => m.readAt === null && m.to.kind === 'session').length,
      forOwner: messages.filter((m) => m.readAt === null && m.to.kind === 'owner').length,
      last: messages[messages.length - 1] ?? null,
      blocks,
    };
  }

  private byThread(): Map<string, Message[]> {
    const threads = new Map<string, Message[]>();
    for (const message of this.kept()) {
      if (!this.there(message.from) || !this.there(message.to)) continue;
      threads.set(message.threadId, [...(threads.get(message.threadId) ?? []), message]);
    }
    return threads;
  }

  /** The threads, those that want the owner first: paused, then with something for the owner, then the newest. */
  list(sessionId?: string): ThreadSummary[] {
    const rank = (t: ThreadSummary): number => (t.state === 'paused' ? 0 : t.forOwner > 0 ? 1 : t.unread > 0 ? 2 : 3);
    return [...this.byThread()]
      .map(([threadId, messages]) => this.summary(threadId, messages))
      .filter((t) => sessionId === undefined || t.parties.some((party) => party.kind === 'session' && party.sessionId === sessionId))
      .sort((a, b) => rank(a) - rank(b) || (b.last?.sentAt ?? '').localeCompare(a.last?.sentAt ?? ''));
  }

  detail(threadId: string): ThreadDetail {
    const messages = this.byThread().get(threadId);
    if (!messages) throw new NotFoundError('No thread by that ID.');
    return { thread: this.summary(threadId, messages), messages };
  }

  /** The owner looked at a thread, read what was for them, paused it, let it go on or stopped it. */
  act(threadId: string, action: ThreadAction['action']): ThreadDetail {
    const { thread, messages } = this.detail(threadId);
    const at = new Date(this.now()).toISOString();
    const lines: MessageLine[] = [];
    const set = (state: ThreadState, turns: number): void => void lines.push({ type: 'thread', threadId, state, turns, at });
    if (action === 'look' && thread.state === 'open' && thread.turns > 0) set('open', 0);
    if (action === 'pause' && thread.state === 'open') set('paused', thread.turns);
    if (action === 'continue' && thread.state !== 'open') set('open', 0);
    if (action === 'stop' && thread.state !== 'stopped') set('stopped', thread.turns);
    if (action === 'read' || action === 'look') {
      const mine = messages.filter((m) => m.readAt === null && m.to.kind === 'owner').map((m) => m.id);
      if (mine.length > 0) lines.push({ type: 'read', ids: mine, at });
    }
    if (lines.length > 0) this.write(lines);
    for (const party of thread.parties) {
      if (party.kind !== 'session') continue;
      this.count(party.sessionId);
      // Going on again: what waited unannounced may now be announced.
      if (action === 'continue') void this.nudge(party.sessionId);
    }
    return this.detail(threadId);
  }

  /** Closes a session to one sender, or opens it again. */
  block(sessionId: string, sender: string, blocked: boolean): MessageBlock & { blocked: boolean } {
    this.sessions.get(sessionId);
    if (this.blocks.has(`${sessionId}|${sender}`) !== blocked) this.write([{ type: 'block', sessionId, sender, blocked, at: new Date(this.now()).toISOString() }]);
    return { sessionId, sender, blocked };
  }

  /* ---------- Saying that a message waits ---------- */

  /**
   * Types the one fixed sentence into a session where an idle agent has
   * unread messages it was not yet told about. Never anything else, never
   * into a plain shell, never while the agent works, once for a batch, and
   * not again within the interval. Returns whether it was typed.
   */
  async nudge(sessionId: string): Promise<boolean> {
    const session = this.session(sessionId);
    if (!session || (session.messages?.unread ?? 0) === 0) return false;
    const now = this.now();
    const last = this.nudges.get(sessionId);
    if (last?.batch) return false;
    const wait = last ? this.settings().nudgeIntervalSeconds * 1000 - (now - last.at) : 0;
    if (wait > 0) {
      // Too soon after the last time: looked at again when the interval is over, and not before.
      if (!this.retries.has(sessionId)) {
        const timer = setTimeout(() => {
          this.retries.delete(sessionId);
          void this.nudge(sessionId);
        }, wait + 50);
        timer.unref();
        this.retries.set(sessionId, timer);
      }
      return false;
    }
    if (!nudgeable(session, now)) return false;
    // Only for something it may be told about: a message in a thread that is not paused or stopped.
    const waiting = [...this.messages.values()].some((m) => m.readAt === null && m.to.kind === 'session' && m.to.sessionId === sessionId && this.thread(m.threadId).state === 'open' && !this.quiet.has(m.id));
    if (!waiting) return false;
    // Noted before the typing, so that two things happening at once type it once.
    this.nudges.set(sessionId, { at: now, batch: true });
    const typed = await this.sessions.tell(sessionId, INBOX_LINE).catch(() => false);
    if (!typed) this.nudges.delete(sessionId);
    return typed;
  }

  /** In words, who a message is from: for the commands. */
  static words(party: Party): string {
    return partyWords(party);
  }

  /** The canvas a session is on, for whoever asks `authorize` about a message between two. */
  canvasOf(sessionId: string): string | null {
    return placeOfSession(this.hub.state, sessionId)?.canvas.id ?? null;
  }
}
