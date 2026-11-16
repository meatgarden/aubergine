import { z } from 'zod';
import { Id } from './ids';

/**
 * Terminal access for programs: reading what a terminal shows, and typing
 * into one. This is where a token can make things happen in a terminal, so
 * everything here is narrow on purpose: text is text and is never read as
 * key names or escapes, keys come from a short fixed list, and anything that
 * is not plainly one or the other is refused.
 */

/* ---------- Which sessions a token may reach ---------- */

/**
 * Which sessions a token's terminal scopes apply to. Chosen when the token is
 * made; there is no silent "all".
 */
export const Reach = z.discriminatedUnion('kind', [
  /** Every session. */
  z.object({ kind: z.literal('all') }),
  /** Sessions on these canvases. A parked session is on none. */
  z.object({ kind: z.literal('canvases'), canvasIds: z.array(Id).min(1).max(50) }),
  /** Sessions that carry this tag. */
  z.object({ kind: z.literal('tag'), tag: z.string().trim().min(1).max(32) }),
]);
export type Reach = z.infer<typeof Reach>;

/** What `authorize` is told about a session when the question is about its terminal. */
export interface SessionFacts {
  /** The canvas it is on; null for a parked session. */
  canvasId: string | null;
  tags: readonly string[];
  /** "People only": no token may read or type, whatever its scopes. */
  peopleOnly: boolean;
}

/** Whether a reach covers a session. */
export function reaches(reach: Reach | null, session: SessionFacts): boolean {
  if (reach === null) return false;
  if (reach.kind === 'all') return true;
  if (reach.kind === 'canvases') return session.canvasId !== null && reach.canvasIds.includes(session.canvasId);
  const wanted = reach.tag.toLowerCase();
  return session.tags.some((tag) => tag.toLowerCase() === wanted);
}

/* ---------- Reading ---------- */

/** What a terminal shows now, as text. */
export const ScreenResponse = z.object({
  /** The visible rows, top to bottom, joined by line breaks. Text only: colors and other control sequences are not in it. */
  text: z.string(),
  columns: z.number().int(),
  rows: z.number().int(),
  /** Where the cursor is, counting from zero at the top left. */
  cursor: z.object({ x: z.number().int(), y: z.number().int() }),
});
export type ScreenResponse = z.infer<typeof ScreenResponse>;

export const OUTPUT_LINES_DEFAULT = 200;
export const OUTPUT_LINES_MAX = 2000;

export const OutputQuery = z.object({
  lines: z.coerce.number().int().min(1).max(OUTPUT_LINES_MAX).default(OUTPUT_LINES_DEFAULT).describe('How many lines to return at most, counted back from the end.'),
  cursor: z.string().min(1).max(64).optional().describe('The `nextCursor` of an earlier answer: read further back from there.'),
});
export type OutputQuery = z.infer<typeof OutputQuery>;

/** Recent history of a terminal, oldest line first. */
export const OutputResponse = z.object({
  /** Text only, a line break between lines. Long lines that the terminal wrapped are one line here. */
  text: z.string(),
  lines: z.number().int(),
  /** For reading further back; null when the beginning of what the terminal keeps was reached. */
  nextCursor: z.string().nullable(),
});
export type OutputResponse = z.infer<typeof OutputResponse>;

export const TerminalSearchQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).describe('How many matches to return at most.'),
  q: z.string().trim().min(2).max(200).describe('The text to look for. Capitals do not matter.'),
});
export type TerminalSearchQuery = z.infer<typeof TerminalSearchQuery>;

export const TerminalSearchResponse = z.object({
  hits: z.array(z.object({ sessionId: Id, /** The session's name, so that a hit can be told to a person. */ sessionName: z.string().default(''), text: z.string(), before: z.array(z.string()), after: z.array(z.string()) })),
  /** True when there were more matches than are returned. */
  truncated: z.boolean(),
  /** How many sessions were searched. */
  searched: z.number().int(),
  /** True when some sessions were not searched because this caller may not read them. Which ones is not said. */
  someLeftOut: z.boolean(),
});
export type TerminalSearchResponse = z.infer<typeof TerminalSearchResponse>;

/* ---------- Input ---------- */

/** The keys that can be pressed by name. A short, fixed list: nothing outside it can be sent as a key. */
export const NAMED_KEYS = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Space', 'Ctrl+C', 'Ctrl+D', 'Ctrl+Z', 'Ctrl+L', 'Ctrl+U', 'Ctrl+A', 'Ctrl+E', 'Ctrl+R'] as const;
export const NamedKey = z.enum(NAMED_KEYS);
export type NamedKey = z.infer<typeof NamedKey>;

