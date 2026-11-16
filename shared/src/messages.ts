import { z } from 'zod';
import { Id } from './ids';

/**
 * Messages between sessions.
 *
 * A message has a named sender and one receiver, and is read by the receiver
 * when it is ready. Nothing a sender wrote is ever typed into a terminal.
 * Messages are kept in a file of their own and are not state; the state holds
 * only a few counts per session, so that the canvas can show a mark.
 *
 * Every default is closed: a session may message another only where the
 * owner opened the canvas to it, a token only with a scope of its own and
 * within its reach, and "people only" closes a session to both.
 */

const Timestamp = z.iso.datetime();

/** How long one message may be, in characters. */
export const MESSAGE_MAX = 4000;
export const MessageText = z.string().trim().min(1).max(MESSAGE_MAX);

/** Who sent a message, or whom it is for. A name is kept as it was when the message was sent. */
export const Party = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('owner') }),
  z.object({ kind: z.literal('session'), sessionId: Id, name: z.string() }),
  z.object({ kind: z.literal('token'), tokenId: Id, name: z.string() }),
]);
export type Party = z.infer<typeof Party>;

/** A party in a few characters, for telling two apart. */
export function partyKey(party: Party): string {
  return party.kind === 'owner' ? 'owner' : party.kind === 'session' ? `s.${party.sessionId}` : `t.${party.tokenId}`;
}

/** A party as a reader is told: "your owner", a terminal by name, a program by its token's name. */
export function partyWords(party: Party): string {
  return party.kind === 'owner' ? 'your owner' : party.kind === 'session' ? `the terminal "${party.name}"` : `the program "${party.name}"`;
}

/**
 * A thread is everything two parties said to each other: there is one per
 * pair, so a limit on a thread cannot be got round by starting another.
 */
export const ThreadId = z.string().regex(/^(owner|[st]\.[0-9a-f-]{36})--(owner|[st]\.[0-9a-f-]{36})$/);
export function threadIdOf(a: Party, b: Party): string {
  return [partyKey(a), partyKey(b)].sort().join('--');
}

export const Message = z.object({
  id: Id,
  threadId: ThreadId,
  from: Party,
  to: Party,
  text: MessageText,
  /** The message this one answers, when it answers one. */
  replyTo: Id.nullable().default(null),
  sentAt: Timestamp,
  /** When the receiver read it; null until then. */
  readAt: Timestamp.nullable().default(null),
});
export type Message = z.infer<typeof Message>;

/** What the state holds about a session's messages: counts for a mark, and nothing a message said. */
export const SessionMessages = z.object({
  /** Messages for this session that it has not read. */
  unread: z.number().int().min(0).default(0),
  /** Who sent the newest of those, in words. */
  from: z.string().max(200).nullable().default(null),
  /** Messages from this session to the owner that the owner has not read. */
  forOwner: z.number().int().min(0).default(0),
  /** Threads of this session that are paused until the owner has looked. */
  paused: z.number().int().min(0).default(0),
  /** When any of this last changed. */
  at: Timestamp.nullable().default(null),
});
export type SessionMessages = z.infer<typeof SessionMessages>;
export const NO_MESSAGES: SessionMessages = SessionMessages.parse({});

/** A session with messages the owner should know about belongs in the waiting queue. */
export function messagesWantOwner(messages: SessionMessages): boolean {
  return messages.forOwner > 0 || messages.paused > 0;
}

/* ---------- Whether a session may message another ---------- */

/**
 * Which canvases' terminals may message the terminals on a canvas: the list
 * kept on the receiving canvas. "Terminals on this canvas may message each
 * other" is the canvas's own ID in its own list. Letting another canvas in
 * later is that canvas's ID in the list: nothing stored has to change.
 */
export function canvasAdmits(messagesFrom: readonly string[], fromCanvasId: string | null): boolean {
  return fromCanvasId !== null && messagesFrom.includes(fromCanvasId);
}

/* ---------- Bodies and answers of the public routes ---------- */

