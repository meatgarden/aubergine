import { z } from 'zod';

/**
 * What a terminal's title and its row in the list say after the name, as the owner writes it: a template, text with
 * `{placeholder}`s in it, as terminal programs do for the titles of their tabs. `{{` and `}}` are a brace.
 *
 * The template carries no markup and no style. A placeholder is registered here with a kind, and the page draws each
 * kind the one way it draws that thing elsewhere: the state in the color of that state, a link as a chip, a value with
 * an address in it with its chip. This module parses a template (`parseTemplate`) and decides which of its pieces are
 * drawn (`renderTemplate`); it knows nothing about terminals. What each placeholder says about one is the page's.
 */

/** Where a template is drawn: a terminal's title (on the canvas and at the head of the focus view), or its row in the list. */
export type TemplateWhere = 'title' | 'row';
export const TEMPLATE_PLACES: readonly TemplateWhere[] = ['title', 'row'];
const PLACE_WORDS: Record<TemplateWhere, string> = { title: 'a terminal’s title', row: 'a row of the list' };

/**
 * How the page draws what a placeholder says. `words`: plain words, cut where there is no room, with the whole in a
 * tooltip. `state`: the state in words in the color of that state. `step`: the step of a run, pressed for the run.
 * `time`: one time, in a few characters. `tags`: the tags, pressed as tags are. `links`: the marks of links, each a chip.
 * `link`: one link, a chip. `field`: a field's value, an address in it a chip. `mark`: one of the marks a title or a
 * row has had all along, drawn as it always was.
 */
export const TEMPLATE_KINDS = ['words', 'state', 'step', 'time', 'tags', 'links', 'link', 'field', 'mark'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export interface TemplatePart {
  /** What is written between the braces: lowercase letters and hyphens. */
  name: string;
  /** What it says, in one line, for the list under the field and the reference. */
  says: string;
  /** Where it may be used. */
  where: readonly TemplateWhere[];
  kind: TemplateKind;
  /** It takes a label after a colon, as `{field:Ticket}` does; `name` is then written with it. */
  takesLabel?: boolean;
}

const PART_NAME = /^[a-z][a-z-]*$/;
const parts = new Map<string, TemplatePart>();

/** Adds a placeholder. Its name is new; a later stage adds its own the same way. */
export function registerTemplatePart(part: TemplatePart): void {
  if (!PART_NAME.test(part.name)) throw new Error(`A placeholder's name is lowercase letters and hyphens: ${part.name}`);
  if (parts.has(part.name)) throw new Error(`The placeholder {${part.name}} is already registered`);
  if (part.where.length === 0) throw new Error(`The placeholder {${part.name}} is for no place`);
  parts.set(part.name, part);
  changed();
}

/**
 * Takes a placeholder away again: for a plugin's, when the plugin is switched off. The ones registered here stay; a
 * template that names a placeholder that went is said and skipped as for any unknown one.
 */
export function unregisterTemplatePart(name: string): void {
  if (parts.delete(name)) changed();
}

const listeners = new Set<() => void>();
let version = 0;
function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}
/** A number that changes each time a placeholder is added or taken away: what a template was read against. */
export const templatePartsVersion = (): number => version;
/** Tells a listener each time a placeholder is added or taken away, so that templates are read again. */
export function onTemplateParts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every placeholder, in the order registered. */
export const templateParts = (): readonly TemplatePart[] => [...parts.values()];
/** The placeholder of a name: only a registered name is one (a map, so `__proto__` is no name). */
export const templatePart = (name: string): TemplatePart | undefined => parts.get(name);
/** How a placeholder is written: `{state}`, `{field:<label>}`. */
export const writtenPart = (part: TemplatePart): string => (part.takesLabel ? `{${part.name}:<label>}` : `{${part.name}}`);

const both: readonly TemplateWhere[] = ['title', 'row'];
const title: readonly TemplateWhere[] = ['title'];

