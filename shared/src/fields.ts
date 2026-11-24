import { z } from 'zod';
import { DescribedBy } from './links';
import { PLAIN_LINE, PlainName } from './workflows';

/**
 * A terminal's fields: short pairs of a label and a value about it ("Ticket: DEMO-12"). The owner's, changed like
 * tags, and what the agent in it says about itself: each says which. The owner's win: where the owner set a label,
 * what the agent sends is kept on it as a suggestion. `setOwnField` and `removeOwnField` are the whole rule of what
 * a session may do; `ownerSetFields` is the owner's.
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

/** A field as it is sent: a label and a value, nothing else. Who set it is never taken from a request. */
export const FieldInput = z.object({ label: FieldLabel, value: FieldValue }).describe('One field: a label and its value.');
export type FieldInput = z.infer<typeof FieldInput>;

export const FieldSuggestion = z
  .object({ value: FieldValue, at: z.iso.datetime() })
  .describe('What the agent in the terminal would set this field to, where the owner set it: kept beside the owner\u2019s value until the owner uses it or changes the field.');
export type FieldSuggestion = z.infer<typeof FieldSuggestion>;

export const TerminalField = z
  .object({
    label: FieldLabel,
    value: FieldValue,
    source: DescribedBy.default('owner').describe('Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server.'),
    suggested: FieldSuggestion.optional(),
  })
  .describe('One field: a label and its value, and who set it.');
export type TerminalField = z.infer<typeof TerminalField>;

/** Whether two labels are the same label: compared without regard to case. */
export function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const labelsDiffer = (fields: readonly { label: string }[]): boolean => fields.every((field, i) => fields.findIndex((other) => sameLabel(other.label, field.label)) === i);

export const TerminalFields = z
  .array(TerminalField)
  .max(MAX_FIELDS)
  .refine(labelsDiffer, 'Two fields have the same label')
  .describe(`The fields of the terminal, in order: at most ${MAX_FIELDS}, each label once.`);
export type TerminalFields = z.infer<typeof TerminalFields>;

/** The whole list as the owner sends it: labels and values only. */
export const FieldsInput = z
  .array(FieldInput)
  .max(MAX_FIELDS)
  .refine(labelsDiffer, 'Two fields have the same label')
  .describe(`The fields of the terminal, in order: at most ${MAX_FIELDS}, each label once. Who set each is the server\u2019s to say: what is sent is the owner\u2019s, except a field sent exactly as it stood, which keeps who set it.`);
export type FieldsInput = z.infer<typeof FieldsInput>;

/**
 * A line as a person types it, `Label: value`, read as a field. The label is what stands before the first colon and
 * the value everything after it, so a value may hold colons of its own (an address). This is the whole rule of what a
 * line is; the problem is a sentence a person can act on.
 */
export function fieldFromLine(line: string): { field: FieldInput } | { problem: string } {
  const at = line.indexOf(':');
  if (at < 0) return { problem: 'Write a label, a colon, then the value, as in “Ticket: DEMO-12”.' };
  const label = line.slice(0, at).trim();
  const value = line.slice(at + 1).trim();
  if (label === '') return { problem: 'Write a label before the colon.' };
  if (value === '') return { problem: `Write a value after “${label.slice(0, FIELD_LABEL_MAX)}:”.` };
  if (!PLAIN_LINE.test(label) || !PLAIN_LINE.test(value)) return { problem: 'A field is one line of plain text, without control characters.' };
  if (label.length > FIELD_LABEL_MAX) return { problem: `A label is at most ${FIELD_LABEL_MAX} characters; this one has ${label.length}.` };
  if (value.length > FIELD_VALUE_MAX) return { problem: `A value is at most ${FIELD_VALUE_MAX} characters; this one has ${value.length}.` };
  const parsed = FieldInput.safeParse({ label, value });
  if (!parsed.success) return { problem: 'A field is one line of plain text, without control characters.' };
  return { field: parsed.data };
}

/** A field as the line that would make it, for editing. */
export function lineOfField(field: FieldInput): string {
  return `${field.label}: ${field.value}`;
}

/** Whether a field is the agent's own: one the agent in the terminal set, that the owner has not made theirs. */
export const isAgentField = (field: TerminalField): boolean => field.source === 'agent';

/** Why a label or a value sent by a session cannot be one, in one sentence; null when it can. */
function inputProblem(label: string, value: string): string | null {
  const name = label.trim();
  if (name === '') return 'A field needs a label: a few words saying what the value is.';
  if (name.includes(':')) return 'A label holds no colon.';
  const read = fieldFromLine(`${name}: ${value.trim()}`);
  return 'problem' in read ? read.problem : null;
}

