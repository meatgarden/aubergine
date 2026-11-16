import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sourceLabel,
  FLAG_WORDS,
  LIBRARY_INDEX_FILE,
  LIBRARY_REQUESTS_MAX,
  LIBRARY_SOURCES_MAX,
  Element,
  WorkflowContent,
  contentOf,
  elementHash,
  fromWords,
  gitAddressProblem,
  historyWords,
  latestVersion,
  libraryKind,
  matchNeed,
  newId,
  previewRun,
  readLibraryIndex,
  standingOf,
  usesOf,
  versionOfProposal,
  wholeText,
  type AddSourceRequest,
  type InstallRequest,
  type InstallRequestDetail,
  type InstalledFrom,
  type InstalledItem,
  type InstalledUsage,
  type Inventory,
  type ItemFlag,
  type LibraryItem,
  type LibraryItemDetail,
  type LibrarySource,
  type ListedItem,
  type Need,
  type NeedAdvice,
  type ReadItem,
  type Requester,
  type WorkflowLimits,
} from '@aubergine/shared';
import type { Inventories } from './agents/inventory';
import type { Drafts } from './drafts';
import { FetchRefusal, type LibraryFetcher } from './library/git';
import { hashOf, readInside } from './repository-files';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { Workflows } from './workflows';

/**
 * The library: sources of workflows and elements that others published, what
 * they list, and installing from them.
 *
 * Three things hold everywhere here:
 *
 * - Nothing is fetched except by `refresh` and `addSource`, which only the
 *   owner can reach. Everything else reads what a refresh left behind.
 * - What a source holds is read as data, through the bounded reader that
 *   follows no link, and never run.
 * - Nothing is installed except by `accept`, which is the owner's alone and
 *   names the digest of exactly what was shown: if the file is not that any
 *   more, nothing happens. A refresh never changes what is installed.
 */

/* ---------- Kinds of source ---------- */

export interface Located {
  /** The folder its files are read from. */
  root: string;
  commit: string | null;
  history: LibrarySource['history'];
}

/**
 * A kind of place a source can be. `check` makes an address safe to keep (or
 * throws, with a sentence). `locate` makes its files readable in a folder,
 * fetching them when `fetch` says the owner asked for that; without it,
 * nothing may leave this computer and `null` means "not here yet".
 */
export interface SourceKindOf {
  kind: string;
  /** Whether making its files readable can reach the network. */
  remote: boolean;
  check(address: string): Promise<string> | string;
  locate(source: LibrarySource, context: { cache: string; fetch: boolean; fetcher: LibraryFetcher }): Promise<Located | null>;
  forget?(source: LibrarySource, context: { cache: string; fetcher: LibraryFetcher }): Promise<void>;
}

const sourceKinds = new Map<string, SourceKindOf>();
export function registerSourceKind(kind: SourceKindOf): void {
  sourceKinds.set(kind.kind, kind);
}

/** The folder of the library that ships with the app: `library/` at the top of this copy. */
export const builtinFolder = (): string => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'library');

registerSourceKind({
  kind: 'builtin',
  remote: false,
  check: () => '',
  locate: async (source) => ({ root: source.address || builtinFolder(), commit: null, history: null }),
});

registerSourceKind({
  kind: 'folder',
  remote: false,
  check: async (address) => {
    const expanded = address.startsWith('~/') ? path.join(process.env.HOME ?? '', address.slice(2)) : address;
    if (!path.isAbsolute(expanded)) throw new BadInputError('Give the full path of the folder.');
    try {
      const resolved = await realpath(expanded);
      if (!(await stat(resolved)).isDirectory()) throw new Error('not a folder');
      return resolved;
    } catch {
      throw new BadInputError('That is not a folder on this computer.');
    }
  },
  locate: async (source) => ({ root: source.address, commit: null, history: null }),
});

