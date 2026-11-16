import { open, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConversationId, type HistoryHit, type HistoryNote, type TranscriptEntry } from '@aubergine/shared';
import type { AgentHistory, ConversationFound, HistoryFound, SearchFound, SearchLimits, TranscriptFound } from './history';

/**
 * Claude Code's past conversations, read from where that product documents
 * it keeps them: one file per conversation, a line per entry, in a folder
 * named after the working folder, under `projects` in its own folder.
 *
 * Two things about this are not ours to rely on, and the product says so:
 * the form of a line is its own business and changes between versions, and
 * a folder name longer than 200 characters is shortened with a hash this
 * code cannot work out. So every line is read as "something that may be a
 * message", and a file none of whose lines is one is reported as not
 * recognised, never as an empty conversation.
 *
 * This is the only module that reads those files. It never writes, renames
 * or deletes one, keeps nothing it read, and is never given a path to read:
 * only a folder, from which the place to look is worked out here.
 */

/** A conversation's record larger than this is not read whole for the list: its beginning and its end are. */
const LIST_WHOLE_BYTES = 2 * 1024 * 1024;
const LIST_EDGE_BYTES = 512 * 1024;
/** The most conversations listed for one folder, newest first. */
const LIST_MAX = 200;
/** A transcript is read up to this size, and shown up to this many entries. */
const TRANSCRIPT_BYTES = 16 * 1024 * 1024;
const TRANSCRIPT_ENTRIES = 3000;
/** One piece of a transcript is cut at this length. */
const ENTRY_CHARS = 20_000;
const LINE = 400;

export const DEFAULT_SEARCH_LIMITS: SearchLimits = { files: 300, bytes: 64 * 1024 * 1024, milliseconds: 4000, hits: 50 };

/** The folder the product keeps a working folder's conversations under: every character that is not a letter or a digit becomes a dash. Null when the name would be shortened with a hash. */
export function projectFolderName(folder: string): string | null {
  const name = folder.replace(/[^A-Za-z0-9]/g, '-');
  return name.length > 200 ? null : name;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const oneLine = (text: string, max: number = LINE): string => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const timeOf = (value: unknown): string | null => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) ? value : null);

/** What one line of a record is taken to be. `null`: not something this code knows how to read. */
export interface ReadLine {
  /** Things said or done, in order. One line can hold several: an agent's words and the tools it called. */
  entries: TranscriptEntry[];
  /** A name for the conversation, when the line carries one. */
  title: string | null;
  /** The working folder the line was written in, when it says. */
  cwd: string | null;
  at: string | null;
}

/** Text the agent's own program wraps round commands and reminders, which the owner did not type. */
const isWrapper = (text: string): boolean => /^\s*<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|system-reminder|task-notification)\b/.test(text);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** A tool call as one line: its name and, where it has one, the plain thing it was pointed at. Never the whole of what it was given. */
function toolLabel(block: Record<string, unknown>): string {
  const name = typeof block.name === 'string' ? oneLine(block.name, 60) : 'a tool';
  const input = isRecord(block.input) ? block.input : {};
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']) {
    if (typeof input[key] === 'string' && input[key] !== '') return `${name}: ${oneLine(input[key] as string, 120)}`;
  }
  return name;
}

const cutTo = (text: string): { text: string; cut: boolean } => (text.length > ENTRY_CHARS ? { text: text.slice(0, ENTRY_CHARS), cut: true } : { text, cut: false });

/**
 * Reads one line. Pure, and forgiving: anything that is not a line this
 * code knows gives `null`, and a line it half knows gives what it could
 * make out.
 */
