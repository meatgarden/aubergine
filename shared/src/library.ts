import { z } from 'zod';
import { Id } from './ids';
import { Element, ElementId, Need, PlainName, WORKFLOW_FILE_FORMAT, elementIdFor, importWorkflow, needsOf, previewRun, validateContent, type WorkflowContent, type WorkflowLimits } from './workflows';
import { versionOfProposal } from './drafts';

/**
 * The library: workflows and elements that someone published in a folder or
 * a Git repository, to be browsed, read and installed.
 *
 * A source holds an index file that lists its items. Each item has an ID
 * that means the same on every computer, a version its publisher assigns,
 * and a file. Nothing is installed without the owner reading exactly what
 * would be installed and accepting it.
 */

const Timestamp = z.iso.datetime();
const OneLine = /^[^\p{Cc}‪-‮⁦-⁩]*$/u;

/* ---------- The index of a source ---------- */

/** The name of the index file, at the root of a source. */
export const LIBRARY_INDEX_FILE = 'aubergine-library.json';
export const LIBRARY_INDEX_FORMAT = 1;
export const LIBRARY_ITEMS_MAX = 500;

/** An item's ID in its source: chosen by the publisher, the same on every computer. Lower-case letters, digits, `.`, `-` and `_`. */
export const LibraryItemId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/, 'An item ID is lower-case letters, digits, ".", "-" and "_", starting with a letter or a digit');

/** The version a publisher gives an item: `3`, `1.2.0`, `2026-04`. It is compared for being the same or not, never for order. */
export const PublisherVersion = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/, 'A version is letters, digits, ".", "+", "-" and "_"');

/**
 * Where an item's file is, from the root of the source: a path of plain
 * names with `/` between them. No `..`, no leading `/`, nothing a file
 * system reads as anything but a name.
 */
export const LibraryPath = z
  .string()
  .max(300)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9._ -]*(\/[A-Za-z0-9_][A-Za-z0-9._ -]*)*$/, 'A path is plain names with "/" between them, from the root of the source')
  .refine((value) => !value.split('/').some((part) => part === '..' || part === '.' || part.endsWith('.') || part.endsWith(' ')), 'A path may not go up or hold a name ending in "." or a space');

export const IndexItem = z.looseObject({
  id: LibraryItemId,
  /** `workflow`, `element`, or a kind a later version adds. An item of a kind this version does not know is listed and cannot be installed. */
  kind: z.string().min(1).max(40),
  name: PlainName,
  /** One line on what it is for. */
  description: z.string().trim().max(300).regex(OneLine, 'A description is one line of plain text').default(''),
  version: PublisherVersion,
  path: LibraryPath,
  /** The publisher no longer recommends it. Installed copies keep working. */
  retired: z.boolean().default(false),
  /** For a retired item: the ID of the one to use in its place. */
  replacedBy: LibraryItemId.optional(),
});
export type IndexItem = z.infer<typeof IndexItem>;

/** The index file. Fields this version does not know are kept when the file is written again. */
export const LibraryIndex = z.looseObject({
  aubergine: z.literal('library'),
  format: z.number().int().min(1),
  /** What the source calls itself. */
  name: z.string().trim().max(120).regex(OneLine).optional(),
  items: z.array(z.unknown()).max(LIBRARY_ITEMS_MAX),
});
export type LibraryIndex = z.infer<typeof LibraryIndex>;

export interface ReadIndex {
  name: string | null;
  items: IndexItem[];
  /** Entries that could not be read, each with why: listed to the owner, never installed. */
  skipped: { id: string; reason: string }[];
}

