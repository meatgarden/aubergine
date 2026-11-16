import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from '@aubergine/client';
import { FLAG_WORDS, LIBRARY_INDEX_FILE, LIBRARY_INDEX_FORMAT, LibraryItemId, PublisherVersion, exportElement, exportWorkflow, historyWords, repositoryFileName, showControl, type Element, type Workflow } from '@aubergine/shared';
import { hashOf, readInside, writeInside } from '../repository-files';
import { UsageError, takeOption } from './commands';
import { resolveWorkflow } from './workflow';

/**
 * `aubergine library …`: the sources of the library, what they offer,
 * installing from them, and writing one's own workflow or element into a
 * folder so that the folder can be a source.
 *
 * Everything but `export` goes through the public API as the owner.
 * `export` writes two files into the folder the owner names and nothing
 * else: it never commits, never pushes, and never writes outside that folder.
 */

export type LibraryCommand =
  | { action: 'sources' }
  | { action: 'add'; address: string; name: string | null }
  | { action: 'remove'; query: string }
  | { action: 'refresh'; query: string | null }
  | { action: 'list' }
  | { action: 'show'; query: string }
  | { action: 'install'; query: string }
  | { action: 'export'; query: string; to: string; element: boolean; version: string | null; id: string | null };

export function parseLibraryCommand(words: readonly string[]): LibraryCommand {
  const [action, ...rest] = words;
  const none = (what: string): void => {
    const unknown = rest.find((word) => word.startsWith('--'));
    if (unknown) throw new UsageError(`library ${what} does not know ${unknown}`);
  };
  switch (action) {
    case undefined:
    case 'list':
    case 'ls':
      if (rest.length > 0) throw new UsageError('library list takes no arguments');
      return { action: 'list' };
    case 'sources':
      if (rest.length > 0) throw new UsageError('library sources takes no arguments');
      return { action: 'sources' };
    case 'add': {
      const { value: name, rest: after } = takeOption(rest, '--name');
      const unknown = after.find((word) => word.startsWith('--'));
      if (unknown) throw new UsageError(`library add does not know ${unknown}`);
      if (after.length !== 1) throw new UsageError('library add needs one thing: a folder, or the address of a Git repository (https://…, ssh://…, user@host:path, file://…)');
      return { action: 'add', address: after[0] as string, name };
    }
    case 'remove':
    case 'rm':
      none('remove');
      if (rest.length === 0) throw new UsageError('library remove needs the name of a source, as `aubergine library sources` lists them');
      return { action: 'remove', query: rest.join(' ') };
    case 'refresh':
      none('refresh');
      return { action: 'refresh', query: rest.length > 0 ? rest.join(' ') : null };
    case 'show':
      none('show');
      if (rest.length === 0) throw new UsageError('library show needs an item: its ID or its name, as `aubergine library list` shows them');
      return { action: 'show', query: rest.join(' ') };
    case 'install':
      none('install');
      if (rest.length === 0) throw new UsageError('library install needs an item: its ID or its name, as `aubergine library list` shows them');
      return { action: 'install', query: rest.join(' ') };
    case 'export': {
      const { value: to, rest: afterTo } = takeOption(rest, '--to');
      const { value: version, rest: afterVersion } = takeOption(afterTo, '--version');
      const { value: id, rest: afterId } = takeOption(afterVersion, '--id');
      const unknown = afterId.find((word) => word.startsWith('--') && word !== '--element');
      if (unknown) throw new UsageError(`library export does not know ${unknown}`);
      const names = afterId.filter((word) => word !== '--element');
      if (names.length === 0 || to === null) throw new UsageError('library export needs the name of a workflow (or, with --element, of a shelf element) and --to <folder>');
      if (version !== null && !PublisherVersion.safeParse(version).success) throw new UsageError('--version is letters, digits, ".", "+", "-" and "_", such as 2 or 1.3.0');
      if (id !== null && !LibraryItemId.safeParse(id).success) throw new UsageError('--id is lower-case letters, digits, ".", "-" and "_"');
      return { action: 'export', query: names.join(' '), to, element: afterId.includes('--element'), version, id };
    }
    default:
      throw new UsageError('library needs one of: sources, add, remove, refresh, list, show, install, export');
  }
}