export function readLine(line: string): ReadLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const at = timeOf(raw.timestamp);
  const cwd = typeof raw.cwd === 'string' ? raw.cwd : null;
  // A name: one the owner gave, one the agent made, or the summary an older version kept.
  for (const key of ['customTitle', 'aiTitle', 'title', 'summary']) {
    if (typeof raw[key] === 'string' && (raw[key] as string).trim() !== '' && typeof raw.message === 'undefined') return { entries: [], title: oneLine(raw[key] as string, 300), cwd, at };
  }
  const message = raw.message;
  if (!isRecord(message) || (raw.type !== 'user' && raw.type !== 'assistant')) return null;
  // What a helper agent said inside the conversation is not part of what the owner and the agent said to each other.
  if (raw.isSidechain === true) return { entries: [], title: null, cwd, at };
  const entries: TranscriptEntry[] = [];
  const content = message.content;
  const blocks: unknown[] = Array.isArray(content) ? content : [];
  if (raw.type === 'user') {
    const said = textOf(content);
    if (said.trim() !== '') {
      const who = raw.isMeta === true || isWrapper(said) ? 'note' : 'you';
      entries.push({ who, at, label: who === 'note' ? 'from the agent’s own program' : '', ...cutTo(said) });
    }
    for (const block of blocks) {
      if (!isRecord(block) || block.type !== 'tool_result') continue;
      entries.push({ who: 'tool', at, label: block.is_error === true ? 'result (an error)' : 'result', ...cutTo(textOf(block.content)) });
    }
  } else {
    const said = textOf(content);
    if (said.trim() !== '') entries.push({ who: 'agent', at, label: '', ...cutTo(said) });
    for (const block of blocks) {
      if (isRecord(block) && block.type === 'tool_use') entries.push({ who: 'tool', at, label: toolLabel(block), text: '', cut: false });
    }
  }
  return { entries, title: null, cwd, at };
}

/** Reads a file's text: all of it up to `whole` bytes, otherwise its first and last `edge` bytes. Lines cut by that are dropped. */
async function readSome(file: string, whole: number, edge: number): Promise<{ lines: string[]; partial: boolean; bytes: number }> {
  const handle = await open(file, 'r');
  try {
    const size = (await handle.stat()).size;
    if (size <= whole) {
      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, 0);
      return { lines: buffer.toString('utf8').split('\n').filter(Boolean), partial: false, bytes: size };
    }
    // Never more than half of it from each end, so that the two do not overlap.
    edge = Math.max(1, Math.min(edge, Math.floor(size / 2)));
    const head = Buffer.alloc(edge);
    const tail = Buffer.alloc(edge);
    await handle.read(head, 0, edge, 0);
    await handle.read(tail, 0, edge, size - edge);
    // The last line of the head and the first of the tail may be cut in two: leave them out.
    return { lines: [...head.toString('utf8').split('\n').slice(0, -1), ...tail.toString('utf8').split('\n').slice(1)].filter(Boolean), partial: true, bytes: edge * 2 };
  } finally {
    await handle.close();
  }
}

export interface ClaudeHistoryOptions {
  /** The home folder. For tests: a folder that stands in for it. */
  home?: string;
  /** The agent's own folder, when it was moved; left out, `CLAUDE_CONFIG_DIR` from the server's environment is used, as the product documents. */
  configDir?: string | null;
  now?: () => number;
}

export class ClaudeHistory implements AgentHistory {
  readonly kind = 'claude-code' as const;
  private readonly projects: string;
  private readonly now: () => number;

  constructor(options: ClaudeHistoryOptions = {}) {
    const moved = options.configDir === undefined ? (process.env.CLAUDE_CONFIG_DIR?.trim() ?? '') : (options.configDir ?? '');
    this.projects = path.join(moved !== '' ? moved : path.join(options.home ?? os.homedir(), '.claude'), 'projects');
    this.now = options.now ?? Date.now;
  }