/** Reads the text of an index file. A sentence when it is not one; an entry that is wrong is skipped with a reason and does not stop the others. */
export function readLibraryIndex(text: string): { ok: true; index: ReadIndex } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `Its index is not JSON: ${(error as Error).message.slice(0, 120)}` };
  }
  const parsed = LibraryIndex.safeParse(json);
  if (!parsed.success) return { ok: false, reason: `Its index is not a library index: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`.trim() };
  if (parsed.data.format > LIBRARY_INDEX_FORMAT) return { ok: false, reason: `Its index is in format ${parsed.data.format}, which this version of Aubergine does not know. Update Aubergine to read it.` };
  const items: IndexItem[] = [];
  const skipped: ReadIndex['skipped'] = [];
  for (const [position, raw] of parsed.data.items.entries()) {
    const item = IndexItem.safeParse(raw);
    const id = typeof (raw as { id?: unknown })?.id === 'string' ? ((raw as { id: string }).id.slice(0, 100).replace(/[^A-Za-z0-9._-]/g, '?') || `entry ${position + 1}`) : `entry ${position + 1}`;
    if (!item.success) skipped.push({ id, reason: `${item.error.issues[0]?.path.join('.') ?? ''}: ${item.error.issues[0]?.message ?? 'not an item'}` });
    else if (items.some((other) => other.id === item.data.id)) skipped.push({ id, reason: 'Another entry has the same ID.' });
    else items.push(item.data);
  }
  return { ok: true, index: { name: parsed.data.name ?? null, items, skipped } };
}

/* ---------- The file of one element ---------- */

export const ELEMENT_FILE_FORMAT = 1;
/** One element as a file, to pass on: the counterpart of a workflow file. */
export const ElementFile = z.looseObject({ aubergine: z.literal('element'), format: z.number().int().min(1), element: z.looseObject({ name: z.string() }) });

const KNOWN_ELEMENT = ['id', 'kind', 'name', 'instructions', 'doneWhen', 'needs', 'produces', 'origin', 'source'];

export function exportElement(element: Element): Record<string, unknown> {
  const { extra, source: _source, origin: _origin, id: _id, ...content } = element;
  return { aubergine: 'element', format: ELEMENT_FILE_FORMAT, element: { ...content, ...extra } };
}

/** Reads a file into an element. Throws, with a sentence, when it is not one. Where it came from on the publisher's computer is not taken over. */
export function importElement(file: unknown): Element {
  const parsed = ElementFile.safeParse(file);
  if (!parsed.success) throw new Error('This is not an Aubergine element file.');
  if (parsed.data.format > ELEMENT_FILE_FORMAT) throw new Error(`This element file is in format ${parsed.data.format}, which this version of Aubergine does not know.`);
  const raw = parsed.data.element as Record<string, unknown>;
  const known = Object.fromEntries(KNOWN_ELEMENT.filter((key) => key in raw && key !== 'source' && key !== 'origin' && key !== 'id').map((key) => [key, raw[key]]));
  const extra = Object.fromEntries(Object.entries(raw).filter(([key]) => !KNOWN_ELEMENT.includes(key)));
  const id = typeof raw.id === 'string' && ElementId.safeParse(raw.id).success ? raw.id : elementIdFor(String(raw.name ?? 'element'), []);
  return Element.parse({ ...known, id, extra });
}

/* ---------- Kinds of item ---------- */

/** What an item's file holds, read: what a reviewer is shown and what an install would put in place. */
export interface ReadItem {
  /** What it calls itself, in its file. */
  name: string;
  /** Exactly what an agent would be told: all of it. */
  text: string;
  needs: Need[];
  /** What it holds, as the kind's installer takes it. */
  content: unknown;
}

/**
 * A kind of thing a library can hold. Everything about a kind is here and in
 * its installer in the daemon: no screen and no route compares a kind to a
 * name. A new kind is `registerLibraryKind` here and `registerLibraryInstaller`
 * there.
 */
export interface LibraryKind {
  kind: string;
  /** `A workflow`, `An element`. */
  title: string;
  /** Where an installed one is found, in a few words: `among your workflows`. */
  lands: string;
  /** Reads the JSON of an item's file. Throws, with a sentence, when it is not one of this kind. */
  read(json: unknown, limits: WorkflowLimits): ReadItem;
}

