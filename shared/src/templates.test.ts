import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROW_FORMAT,
  DEFAULT_TITLE_FORMAT,
  TEMPLATE_KINDS,
  TEMPLATE_MAX,
  TemplateText,
  parseTemplate,
  registerTemplatePart,
  renderTemplate,
  rowFormat,
  templatePart,
  templateParts,
  titleFormat,
  type TemplatePiece,
} from './templates';
import { DEFAULT_SETTINGS, Settings } from './settings';

/** Draws a template as text, with what each placeholder says from a table; a missing entry says nothing. */
function draw(template: string, says: Record<string, string>, where: 'title' | 'row' = 'row'): string {
  const { pieces } = parseTemplate(template, where);
  return renderTemplate(pieces, (piece) => says[piece.label === undefined ? piece.part : `${piece.part}:${piece.label}`] ?? null)
    .map((piece) => ('text' in piece ? piece.text : `<${piece.value}>`))
    .join('');
}

describe('parseTemplate', () => {
  it('reads text and placeholders, and braces doubled as braces', () => {
    expect(parseTemplate('in {folder} {{x}} on {canvas}', 'row')).toEqual({
      pieces: [{ text: 'in ' }, { part: 'folder' }, { text: ' {x} on ' }, { part: 'canvas' }],
      problems: [],
      unclosed: false,
    });
    expect(parseTemplate('{{{folder}}}', 'row').pieces).toEqual([{ text: '{' }, { part: 'folder' }, { text: '}' }]);
    expect(parseTemplate('', 'row')).toEqual({ pieces: [], problems: [], unclosed: false });
    expect(parseTemplate('plain words', 'title').pieces).toEqual([{ text: 'plain words' }]);
  });

  it('says each wrong placeholder in a sentence, skips it and keeps the rest', () => {
    const parsed = parseTemplate('{state} {nope} {name} {resume} {field:} {folder:x} {field:a:b} {time}', 'row');
    expect(parsed.pieces.filter((piece) => 'part' in piece)).toEqual([{ part: 'state' }, { part: 'time' }]);
    expect(parsed.unclosed).toBe(false);
    expect(parsed.problems).toEqual([
      '{nope} is not a placeholder. It is skipped; what can be used is listed under the field.',
      '{name} is not needed: the name always comes first, before what the template says. It is skipped.',
      '{resume} is for a terminal’s title, not a row of the list. It is skipped.',
      '{field:} needs a label after the colon, as in {field:Ticket}. It is skipped.',
      '{folder} takes nothing after a colon: write {folder}. It is skipped.',
      '{field:a:b} has a label no field can have: at most 40 characters, without a colon. It is skipped.',
    ]);
    // Said once, however often it is written.
    expect(parseTemplate('{nope}{nope}', 'row').problems).toHaveLength(1);
  });

  it('says a brace that is not closed, and keeps what follows as text', () => {
    const open = parseTemplate('{state} {folder', 'row');
    expect(open.unclosed).toBe(true);
    expect(open.pieces).toEqual([{ part: 'state' }, { text: ' {folder' }]);
    expect(open.problems[0]).toMatch(/not closed/);
    // A { inside a placeholder: the first is not closed.
    const nested = parseTemplate('{fol{der}}', 'row');
    expect(nested.unclosed).toBe(true);
    expect(nested.problems.some((p) => /not a placeholder/.test(p))).toBe(true);
    // A } alone is drawn as it is, and said.
    const lone = parseTemplate('a } b', 'row');
    expect(lone).toEqual({ pieces: [{ text: 'a } b' }], problems: ['A } stands alone: it is drawn as it is. Write }} for a brace.'], unclosed: false });
  });

  it('takes a field by any label a field can have, with spaces and capitals as written', () => {
    expect(parseTemplate('{field:Ticket}', 'title').pieces).toEqual([{ part: 'field', label: 'Ticket' }]);
    expect(parseTemplate('{field: Due date }', 'row').pieces).toEqual([{ part: 'field', label: 'Due date' }]);
    expect(parseTemplate('{field:Prix €}', 'row').pieces).toEqual([{ part: 'field', label: 'Prix €' }]);
    expect(parseTemplate(`{field:${'x'.repeat(41)}}`, 'row').pieces).toEqual([]);
    expect(parseTemplate('{ state }', 'row').pieces).toEqual([{ part: 'state' }]);
  });

  it('is not fooled by names an object has by default, or by hostile text', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'STATE', 'state ', '']) {
      const parsed = parseTemplate(`{${name}}`, 'row');
      if (name.trim() === 'state') expect(parsed.pieces).toEqual([{ part: 'state' }]);
      else expect(parsed.pieces, name).toEqual([]);
    }
    // Markup is text, drawn as text by the page.
    expect(parseTemplate('<b onclick="x">{folder}</b>', 'row').pieces).toEqual([{ text: '<b onclick="x">' }, { part: 'folder' }, { text: '</b>' }]);
    // A very long line is read whole, and quickly.
    const long = '{folder} · '.repeat(5000);
    const started = Date.now();
    expect(parseTemplate(long, 'row').pieces).toHaveLength(10_000);
    expect(Date.now() - started).toBeLessThan(2000);
    // Many braces never closed.
    expect(parseTemplate('{a'.repeat(1000), 'row').unclosed).toBe(true);
    // Braces doubled are braces, however many.
    expect(parseTemplate('{'.repeat(1000), 'row').pieces).toEqual([{ text: '{'.repeat(500) }]);
  });
});