  /** The files of a folder's conversations, newest first, with what could not be listed. */
  private async files(folder: string): Promise<{ files: { id: string; file: string; mtimeMs: number; size: number }[]; notes: HistoryNote[] }> {
    const name = projectFolderName(folder);
    if (name === null) return { files: [], notes: [{ level: 'gap', text: 'This folder’s path is very long. The agent keeps such a folder’s conversations under a shortened name that cannot be worked out from here, so they are not listed.' }] };
    const dir = path.join(this.projects, name);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return { files: [], notes: [] };
      return { files: [], notes: [{ level: 'unreadable', text: 'The folder where the agent keeps this folder’s conversations could not be read. None are listed, though there may be some.' }] };
    }
    const found: { id: string; file: string; mtimeMs: number; size: number }[] = [];
    for (const entry of names) {
      if (!entry.endsWith('.jsonl')) continue;
      const id = entry.slice(0, -6);
      // Only a plain ID is a conversation: it may end up on a command line.
      if (!ConversationId.safeParse(id).success) continue;
      try {
        const info = await stat(path.join(dir, entry));
        if (info.isFile()) found.push({ id, file: path.join(dir, entry), mtimeMs: info.mtimeMs, size: info.size });
      } catch {
        // Gone between the listing and the look: not there.
      }
    }
    found.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { files: found, notes: [] };
  }

  async list(folder: string): Promise<HistoryFound> {
    const { files, notes } = await this.files(folder);
    const conversations: ConversationFound[] = [];
    let unreadable = 0;
    let unrecognised = 0;
    let elsewhere = 0;
    for (const { id, file, mtimeMs } of files.slice(0, LIST_MAX)) {
      const found = await this.summarise(folder, id, file, mtimeMs);
      if (found === 'unreadable') unreadable += 1;
      else if (found === 'unrecognised') unrecognised += 1;
      else if (found === 'elsewhere') elsewhere += 1;
      else if (found !== 'empty') conversations.push(found);
    }
    if (files.length > LIST_MAX) notes.push({ level: 'limit', text: `There are ${files.length} conversations here; the newest ${LIST_MAX} are listed.` });
    if (unreadable > 0) notes.push({ level: 'unreadable', text: `${unreadable} conversation${unreadable === 1 ? '' : 's'} could not be read and ${unreadable === 1 ? 'is' : 'are'} not listed.` });
    if (unrecognised > 0) notes.push({ level: 'unrecognised', text: `${unrecognised} record${unrecognised === 1 ? ' is' : 's are'} not in a form this was written to read, and ${unrecognised === 1 ? 'is' : 'are'} not listed. The agent may have changed how it keeps conversations.` });
    if (elsewhere > 0) notes.push({ level: 'gap', text: `${elsewhere} record${elsewhere === 1 ? '' : 's'} kept in the same place belong${elsewhere === 1 ? 's' : ''} to another folder with a similar path, and ${elsewhere === 1 ? 'is' : 'are'} left out.` });
    return { conversations, notes };
  }

  /** What one record says about its conversation, or why it is not listed. */
  private async summarise(folder: string, id: string, file: string, mtimeMs: number): Promise<ConversationFound | 'unreadable' | 'unrecognised' | 'elsewhere' | 'empty'> {
    let read: Awaited<ReturnType<typeof readSome>>;
    try {
      read = await readSome(file, LIST_WHOLE_BYTES, LIST_EDGE_BYTES);
    } catch {
      return 'unreadable';
    }
    let name: string | null = null;
    let first: string | null = null;
    let last: string | null = null;
    let startedAt: string | null = null;
    let lastAt: string | null = null;
    let turns = 0;
    let known = 0;
    let cwd: string | null = null;
    for (const line of read.lines) {
      const parsed = readLine(line);
      if (!parsed) continue;
      known += 1;
      if (parsed.title) name = parsed.title;
      cwd ??= parsed.cwd;
      if (parsed.at) {
        startedAt ??= parsed.at;
        lastAt = parsed.at;
      }
      for (const entry of parsed.entries) {
        if (entry.who !== 'you') continue;
        turns += 1;
        first ??= oneLine(entry.text);
        last = oneLine(entry.text);
      }
    }
    if (known === 0) return read.lines.length > 0 ? 'unrecognised' : 'empty';
    // Two folders can share a name once their paths are turned into one: a record that says it was written elsewhere is not this folder's.
    if (cwd !== null && cwd !== folder && !cwd.startsWith(`${folder}/`)) return 'elsewhere';
    return { id, name, firstPrompt: first, lastPrompt: last, startedAt, lastActiveAt: lastAt ?? new Date(mtimeMs).toISOString(), turns: read.partial ? null : turns };
  }

  /** One conversation of a folder in a few words, or null when it is not there or cannot be read. For saying what a terminal outside the canvas was about. */
  async summary(folder: string, id: string): Promise<ConversationFound | null> {
    if (!ConversationId.safeParse(id).success) return null;
    const { files } = await this.files(folder);
    const entry = files.find((file) => file.id === id);
    if (!entry) return null;
    const found = await this.summarise(folder, id, entry.file, entry.mtimeMs);
    return typeof found === 'string' ? null : found;
  }

  /** The file of one conversation of a folder, or null when there is none by that ID there. */
  private async fileOf(folder: string, id: string): Promise<string | null> {
    if (!ConversationId.safeParse(id).success) return null;
    const { files } = await this.files(folder);
    return files.find((entry) => entry.id === id)?.file ?? null;
  }

  async has(folder: string, id: string): Promise<boolean> {
    return (await this.fileOf(folder, id)) !== null;
  }

  async read(folder: string, id: string): Promise<TranscriptFound | null> {
    const file = await this.fileOf(folder, id);
    if (file === null) return null;
    const notes: HistoryNote[] = [];
    let read: Awaited<ReturnType<typeof readSome>>;
    try {
      read = await readSome(file, TRANSCRIPT_BYTES, TRANSCRIPT_BYTES / 2);
    } catch {
      return { name: null, entries: [], notes: [{ level: 'unreadable', text: 'This conversation’s record could not be read.' }] };
    }
    if (read.partial) notes.push({ level: 'limit', text: 'This conversation is very long: its beginning and its end are shown, and the middle is left out.' });
    const entries: TranscriptEntry[] = [];
    let name: string | null = null;
    let known = 0;
    let unknown = 0;
    for (const line of read.lines) {
      const parsed = readLine(line);
      if (!parsed) {
        unknown += 1;
        continue;
      }
      known += 1;
      if (parsed.title) name = parsed.title;
      for (const entry of parsed.entries) if (entries.length < TRANSCRIPT_ENTRIES) entries.push(entry);
    }
    if (known === 0 && read.lines.length > 0) notes.push({ level: 'unrecognised', text: 'This record is not in a form this was written to read, so nothing of it can be shown. The agent may have changed how it keeps conversations.' });
    else if (entries.length >= TRANSCRIPT_ENTRIES) notes.push({ level: 'limit', text: `Only the first ${TRANSCRIPT_ENTRIES} things said are shown.` });
    // Lines that are not messages are the agent's own bookkeeping; they are many, and saying how many helps nobody. A record that is mostly unknown is worth a word.
    if (known > 0 && unknown > known * 4) notes.push({ level: 'unrecognised', text: 'Much of this record is in a form this was not written to read. What is shown may leave things out.' });
    return { name, entries, notes };
  }

  async search(folders: readonly string[], query: string, limits: SearchLimits = DEFAULT_SEARCH_LIMITS): Promise<SearchFound> {
    const needle = query.toLowerCase();
    const started = this.now();
    const hits: HistoryHit[] = [];
    const notes: HistoryNote[] = [];
    let files = 0;
    let bytes = 0;
    let why = '';
    const all: { folder: string; id: string; file: string; mtimeMs: number; size: number }[] = [];
    for (const folder of folders) {
      const found = await this.files(folder);
      notes.push(...found.notes);
      all.push(...found.files.map((entry) => ({ ...entry, folder })));
    }
    // The newest conversations first, whichever folder they are in: when the search is cut short, it is the old ones that were not looked at.
    all.sort((a, b) => b.mtimeMs - a.mtimeMs);
    search: for (const { folder, id, file } of all) {
      if (files >= limits.files) why = `it looks at no more than ${limits.files} conversations`;
      else if (bytes >= limits.bytes) why = 'there is more text than it reads in one search';
      else if (this.now() - started >= limits.milliseconds) why = 'it took too long';
      else if (hits.length >= limits.hits) why = `it stops at ${limits.hits} matches`;
      if (why) break;
      let read: Awaited<ReturnType<typeof readSome>>;
      try {
        read = await readSome(file, Math.min(TRANSCRIPT_BYTES, Math.max(1, limits.bytes - bytes)), LIST_EDGE_BYTES);
      } catch {
        continue;
      }
      files += 1;
      bytes += read.bytes;
      let name: string | null = null;
      const inText: HistoryHit[] = [];
      for (const line of read.lines) {
        // A line that holds neither the words nor a name is not worth taking apart.
        if (!line.toLowerCase().includes(needle) && !/"(customTitle|aiTitle|title|summary)"/.test(line)) continue;
        const parsed = readLine(line);
        if (!parsed) continue;
        if (parsed.title) name = parsed.title;
        for (const entry of parsed.entries) {
          if (inText.length >= 3) break;
          const text = entry.who === 'tool' && entry.text === '' ? entry.label : entry.text;
          const index = text.toLowerCase().indexOf(needle);
          if (index < 0) continue;
          inText.push({ folder, id, name: null, where: 'text', who: entry.who, line: oneLine(text.slice(Math.max(0, index - 120), index + needle.length + 200)), at: entry.at });
        }
      }
      if (name !== null && name.toLowerCase().includes(needle)) hits.push({ folder, id, name, where: 'name', who: null, line: name, at: null });
      for (const hit of inText) {
        hits.push({ ...hit, name });
        if (hits.length >= limits.hits) continue search;
      }
    }
    return { hits: hits.slice(0, limits.hits), cutShort: why !== '', why: why ? `The search was cut short: ${why}. Older conversations were not looked at.` : '', searched: files, notes };
  }
}