// What a title and a row have always said, and what is known about a terminal that could be said there too.
registerTemplatePart({ name: 'state', kind: 'state', where: both, says: 'Its state in words where it is not the ordinary one, in that state’s color: waiting for you, finished; on a row also working and a failed exit.' });
registerTemplatePart({ name: 'exit', kind: 'mark', where: title, says: 'How its last command ended, where it failed: exit 2.' });
registerTemplatePart({ name: 'untold', kind: 'mark', where: title, says: 'That a sentence could not be typed for its agent lately: not told.' });
registerTemplatePart({ name: 'messages', kind: 'mark', where: title, says: 'Its messages, where some are unread or for you: pressed to read them.' });
registerTemplatePart({ name: 'activity', kind: 'words', where: both, says: 'What it is doing: the command running now, else the program and its folder.' });
registerTemplatePart({ name: 'command', kind: 'words', where: both, says: 'What runs: the command running now, else the program it was started with, short; the whole line when pointed at.' });
registerTemplatePart({ name: 'folder', kind: 'words', where: both, says: 'Its folder, the last two parts; the whole path when pointed at.' });
registerTemplatePart({ name: 'step', kind: 'step', where: both, says: 'The step of the run it is on, and how many there are: pressed for the whole run.' });
registerTemplatePart({ name: 'copy', kind: 'mark', where: title, says: 'The working copy it works in: its branch and how many files changed, pressed for what changed.' });
registerTemplatePart({ name: 'list', kind: 'mark', where: both, says: 'A list its agent handed in, and how much of it is ticked: pressed to open it.' });
registerTemplatePart({ name: 'standing', kind: 'words', where: both, says: 'Whether it is parked or its shell has ended, and the agent a terminal read in from a file was meant for.' });
registerTemplatePart({ name: 'time', kind: 'time', where: both, says: 'When it was last typed into or last printed, whichever is later: 4m ago.' });
registerTemplatePart({ name: 'typed-by', kind: 'mark', where: both, says: 'Which API token typed into it last: in a title for half a minute, on a row with the time.' });
registerTemplatePart({ name: 'desktop', kind: 'mark', where: title, says: 'That something outside the page shows it too, most likely a window of your terminal application: also on desktop.' });
registerTemplatePart({ name: 'resume', kind: 'mark', where: title, says: 'Resume agent, where its agent can be started again in the conversation it was last in.' });
registerTemplatePart({ name: 'people-only', kind: 'mark', where: both, says: 'That no API token may read it or type into it: people only.' });
registerTemplatePart({ name: 'links', kind: 'links', where: title, says: 'The marks of at most three of its links, the ticket and the pull request first: each pressed to open.' });
registerTemplatePart({ name: 'tags', kind: 'tags', where: both, says: 'Its tags: in a title the first and how many more, pressed to change them; on a row each one, pressed to list only those.' });
registerTemplatePart({ name: 'canvas', kind: 'words', where: both, says: 'The name of the canvas it is on.' });
registerTemplatePart({ name: 'project', kind: 'words', where: both, says: 'The name of its project.' });
registerTemplatePart({ name: 'theme', kind: 'words', where: both, says: 'The name of the color theme its body is drawn in.' });
registerTemplatePart({ name: 'agent', kind: 'words', where: both, says: 'The agent on record in it: the program seen in front when it last reported, else its kind.' });
registerTemplatePart({ name: 'branch', kind: 'words', where: both, says: 'The branch of its folder, as found by looking there.' });
registerTemplatePart({ name: 'pull-request', kind: 'link', where: both, says: 'The pull request of that branch, where the gh tool told one: a chip, pressed to open it.' });
registerTemplatePart({ name: 'field', kind: 'field', where: both, takesLabel: true, says: 'The value of its field with that label, whatever the capitals: {field:Ticket}. An address in it is a chip.' });

/** How long a template may be, and what it may hold: one line, without control characters. */
export const TEMPLATE_MAX = 200;
const TEMPLATE_LINE = /^[^\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]*$/u;
/** A template as a request sends it and the settings file holds it. */
export const TemplateText = z.string().max(TEMPLATE_MAX).regex(TEMPLATE_LINE, 'A template is one line, without control characters.');

/**
 * What a terminal's title says after its name, by default: exactly what it said before there were templates, in the
 * same order. Spaces between placeholders draw nothing of their own.
 */
export const DEFAULT_TITLE_FORMAT = '{state} {exit} {untold} {messages} {activity} {copy} {list} {typed-by} {desktop} {resume} {people-only} {links} {tags}';
/** What a row of the list says on its second line, by default: what it said before there were templates. */
export const DEFAULT_ROW_FORMAT = '{state} {step} {standing} {time} {people-only} {typed-by} {tags}';
export const DEFAULT_FORMAT: Record<TemplateWhere, string> = { title: DEFAULT_TITLE_FORMAT, row: DEFAULT_ROW_FORMAT };

/** A piece of a template as written: text, or a placeholder (with the label of `{field:<label>}`). */
export type TemplatePiece = { text: string } | { part: string; label?: string };

export interface ParsedTemplate {
  pieces: TemplatePiece[];
  /** Each thing that is wrong, in a sentence; what is wrong is skipped and the rest still drawn. */
  problems: string[];
  /** A `{` that is never closed: the page does not save such a template while it is typed. */
  unclosed: boolean;
}