registerSourceKind({
  kind: 'git',
  remote: true,
  check: (address) => {
    const problem = gitAddressProblem(address);
    if (problem) throw new BadInputError(problem);
    return address;
  },
  locate: async (source, { cache, fetch, fetcher }) => {
    if (!fetch) return source.commit ? { root: path.join(cache, 'tree'), commit: source.commit, history: source.history } : null;
    const fetched = await fetcher.fetch(source.address, cache, source.commit);
    return { root: fetched.root, commit: fetched.commit, history: fetched.history };
  },
  forget: (_source, { cache, fetcher }) => fetcher.forget(cache),
});

/* ---------- Kinds of item: what installing one does ---------- */

/** What putting an item of some kind in place does. A kind without one is kept as its record alone. */
export interface LibraryInstaller {
  kind: string;
  /** Puts new content in place; returns where. `edited`: what the owner changed it to before accepting. */
  install(content: unknown, origin: Record<string, unknown>, edited: unknown, deps: InstallerDeps): InstalledItem['target'];
  /** Brings what is in place up to date. Returns false when it is no longer there, and a fresh install is wanted. */
  update(target: InstalledItem['target'], content: unknown, edited: unknown, from: InstalledFrom, deps: InstallerDeps): boolean;
  /** What an agent is told by what is in place now; null when it is not there any more. */
  current(target: InstalledItem['target'], deps: InstallerDeps): { text: string; changed: (installed: unknown) => boolean } | null;
  uses(target: InstalledItem['target'], deps: InstallerDeps): InstalledUsage;
  remove(target: InstalledItem['target'], deps: InstallerDeps): void;
}
export interface InstallerDeps {
  hub: StateHub;
  workflows: Workflows;
  drafts: Drafts;
  limits: () => WorkflowLimits;
}

const installers = new Map<string, LibraryInstaller>();
export function registerLibraryInstaller(installer: LibraryInstaller): void {
  installers.set(installer.kind, installer);
}

const contentJson = (content: WorkflowContent): string => JSON.stringify({ ...content, elements: content.elements.map((element) => contentOf(element)), extra: undefined });

registerLibraryInstaller({
  kind: 'workflow',
  install(content, origin, edited, { workflows }) {
    const workflow = workflows.createAccepted(WorkflowContent.parse(edited ?? content), origin as never);
    return { workflowId: workflow.id };
  },
  update(target, content, edited, _from, { hub, workflows }) {
    if (!target.workflowId || !hub.state.workflows.some((w) => w.id === target.workflowId && w.listed)) return false;
    const { extra: _extra, ...fields } = WorkflowContent.parse(edited ?? content);
    // A new version of the workflow, as any edit makes: what it said before is still there, and runs that are going keep to their version.
    workflows.update(target.workflowId, fields, false);
    return true;
  },
  current(target, { hub }) {
    const workflow = hub.state.workflows.find((w) => w.id === target.workflowId && w.listed);
    if (!workflow) return null;
    const { number: _number, createdAt: _createdAt, ...now } = latestVersion(workflow);
    return { text: wholeText(now), changed: (installed) => contentJson(now) !== contentJson(WorkflowContent.parse(installed)) };
  },
  uses(target, { hub }) {
    const workflow = hub.state.workflows.find((w) => w.id === target.workflowId);
    return { uses: workflow ? [`the workflow "${workflow.name}"`] : [], liveRuns: hub.state.runs.filter((r) => r.workflowId === target.workflowId).length };
  },
  remove(target, { hub, workflows }) {
    if (target.workflowId && hub.state.workflows.some((w) => w.id === target.workflowId)) workflows.remove(target.workflowId);
  },
});