/**
 * The agent in a terminal sets one of its fields. A label nobody set is added at the end as the agent's; the agent's
 * own is replaced where it stands; where the owner set that label, the owner's value stays and what was sent is
 * kept on it as `suggested` (`kept` is then false). The limit counts every field. This is the whole rule. `reason`
 * says why not: what was sent is not a field (`input`), or the terminal has as many as it can (`full`).
 */
export function setOwnField(fields: readonly TerminalField[], label: string, value: string, now: string): { fields: TerminalField[]; field: TerminalField; kept: boolean } | { problem: string; reason: 'input' | 'full' } {
  const problem = inputProblem(label, value);
  if (problem) return { problem, reason: 'input' };
  const sent = FieldInput.parse({ label, value });
  const existing = fields.find((field) => sameLabel(field.label, sent.label));
  if (!existing) {
    if (fields.length >= MAX_FIELDS) return { problem: `This terminal has ${fields.length} fields, the most it can have. Remove one of your own first, or leave this one out.`, reason: 'full' };
    const field: TerminalField = { ...sent, source: 'agent' };
    return { fields: [...fields, field], field, kept: true };
  }
  let field: TerminalField;
  if (isAgentField(existing)) field = { label: sent.label, value: sent.value, source: 'agent' };
  else if (existing.value === sent.value) {
    // The owner's value said again: nothing to suggest, and an earlier suggestion is no longer what the agent says.
    const { suggested: _suggested, ...kept } = existing;
    field = kept;
  } else field = { ...existing, suggested: { value: sent.value, at: now } };
  return { fields: fields.map((other) => (other === existing ? field : other)), field, kept: isAgentField(existing) || existing.value === sent.value };
}

/** The agent in a terminal removes one of its fields: only its own. `reason` says why not. */
export function removeOwnField(fields: readonly TerminalField[], label: string): { fields: TerminalField[] } | { problem: string; reason: 'none' | 'owners' } {
  const existing = fields.find((field) => sameLabel(field.label, label));
  if (!existing) return { problem: `This terminal has no field “${label.trim().slice(0, FIELD_LABEL_MAX)}”.`, reason: 'none' };
  if (!isAgentField(existing)) return { problem: `The field “${existing.label}” is your owner’s: only they remove it. Leave it as it is.`, reason: 'owners' };
  return { fields: fields.filter((field) => field !== existing) };
}

/**
 * The owner replaces the whole list. Each field sent is the owner's, except one sent exactly as it stood (the same
 * label and the same value), which keeps who set it. What the agent suggested for a label is dropped where the owner
 * changed its value, and kept otherwise.
 */
export function ownerSetFields(before: readonly TerminalField[], sent: readonly FieldInput[]): TerminalField[] {
  return sent.map(({ label, value }) => {
    const prior = before.find((field) => sameLabel(field.label, label));
    const asItStood = prior !== undefined && prior.label === label && prior.value === value;
    const suggested = prior?.suggested && prior.value === value ? prior.suggested : undefined;
    return { label, value, source: asItStood ? prior.source : 'owner', ...(suggested ? { suggested } : {}) };
  });
}

/** The owner uses what the agent suggested for a field: the value is put in place, and is the owner's. */
export function useSuggestedField(fields: readonly TerminalField[], label: string): { fields: TerminalField[] } | { problem: string } {
  const existing = fields.find((field) => sameLabel(field.label, label) && field.suggested);
  if (!existing?.suggested) return { problem: 'Nothing was suggested for that field.' };
  const field: TerminalField = { label: existing.label, value: existing.suggested.value, source: 'owner' };
  return { fields: fields.map((other) => (other === existing ? field : other)) };
}

/* ---------- What a session sends and is answered about its own fields ---------- */

export const SetOwnFieldRequest = z.object({
  label: z.string().max(200).describe('What the value is, in a few words: one line of plain text, without a colon, at most 40 characters. A label that is there already, whatever its capitals, is that field.'),
  value: z.string().max(1000).describe('The value: one line of plain text, at most 200 characters.'),
});
export type SetOwnFieldRequest = z.infer<typeof SetOwnFieldRequest>;

export const OwnFieldAnswer = z.object({
  field: TerminalField,
  kept: z.boolean().describe('False where the owner set this label: the owner\u2019s value stays, and what was sent is kept on it as a suggestion.'),
});
export type OwnFieldAnswer = z.infer<typeof OwnFieldAnswer>;

export const OwnFieldsAnswer = z.object({ fields: TerminalFields.describe('The fields of the terminal, in order, each saying who set it.') });
export type OwnFieldsAnswer = z.infer<typeof OwnFieldsAnswer>;