const kinds = new Map<string, LibraryKind>();
export function registerLibraryKind(kind: LibraryKind): void {
  kinds.set(kind.kind, kind);
}
export function unregisterLibraryKind(kind: string): void {
  kinds.delete(kind);
}
export const libraryKind = (kind: string): LibraryKind | undefined => kinds.get(kind);
export const libraryKinds = (): LibraryKind[] => [...kinds.values()];

/** What an agent would be told on every element of a workflow, one after another: the whole text a reviewer must have seen. */
export function wholeText(content: WorkflowContent): string {
  const version = { ...content, number: 1, createdAt: '1970-01-01T00:00:00.000Z' };
  const inputs = Object.fromEntries(content.inputs.map((input) => [input.key, `(${input.label.toLowerCase()})`]));
  return content.elements.map((element, index) => `--- Element ${index + 1} of ${content.elements.length} ---\n${previewRun(version, inputs, element.id)}`).join('\n\n');
}

registerLibraryKind({
  kind: 'workflow',
  title: 'A workflow',
  lands: 'among your workflows',
  read(json, limits) {
    const { content } = importWorkflow(json);
    const problems = validateContent(content, limits);
    if (problems.length > 0) throw new Error(problems.join(' '));
    // Where a publisher's copies came from says nothing here: their shelf is not this one.
    const elements = content.elements.map((element) => ({ ...element, source: null }));
    const clean = { ...content, elements };
    return { name: content.name, text: wholeText(clean), needs: needsOf(elements), content: clean };
  },
});

registerLibraryKind({
  kind: 'element',
  title: 'An element',
  lands: 'on your shelf',
  read(json, limits) {
    const element = importElement(json);
    const version = versionOfProposal({ workflow: null, element });
    if (!version) throw new Error('This is not an element.');
    const problems = validateContent(version, limits);
    if (problems.length > 0) throw new Error(problems.join(' '));
    return { name: element.name, text: previewRun(version, { task: '(task)' }), needs: element.needs, content: element };
  },
});

export { WORKFLOW_FILE_FORMAT };

/* ---------- Sources ---------- */

/** What kind of place a source is. `builtin`, `folder`, `git`; a later kind is one more registration in the daemon. */
export const SourceKind = z.string().min(1).max(40);

/** What can be said about an item after comparing a refresh with the one before. Words for the owner, not locks. */
export const ItemFlag = z.enum([
  /** Its content changed and its version did not. */
  'changed-without-version',
  /** It was listed before and is not any more. Kept in the list only while it is installed. */
  'gone',
  /** Its file could not be read, or is not what its kind says. */
  'unreadable',
  /** Of a kind this version does not know. */
  'unknown-kind',
]);
export type ItemFlag = z.infer<typeof ItemFlag>;

/** One item of a source, as it was at the last refresh. Not its content: that is read from the source when it is shown. */
export const LibraryItem = z.object({
  id: LibraryItemId,
  kind: z.string(),
  name: z.string(),
  description: z.string().default(''),
  version: z.string(),
  path: z.string(),
  /** SHA-256 of its file as read at the last refresh; null when it could not be read. */
  digest: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  retired: z.boolean().default(false),
  replacedBy: z.string().nullable().default(null),
  flags: z.array(ItemFlag).default([]),
  /** Why it cannot be installed, when it cannot. */
  problem: z.string().max(400).nullable().default(null),
});
export type LibraryItem = z.infer<typeof LibraryItem>;