export const SendFromSessionRequest = z.object({
  to: z.string().trim().min(1).max(200).describe('The terminal the message is for: its ID, or its exact name on the same canvas.'),
  text: MessageText.describe(`The message, as plain text: at most ${MESSAGE_MAX} characters. It is shown to the receiver as your words; it is never typed into a terminal.`),
});
export type SendFromSessionRequest = z.infer<typeof SendFromSessionRequest>;

export const ReplyRequest = z.object({
  text: MessageText.describe(`The answer, as plain text: at most ${MESSAGE_MAX} characters.`),
});
export type ReplyRequest = z.infer<typeof ReplyRequest>;

export const SendMessageRequest = z.object({
  text: MessageText.describe(`The message, as plain text: at most ${MESSAGE_MAX} characters. It is shown to the receiver as the words of the token's name; it is never typed into a terminal.`),
  replyTo: Id.optional().describe('The message from that session this one answers.'),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

/** What taking the inbox gives: the messages that were unread, oldest first. They are now read. */
export const Inbox = z.object({
  messages: z.array(Message),
  /** How many more are still unread, when there were more than one answer carries. */
  more: z.number().int().min(0),
});
export type Inbox = z.infer<typeof Inbox>;

/* ---------- What the owner sees ---------- */

export const ThreadState = z.enum(['open', 'paused', 'stopped']);
export type ThreadState = z.infer<typeof ThreadState>;

/** A sender the owner closed one session to. */
export const MessageBlock = z.object({ sessionId: Id, sender: z.string().max(80) });
export type MessageBlock = z.infer<typeof MessageBlock>;

export const ThreadSummary = z.object({
  id: ThreadId,
  parties: z.tuple([Party, Party]),
  state: ThreadState,
  /** Messages exchanged since the owner last looked at it. Counted where the owner is not one of the two. */
  turns: z.number().int().min(0),
  /** After how many such messages it pauses. */
  pauseAfter: z.number().int().min(1),
  total: z.number().int().min(0),
  /** Not yet read by the session they are for. */
  unread: z.number().int().min(0),
  /** For the owner, and not yet read by the owner. */
  forOwner: z.number().int().min(0),
  last: Message.nullable(),
  blocks: z.array(MessageBlock),
});
export type ThreadSummary = z.infer<typeof ThreadSummary>;

export const ThreadList = z.object({ threads: z.array(ThreadSummary) });
export type ThreadList = z.infer<typeof ThreadList>;

export const ThreadDetail = z.object({ thread: ThreadSummary, messages: z.array(Message) });
export type ThreadDetail = z.infer<typeof ThreadDetail>;

export const ThreadsQuery = z.object({ sessionId: Id.optional() });
export type ThreadsQuery = z.infer<typeof ThreadsQuery>;

/** What the owner does to a thread. `look`: the owner has seen it, which lets a paused count start again. `read`: what was for the owner is read. */
export const ThreadAction = z.object({ action: z.enum(['look', 'read', 'pause', 'continue', 'stop']) });
export type ThreadAction = z.infer<typeof ThreadAction>;

export const OwnerMessageRequest = z.object({ text: MessageText, replyTo: Id.optional() });
export type OwnerMessageRequest = z.infer<typeof OwnerMessageRequest>;

export const BlockSenderRequest = z.object({ sender: z.string().regex(/^[st]\.[0-9a-f-]{36}$/), blocked: z.boolean() });
export type BlockSenderRequest = z.infer<typeof BlockSenderRequest>;

/** The switch of a canvas: whether its terminals may message each other. */
export const CanvasMessagingRequest = z.object({ sessions: z.boolean() });
export type CanvasMessagingRequest = z.infer<typeof CanvasMessagingRequest>;

/* ---------- As text ---------- */

/** The line above a message where it is shown to a reader: who, when, and which message it is. */
export function messageHeading(message: Message, agoWords: string): string {
  return `Message ${message.id} from ${partyWords(message.from)}, ${agoWords} ago${message.replyTo ? ` (answering ${message.replyTo})` : ''}:`;
}