export interface LibraryCommandDeps {
  owner<T>(work: (client: Client) => Promise<T>): Promise<T>;
  print(text: string): void;
  ask(question: string): Promise<string>;
  /** The folder relative paths are taken from. */
  cwd: string;
}

type Source = Awaited<ReturnType<Client['listLibrarySources']>>['sources'][number];
type Listed = Awaited<ReturnType<Client['listLibraryItems']>>['items'][number];

function pickSource(sources: readonly Source[], query: string): Source {
  const wanted = query.trim().toLowerCase();
  const found = sources.filter((source) => source.id === query || source.name.toLowerCase() === wanted || source.address === query);
  if (found.length === 1) return found[0] as Source;
  throw new UsageError(found.length === 0 ? `No source is named "${query}". They are: ${sources.map((s) => `"${s.name}"`).join(', ')}.` : `${found.length} sources are named "${query}". Use the address or the ID.`);
}

function pickItem(items: readonly Listed[], query: string): Listed {
  const wanted = query.trim().toLowerCase();
  const found = items.filter((item) => item.id === wanted || item.name.toLowerCase() === wanted);
  if (found.length === 1) return found[0] as Listed;
  throw new UsageError(found.length === 0 ? `Nothing in the library has the ID or the name "${query}". See: aubergine library list` : `${found.length} items match "${query}": ${found.map((item) => `${item.id} in "${item.sourceName}"`).join(', ')}. They are in different sources: remove the ambiguity by using the browser.`);
}

const sourceLine = (source: Source): string =>
  [
    `${source.name}  (${source.kind === 'builtin' ? 'comes with Aubergine' : `${source.kind}: ${source.address}`})`,
    `  ${source.items.length} item${source.items.length === 1 ? '' : 's'}; ${source.refreshedAt ? `last read ${source.refreshedAt}` : 'not read yet'}${source.commit ? `, commit ${source.commit.slice(0, 12)}` : ''}`,
    ...(source.problem ? [`  Could not be read at the last try: ${source.problem}`] : []),
    ...(historyWords(source.history) ? [`  ${historyWords(source.history)}`] : []),
    ...source.skipped.map((skipped) => `  Skipped "${skipped.id}": ${skipped.reason}`),
  ].join('\n');

const standingWords = (item: Listed): string => (item.standing === 'installed' ? `installed (version ${item.installedVersion})` : item.standing === 'update' ? `installed at version ${item.installedVersion}; the source has version ${item.version}` : item.requested ? 'waits for you in Review' : 'not installed');

