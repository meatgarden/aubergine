import { SHELF_VERSIONS_KEPT, ShelfElement, type ShelfVersion } from './drafts';
import { Element, type ElementSource, type Workflow } from './workflows';

/**
 * The life of a shelf element: its versions, what a copy in a workflow knows
 * about where it came from, and what can be told from that.
 *
 * A copy records the shelf element, the version it was copied from, and a
 * mark of the content as copied. Nothing here changes a copy: the owner
 * takes a newer version or keeps theirs, one element at a time.
 */

/* ---------- The content of an element, and a mark of it ---------- */

/** What an element says: the fields that are copied, compared and versioned. Not where it came from, and not its ID. */
export const CONTENT_FIELDS = ['kind', 'name', 'instructions', 'doneWhen', 'needs', 'produces'] as const;
/** `ask` and `lookAt` belong to the content too; they are optional here because an element from before they existed has neither. */
export type ElementContent = Pick<Element, (typeof CONTENT_FIELDS)[number]> & Partial<Pick<Element, 'ask' | 'lookAt'>>;

export function contentOf(element: ElementContent): ElementContent {
  return {
    kind: element.kind,
    name: element.name,
    instructions: element.instructions,
    doneWhen: element.doneWhen,
    needs: element.needs.map((need) => ({ kind: need.kind, name: need.name, ...(need.note ? { note: need.note } : {}) })),
    produces: element.produces,
    // Left out when empty, so that the mark of an element from before these fields is what it was.
    ...(element.ask ? { ask: element.ask } : {}),
    ...(element.lookAt ? { lookAt: element.lookAt } : {}),
  };
}

/** One 53-bit hash of a string, with a seed. Not for secrets: only for telling whether two texts are the same. */
function mix(text: string, seed: number): number {
  let a = 0xdeadbeef ^ seed;
  let b = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return 4294967296 * (2097151 & b) + (a >>> 0);
}

/**
 * A mark of an element's content: the same for the same content, and in
 * practice different for different content. It tells "changed since it was
 * copied" from "not"; it protects nothing.
 */
export function elementHash(element: ElementContent): string {
  const text = JSON.stringify(contentOf(element));
  return (mix(text, 1).toString(16).padStart(14, '0') + mix(text, 2).toString(16).padStart(14, '0')).slice(-16).padStart(16, '0');
}

/** The mark a new copy of a shelf element carries. */
export function sourceOf(item: Pick<ShelfElement, 'id' | 'version' | 'element'>): ElementSource {
  return { shelfId: item.id, version: item.version, hash: elementHash(item.element) };
}

/* ---------- What can be told about a copy ---------- */

/**
 * `none`: not a copy of a shelf element.
 * `unchanged`: as it was copied, and that is the newest version.
 * `changed`: changed here since it was copied; the shelf has nothing newer.
 * `behind`: as it was copied, and the shelf has a newer version.
 * `both`: changed here, and the shelf has a newer version too.
 * `unknown`: a copy from before versions were kept: nothing can be told, and it is never called behind.
 * `gone`: its source is not on the shelf (it was removed, or the workflow came from elsewhere).
 */
export type CopyState = 'none' | 'unchanged' | 'changed' | 'behind' | 'both' | 'unknown' | 'gone';

export interface CopyStatus {
  state: CopyState;
  /** The shelf element it came from, when that is still on the shelf. */
  shelf: ShelfElement | null;
  /** The version it was copied from, when known. */
  copiedVersion: number | null;
  /** The source is retired. */
  retired: boolean;
  /** For a retired source that names another: that one. */
  replacedBy: ShelfElement | null;
}

export function copyStatus(element: Pick<Element, 'source'> & ElementContent, shelf: readonly ShelfElement[]): CopyStatus {
  const none: CopyStatus = { state: 'none', shelf: null, copiedVersion: null, retired: false, replacedBy: null };
  const source = element.source;
  if (source === null || source === undefined) return none;
  const item = shelf.find((entry) => entry.id === source.shelfId) ?? null;
  if (item === null) return { ...none, state: 'gone', copiedVersion: source.version };
  const about = { shelf: item, copiedVersion: source.version, retired: item.state === 'retired', replacedBy: item.replacedBy ? (shelf.find((entry) => entry.id === item.replacedBy) ?? null) : null };
  if (source.version === null || source.hash === null) return { ...about, state: 'unknown' };
  const changed = elementHash(element) !== source.hash;
  const newer = item.version > source.version;
  return { ...about, state: changed ? (newer ? 'both' : 'changed') : newer ? 'behind' : 'unchanged' };
}

