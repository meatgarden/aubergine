import { z } from 'zod';

/**
 * What an element produces has a kind. A kind says how to check what was
 * handed in, how to tell the next element about it, and (in the web app) how
 * to show it. Two kinds exist: `note`, the text every element can hand over,
 * and `checklist`, a list of items the owner can tick.
 *
 * A new kind (a link, a file, a table) is one more `registerOutputKind`;
 * nothing that steps or renders a run looks at the name of a kind.
 */

/** A tick the owner put on one item of an output. */
export const Tick = z.object({
  /** Which item, counting from zero. */
  item: z.number().int().min(0).max(10_000),
  by: z.object({ kind: z.enum(['agent', 'person', 'token']), name: z.string().max(120).optional() }),
  at: z.iso.datetime(),
});
export type Tick = z.infer<typeof Tick>;

export interface OutputKind {
  kind: string;
  /** What the editor calls it. */
  title: string;
  /** False for a kind an element can be finished without: the note. */
  required: boolean;
  /** One or two sentences for whoever must hand one in: what is expected, and the format of the file. */
  expects: string;
  /** Checks what was handed in. Gives the value as it is stored, or what is wrong with it, in sentences. */
  check(value: unknown): { ok: true; value: unknown } | { ok: false; problems: string[] };
  /** How many items can be ticked; zero for a kind without items. */
  items(value: unknown): number;
  /** The output as the next element is told it. `ticked` holds the items the owner ticked. Empty when there is nothing to tell. */
  render(value: unknown, ticked: ReadonlySet<number>): string;
}

const kinds = new Map<string, OutputKind>();
export function registerOutputKind(kind: OutputKind): void {
  kinds.set(kind.kind, kind);
}
export function unregisterOutputKind(kind: string): void {
  kinds.delete(kind);
}
export const outputKind = (kind: string): OutputKind | undefined => kinds.get(kind);
export const outputKindNames = (): string[] => [...kinds.keys()];

/* ---------- note: what there has always been ---------- */

// The note itself is kept where it always was, in the element's `note`; this kind adds nothing to what is stored.
registerOutputKind({
  kind: 'note',
  title: 'A note',
  required: false,
  expects: 'A note in plain text, given with --note.',
  check: () => ({ ok: true, value: null }),
  items: () => 0,
  render: () => '',
});

/* ---------- checklist ---------- */

export const CHECKLIST_MAX_ITEMS = 100;
export const CHECKLIST_TEXT_MAX = 300;
export const CHECKLIST_DETAIL_MAX = 1000;

/** One line of plain text: no line breaks, no control characters, nothing that reverses the direction of text. */
const Line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}‪-‮⁦-⁩]*$/u, 'one line of plain text, without control characters');

export const Checklist = z.object({
  items: z
    .array(
      z.object({
        text: Line(CHECKLIST_TEXT_MAX),
        /** More about the item, shown under it. May have several lines. */
        detail: z.string().trim().max(CHECKLIST_DETAIL_MAX).optional(),
      }),
    )
    .min(1)
    .max(CHECKLIST_MAX_ITEMS),
});
export type Checklist = z.infer<typeof Checklist>;

export const CHECKLIST_FORMAT = `A checklist: a JSON file of the form {"items": [{"text": "one line", "detail": "optional, more about it"}]}, with 1 to ${CHECKLIST_MAX_ITEMS} items, each text one line of at most ${CHECKLIST_TEXT_MAX} characters. Hand it in with: aubergine workflow done --output <file>`;

registerOutputKind({
  kind: 'checklist',
  title: 'A checklist',
  required: true,
  expects: CHECKLIST_FORMAT,
  check: (value) => {
    const parsed = Checklist.safeParse(value);
    if (parsed.success) return { ok: true, value: parsed.data };
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 5).map((issue) => {
        const [where, index, field] = issue.path;
        if (where === 'items' && typeof index === 'number') return `Item ${index + 1}${field ? ` (${String(field)})` : ''}: ${issue.message}.`;
        if (where === 'items') return `The checklist needs 1 to ${CHECKLIST_MAX_ITEMS} items.`;
        return 'This is not a checklist.';
      }),
    };
  },
  items: (value) => (Checklist.safeParse(value).data?.items.length ?? 0),
  render: (value, ticked) => {
    const parsed = Checklist.safeParse(value);
    if (!parsed.success) return '';
    const lines = parsed.data.items.flatMap((item, index) => [
      `${ticked.has(index) ? '[x]' : '[ ]'} ${index + 1}. ${item.text}`,
      ...(item.detail ? item.detail.split('\n').map((line) => `      ${line}`) : []),
    ]);
    const chosen = ticked.size > 0 ? `The owner ticked ${ticked.size} of ${parsed.data.items.length}: the ones marked [x].` : 'The owner has ticked none of these yet.';
    return [...lines, chosen].join('\n');
  },
});