describe('renderTemplate: the rule of what hangs from a placeholder', () => {
  const all = { state: 'S', step: 'P', time: 'T' };
  it('draws what each placeholder says, in order', () => {
    expect(draw('{state} · {step} · {time}', all)).toBe('<S> · <P> · <T>');
  });

  it('never leaves a separator with nothing on one side', () => {
    const template = '{state} · {step} · {time}';
    expect(draw(template, { step: 'P', time: 'T' })).toBe('<P> · <T>');
    expect(draw(template, { state: 'S', time: 'T' })).toBe('<S> · <T>');
    expect(draw(template, { state: 'S', step: 'P' })).toBe('<S> · <P>');
    expect(draw(template, { state: 'S' })).toBe('<S>');
    expect(draw(template, { step: 'P' })).toBe('<P>');
    expect(draw(template, { time: 'T' })).toBe('<T>');
    expect(draw(template, {})).toBe('');
  });

  it('keeps text before the first and after the last only with them', () => {
    expect(draw('[{state}]', { state: 'S' })).toBe('[<S>]');
    expect(draw('[{state}]', {})).toBe('');
    expect(draw('in {folder}, on {canvas}!', { folder: 'F' })).toBe('in <F>');
    expect(draw('in {folder}, on {canvas}!', { canvas: 'C' })).toBe('<C>!');
    expect(draw('in {folder}, on {canvas}!', { folder: 'F', canvas: 'C' })).toBe('in <F>, on <C>!');
  });

  it('draws a template without placeholders as written, and leaves out text that is only spaces', () => {
    expect(draw('just words', {})).toBe('just words');
    expect(draw('{state} {step}   {time}', all)).toBe('<S><P><T>');
    expect(draw('{state}{step}', { step: 'P' })).toBe('<P>');
  });

  it('keeps separators of different kinds apart', () => {
    expect(draw('{state} | {step} / {time}', { state: 'S', time: 'T' })).toBe('<S> | <T>');
    expect(draw('{state} | {step} / {time}', { step: 'P', time: 'T' })).toBe('<P> / <T>');
  });

  it('draws a placeholder written twice twice, and a skipped one as if it were not there', () => {
    expect(draw('{time} {time}', { time: 'T' })).toBe('<T><T>');
    expect(draw('{state} · {nope} · {time}', { state: 'S', time: 'T' })).toBe('<S> ·  · <T>');
  });

  it('gives a field its label', () => {
    expect(draw('Ticket {field:Ticket}', { 'field:Ticket': 'DEMO-12' })).toBe('Ticket <DEMO-12>');
    expect(draw('Ticket {field:Ticket}', {})).toBe('');
  });

  it('hands each kind of placeholder its own value, whatever it is', () => {
    const { pieces } = parseTemplate('{state} {step}', 'row');
    const drawn = renderTemplate(pieces, (piece) => ({ kind: templatePart(piece.part)?.kind }));
    expect(drawn).toEqual([
      { part: 'state', value: { kind: 'state' } },
      { part: 'step', value: { kind: 'step' } },
    ]);
  });
});

describe('the placeholders', () => {
  it('each has a name, a kind, a place and one line that says what it is', () => {
    expect(templateParts().length).toBeGreaterThan(20);
    for (const part of templateParts()) {
      expect(TEMPLATE_KINDS).toContain(part.kind);
      expect(part.says, part.name).toMatch(/^[^\n]{10,200}$/);
      expect(part.where.length).toBeGreaterThan(0);
    }
  });

  it('can be added to, once per name', () => {
    expect(() => registerTemplatePart({ name: 'state', kind: 'words', where: ['row'], says: 'twice' })).toThrow();
    expect(() => registerTemplatePart({ name: 'Bad Name', kind: 'words', where: ['row'], says: 'bad' })).toThrow();
  });

  it('the defaults read without a problem, each where it is used', () => {
    expect(parseTemplate(DEFAULT_TITLE_FORMAT, 'title').problems).toEqual([]);
    expect(parseTemplate(DEFAULT_ROW_FORMAT, 'row').problems).toEqual([]);
    expect(DEFAULT_TITLE_FORMAT.length).toBeLessThanOrEqual(TEMPLATE_MAX);
  });
});

describe('the two settings', () => {
  it('are the defaults where nothing is written, and where what is written is not a template', () => {
    expect(DEFAULT_SETTINGS.appearance.titleFormat).toBe(DEFAULT_TITLE_FORMAT);
    expect(DEFAULT_SETTINGS.appearance.rowFormat).toBe(DEFAULT_ROW_FORMAT);
    for (const wrong of [3, null, ['{state}'], 'x'.repeat(TEMPLATE_MAX + 1), 'two\nlines', 'a\u0007bell', 'a‮reversed']) {
      expect(titleFormat.parse(wrong), String(wrong)).toBe(DEFAULT_TITLE_FORMAT);
      expect(rowFormat.parse(wrong), String(wrong)).toBe(DEFAULT_ROW_FORMAT);
    }
    const read = Settings.parse({ appearance: { titleFormat: '{folder}', rowFormat: 7, light: 'light' } });
    expect(read.appearance.titleFormat).toBe('{folder}');
    expect(read.appearance.rowFormat).toBe(DEFAULT_ROW_FORMAT);
  });

  it('take a template with problems in it: those are said where it is drawn', () => {
    expect(TemplateText.safeParse('{nope} {state').success).toBe(true);
    expect(TemplateText.safeParse('x'.repeat(TEMPLATE_MAX)).success).toBe(true);
    expect(TemplateText.safeParse('x'.repeat(TEMPLATE_MAX + 1)).success).toBe(false);
    expect(TemplateText.safeParse('tab\there').success).toBe(false);
  });
});

// The pieces of a template are only ever text or a placeholder: nothing that would be markup or a style.
const _kinds: TemplatePiece[] = [{ text: '' }, { part: 'state' }];
void _kinds;