registerLibraryInstaller({
  kind: 'element',
  install(content, origin, edited, { drafts }) {
    const element = Element.parse(edited ?? content);
    return { shelfId: drafts.addToShelf({ ...element, origin: origin as never }).id };
  },
  update(target, content, edited, from, { hub, drafts }) {
    if (!target.shelfId || !hub.state.shelf.some((e) => e.id === target.shelfId)) return false;
    // A new version of the shelf element: its earlier versions stay, and no copy in a workflow is touched.
    drafts.updateOnShelf(target.shelfId, { ...contentOf(Element.parse(edited ?? content)), note: `From the library: version ${from.version}`.slice(0, 200) });
    return true;
  },
  current(target, { hub }) {
    const item = hub.state.shelf.find((e) => e.id === target.shelfId);
    const version = item ? versionOfProposal({ workflow: null, element: item.element }) : null;
    if (!item || !version) return null;
    return { text: previewRun(version, { task: '(task)' }), changed: (installed) => elementHash(item.element) !== elementHash(Element.parse(installed)) };
  },
  uses(target, { hub }) {
    const uses = target.shelfId ? usesOf(target.shelfId, hub.state.workflows, hub.state.shelf) : [];
    return { uses: uses.map((use) => `the workflow "${use.workflowName}" (a copy)`), liveRuns: 0 };
  },
  remove(target, { hub, drafts }) {
    if (target.shelfId && hub.state.shelf.some((e) => e.id === target.shelfId)) drafts.removeFromShelf(target.shelfId);
  },
});

/* ---------- The service ---------- */

export interface LibraryOptions {
  /** The folder in the data folder that fetched sources are kept in. */
  cacheDir: string;
  fetcher: LibraryFetcher;
  limits: () => WorkflowLimits;
  /** Reads how the owner's agents are set up, for advice about needs. Left out, the advice is "cannot tell". */
  inventories?: Inventories | undefined;
  /** Where the library that ships with the app is. Left out, this copy's. For tests. */
  builtin?: string | undefined;
}

const MAX_ITEM_BYTES = 512 * 1024;
const MAX_INDEX_BYTES = 1024 * 1024;

