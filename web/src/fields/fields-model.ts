import { MAX_FIELDS, sameLabel, showControl, type TerminalField } from '@aubergine/shared';

/**
 * The list of fields after one is added (`replacing` null) or the one labelled `replacing` is changed: the new list in
 * place, or why not. A changed field keeps its place.
 */
export function fieldsAfter(fields: readonly TerminalField[], field: TerminalField, replacing: string | null): { fields: TerminalField[] } | { problem: string } {
  const at = replacing === null ? -1 : fields.findIndex((one) => sameLabel(one.label, replacing));
  const clash = fields.find((one, index) => index !== at && sameLabel(one.label, field.label));
  if (clash) return { problem: `There is a field “${showControl(clash.label)}” already: change that one, or use another label.` };
  if (at < 0) {
    if (fields.length >= MAX_FIELDS) return { problem: `A terminal has at most ${MAX_FIELDS} fields. Remove one to add another.` };
    return { fields: [...fields, field] };
  }
  return { fields: fields.map((one, index) => (index === at ? field : one)) };
}

/** The list with the field at `index` moved one place up (-1) or down (1). Unchanged at either end. */
export function moved(fields: readonly TerminalField[], index: number, by: -1 | 1): TerminalField[] {
  const to = index + by;
  if (index < 0 || index >= fields.length || to < 0 || to >= fields.length) return [...fields];
  const next = [...fields];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}