export async function runLibraryCommand(command: LibraryCommand, deps: LibraryCommandDeps): Promise<number> {
  const { owner, print } = deps;
  switch (command.action) {
    case 'sources': {
      const { sources } = await owner((client) => client.listLibrarySources());
      print(showControl(sources.map(sourceLine).join('\n\n')));
      return 0;
    }
    case 'add': {
      // A folder when it is one on this computer; otherwise an address for Git, which the server checks.
      const asPath = path.resolve(deps.cwd, command.address);
      const isFolder = !/^[a-z]+:\/\//i.test(command.address) && (await stat(asPath).then((s) => s.isDirectory(), () => false));
      const source = await owner((client) => client.addLibrarySource({ body: { kind: isFolder ? 'folder' : 'git', address: isFolder ? asPath : command.address, ...(command.name ? { name: command.name } : {}) } }));
      print(showControl(sourceLine(source)));
      return source.problem ? 1 : 0;
    }
    case 'remove': {
      const { sources } = await owner((client) => client.listLibrarySources());
      const source = pickSource(sources, command.query);
      await owner((client) => client.removeLibrarySource({ sourceId: source.id }));
      print(showControl(`Removed the source "${source.name}". What was installed from it stays as it is.`));
      return 0;
    }
    case 'refresh': {
      const { sources } = await owner((client) => client.listLibrarySources());
      const which = command.query === null ? sources : [pickSource(sources, command.query)];
      let failed = 0;
      for (const source of which) {
        const read = await owner((client) => client.refreshLibrarySource({ sourceId: source.id }));
        print(showControl(sourceLine(read)));
        if (read.problem) failed += 1;
      }
      return failed > 0 ? 1 : 0;
    }
    case 'list': {
      const { items } = await owner((client) => client.listLibraryItems());
      if (items.length === 0) {
        print('The library is empty. Add a source: aubergine library add <folder or Git address>');
        return 0;
      }
      const width = Math.max(...items.map((item) => item.id.length));
      print(showControl(items.map((item) => `${item.id.padEnd(width)}  ${item.kindTitle.toLowerCase()}, version ${item.version}, from "${item.sourceName}": ${item.name}. ${item.description}\n${' '.repeat(width)}  ${standingWords(item)}${item.retired ? '; retired by its publisher' : ''}${item.problem ? `; cannot be installed: ${item.problem}` : ''}${item.flags.filter((flag) => flag === 'changed-without-version' || flag === 'gone').map((flag) => `; ${FLAG_WORDS[flag]}`).join('')}`).join('\n')));
      return 0;
    }
    case 'show': {
      const { items } = await owner((client) => client.listLibraryItems());
      const item = pickItem(items, command.query);
      const detail = await owner((client) => client.getLibraryItem({ sourceId: item.sourceId, itemId: item.id }));
      print(showControl([`${item.kindTitle}: ${item.name}`, `From ${detail.from}`, standingWords(item), ...detail.warnings.map((warning) => `Careful: ${warning}`), ...(detail.needs.length > 0 ? [`Needs: ${detail.needs.map((need) => `${need.kind} ${need.name}`).join('; ')}`] : []), '', detail.text ?? '(It could not be read.)'].join('\n')));
      return detail.text === null ? 1 : 0;
    }
    case 'install': {
      const { items } = await owner((client) => client.listLibraryItems());
      const item = pickItem(items, command.query);
      const request = await owner((client) => client.requestLibraryInstall({ body: { sourceId: item.sourceId, itemId: item.id } }));
      const detail = await owner((client) => client.getLibraryRequest({ requestId: request.id }));
      if (detail.text === null || detail.digest === null) {
        print(showControl(`It cannot be installed: ${detail.warnings.join(' ')}`));
        await owner((client) => client.discardLibraryRequest({ requestId: request.id }));
        return 1;
      }
      // Everything an agent would be told, before anything is installed. Someone else wrote it.
      print(
        showControl(
          [
            `${detail.what}, from ${detail.from}.`,
            ...detail.warnings.map((warning) => `Careful: ${warning}`),
            ...detail.needs.map((advice) => `Needs ${advice.need.kind} ${advice.need.name}: ${advice.words}`),
            '',
            'This is what an agent will be told. Someone else wrote it; an agent will follow it. Read all of it:',
            '',
            detail.text,
            ...(detail.previousText !== null ? ['', 'What is in place now says:', '', detail.previousText] : []),
            '',
          ].join('\n'),
        ),
      );
      if (!/^y(es)?$/i.test((await deps.ask('Install exactly this? [y/N] ')).trim())) {
        print('Not installed. It waits in Review in the browser; discard it there if you do not want it.');
        return 0;
      }
      const installed = await owner((client) => client.acceptLibraryRequest({ requestId: request.id, body: { digest: detail.digest as string } }));
      print(showControl(`Installed "${installed.name}", version ${installed.from.version}.`));
      return 0;
    }
    case 'export':
      return exportToFolder(command, deps);
  }
}

/** The JSON of a file inside a folder, when there is one that can be read. */
async function jsonInside(root: string, file: string): Promise<{ raw: string; json: unknown } | null> {
  const read = await readInside(root, file, 4 * 1024 * 1024);
  if (!read.ok) return null;
  try {
    return { raw: read.bytes.toString('utf8'), json: JSON.parse(read.bytes.toString('utf8')) };
  } catch {
    throw new UsageError(`${file} in that folder is not JSON. Nothing was written.`);
  }
}

/**
 * Writes a workflow or a shelf element as a file into a folder, and adds or updates its entry in the folder's
 * index, making the index when there is none. Two files, both inside the folder; nothing is committed or pushed.
 */
