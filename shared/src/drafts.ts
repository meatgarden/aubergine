import { z } from 'zod';
import { Id } from './ids';
import { CHECKLIST_FORMAT, outputKindNames } from './outputs';
import { Element, NEEDS_MAX, WorkflowContent, needsOf, previewRun, type Need, type WorkflowLimits, type WorkflowVersion } from './workflows';

/**
 * Drafts: workflows and elements that someone other than the owner wrote.
 *
 * Text that agents will obey is read by a person first. So whatever an agent
 * or a program writes arrives here, as a draft. A draft is inert: it cannot
 * be run, it is not among the workflows, and nothing renders it to an agent
 * as instructions. The owner reads it on the review screen and accepts it,
 * sends it back with a comment, or discards it.
 */

const Timestamp = z.iso.datetime();

/** Who proposed a draft. */
export const Proposer = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), sessionId: Id }),
  z.object({ kind: z.literal('token'), tokenId: Id, name: z.string().max(120) }),
  z.object({ kind: z.literal('person') }),
]);
export type Proposer = z.infer<typeof Proposer>;

export const DRAFT_DESCRIPTION_MAX = 4000;
export const DRAFT_COMMENT_MAX = 2000;

/** What a draft proposes: a whole workflow, or one element for the shelf. Exactly one of the two is set. */
const Proposal = z.object({
  workflow: WorkflowContent.nullable().default(null),
  element: Element.nullable().default(null),
});

export const DraftStatus = z.enum([
  /** The owner asked for it; nothing has been handed in yet. */
  'requested',
  /** Handed in, waiting to be read. */
  'waiting',
  /** Sent back with a comment, to be revised. */
  'returned',
]);
export type DraftStatus = z.infer<typeof DraftStatus>;

