import { TASK_INPUT, WorkflowContent, elementIdFor, validateContent, type Element, type WorkflowInput, type WorkflowLimits, type WorkflowVersion } from '@aubergine/shared';

/**
 * A workflow while it is being edited, and what can be done to it. Pure:
 * the editor only draws a draft and calls these.
 */
export interface Draft {
  name: string;
  description: string;
  standing: string;
  inputs: WorkflowInput[];
  elements: Element[];
}

export function draftOf(version: WorkflowVersion): Draft {
  const { name, description, standing, inputs, elements } = version;
  return { name, description, standing, inputs, elements };
}

export const sameDraft = (a: Draft, b: Draft): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A new element at the end. Its ID is made once, from its first name, and then stays: runs know elements by it. */
export function addElement(draft: Draft, name = 'New element'): Draft {
  const id = elementIdFor(name, draft.elements.map((e) => e.id));
  return { ...draft, elements: [...draft.elements, { id, kind: 'instructions', name, instructions: '', doneWhen: '', origin: { kind: 'local' }, extra: {} }] };
}

export function changeElement(draft: Draft, id: string, element: Element): Draft {
  return { ...draft, elements: draft.elements.map((e) => (e.id === id ? { ...element, id } : e)) };
}

export function removeElement(draft: Draft, id: string): Draft {
  return { ...draft, elements: draft.elements.filter((e) => e.id !== id) };
}

/** Moves the element at `from` so that it ends up at `to`. Out of range leaves the draft as it is. */
export function moveElement(draft: Draft, from: number, to: number): Draft {
  if (from === to || from < 0 || to < 0 || from >= draft.elements.length || to >= draft.elements.length) return draft;
  const elements = [...draft.elements];
  const [moved] = elements.splice(from, 1);
  elements.splice(to, 0, moved as Element);
  return { ...draft, elements };
}

export function addInput(draft: Draft): Draft {
  const keys = draft.inputs.map((i) => i.key);
  if (!keys.includes(TASK_INPUT.key)) return { ...draft, inputs: [...draft.inputs, TASK_INPUT] };
  let n = draft.inputs.length + 1;
  while (keys.includes(`input_${n}`)) n += 1;
  return { ...draft, inputs: [...draft.inputs, { key: `input_${n}`, label: `Input ${n}`, description: '', required: false }] };
}

/** What is wrong with a draft, in sentences. Empty means it can be saved. */
export function draftProblems(draft: Draft, limits: WorkflowLimits): string[] {
  const parsed = WorkflowContent.safeParse({ ...draft, extra: {} });
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => {
      const [where, index, field] = issue.path;
      if (where === 'name') return 'The workflow needs a name.';
      if (where === 'elements' && typeof index !== 'number') return 'A workflow needs at least one element.';
      if (where === 'elements' && field === 'name') return `Element ${Number(index) + 1} needs a name.`;
      if (where === 'inputs' && field === 'key') return `Input ${Number(index) + 1}: ${issue.message}.`;
      if (where === 'inputs' && field === 'label') return `Input ${Number(index) + 1} needs a label.`;
      return `${issue.path.join('.')}: ${issue.message}`;
    });
  }
  return validateContent(parsed.data, limits);
}

/** Stand-in values for a preview: what was typed, else the input's label in brackets. */
export function sampleInputs(inputs: readonly WorkflowInput[], typed: Record<string, string>): Record<string, string> {
  return Object.fromEntries(inputs.map((input) => [input.key, typed[input.key]?.trim() ? (typed[input.key] as string) : `(${input.label.toLowerCase()})`]));
}

/** The draft as a version, for previewing what an agent would be told. */
export const versionOfDraft = (draft: Draft): WorkflowVersion => ({ ...draft, extra: {}, number: 0, createdAt: '1970-01-01T00:00:00.000Z' });