export const LibrarySource = z.object({
  id: Id,
  kind: SourceKind,
  /** A folder's path, a Git address; empty for what ships with the app. Never holds a password. */
  address: z.string().max(2000),
  name: z.string().max(120),
  addedAt: Timestamp,
  /** When it was last read; null before the first time. */
  refreshedAt: Timestamp.nullable().default(null),
  /** For a Git source: the exact commit that was read. */
  commit: z
    .string()
    .regex(/^[0-9a-f]{40,64}$/)
    .nullable()
    .default(null),
  /** Why the last attempt to read it failed; null when it worked. What was read before stays. */
  problem: z.string().max(600).nullable().default(null),
  /**
   * For a Git source, at the last refresh: whether the commit read before is still part of its history.
   * `rewritten`: it is not. `cannot-tell`: too much history lies between the two to say.
   */
  history: z.enum(['same', 'grew', 'rewritten', 'cannot-tell']).nullable().default(null),
  items: z.array(LibraryItem).max(LIBRARY_ITEMS_MAX).default([]),
  /** Entries of the index that could not be read, with why. */
  skipped: z.array(z.object({ id: z.string().max(100), reason: z.string().max(400) })).max(LIBRARY_ITEMS_MAX).default([]),
});
export type LibrarySource = z.infer<typeof LibrarySource>;

/* ---------- What is installed, and what waits to be ---------- */

/** Where an installed item came from, kept with it so that it is known even after its source was removed. */
export const InstalledFrom = z.object({
  sourceId: Id,
  kind: SourceKind,
  address: z.string().max(2000),
  sourceName: z.string().max(120),
  itemId: LibraryItemId,
  /** The publisher's version that was installed. */
  version: z.string(),
  /** For a Git source: the commit it was read at. */
  commit: z.string().nullable().default(null),
  /** SHA-256 of the file as it was fetched and read by the owner. */
  digest: z.string().regex(/^[0-9a-f]{64}$/),
});
export type InstalledFrom = z.infer<typeof InstalledFrom>;

export const InstalledItem = z.object({
  id: Id,
  kind: z.string(),
  name: z.string(),
  from: InstalledFrom,
  installedAt: Timestamp,
  /** The content as it was installed, whatever was done to the installed thing since. */
  content: z.unknown(),
  /** What it became here: a workflow, a shelf element, or for a kind without a place of its own nothing but this record. */
  target: z.object({ workflowId: Id.optional(), shelfId: Id.optional() }).default({}),
  /** What its source said about it at the last refresh. `gone`: no longer listed. */
  atSource: z.enum(['current', 'retired', 'gone']).default('current'),
  /** For one retired at its source: the name of what to use in its place, when the source named one. */
  useInstead: z.string().max(200).nullable().default(null),
});
export type InstalledItem = z.infer<typeof InstalledItem>;

/** Who asked for an install. */
export const Requester = z.discriminatedUnion('kind', [z.object({ kind: z.literal('owner') }), z.object({ kind: z.literal('token'), tokenId: Id, name: z.string() })]);
export type Requester = z.infer<typeof Requester>;

/** An install, or an update of something installed, that waits for the owner to read and accept it. It installs nothing. */
export const InstallRequest = z.object({
  id: Id,
  sourceId: Id,
  itemId: LibraryItemId,
  /** For an update: the installed item it would bring up to date. */
  updates: Id.nullable().default(null),
  requestedBy: Requester,
  at: Timestamp,
});
export type InstallRequest = z.infer<typeof InstallRequest>;

export const LIBRARY_SOURCES_MAX = 50;
export const LIBRARY_REQUESTS_MAX = 100;

export const LibraryState = z.object({
  sources: z.array(LibrarySource).max(LIBRARY_SOURCES_MAX).default([]),
  installed: z.array(InstalledItem).default([]),
  requests: z.array(InstallRequest).max(LIBRARY_REQUESTS_MAX).default([]),
});
export type LibraryState = z.infer<typeof LibraryState>;

/* ---------- What can be told about an item ---------- */

/**
 * `available`: not installed. `installed`: installed, and the source has the same version and content.
 * `update`: the source has another version or other content than what was installed.
 */
export type ItemStanding = 'available' | 'installed' | 'update';

