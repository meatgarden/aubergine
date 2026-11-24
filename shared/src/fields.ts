import { z } from 'zod';
import { PLAIN_LINE, PlainName } from './workflows';

/**
 * A terminal's fields: short pairs of a label and a value the owner keeps about it ("Ticket: DEMO-12"). The owner's
 * own words, changed like tags; nothing an agent sends becomes one.
 */

export const MAX_FIELDS = 12;
export const FIELD_LABEL_MAX = 40;
export const FIELD_VALUE_MAX = 200;

export const FieldLabel = PlainName.max(FIELD_LABEL_MAX)
  .regex(/^[^:]*$/, 'A label holds no colon')
  .describe('What the value is, in a few words: one line of plain text, without a colon.');

export const FieldValue = z
  .string()
  .trim()
  .min(1)
  .max(FIELD_VALUE_MAX)
  .regex(PLAIN_LINE, 'A value is one line of plain text, without control characters')
  .describe('The value: one line of plain text. An address in it is shown as a link.');

export const TerminalField = z.object({ label: FieldLabel, value: FieldValue }).describe('One field: a label and its value.');
export type TerminalField = z.infer<typeof TerminalField>;

/** Whether two labels are the same label: compared without regard to case. */
export function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const TerminalFields = z
  .array(TerminalField)
  .max(MAX_FIELDS)
  .refine((fields) => fields.every((field, i) => fields.findIndex((other) => sameLabel(other.label, field.label)) === i), 'Two fields have the same label')
  .describe(`The fields of the terminal, in order: at most ${MAX_FIELDS}, each label once.`);
export type TerminalFields = z.infer<typeof TerminalFields>;

/**
 * A line as a person types it, `Label: value`, read as a field. The label is what stands before the first colon and
 * the value everything after it, so a value may hold colons of its own (an address). This is the whole rule of what a
 * line is; the problem is a sentence a person can act on.
 */
export function fieldFromLine(line: string): { field: TerminalField } | { problem: string } {
  const at = line.indexOf(':');
  if (at < 0) return { problem: 'Write a label, a colon, then the value, as in “Ticket: DEMO-12”.' };
  const label = line.slice(0, at).trim();
  const value = line.slice(at + 1).trim();
  if (label === '') return { problem: 'Write a label before the colon.' };
  if (value === '') return { problem: `Write a value after “${label.slice(0, FIELD_LABEL_MAX)}:”.` };
  if (!PLAIN_LINE.test(label) || !PLAIN_LINE.test(value)) return { problem: 'A field is one line of plain text, without control characters.' };
  if (label.length > FIELD_LABEL_MAX) return { problem: `A label is at most ${FIELD_LABEL_MAX} characters; this one has ${label.length}.` };
  if (value.length > FIELD_VALUE_MAX) return { problem: `A value is at most ${FIELD_VALUE_MAX} characters; this one has ${value.length}.` };
  const parsed = TerminalField.safeParse({ label, value });
  if (!parsed.success) return { problem: 'A field is one line of plain text, without control characters.' };
  return { field: parsed.data };
}

/** A field as the line that would make it, for editing. */
export function lineOfField(field: TerminalField): string {
  return `${field.label}: ${field.value}`;
}