export const Draft = Proposal.extend({
  id: Id,
  kind: z.enum(['workflow', 'element']),
  status: DraftStatus,
  /** What the owner asked for, in their words. Empty for a draft nobody asked for. */
  description: z.string().max(DRAFT_DESCRIPTION_MAX).default(''),
  proposedBy: Proposer,
  /** The session that was asked, or that proposed it. Its token may read and revise this draft, and no other. */
  sessionId: Id.nullable().default(null),
  /** For a workflow draft: the workflow it is a new version of, when it revises one. */
  revisesWorkflowId: Id.nullable().default(null),
  /** What was proposed before the last revision, to show what changed. */
  previous: Proposal.nullable().default(null),
  /** How many times something was handed in. */
  revision: z.number().int().min(0).default(0),
  /** The owner's comment, when it was sent back. */
  comment: z.string().max(DRAFT_COMMENT_MAX).nullable().default(null),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Draft = z.infer<typeof Draft>;

/** An element kept for reuse: put into workflows as a copy, or run by itself. */
export const ShelfElement = z.object({
  id: Id,
  element: Element,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type ShelfElement = z.infer<typeof ShelfElement>;

/* ---------- A draft as text, for the person who reviews it ---------- */

/** The proposal as a workflow version, so that it can be shown through the very code that tells an agent. An element is a workflow of one. */
export function versionOfProposal(proposal: { workflow: WorkflowContent | null; element: Element | null }): WorkflowVersion | null {
  const content: WorkflowContent | null = proposal.workflow ?? (proposal.element ? { name: proposal.element.name, description: '', standing: '', inputs: [{ key: 'task', label: 'Task', description: '', required: false }], elements: [proposal.element], extra: {} } : null);
  return content ? { ...content, number: 1, createdAt: '1970-01-01T00:00:00.000Z' } : null;
}

/**
 * Everything a proposal would tell an agent, element by element, with
 * stand-in inputs: the text a reviewer reads before accepting. Made by the
 * same function that tells an agent during a run, so what is read is what
 * would be said. This is for reading; nothing gives it to an agent.
 */
export function reviewText(proposal: { workflow: WorkflowContent | null; element: Element | null }): string {
  const version = versionOfProposal(proposal);
  if (!version) return '';
  const inputs = Object.fromEntries(version.inputs.map((input) => [input.key, `(${input.label.toLowerCase()})`]));
  return version.elements.map((element) => previewRun(version, inputs, element.id)).join('\n\n────────────────────────────────────────\n\n');
}

export const needsOfProposal = (proposal: { workflow: WorkflowContent | null; element: Element | null }): Need[] => needsOf(proposal.workflow?.elements ?? (proposal.element ? [proposal.element] : []));

/** One line of a comparison: kept, taken out, or put in. */
export interface DiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/** What changed between two texts, line by line. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // The longest run of lines the two share, worked out from the end so that it can be read off from the start.
  const common: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      (common[i] as number[])[j] = a[i] === b[j] ? ((common[i + 1] as number[])[j + 1] as number) + 1 : Math.max((common[i + 1] as number[])[j] as number, (common[i] as number[])[j + 1] as number);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] as string });
      i += 1;
      j += 1;
    } else if (((common[i + 1] as number[])[j] as number) >= ((common[i] as number[])[j + 1] as number)) {
      lines.push({ kind: 'removed', text: a[i] as string });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: b[j] as string });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) lines.push({ kind: 'removed', text: a[i] as string });
  for (; j < b.length; j += 1) lines.push({ kind: 'added', text: b[j] as string });
  return lines;
}

/** How many lines of a text the review screen shows before it asks for "show all". */
export const REVIEW_LINES_SHOWN = 60;
/** Whether a text is longer than the review screen shows at first. Accepting waits until all of it has been shown. */
export const needsShowAll = (text: string): boolean => text.split('\n').length > REVIEW_LINES_SHOWN;

/* ---------- The brief: what an agent asked for a draft is told ---------- */

const EXAMPLE_ELEMENT = {
  name: 'Collect open questions',
  instructions: 'Read the discussion about {{task}} and list every question that nobody has answered yet, one per item.',
  doneWhen: 'Every open question is on the list.',
  needs: [{ kind: 'command', name: 'git', note: 'to read the history' }],
  produces: 'checklist',
};

/**
 * What `aubergine workflow brief` prints: the owner's description, the format
 * with one example, the limits, and how to hand the result in. The owner's
 * words reach the agent here, printed by a command the agent runs, and never
 * as keys typed into its terminal.
 */
export function renderBrief(draft: Draft, limits: WorkflowLimits): string {
  const element = draft.kind === 'element';
  const lines = [`You have been asked to write ${element ? 'an element' : 'a workflow'} for Aubergine.`, ''];
  lines.push('What is wanted, in the words of the person who asked:', '', draft.description.trim() || '(no description was given)', '');
  if (draft.status === 'returned') {
    lines.push('Your last version was read and sent back with this comment:', '', draft.comment?.trim() || '(no comment)', '');
    lines.push('Your last version was:', '', JSON.stringify(element ? draft.element : draft.workflow, null, 2), '', 'Change it as the comment asks and hand it in again.', '');
  }
  lines.push(
    element
      ? 'An element is one piece of work for an agent: a name, instructions, and one line saying how to tell it is done.'
      : 'A workflow is an ordered list of elements that an agent goes through one at a time. An element is a name, instructions, and one line saying how to tell it is done.',
    'Write the instructions for an agent that knows nothing about this conversation. Nothing you write is run by a computer: it is text another agent will read and follow.',
    '',
    'The format is a JSON file. An example of an element:',
    '',
    JSON.stringify(EXAMPLE_ELEMENT, null, 2),
    '',
  );
  if (!element) lines.push('A workflow is:', '', JSON.stringify({ name: 'A short name', description: 'What it is for.', standing: 'Text added to every element (may be empty).', elements: ['…elements like the one above…'] }, null, 2), '');
  lines.push(
    'Rules:',
    `- name: one line, at most 120 characters. instructions: at most ${limits.maxElementChars} characters. doneWhen: one line, at most 500.`,
    ...(element ? [] : [`- A workflow has 1 to ${limits.maxElements} elements.`]),
    '- {{task}} in any text becomes what the run is about.',
    `- needs (optional, at most ${NEEDS_MAX}): what whoever does the element must have. Each has a kind (mcp, command, access or other), a name, and may have a note. Name a need only if the work cannot be done without it.`,
    `- produces (optional): ${outputKindNames().join(' or ')}. Leave it out for a note. ${CHECKLIST_FORMAT.split(' Hand it in')[0]} is what an element that produces a checklist hands in when it is done.`,
    '',
    'What you hand in is a draft. A person reads it before it can be used; it may come back to you with a comment.',
    '',
    'Hand it in with:',
    `    aubergine ${element ? 'element' : 'workflow'} propose --file <file>`,
  );
  return lines.join('\n');
}