/** Whether an item of a source is installed, and whether the source has something else than what was installed. The shelf's own counter plays no part. */
export function standingOf(sourceId: string, item: Pick<LibraryItem, 'id' | 'version' | 'digest'>, installed: readonly InstalledItem[]): { standing: ItemStanding; installed: InstalledItem | null } {
  const mine = installed.find((entry) => entry.from.sourceId === sourceId && entry.from.itemId === item.id) ?? null;
  if (!mine) return { standing: 'available', installed: null };
  const same = item.version === mine.from.version && (item.digest === null || item.digest === mine.from.digest);
  return { standing: same ? 'installed' : 'update', installed: mine };
}

/** What to say about an item's flags, each a sentence. */
export const FLAG_WORDS: Record<ItemFlag, string> = {
  'changed-without-version': 'Its content changed and its version did not: what is there now is not what was there under this version before.',
  gone: 'Its source no longer lists it.',
  unreadable: 'Its file could not be read as what it says it is.',
  'unknown-kind': 'It is of a kind this version of Aubergine does not know.',
};

/** What to say about a source's history, when there is something to say. */
export function historyWords(history: LibrarySource['history']): string {
  if (history === 'rewritten') return 'Its history was rewritten: the commit read last time is no longer part of it. What you read before may not be what is there now. Read again before installing or updating.';
  if (history === 'cannot-tell') return 'So much history lies between the last refresh and this one that it could not be told whether the history was rewritten.';
  return '';
}

/** Where something came from, in words. */
export function fromWords(from: InstalledFrom): string {
  const where = from.kind === 'builtin' ? 'the library that comes with Aubergine' : `${from.sourceName} (${from.address})`;
  return `${where}, item ${from.itemId}, version ${from.version}${from.commit ? `, commit ${from.commit.slice(0, 12)}` : ''}`;
}

/* ---------- Bodies and answers ---------- */

export const AddSourceRequest = z.object({
  kind: SourceKind.describe('`folder` (a folder on this computer) or `git` (the address of a Git repository).'),
  address: z.string().trim().min(1).max(2000).describe('For a folder: its path. For Git: an address starting with https://, ssh:// or file://, or of the form user@host:path. Never with a password in it.'),
  name: z.string().trim().max(120).regex(OneLine).optional().describe('What to call it. Left out, the name its index gives, or its address.'),
});
export type AddSourceRequest = z.infer<typeof AddSourceRequest>;

export const LibrarySourceList = z.object({ sources: z.array(LibrarySource) });
export type LibrarySourceList = z.infer<typeof LibrarySourceList>;

/** An item as it is listed: with its source, and whether it is installed. */
export const ListedItem = LibraryItem.extend({
  sourceId: Id,
  sourceName: z.string(),
  sourceKind: z.string(),
  /** `A workflow`, `An element`; the kind's own name when this version does not know it. */
  kindTitle: z.string(),
  standing: z.enum(['available', 'installed', 'update']),
  installedId: Id.nullable(),
  /** The publisher's version that is installed, when one is. */
  installedVersion: z.string().nullable(),
  /** An install or update of it waits in Review. */
  requested: z.boolean(),
});
export type ListedItem = z.infer<typeof ListedItem>;
export const LibraryItemList = z.object({ items: z.array(ListedItem) });
export type LibraryItemList = z.infer<typeof LibraryItemList>;

export const NeedAdvice = z.object({ need: Need, state: z.enum(['found', 'not-found', 'cannot-tell']), words: z.string() });
export type NeedAdvice = z.infer<typeof NeedAdvice>;

/** One item with what its file says: what a reviewer reads. Read from the source's files when asked; never from the network. */
export const LibraryItemDetail = z.object({
  item: ListedItem,
  /** Exactly what an agent would be told: all of it. Null when the file could not be read. */
  text: z.string().nullable(),
  needs: z.array(Need),
  /** SHA-256 of the file as read for this answer. Accepting names it: what is installed is this, or nothing. */
  digest: z.string().nullable(),
  /** Where it comes from, in words: source, item, version, commit. */
  from: z.string(),
  /** What there is to be careful about: flags of the item and of its source, each a sentence. */
  warnings: z.array(z.string()),
});
export type LibraryItemDetail = z.infer<typeof LibraryItemDetail>;