const LABEL_MAX = 40;
const quote = (text: string): string => text.replace(/[^\x20-\x7e]/g, '?').slice(0, 40);

/**
 * Reads a template for one place. Text is kept as written, `{{` and `}}` as braces. A placeholder that is not
 * registered, is not for this place, is `{name}`, or is a `{field:}` without a label is said in a sentence and
 * skipped. A `{` with no `}` after it is said and the rest of the line taken as text; a `}` alone is said and kept as
 * text. Pure.
 */
export function parseTemplate(text: string, where: TemplateWhere): ParsedTemplate {
  const pieces: TemplatePiece[] = [];
  const problems: string[] = [];
  let unclosed = false;
  let literal = '';
  const flush = (): void => {
    if (literal !== '') pieces.push({ text: literal });
    literal = '';
  };
  const say = (problem: string): void => {
    if (!problems.includes(problem)) problems.push(problem);
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    if (char === '{' && text[i + 1] === '{') {
      literal += '{';
      i += 1;
      continue;
    }
    if (char === '}') {
      if (text[i + 1] === '}') i += 1;
      else say('A } stands alone: it is drawn as it is. Write }} for a brace.');
      literal += '}';
      continue;
    }
    if (char !== '{') {
      literal += char;
      continue;
    }
    const end = text.indexOf('}', i + 1);
    const nested = text.indexOf('{', i + 1);
    if (end < 0 || (nested >= 0 && nested < end)) {
      unclosed = true;
      say('A { is not closed: write the placeholder’s name and a }, or {{ for a brace.');
      literal += char;
      continue;
    }
    const inside = text.slice(i + 1, end).trim();
    i = end;
    const colon = inside.indexOf(':');
    const name = (colon < 0 ? inside : inside.slice(0, colon)).trim();
    const label = colon < 0 ? undefined : inside.slice(colon + 1).trim();
    if (name === 'name') {
      say('{name} is not needed: the name always comes first, before what the template says. It is skipped.');
      continue;
    }
    const part = templatePart(name);
    if (!part) {
      say(`{${quote(inside)}} is not a placeholder. It is skipped; what can be used is listed under the field.`);
      continue;
    }
    if (!part.where.includes(where)) {
      say(`{${part.name}} is for ${part.where.map((w) => PLACE_WORDS[w]).join(' and ')}, not ${PLACE_WORDS[where]}. It is skipped.`);
      continue;
    }
    if (part.takesLabel) {
      if (!label) {
        say(`{${part.name}:} needs a label after the colon, as in {${part.name}:Ticket}. It is skipped.`);
        continue;
      }
      if (label.length > LABEL_MAX || label.includes(':')) {
        say(`{${part.name}:${quote(label)}} has a label no field can have: at most ${LABEL_MAX} characters, without a colon. It is skipped.`);
        continue;
      }
      flush();
      pieces.push({ part: part.name, label });
      continue;
    }
    if (label !== undefined) {
      say(`{${part.name}} takes nothing after a colon: write {${part.name}}. It is skipped.`);
      continue;
    }
    flush();
    pieces.push({ part: part.name });
  }
  flush();
  return { pieces, problems, unclosed };
}

/** What is drawn of a template: text, or what a placeholder says. */
export type DrawnPiece<T> = { text: string } | { part: string; label?: string; value: T };

/**
 * Which pieces of a template are drawn, given what each placeholder says (`said`: null where it has nothing to say).
 * A placeholder with nothing to say is left out, and so is the text that would hang from it, by one rule:
 *
 *   Text after a placeholder is drawn only when that placeholder said something and a later one does too; text
 *   before the first placeholder only when the first said something; text after the last only when the last said
 *   something. A template with no placeholder is drawn as written.
 *
 * So `{state} · {step} · {time}` never shows a dot with nothing on one side of it. Text that is only spaces is not
 * drawn: what stands in a line is spaced by the line itself. Pure.
 */
export function renderTemplate<T>(pieces: readonly TemplatePiece[], said: (piece: { part: string; label?: string }) => T | null): DrawnPiece<T>[] {
  const values = pieces.map((piece) => ('part' in piece ? said(piece) : null));
  const placeholders = pieces.flatMap((piece, i) => ('part' in piece ? [i] : []));
  const spoke = (i: number): boolean => values[i] !== null && values[i] !== undefined;
  const first = placeholders[0];
  const last = placeholders.at(-1);
  const out: DrawnPiece<T>[] = [];
  pieces.forEach((piece, i) => {
    if ('part' in piece) {
      if (spoke(i)) out.push({ ...piece, value: values[i] as T });
      return;
    }
    if (piece.text.trim() === '') return;
    const before = placeholders.filter((p) => p < i).at(-1);
    const after = placeholders.find((p) => p > i);
    let shown: boolean;
    if (first === undefined) shown = true;
    else if (before === undefined) shown = spoke(first);
    else if (after === undefined) shown = last !== undefined && spoke(last);
    else shown = spoke(before) && placeholders.some((p) => p > i && spoke(p));
    if (shown) out.push({ text: piece.text });
  });
  return out;
}

