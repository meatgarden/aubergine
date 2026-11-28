import { describe, expect, it } from 'vitest';
import { DEFAULT_ROW_FORMAT, DEFAULT_TITLE_FORMAT, TEMPLATE_MAX, templatePart, templateParts } from '@aubergine/shared';
import { madeUp, formatSays, insertPart, partToWrite, partWhereWords } from './TitlesPart';

describe('Settings → Titles and rows', () => {
  it('says what is wrong in what is typed, and does not save a brace that is not closed', () => {
    expect(formatSays(DEFAULT_TITLE_FORMAT, 'title')).toEqual({ problems: [], saves: true });
    expect(formatSays(DEFAULT_ROW_FORMAT, 'row')).toEqual({ problems: [], saves: true });
    expect(formatSays('{state} {nope}', 'row')).toEqual({ problems: ['{nope} is not a placeholder. It is skipped; what can be used is listed under the field.'], saves: true });
    const open = formatSays('{state} {fol', 'row');
    expect(open.saves).toBe(false);
    expect(open.problems.at(-1)).toBe('It is not saved until the brace is closed.');
    expect(formatSays('{resume}', 'row').problems[0]).toMatch(/for a terminal’s title, not a row/);
    expect(formatSays('x'.repeat(TEMPLATE_MAX + 1), 'row').saves).toBe(false);
    expect(formatSays('', 'row')).toEqual({ problems: [], saves: true });
  });

  it('puts a placeholder where the caret is, over what is chosen, with the caret after it', () => {
    expect(insertPart('{state}  {time}', 8, 8, '{folder}')).toEqual({ text: '{state} {folder} {time}', caret: 16 });
    expect(insertPart('abc', 1, 2, '{x}')).toEqual({ text: 'a{x}c', caret: 4 });
    expect(insertPart('abc', 99, 99, '{x}')).toEqual({ text: 'abc{x}', caret: 6 });
    expect(insertPart('abc', 2, 1, '{x}')).toEqual({ text: 'ab{x}c', caret: 5 });
  });

  it('writes a field with a label to change, and says where each may be used', () => {
    expect(partToWrite(templatePart('field')!)).toBe('{field:Ticket}');
    expect(partToWrite(templatePart('state')!)).toBe('{state}');
    expect(partWhereWords(templatePart('resume')!)).toBe('title only');
    expect(partWhereWords(templatePart('state')!)).toBe('title and row');
    expect(templateParts().every((part) => partWhereWords(part) !== '')).toBe(true);
  });

  it('has a made-up terminal with something to say for the placeholders most used', () => {
    const made = madeUp(Date.parse('2026-03-01T12:00:00.000Z'));
    expect(made.cwd).toBeTruthy();
    expect(made.fields.map((field) => field.label)).toContain('Ticket');
    expect(made.attention.state).toBe('waiting');
    expect(made.lastOutputAt).toBe('2026-03-01T11:56:00.000Z');
  });
});