/** A copy's state in a few words, for a mark beside it. Empty for an element that is not a copy. */
export function copyWords(status: CopyStatus): string {
  const name = status.shelf?.element.name ?? '';
  const retired = status.retired ? ` It is retired${status.replacedBy ? `: use "${status.replacedBy.element.name}"` : ''}.` : '';
  switch (status.state) {
    case 'none':
      return '';
    case 'unchanged':
      return `A copy of "${name}" from your saved steps, version ${status.copiedVersion}, unchanged.${retired}`;
    case 'changed':
      return `A copy of "${name}" from your saved steps, version ${status.copiedVersion}, changed here since.${retired}`;
    case 'behind':
      return `A copy of "${name}" from your saved steps, version ${status.copiedVersion}. A newer version is saved: version ${status.shelf?.version}.${retired}`;
    case 'both':
      return `A copy of "${name}" from your saved steps, version ${status.copiedVersion}, changed here since. A newer version is saved too: version ${status.shelf?.version}.${retired}`;
    case 'unknown':
      return `A copy of "${name}" from your saved steps, made before versions were kept: it cannot be told whether it was changed or is behind.${retired}`;
    case 'gone':
      return 'A copy of a saved step whose source is not among your saved steps: it was removed, or this workflow came from somewhere else.';
  }
}

/** The one word of the mark. */
export const COPY_MARK: Record<CopyState, string> = { none: '', unchanged: 'a saved step', changed: 'changed here', behind: 'a newer version is saved', both: 'changed here, a newer version is saved', unknown: 'a saved step, cannot tell', gone: 'its source was removed' };

/* ---------- Taking a newer version, or keeping one's own ---------- */

/**
 * The element after its owner decided about the newer version on the shelf.
 * `take`: the shelf's content takes the place of the copy's; it is then an unchanged copy of that version.
 * `keep`: the copy's content stays; it is then a copy of that version that was changed here.
 * Its ID in the workflow stays the same either way. Nothing is merged.
 */
export function decideUpdate(element: Element, item: ShelfElement, decision: 'take' | 'keep'): Element {
  const source = sourceOf(item);
  return decision === 'take' ? { ...element, ...contentOf(item.element), source } : { ...element, source };
}

/** The three texts an owner picks between: what was copied (when that version is still kept), what the copy says now, what the shelf says now. */
export function threeTexts(element: Element, item: ShelfElement): { copied: ElementContent | null; mine: ElementContent; shelf: ElementContent } {
  const copied = element.source?.version != null ? (item.versions.find((v) => v.version === element.source?.version)?.element ?? null) : null;
  return { copied: copied ? contentOf(copied) : null, mine: contentOf(element), shelf: contentOf(item.element) };
}

/** An element as plain lines, for comparing two side by side. */
export function elementLines(content: ElementContent): string[] {
  return [
    `Name: ${content.name}`,
    `Done when: ${content.doneWhen}`,
    `Produces: ${content.produces}`,
    `Needs: ${content.needs.map((need) => `${need.kind} ${need.name}${need.note ? ` (${need.note})` : ''}`).join('; ') || 'nothing'}`,
    ...(content.ask ? [`The person is asked: ${content.ask}`] : []),
    ...(content.lookAt ? [`To look at: ${content.lookAt}`] : []),
    '',
    ...content.instructions.split('\n'),
  ];
}

/* ---------- Sources are the owner's to set ---------- */

/**
 * The elements of a workflow as they may be saved by a caller who is not the
 * owner: each keeps the source mark the element of the same ID had before,
 * and a new element has none. So a token or a draft can change what a copy
 * says (it then reads as changed here), and cannot say that a copy was
 * brought up to date.
 */
export function carrySources<T extends { id?: string | undefined; source?: ElementSource | null | undefined }>(incoming: readonly T[], before: readonly Pick<Element, 'id' | 'source'>[]): T[] {
  return incoming.map((element) => ({ ...element, source: before.find((old) => old.id === element.id)?.source ?? null }));
}

/* ---------- Where a shelf element is used ---------- */

export interface ShelfUse {
  workflowId: string;
  workflowName: string;
  /** The number of the workflow's newest version. */
  workflowVersion: number;
  /** The copies in the newest version. */
  copies: { elementId: string; name: string; state: CopyState; copiedVersion: number | null }[];
  /** Every kept version of the workflow that holds a copy, oldest first. */
  inVersions: number[];
}