export const RequestInstallRequest = z.object({ sourceId: Id, itemId: LibraryItemId });
export type RequestInstallRequest = z.infer<typeof RequestInstallRequest>;

/** An install that waits, with everything its reviewer reads. */
export const InstallRequestDetail = z.object({
  request: InstallRequest,
  item: ListedItem.nullable(),
  /** `An element`, `A new version of the workflow "Fix a bug"`. */
  what: z.string(),
  from: z.string(),
  requestedBy: z.string(),
  text: z.string().nullable(),
  /** For an update: what an agent is told by what is in place now. */
  previousText: z.string().nullable(),
  /** For an update of something that was changed here since it was installed: what was installed, to compare the three. */
  installedText: z.string().nullable(),
  needs: z.array(NeedAdvice),
  digest: z.string().nullable(),
  warnings: z.array(z.string()),
  /** What it holds, for editing before accepting. */
  proposal: z.object({ workflow: z.unknown().nullable(), element: z.unknown().nullable() }),
});
export type InstallRequestDetail = z.infer<typeof InstallRequestDetail>;
export const InstallRequestList = z.object({ requests: z.array(InstallRequestDetail.pick({ request: true, item: true, what: true, from: true, requestedBy: true })) });
export type InstallRequestList = z.infer<typeof InstallRequestList>;

export const AcceptInstallRequest = z.object({
  digest: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .describe('The digest of the file as it was shown for review. If the file is not that any more, nothing is installed.'),
  workflow: z.unknown().optional().describe('The workflow as edited before accepting.'),
  element: z.unknown().optional().describe('The element as edited before accepting.'),
});
export type AcceptInstallRequest = z.infer<typeof AcceptInstallRequest>;

export const InstalledList = z.object({ installed: z.array(InstalledItem.omit({ content: true })) });
export type InstalledList = z.infer<typeof InstalledList>;

/** Where an installed item is used, said before it is removed. */
export const InstalledUsage = z.object({ uses: z.array(z.string()), liveRuns: z.number().int().min(0) });
export type InstalledUsage = z.infer<typeof InstalledUsage>;

/* ---------- Git addresses ---------- */

/**
 * Whether a text is an address Git may be given: https, ssh (as a URL or as
 * `user@host:path`) or file. Anything Git would read as an option, as
 * another transport (`ext::…`, `transport::address`), or that carries a
 * password, is refused. Returns why, or null when it is fine.
 */
export function gitAddressProblem(address: string): string | null {
  if (address.length > 2000) return 'That address is too long.';
  if (/[\s\p{Cc}]/u.test(address)) return 'An address holds no spaces and no control characters.';
  if (address.startsWith('-')) return 'An address does not start with "-": Git would read it as an option.';
  if (address.includes('::')) return 'An address of the form "transport::address" runs a helper program. Only https, ssh and file addresses are taken.';
  const scp = /^[A-Za-z0-9_][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*:[A-Za-z0-9._~][A-Za-z0-9._~/-]*$/.test(address);
  if (scp) return null;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return 'That is not an address Git can fetch from. It starts with https://, ssh:// or file://, or has the form user@host:path.';
  }
  if (!['https:', 'ssh:', 'file:'].includes(url.protocol)) return `Only https, ssh and file addresses are taken, not ${url.protocol.replace(':', '')}.`;
  if (url.password !== '') return 'An address with a password in it is not taken: Aubergine stores no credential. Use the Git access you already have (a credential helper, or an ssh key).';
  if (url.protocol !== 'file:' && (url.hostname === '' || url.hostname.startsWith('-'))) return 'That address has no host, or one that starts with "-".';
  if (url.username.startsWith('-')) return 'A user name does not start with "-".';
  if (url.protocol === 'file:' && (url.hostname !== '' || !url.pathname.startsWith('/'))) return 'A file address names a folder on this computer by its full path: file:///path/to/repository';
  return null;
}