async function exportToFolder(command: Extract<LibraryCommand, { action: 'export' }>, deps: LibraryCommandDeps): Promise<number> {
  const { owner, print } = deps;
  let root: string;
  try {
    root = await realpath(path.resolve(deps.cwd, command.to));
    if (!(await stat(root)).isDirectory()) throw new Error('not a folder');
  } catch {
    throw new UsageError(`${command.to} is not a folder. Make it first: nothing is created outside what you name.`);
  }

  let name: string;
  let file: Record<string, unknown>;
  if (command.element) {
    const shelf: { id: string; element: Element }[] = [];
    await owner(async (client) => {
      for await (const item of client.each.listElements()) shelf.push(item as never);
    });
    const item = resolveWorkflow(shelf.map((entry) => ({ ...entry, name: entry.element.name })), command.query);
    name = item.element.name;
    file = exportElement(item.element);
  } else {
    const all: { id: string; name: string }[] = [];
    await owner(async (client) => {
      for await (const workflow of client.each.listWorkflows()) all.push(workflow);
    });
    const summary = resolveWorkflow(all, command.query);
    const detail = await owner((client) => client.getWorkflow({ workflowId: summary.id }));
    name = detail.name;
    // Where the copies in it came from on this computer means nothing elsewhere: left out of what is published.
    const current = { ...detail.current, elements: detail.current.elements.map((element) => ({ ...element, source: null })) };
    file = exportWorkflow({ ...detail, projectId: detail.id, listed: true, versions: [current] } as unknown as Workflow);
    delete (file.workflow as Record<string, unknown>).labels;
    delete (file.workflow as Record<string, unknown>).origin;
    const published = file.workflow as { elements: Record<string, unknown>[] };
    published.elements = published.elements.map(({ origin: _origin, ...element }) => element);
  }

  const kind = command.element ? 'element' : 'workflow';
  const slug = repositoryFileName(name).replace(/\.json$/, '');
  const id = command.id ?? slug;
  if (!LibraryItemId.safeParse(id).success) throw new UsageError(`"${name}" does not make an ID. Give one with --id.`);
  const relative = `${kind}s/${slug}.json`;
  const text = `${JSON.stringify(file, null, 2)}\n`;

  const existing = await jsonInside(root, LIBRARY_INDEX_FILE);
  const index = (existing?.json ?? { aubergine: 'library', format: LIBRARY_INDEX_FORMAT, items: [] }) as { aubergine?: unknown; items?: unknown };
  if (index.aubergine !== 'library' || !Array.isArray(index.items)) throw new UsageError(`${LIBRARY_INDEX_FILE} in that folder is not a library index. Nothing was written.`);
  const items = index.items as Record<string, unknown>[];
  const at = items.findIndex((entry) => entry && typeof entry === 'object' && entry.id === id);
  const before = at >= 0 ? (items[at] as Record<string, unknown>) : null;
  if (before && before.kind !== kind) throw new UsageError(`That folder already lists "${id}" as ${String(before.kind)}. Give another ID with --id.`);

  // The version is the publisher's to give. Unchanged content keeps its version; changed content needs a new one.
  const was = before && typeof before.path === 'string' ? await readInside(root, before.path, 4 * 1024 * 1024) : null;
  const same = was?.ok === true && hashOf(was.bytes) === hashOf(text);
  let version = command.version;
  if (version === null) {
    const old = before && typeof before.version === 'string' ? before.version : null;
    if (old === null) version = '1';
    else if (same) version = old;
    else if (/^\d{1,9}$/.test(old)) version = String(Number(old) + 1);
    else throw new UsageError(`"${id}" is at version ${old} in that folder and its content changed. Say which version this is: --version <version>`);
  } else if (before && !same && before.version === version) {
    throw new UsageError(`"${id}" is already at version ${version} in that folder with other content. Give it a new version: whoever installed it would otherwise have other content under the same version.`);
  }

  const entry = { ...(before ?? {}), id, kind, name, description: typeof before?.description === 'string' ? before.description : '', version, path: relative };
  const next = { ...index, items: at >= 0 ? items.map((old, position) => (position === at ? entry : old)) : [...items, entry] };
  const wrote = await writeInside(root, relative, text);
  await writeInside(root, LIBRARY_INDEX_FILE, `${JSON.stringify(next, null, 2)}\n`);
  print(showControl(`${wrote.replaced ? 'Replaced' : 'Wrote'} ${wrote.path}\n${existing ? 'Updated' : 'Made'} ${path.join(root, LIBRARY_INDEX_FILE)}: "${id}", version ${version}.\nNothing was committed or pushed: that is yours to do. To use this folder as a source: aubergine library add ${root}`));
  if (entry.description === '') print('Its entry has no description yet: add one line to "description" in the index, so that whoever browses knows what it is for.');
  return 0;
}