/** The listed workflows that hold a copy of a shelf element, by name. */
export function usesOf(shelfId: string, workflows: readonly Workflow[], shelf: readonly ShelfElement[]): ShelfUse[] {
  const uses: ShelfUse[] = [];
  for (const workflow of workflows) {
    if (!workflow.listed) continue;
    const holding = workflow.versions.filter((version) => version.elements.some((element) => element.source?.shelfId === shelfId));
    if (holding.length === 0) continue;
    const latest = workflow.versions[workflow.versions.length - 1];
    if (!latest) continue;
    uses.push({
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: latest.number,
      copies: latest.elements.filter((element) => element.source?.shelfId === shelfId).map((element) => ({ elementId: element.id, name: element.name, state: copyStatus(element, shelf).state, copiedVersion: element.source?.version ?? null })),
      inVersions: holding.map((version) => version.number),
    });
  }
  return uses.sort((a, b) => a.workflowName.localeCompare(b.workflowName) || a.workflowId.localeCompare(b.workflowId));
}

/* ---------- Versions ---------- */

/** The versions of a shelf element some copy was made from, in any kept version of any workflow. */
export function versionsInUse(shelfId: string, workflows: readonly Workflow[]): Set<number> {
  const used = new Set<number>();
  for (const workflow of workflows) for (const version of workflow.versions) for (const element of version.elements) if (element.source?.shelfId === shelfId && element.source.version !== null) used.add(element.source.version);
  return used;
}

/** The versions to keep: the newest ones up to the limit, and any a copy was made from. Oldest first. */
export function keptVersions(versions: readonly ShelfVersion[], inUse: ReadonlySet<number>): ShelfVersion[] {
  const newest = new Set(versions.slice(-SHELF_VERSIONS_KEPT).map((v) => v.version));
  return versions.filter((v) => newest.has(v.version) || inUse.has(v.version));
}

/** A shelf element with its first version, for one that has none yet: what it says now is version 1. */
export function withFirstVersion(item: ShelfElement): ShelfElement {
  if (item.versions.length > 0) return item;
  return { ...item, version: 1, versions: [{ version: 1, element: item.element, at: item.updatedAt, by: { kind: 'person' }, note: '' }] };
}

/* ---------- What is in an element, as one place to read ---------- */

export interface FieldNote {
  field: string;
  /** What it is for. */
  what: string;
  /** Whether a person writes it, or it is kept for them. */
  written: 'by you' | 'for you';
}

const WRITTEN_BY_YOU = new Set(['name', 'instructions', 'doneWhen', 'needs', 'produces', 'ask', 'lookAt']);

function described(shape: Record<string, { description?: string | undefined }>, fields: readonly string[], written: (field: string) => FieldNote['written']): FieldNote[] {
  return fields.map((field) => ({ field, what: shape[field]?.description ?? '', written: written(field) }));
}

/**
 * Every field of an element and of its place on the shelf, with what each is
 * for: read from the descriptions in the schemas, so that it cannot say
 * something else than they do.
 */
export function elementReference(): { element: FieldNote[]; shelf: FieldNote[] } {
  return {
    element: described(Element.shape, ['name', 'instructions', 'doneWhen', 'needs', 'produces', 'kind', 'ask', 'lookAt', 'origin', 'source', 'id', 'extra'], (field) => (WRITTEN_BY_YOU.has(field) ? 'by you' : 'for you')),
    shelf: described(ShelfElement.shape, ['version', 'versions', 'state', 'replacedBy'], () => 'for you'),
  };
}

/** The reference as a Markdown page. */
export function elementReferencePage(): string {
  const { element, shelf } = elementReference();
  const table = (rows: FieldNote[]): string[] => ['| Field | Written | What it is for |', '|---|---|---|', ...rows.map((row) => `| \`${row.field}\` | ${row.written} | ${row.what.replaceAll('|', '\\|')} |`)];
  return [
    '# What is in a step',
    '',
    'A step is one piece of work for an agent: text it reads and follows, and a line saying how to tell that it is done. A workflow is a list of steps. Nothing in a step is run by a computer.',
    '',
    '## The fields of a step',
    '',
    ...table(element),
    '',
    '## A saved step also has',
    '',
    ...table(shelf),
    '',
    'A saved step is copied into a workflow, never linked: changing the shelf changes no workflow. A copy remembers where it came from (`source`), so the editor can say when a newer version is on the shelf, and you decide whether to take it.',
  ].join('\n');
}