/** A template from the settings that is not one (not text, too long, more than a line) is the default, by itself. */
export const titleFormat = TemplateText.default(DEFAULT_TITLE_FORMAT).catch(DEFAULT_TITLE_FORMAT);
export const rowFormat = TemplateText.default(DEFAULT_ROW_FORMAT).catch(DEFAULT_ROW_FORMAT);

/** The rule of what hangs from a placeholder, in the words `renderTemplate` follows. */
export const SEPARATOR_RULE =
  'Text after a placeholder is drawn only when that placeholder said something and a later one does too; text before the first placeholder only when the first said something; text after the last only when the last said something. A template with no placeholder is drawn as written, and text that is only spaces draws nothing of its own.';

const KIND_WORDS: Record<TemplateKind, string> = {
  words: 'words',
  state: 'the state',
  step: 'a step',
  time: 'a time',
  tags: 'tags',
  links: 'link chips',
  link: 'a link chip',
  field: 'a field',
  mark: 'a mark',
};

/** The reference of the language and of every placeholder, from the registry: `docs/templates.md`. */
export function templateReferencePage(): string {
  const cell = (text: string): string => text.replace(/\|/g, '\\|');
  const rows = templateParts().map((part) => `| \`${writtenPart(part)}\` | ${part.where.map((w) => (w === 'title' ? 'title' : 'row')).join(', ')} | ${KIND_WORDS[part.kind]} | ${cell(part.says)} |`);
  return [
    '# Titles and rows',
    '',
    'What a terminal’s title says after its name, and what its row in the list says on its second line, are two templates in the settings: `appearance.titleFormat` and `appearance.rowFormat`. They are changed in Settings → Appearance, Titles and rows (the command “Titles and rows: what they show”), or written by hand in `config.json`. The title’s template is drawn on the canvas and at the head of a terminal in a browser tab of its own; the row’s on the second line of a row (a row of one line, “One line per terminal”, says its state alone, beside the name).',
    '',
    '## The language',
    '',
    `A template is one line of at most ${TEMPLATE_MAX} characters, without control characters: text, with placeholders in braces. \`{{\` and \`}}\` are a brace. The name always comes first and is not part of a template, so \`{name}\` is not a placeholder.`,
    '',
    '- Text is drawn as it is written, as text: a template carries no markup and no style.',
    '- A placeholder is drawn the way the page draws that thing everywhere else: the state in the color of that state, a link as a chip, a field’s value with any address in it as a chip, the step of a run pressed for the run.',
    '- A placeholder that is not known, is not for that place, or is a `{field:}` without a label is said in Settings, under the field, and skipped; the rest is still drawn. A `{` that is not closed is said too, and the template is not saved until it is.',
    '- A template in the file that is not one as a whole (not text, too long, more than one line) is the default, by itself.',
    '',
    '## What hangs from a placeholder',
    '',
    'A placeholder with nothing to say is left out, and so is the text that would hang from it:',
    '',
    `> ${SEPARATOR_RULE}`,
    '',
    'So `{state} · {step} · {time}` never shows a dot with nothing on one side of it. On a row, two pieces with nothing written between them have the row’s own quiet dot between them; text written between them stands there instead.',
    '',
    '## What stays as it is',
    '',
    'Whatever a template says: the name comes first, and in a title the dot of its state before it; the title is one row that never wraps and the row’s second line one line; the name gives way first, then the marks, and a state is never cut; the tools at the end of a title (Note, Details, Tab, the menu) stay at its right end; text is in the sizes of the page.',
    '',
    '## The placeholders',
    '',
    '| Placeholder | Where | Drawn as | What it says |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## The defaults',
    '',
    'They draw what a title and a row drew before there were templates:',
    '',
    `- Title: \`${DEFAULT_TITLE_FORMAT}\``,
    `- Row: \`${DEFAULT_ROW_FORMAT}\``,
    '',
    '## Examples',
    '',
    '- A title that says where it works and its ticket: `{state} {folder} · {field:Ticket} {links} {tags}`',
    '- A row that says its folder and its branch: `{state} {step} {folder} · {branch} {time}`',
    '- A row with words between: `{state} on {canvas}, {time}`. With nothing to say on its canvas, it reads `waiting for you`, not `waiting for you on ,`.',
  ].join('\n');
}
