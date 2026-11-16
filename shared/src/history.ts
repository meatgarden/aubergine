import { z } from 'zod';
import { ConversationId } from './entities';
import { Id } from './ids';

/**
 * Past conversations of an agent in a folder: the list, one conversation as
 * a transcript to read, and a search over them.
 *
 * A conversation holds everything the owner and the agent said, pasted
 * secrets and file contents included. So all of this is the owner's alone,
 * read when asked for and never kept, and shown as other people's text.
 */

/** Something that could not be told, or could only partly be: a file not readable, a form not recognised, a limit reached. */
export const HistoryNote = z.object({
  level: z.enum(['unreadable', 'unrecognised', 'limit', 'gap']),
  text: z.string().max(600),
});
export type HistoryNote = z.infer<typeof HistoryNote>;

export const ConversationSummary = z.object({
  id: ConversationId,
  /** The name it was given, or that the agent gave it. Null when none was found. */
  name: z.string().max(300).nullable(),
  /** The first and the last thing the owner said in it, cut to a line. */
  firstPrompt: z.string().max(400).nullable(),
  lastPrompt: z.string().max(400).nullable(),
  startedAt: z.iso.datetime().nullable(),
  lastActiveAt: z.iso.datetime().nullable(),
  /** How many times the owner spoke. Null when the record was too large to count. */
  turns: z.number().int().nullable(),
  /** The canvas terminal that is on this conversation right now, if one is. */
  onCanvas: z.object({ sessionId: Id, name: z.string() }).nullable(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const HistoryList = z.object({
  folder: z.string(),
  agent: z.string(),
  /** Newest first. */
  conversations: z.array(ConversationSummary),
  notes: z.array(HistoryNote),
});
export type HistoryList = z.infer<typeof HistoryList>;

/** One thing said or done in a conversation, in order. */
export const TranscriptEntry = z.object({
  who: z.enum(['you', 'agent', 'tool', 'note']),
  at: z.iso.datetime().nullable(),
  /** For a tool: its name and nothing of what it was given. */
  label: z.string().max(200),
  /** What was said, or what a tool gave back. Plain text; whoever shows it shows control characters. */
  text: z.string(),
  /** True when the text was cut because it was very long. */
  cut: z.boolean(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntry>;

export const Transcript = z.object({
  folder: z.string(),
  id: ConversationId,
  name: z.string().nullable(),
  entries: z.array(TranscriptEntry),
  notes: z.array(HistoryNote),
});
export type Transcript = z.infer<typeof Transcript>;

export const HistoryHit = z.object({
  folder: z.string(),
  id: ConversationId,
  name: z.string().nullable(),
  /** `name`: the conversation's name matched. `text`: something said in it did. */
  where: z.enum(['name', 'text']),
  who: z.enum(['you', 'agent', 'tool', 'note']).nullable(),
  /** The line that matched, cut round the match. */
  line: z.string().max(400),
  at: z.iso.datetime().nullable(),
});
export type HistoryHit = z.infer<typeof HistoryHit>;

export const HistorySearch = z.object({
  hits: z.array(HistoryHit),
  /** True when the search stopped before it had looked at everything, and why. */
  cutShort: z.boolean(),
  why: z.string(),
  /** How many conversations were looked at. */
  searched: z.number().int(),
  notes: z.array(HistoryNote),
});
export type HistorySearch = z.infer<typeof HistorySearch>;

const Folder = z.string().startsWith('/').max(4096);
export const HistoryQuery = z.object({ folder: Folder });
export const TranscriptQuery = z.object({ folder: Folder, id: ConversationId });
export const HistorySearchQuery = z.object({ q: z.string().trim().min(2).max(200), folder: Folder.optional() });
export const OpenConversationRequest = z.object({
  folder: Folder,
  id: ConversationId,
  /** Open a copy (a branch of the conversation) rather than the conversation itself. */
  copy: z.boolean().default(false),
  /** Open it though a canvas terminal is on it already. Two agents in one conversation lose each other's messages. */
  evenIfOpen: z.boolean().default(false),
  canvasId: Id.optional(),
});
export type OpenConversationRequest = z.infer<typeof OpenConversationRequest>;

/** How many lines of a long piece of a transcript are shown before it is folded. */
export const FOLD_AFTER_LINES = 12;

/** Whether a piece of a transcript is long enough to fold, and what shows while it is folded. */
export function folded(text: string): { long: boolean; head: string; rest: number } {
  const lines = text.split('\n');
  if (lines.length <= FOLD_AFTER_LINES && text.length <= 1500) return { long: false, head: text, rest: 0 };
  const head = lines.slice(0, FOLD_AFTER_LINES).join('\n').slice(0, 1500);
  return { long: true, head, rest: Math.max(0, lines.length - FOLD_AFTER_LINES) };
}