export class Library {
  private readonly deps: InstallerDeps;

  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    workflows: Workflows,
    drafts: Drafts,
    private readonly options: LibraryOptions,
  ) {
    this.deps = { hub, workflows, drafts, limits: options.limits };
  }

  private get state() {
    return this.hub.state.library;
  }

  /** Makes sure the library that ships with the app is among the sources, and read. Local files only. */
  async start(): Promise<void> {
    let builtin = this.state.sources.find((source) => source.kind === 'builtin');
    if (!builtin) {
      builtin = { id: newId(), kind: 'builtin', address: this.options.builtin ?? '', name: 'Comes with Aubergine', claims: null, addedAt: new Date().toISOString(), refreshedAt: null, commit: null, problem: null, history: null, items: [], skipped: [] };
      this.hub.emit({ type: 'library.source.changed', source: builtin });
    } else if ((this.options.builtin ?? '') !== builtin.address) {
      builtin = { ...builtin, address: this.options.builtin ?? '' };
      this.hub.emit({ type: 'library.source.changed', source: builtin });
    }
    // What ships with the app is read from this copy's own folder: nothing is fetched for it.
    await this.read(builtin, false).catch(() => undefined);
  }

  /* ---------- Sources ---------- */

  sources(): LibrarySource[] {
    return [...this.state.sources].sort((a, b) => (a.kind === 'builtin' ? -1 : b.kind === 'builtin' ? 1 : a.name.localeCompare(b.name) || a.id.localeCompare(b.id)));
  }

  source(sourceId: string): LibrarySource {
    const source = this.state.sources.find((s) => s.id === sourceId);
    if (!source) throw new NotFoundError(`No library source ${sourceId}`);
    return source;
  }

  private cacheOf(source: LibrarySource): string {
    return path.join(this.options.cacheDir, source.id);
  }

  /** Adds a source and reads it for the first time. The owner's alone: for a Git source this fetches. */
  async addSource(body: AddSourceRequest): Promise<LibrarySource> {
    const kind = sourceKinds.get(body.kind);
    if (!kind || body.kind === 'builtin') throw new BadInputError(`A source is one of: ${[...sourceKinds.keys()].filter((k) => k !== 'builtin').join(', ')}.`);
    if (this.state.sources.length >= LIBRARY_SOURCES_MAX) throw new ConflictError(`There are ${LIBRARY_SOURCES_MAX} sources; remove one first.`);
    const address = await kind.check(body.address);
    if (this.state.sources.some((s) => s.kind === body.kind && s.address === address)) throw new ConflictError('That source is already among yours.');
    const source: LibrarySource = { id: newId(), kind: body.kind, address, name: (body.name ?? '').slice(0, 120), claims: null, addedAt: new Date().toISOString(), refreshedAt: null, commit: null, problem: null, history: null, items: [], skipped: [] };
    this.hub.emit({ type: 'library.source.changed', source });
    const read = await this.read(source, true);
    return read;
  }

  /** Removes a source. What was installed from it stays, and says from then on that its source is no longer among yours. */
  async removeSource(sourceId: string): Promise<void> {
    const source = this.source(sourceId);
    if (source.kind === 'builtin') throw new ConflictError('The library that comes with Aubergine cannot be removed.');
    await sourceKinds.get(source.kind)?.forget?.(source, { cache: this.cacheOf(source), fetcher: this.options.fetcher });
    this.hub.emit({ type: 'library.source.removed', sourceId });
  }

  /** Reads a source again. The owner's alone: for a Git source this is the one thing that fetches. */
  refresh(sourceId: string): Promise<LibrarySource> {
    return this.read(this.source(sourceId), true);
  }

  /**
   * Reads a source's index and the digest of every file it names, and keeps that. `fetch`: the owner asked, so a
   * remote source may be fetched. When it cannot be read, what was read before stays, with why.
   */
  private async read(source: LibrarySource, fetch: boolean): Promise<LibrarySource> {
    const kind = sourceKinds.get(source.kind);
    const at = new Date().toISOString();
    const failed = (problem: string): LibrarySource => {
      const next: LibrarySource = { ...source, problem: problem.slice(0, 600) };
      this.hub.emit({ type: 'library.source.changed', source: next });
      return next;
    };
    if (!kind) return failed('This version of Aubergine does not know this kind of source.');
    let located: Located | null;
    try {
      located = await kind.locate(source, { cache: this.cacheOf(source), fetch, fetcher: this.options.fetcher });
    } catch (error) {
      return failed(error instanceof FetchRefusal || error instanceof BadInputError ? error.message : 'It could not be reached.');
    }
    if (!located) return source;
    const index = await readInside(located.root, LIBRARY_INDEX_FILE, MAX_INDEX_BYTES);
    if (!index.ok) return failed(`It has no index that can be read (${LIBRARY_INDEX_FILE} at its root): ${index.reason}`);
    const parsed = readLibraryIndex(index.bytes.toString('utf8'));
    if (!parsed.ok) return failed(parsed.reason);

    const before = new Map(source.items.map((item) => [item.id, item]));
    const items: LibraryItem[] = [];
    for (const entry of parsed.index.items) {
      const flags: ItemFlag[] = [];
      let digest: string | null = null;
      let problem: string | null = null;
      const file = await readInside(located.root, entry.path, MAX_ITEM_BYTES);
      if (!file.ok) {
        flags.push('unreadable');
        problem = file.reason;
      } else {
        digest = hashOf(file.bytes);
        const known = libraryKind(entry.kind);
        if (!known) {
          flags.push('unknown-kind');
          problem = FLAG_WORDS['unknown-kind'];
        } else {
          try {
            known.read(JSON.parse(file.bytes.toString('utf8')), this.options.limits());
          } catch (error) {
            flags.push('unreadable');
            problem = `Its file is not ${known.title.toLowerCase()}: ${(error as Error).message.slice(0, 200)}`;
          }
        }
      }
      const was = before.get(entry.id);
      // The same version as last time, and other content: said, not hidden. It stays said until the version changes.
      if (was && was.version === entry.version && was.digest !== null && digest !== null && (was.digest !== digest || was.flags.includes('changed-without-version'))) flags.push('changed-without-version');
      items.push({ id: entry.id, kind: entry.kind, name: entry.name, description: entry.description, version: entry.version, path: entry.path, digest, retired: entry.retired, replacedBy: entry.replacedBy ?? null, flags, problem });
    }
    // What was listed before and is not any more is kept in the list while it is installed, saying so.
    for (const was of source.items) {
      if (items.some((item) => item.id === was.id)) continue;
      if (this.state.installed.some((entry) => entry.from.sourceId === source.id && entry.from.itemId === was.id)) items.push({ ...was, flags: ['gone'], problem: FLAG_WORDS.gone });
    }
    // What the index calls the source is kept as its own claim. It never becomes the name.
    const next: LibrarySource = { ...source, claims: parsed.index.name ? parsed.index.name.slice(0, 120) : null, refreshedAt: at, commit: located.commit, history: located.history, problem: null, items, skipped: parsed.index.skipped };
    this.hub.emit({ type: 'library.source.changed', source: next });

    // What the source now says about what is installed from it: a state, and never a change to what is installed.
    for (const installed of this.state.installed.filter((entry) => entry.from.sourceId === source.id)) {
      const item = items.find((entry) => entry.id === installed.from.itemId);
      const atSource: InstalledItem['atSource'] = !item || item.flags.includes('gone') ? 'gone' : item.retired ? 'retired' : 'current';
      const useInstead = item?.retired && item.replacedBy ? (items.find((entry) => entry.id === item.replacedBy)?.name ?? item.replacedBy) : null;
      if (installed.atSource !== atSource || installed.useInstead !== useInstead) this.hub.emit({ type: 'library.installed.changed', item: { ...installed, atSource, useInstead } });
    }
    return next;
  }

  /* ---------- Items ---------- */

  private listed(source: LibrarySource, item: LibraryItem): ListedItem {
    const { standing, installed } = standingOf(source.id, item, this.state.installed);
    return {
      ...item,
      sourceId: source.id,
      sourceName: sourceLabel(source),
      sourceKind: source.kind,
      kindTitle: libraryKind(item.kind)?.title ?? item.kind,
      standing,
      installedId: installed?.id ?? null,
      installedVersion: installed?.from.version ?? null,
      requested: this.state.requests.some((request) => request.sourceId === source.id && request.itemId === item.id),
    };
  }

  items(): ListedItem[] {
    return this.sources().flatMap((source) => source.items.map((item) => this.listed(source, item)));
  }

  private find(sourceId: string, itemId: string): { source: LibrarySource; item: LibraryItem } {
    const source = this.source(sourceId);
    const item = source.items.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundError(`That source lists no item ${itemId}`);
    return { source, item };
  }

  /** Reads an item's file from what the last refresh left behind. Never fetches. */
  private async file(source: LibrarySource, item: LibraryItem): Promise<{ ok: true; digest: string; read: ReadItem } | { ok: false; reason: string }> {
    const kind = sourceKinds.get(source.kind);
    const located = kind ? await kind.locate(source, { cache: this.cacheOf(source), fetch: false, fetcher: this.options.fetcher }).catch(() => null) : null;
    if (!located) return { ok: false, reason: 'This source has not been read yet. Refresh it first.' };
    const known = libraryKind(item.kind);
    if (!known) return { ok: false, reason: FLAG_WORDS['unknown-kind'] };
    const file = await readInside(located.root, item.path, MAX_ITEM_BYTES);
    if (!file.ok) return { ok: false, reason: file.reason };
    try {
      return { ok: true, digest: hashOf(file.bytes), read: known.read(JSON.parse(file.bytes.toString('utf8')), this.options.limits()) };
    } catch (error) {
      return { ok: false, reason: `Its file is not ${known.title.toLowerCase()}: ${(error as Error).message.slice(0, 200)}` };
    }
  }

  private fromOf(source: LibrarySource, item: LibraryItem, digest: string): InstalledFrom {
    return { sourceId: source.id, kind: source.kind, address: source.address, sourceName: sourceLabel(source), itemId: item.id, version: item.version, commit: source.commit, digest };
  }

  private warnings(source: LibrarySource, item: LibraryItem, digestNow: string | null): string[] {
    const warnings = [...item.flags.filter((flag) => flag !== 'unreadable' && flag !== 'unknown-kind').map((flag) => FLAG_WORDS[flag])];
    const history = historyWords(source.history);
    if (history) warnings.push(history);
    if (item.retired) warnings.push(`Its publisher has retired it${item.replacedBy ? ` and names "${source.items.find((entry) => entry.id === item.replacedBy)?.name ?? item.replacedBy}" to use in its place` : ''}.`);
    if (digestNow !== null && item.digest !== null && digestNow !== item.digest) warnings.push('Its file changed on this computer since the source was last read. What is shown here is the file as it is now.');
    if (source.problem) warnings.push(`The source could not be read at the last try (${source.problem}). What is shown is from ${source.refreshedAt ?? 'before'}.`);
    return warnings;
  }

  async detail(sourceId: string, itemId: string): Promise<LibraryItemDetail> {
    const { source, item } = this.find(sourceId, itemId);
    const file = await this.file(source, item);
    const digest = file.ok ? file.digest : null;
    return {
      item: this.listed(source, item),
      text: file.ok ? file.read.text : null,
      needs: file.ok ? file.read.needs : [],
      digest,
      from: fromWords(this.fromOf(source, item, digest ?? '0'.repeat(64))),
      warnings: [...(file.ok ? [] : [file.reason]), ...this.warnings(source, item, digest)],
    };
  }

  /* ---------- Installs that wait ---------- */

  /**
   * Asks for an install, or for an update of what is installed. It installs nothing: the request waits for the
   * owner to read and accept it. One request per item.
   */
  request(sourceId: string, itemId: string, by: Requester): InstallRequest {
    const { source, item } = this.find(sourceId, itemId);
    if (item.problem !== null && !item.flags.includes('gone')) throw new ConflictError(`"${item.name}" cannot be installed: ${item.problem}`);
    if (item.flags.includes('gone')) throw new ConflictError(`"${item.name}" is no longer listed by its source.`);
    const waiting = this.state.requests.find((request) => request.sourceId === sourceId && request.itemId === itemId);
    if (waiting) return waiting;
    const { standing, installed } = standingOf(source.id, item, this.state.installed);
    if (standing === 'installed') throw new ConflictError(`"${item.name}" is installed, and its source has nothing newer.`);
    if (this.state.requests.length >= LIBRARY_REQUESTS_MAX) throw new ConflictError(`${LIBRARY_REQUESTS_MAX} installs are waiting to be read. No more can be asked for until some are accepted or discarded.`);
    const request: InstallRequest = { id: newId(), sourceId, itemId, updates: installed?.id ?? null, requestedBy: by, at: new Date().toISOString() };
    this.hub.emit({ type: 'library.request.changed', request });
    return request;
  }

  private waiting(requestId: string): InstallRequest {
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) throw new NotFoundError(`No install ${requestId} is waiting`);
    return request;
  }

  /** How the owner's agents are set up, for advice about needs: every agent terminal whose set-up can be read. */
  private async advice(needs: readonly Need[]): Promise<NeedAdvice[]> {
    if (needs.length === 0) return [];
    const inventories: { name: string; inventory: Inventory }[] = [];
    if (this.options.inventories) {
      for (const session of this.sessions.all().filter((s) => s.agent !== null && s.state !== 'exited').slice(0, 20)) {
        const inventory = await this.options.inventories.of(session).catch(() => null);
        if (inventory) inventories.push({ name: session.name, inventory });
      }
    }
    return needs.map((need) => {
      if (inventories.length === 0) return { need, state: 'cannot-tell' as const, words: 'No agent terminal is on your canvases whose set-up could be read, so it cannot be told whether you have this.' };
      const matches = inventories.map(({ name, inventory }) => ({ name, match: matchNeed(need, inventory) }));
      const found = matches.filter(({ match }) => match.state === 'found');
      if (found.length > 0) return { need, state: 'found' as const, words: `A name like it is in the set-up of ${found.map(({ name }) => `"${name}"`).join(', ')}. Names are compared, nothing more.` };
      const none = matches.every(({ match }) => match.state === 'not-found');
      return { need, state: none ? ('not-found' as const) : ('cannot-tell' as const), words: none ? 'No name like it is in the set-up of any agent terminal on your canvases. Names are compared, nothing more.' : (matches[0]?.match.words ?? 'It cannot be told.') };
    });
  }

  private about(request: InstallRequest): Pick<InstallRequestDetail, 'request' | 'item' | 'what' | 'from' | 'requestedBy'> & { source: LibrarySource | null; found: LibraryItem | null; installed: InstalledItem | null } {
    const source = this.state.sources.find((s) => s.id === request.sourceId) ?? null;
    const found = source?.items.find((entry) => entry.id === request.itemId) ?? null;
    const installed = request.updates ? (this.state.installed.find((entry) => entry.id === request.updates) ?? null) : null;
    const title = found ? (libraryKind(found.kind)?.title ?? found.kind) : 'Something';
    return {
      request,
      item: source && found ? this.listed(source, found) : null,
      what: installed ? `A new version of ${title.toLowerCase().replace(/^an? /, 'the ')} "${installed.name}" (you have version ${installed.from.version}; this is version ${found?.version ?? '?'})` : title,
      from: source && found ? fromWords(this.fromOf(source, found, found.digest ?? '0'.repeat(64))) : 'a source that is no longer among yours',
      requestedBy: request.requestedBy.kind === 'owner' ? 'you' : `the program "${request.requestedBy.name}"`,
      source,
      found,
      installed,
    };
  }

  requests(): Pick<InstallRequestDetail, 'request' | 'item' | 'what' | 'from' | 'requestedBy'>[] {
    return [...this.state.requests]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((request) => {
        const { source: _source, found: _found, installed: _installed, ...rest } = this.about(request);
        return rest;
      });
  }

  /** Everything the reviewer of an install reads. The file is read now, from this computer; its digest is what an acceptance names. */
  async requestDetail(requestId: string): Promise<InstallRequestDetail> {
    const { source, found, installed, ...about } = this.about(this.waiting(requestId));
    const none = { ...about, text: null, previousText: null, installedText: null, needs: [], digest: null, proposal: { workflow: null, element: null } };
    if (!source || !found) return { ...none, warnings: ['Its source is no longer among yours, or no longer lists it. It cannot be installed; discard it.'] };
    const file = await this.file(source, found);
    if (!file.ok) return { ...none, warnings: [file.reason, ...this.warnings(source, found, null)] };
    const warnings = this.warnings(source, found, file.digest);
    let previousText: string | null = null;
    let installedText: string | null = null;
    if (installed) {
      const installer = installers.get(installed.kind);
      const now = installer?.current(installed.target, this.deps) ?? null;
      const known = libraryKind(installed.kind);
      const asInstalled = known ? this.textOf(installed) : null;
      previousText = now?.text ?? asInstalled;
      if (now && now.changed(installed.content)) {
        // Changed here since it was installed: the three texts, and accepting replaces the owner's changes.
        installedText = asInstalled;
        warnings.unshift('You changed it since you installed it. Accepting puts this version in place of yours (your version stays among its earlier versions). Nothing is merged: to keep parts of both, accept and then edit, or discard this and keep yours.');
      }
      if (!now) warnings.unshift('What was installed is no longer there. Accepting installs it again.');
    }
    return {
      ...about,
      text: file.read.text,
      previousText,
      installedText,
      needs: await this.advice(file.read.needs),
      digest: file.digest,
      warnings,
      proposal: { workflow: found.kind === 'workflow' ? file.read.content : null, element: found.kind === 'element' ? file.read.content : null },
    };
  }

  /** What an agent would be told by the content as it was installed. */
  private textOf(installed: InstalledItem): string | null {
    try {
      if (installed.kind === 'workflow') return wholeText(WorkflowContent.parse(installed.content));
      if (installed.kind === 'element') {
        const version = versionOfProposal({ workflow: null, element: Element.parse(installed.content) });
        return version ? previewRun(version, { task: '(task)' }) : null;
      }
    } catch {
      // Content this version cannot read any more: nothing to compare with.
    }
    return null;
  }

  /**
   * Installs what a request asks for, or brings what is installed up to date. The owner's alone. `digest` is
   * the digest of the file the owner was shown: the file is read again now, and if it is not that file any
   * more, nothing is installed.
   */
  async accept(requestId: string, digest: string, edited: { workflow?: unknown; element?: unknown } = {}): Promise<InstalledItem> {
    const request = this.waiting(requestId);
    const { source, found, installed } = this.about(request);
    if (!source || !found) throw new ConflictError('Its source is no longer among yours, or no longer lists it. Nothing was installed.');
    const file = await this.file(source, found);
    if (!file.ok) throw new ConflictError(`Nothing was installed: ${file.reason}`);
    if (file.digest !== digest) throw new ConflictError('Nothing was installed: the file is not the one you were shown. It changed since you read it. Read it again.');
    const installer = installers.get(found.kind);
    const from = this.fromOf(source, found, file.digest);
    const origin = { kind: 'library', source: source.kind, address: source.address, itemId: found.id, version: found.version, ...(source.commit ? { commit: source.commit } : {}) };
    const change = found.kind === 'workflow' ? edited.workflow : found.kind === 'element' ? edited.element : undefined;
    let target: InstalledItem['target'] = installed?.target ?? {};
    if (installer) {
      const updated = installed ? installer.update(installed.target, file.read.content, change, from, this.deps) : false;
      if (!updated) target = installer.install(file.read.content, origin, change, this.deps);
    }
    const item: InstalledItem = {
      id: installed?.id ?? newId(),
      kind: found.kind,
      name: file.read.name,
      from,
      installedAt: new Date().toISOString(),
      // What was fetched and read, not what the owner changed it to: against this, "changed here" is told later.
      content: file.read.content,
      target,
      atSource: found.retired ? 'retired' : 'current',
      useInstead: found.retired && found.replacedBy ? (source.items.find((entry) => entry.id === found.replacedBy)?.name ?? found.replacedBy) : null,
    };
    this.hub.emit({ type: 'library.installed.changed', item });
    this.hub.emit({ type: 'library.request.removed', requestId });
    return item;
  }

  discard(requestId: string): void {
    this.waiting(requestId);
    this.hub.emit({ type: 'library.request.removed', requestId });
  }

  /* ---------- What is installed ---------- */

  installed(): Omit<InstalledItem, 'content'>[] {
    return [...this.state.installed].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map(({ content: _content, ...rest }) => rest);
  }

  private installedItem(installedId: string): InstalledItem {
    const item = this.state.installed.find((entry) => entry.id === installedId);
    if (!item) throw new NotFoundError(`Nothing installed has the ID ${installedId}`);
    return item;
  }

  /** Where an installed item is used: said before it is removed. */
  usage(installedId: string): InstalledUsage {
    const item = this.installedItem(installedId);
    return installers.get(item.kind)?.uses(item.target, this.deps) ?? { uses: [], liveRuns: 0 };
  }

  /** Removes what was installed. Copies of it in workflows stay as they are, and say that their source was removed. */
  remove(installedId: string): void {
    const item = this.installedItem(installedId);
    installers.get(item.kind)?.remove(item.target, this.deps);
    this.hub.emit({ type: 'library.installed.removed', installedId });
  }
}