/** The most text one call may carry, whatever the settings say. */
export const INPUT_TEXT_HARD_MAX = 20_000;
export const INPUT_KEYS_MAX = 32;

/**
 * Body of typing into a terminal: text, or keys, not both.
 *
 * `text` is typed exactly as it is. Nothing inside it is read as a key name
 * or an escape: "Enter" types the five letters. It may not hold control
 * characters. A line break is refused too, unless `paste` is set: then the
 * text is delivered as a paste (bracketed, where the program in the terminal
 * asked for that), which is how a terminal hands over several lines without
 * each line break being taken as the Enter key.
 */
export const InputRequest = z
  .object({
    text: z.string().min(1).max(INPUT_TEXT_HARD_MAX).optional().describe('Text to type, exactly as it is. No control characters; no line breaks unless `paste` is true.'),
    enter: z.boolean().default(false).describe('Press Enter after the text. Say so explicitly: text alone presses nothing.'),
    paste: z.boolean().default(false).describe('Deliver the text as a paste. Needed for text with line breaks.'),
    keys: z.array(NamedKey).min(1).max(INPUT_KEYS_MAX).optional().describe(`Keys to press, in order, from this list only: ${NAMED_KEYS.join(', ')}.`),
  })
  .refine((body) => (body.text === undefined) !== (body.keys === undefined), 'Give text or keys, one of the two')
  .refine((body) => body.keys === undefined || (!body.enter && !body.paste), '`enter` and `paste` go with text; with keys, name the Enter key in the list');
export type InputRequest = z.infer<typeof InputRequest>;

/**
 * What is wrong with text that was sent to be typed; null when it may be
 * typed. The rule is the whole of what the server does with the text: it
 * looks for characters that are not text, and refuses.
 */
export function inputProblem(text: string, paste: boolean): string | null {
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (char === '\n') {
      if (!paste) return 'The text has a line break. A line break in typed text would be the Enter key. Send one line with `enter`, or set `paste` to deliver it as a paste.';
      continue;
    }
    if (char === '\t') {
      if (!paste) return 'The text has a tab, which typed is the Tab key. Name the key in `keys`, or set `paste`.';
      continue;
    }
    // Everything else below a space, DEL, and the second block of control characters: key presses and escapes, not text.
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return `The text has a control character (U+${code.toString(16).toUpperCase().padStart(4, '0')}). Control characters are not typed as text; press keys by name with \`keys\`.`;
  }
  return null;
}

export const InputResponse = z.object({
  /** How many characters of text were typed. */
  typed: z.number().int(),
  /** How many keys were pressed, the Enter of `enter` included. */
  keys: z.number().int(),
});
export type InputResponse = z.infer<typeof InputResponse>;

/* ---------- Run and wait ---------- */

export const RUN_TIMEOUT_DEFAULT = 30;
export const RUN_TIMEOUT_MAX = 600;
export const RUN_OUTPUT_MAX_LINES = 2000;

export const RunCommandRequest = z.object({
  command: z.string().trim().min(1).max(4000).describe('One command line, typed at the shell prompt. One line: no line breaks, no control characters.'),
  timeoutSeconds: z.number().int().min(1).max(RUN_TIMEOUT_MAX).default(RUN_TIMEOUT_DEFAULT).describe('How long to wait for it to finish. When the time is up the answer says it is still going; nothing is stopped.'),
});
export type RunCommandRequest = z.infer<typeof RunCommandRequest>;

export const RunCommandResponse = z.object({
  /** False when the time was up before the shell reported the command finished. It is still going; nothing was stopped. */
  finished: z.boolean(),
  /** The exit code; null while it is still going. */
  exitCode: z.number().int().nullable(),
  /** What the terminal showed between the command and the next prompt, as text. Null for a caller that may type but not read. */
  output: z.string().nullable(),
  /** True when the output was longer than is returned, or its beginning could not be found (the screen was cleared). */
  outputCut: z.boolean(),
  /** How long it took, or how long was waited, in milliseconds. */
  durationMs: z.number().int(),
});
export type RunCommandResponse = z.infer<typeof RunCommandResponse>;

/** Body of switching "people only" on or off for a session. */
export const ProtectRequest = z.object({ peopleOnly: z.boolean().describe('True: no token may read this terminal or type into it, whatever its scopes.') });
export type ProtectRequest = z.infer<typeof ProtectRequest>;

/** Who typed into a session last through the API, for the owner to see. Not what was typed. */
export const TypedBy = z.object({ name: z.string().max(120), at: z.iso.datetime() });
export type TypedBy = z.infer<typeof TypedBy>;
