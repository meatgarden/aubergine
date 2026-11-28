import type { Dirent } from 'node:fs';
import { lstat, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  FOLLOW,
  PLUGINS_FOLDER,
  PLUGINS_MAX,
  PLUGIN_FILES_MAX,
  PLUGIN_FILE_MAX_BYTES,
  PLUGIN_ID,
  PLUGIN_MANIFEST,
  isPluginFileName,
  plain,
  pluginContentType,
  pluginDigestText,
  pluginIdProblem,
  pluginStarter,
  readPluginManifest,
  resolvePluginSwitches,
  type PluginFile,
  type PluginFound,
  type PluginManifest,
  type PluginsAnswer,
} from '@aubergine/shared';
import { RepositoryWriteError, hashOf, readInside, writeInside } from './repository-files';

/**
 * The owner's plugins: `plugins/<id>/` in the data folder. This module is the one place that folder is read, and what
 * a manifest holds is decided by `readPluginManifest` in shared/. Only regular files directly in a plugin's folder are
 * read, by the same reader as a repository's files (`readInside`: no link followed, at most `PLUGIN_FILE_MAX_BYTES`
 * each), at most `PLUGIN_FILES_MAX` of them, and at most `PLUGINS_MAX` plugins. A link, a folder or a name a file
 * cannot have is said and skipped.
 *
 * The server runs nothing of a plugin, and reads nothing in it as configuration but the manifest: its files are bytes
 * that are sent to the signed-in owner's page, under the digest the plugin has as it is read for that request. Nothing
 * is kept between readings: every answer and every file sent is of the folder as it is then. Nothing is fetched.
 */

/** One plugin as it was read: what the page is told of it, and the bytes of its files. */
export interface PluginReading {
  found: PluginFound;
  contents: ReadonlyMap<string, Buffer>;
}

const byName = (a: Dirent, b: Dirent): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Reads one plugin's folder, afresh. Null where there is nothing of that name in the folder of plugins. */
export async function readPlugin(pluginsFolder: string, id: string): Promise<PluginReading | null> {
  const where = `${PLUGINS_FOLDER}/${plain(id)}`;
  const nothing = (notLoaded: string): PluginReading => ({ found: { id, name: id, manifest: null, digest: null, files: [], notLoaded, problems: [] }, contents: new Map() });
  if (!PLUGIN_ID.test(id)) return null;
  const folder = path.join(pluginsFolder, id);
  const stats = await lstat(folder).catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' || error.code === 'ENOTDIR' ? null : error));
  if (stats === null) return null;
  if (stats instanceof Error) return nothing(`${where}: the folder could not be looked at. It is not loaded.`);
  // A link here could point anywhere on the machine: it is not followed.
  if (stats.isSymbolicLink()) return nothing(`${where}: it is a link, and links are not followed. It is not loaded.`);
  if (!stats.isDirectory()) return nothing(`${where}: it is not a folder. It is not loaded.`);
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return nothing(`${where}: the folder could not be read. It is not loaded.`);
  }
  const problems: string[] = [];
  const named: Dirent[] = [];
  for (const entry of entries.sort(byName)) {
    const at = `${where}/${plain(entry.name)}`;
    if (!isPluginFileName(entry.name)) problems.push(`${at}: its name is not one a plugin’s file can have (letters, digits, dots, hyphens and underscores, at most 80). It is skipped.`);
    else if (entry.isSymbolicLink()) problems.push(`${at}: it is a link, and links are not followed. It is skipped.`);
    else if (entry.isDirectory()) problems.push(`${at}: it is a folder, and a plugin’s folders are not read: its files are directly in its own folder. It is skipped.`);
    else if (!entry.isFile()) problems.push(`${at}: it is not a regular file. It is skipped.`);
    else named.push(entry);
  }
  const found = (fields: { manifest: PluginManifest | null; digest: string | null; files: PluginFile[]; notLoaded: string | null; name?: string }): PluginFound => ({ id, name: fields.name ?? fields.manifest?.name ?? id, problems, ...fields });
  if (named.length > PLUGIN_FILES_MAX) return { found: found({ manifest: null, digest: null, files: [], notLoaded: `${where}: it has ${named.length} files, and a plugin may have at most ${PLUGIN_FILES_MAX}. It is not loaded.` }), contents: new Map() };

  const contents = new Map<string, Buffer>();
  const files: PluginFile[] = [];
  let unread: string | null = null;
  for (const entry of named) {
    const read = await readInside(folder, entry.name, PLUGIN_FILE_MAX_BYTES);
    if (!read.ok) {
      unread ??= `${where}/${plain(entry.name)}: ${read.reason} The plugin is not loaded.`;
      continue;
    }
    contents.set(entry.name, read.bytes);
    files.push({ name: entry.name, bytes: read.bytes.length });
  }
  // Over every file, or none: a digest of some of them would approve what was not read.
  const digest = unread === null ? hashOf(pluginDigestText(files.map((file) => ({ name: file.name, sha256: hashOf(contents.get(file.name) as Buffer) })))) : null;

  const manifestBytes = contents.get(PLUGIN_MANIFEST);
  if (manifestBytes === undefined) return { found: found({ manifest: null, digest, files, notLoaded: unread ?? `${where}: there is no ${PLUGIN_MANIFEST} in it. It is not loaded.` }), contents };
  const reading = readPluginManifest(id, manifestBytes.toString('utf8'));
  if ('problem' in reading) return { found: found({ manifest: null, digest, files, notLoaded: reading.problem, ...(reading.name ? { name: reading.name } : {}) }), contents };
  problems.push(...reading.problems);
  const { manifest } = reading;
  const missing = [manifest.main, ...(manifest.style ? [manifest.style] : [])].find((file) => !contents.has(file));
  const notLoaded = unread ?? (missing === undefined ? null : `${where}: its manifest names ${plain(missing)}, which is not a file in its folder. It is not loaded.`);
  return { found: found({ manifest, digest, files, notLoaded }), contents };
}

/** Every plugin in the folder of plugins, read afresh, and what was wrong with the folder. */
export async function readPluginsFolder(pluginsFolder: string): Promise<{ plugins: PluginReading[]; problems: string[] }> {
  const stats = await lstat(pluginsFolder).catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? null : error));
  if (stats === null) return { plugins: [], problems: [] };
  if (stats instanceof Error) return { plugins: [], problems: [`${PLUGINS_FOLDER}: the folder could not be looked at. No plugin is read.`] };
  if (stats.isSymbolicLink()) return { plugins: [], problems: [`${PLUGINS_FOLDER}: it is a link, and links are not followed. No plugin is read.`] };
  if (!stats.isDirectory()) return { plugins: [], problems: [`${PLUGINS_FOLDER}: it is not a folder. No plugin is read.`] };
  let entries: Dirent[];
  try {
    entries = await readdir(pluginsFolder, { withFileTypes: true });
  } catch {
    return { plugins: [], problems: [`${PLUGINS_FOLDER}: the folder could not be read. No plugin is read.`] };
  }
  const problems: string[] = [];
  const ids: string[] = [];
  for (const entry of entries.sort(byName)) {
    // A file a system leaves in every folder (.DS_Store) is no plugin and not worth a sentence.
    if (entry.name.startsWith('.')) continue;
    const wrong = pluginIdProblem(entry.name);
    if (wrong) problems.push(`${PLUGINS_FOLDER}/${plain(entry.name)}: ${wrong} It is skipped.`);
    else if (entry.isSymbolicLink() || entry.isDirectory()) ids.push(entry.name);
    else problems.push(`${PLUGINS_FOLDER}/${plain(entry.name)}: it is not a folder; a plugin is a folder with a ${PLUGIN_MANIFEST} in it. It is skipped.`);
  }
  if (ids.length > PLUGINS_MAX) problems.push(`${PLUGINS_FOLDER}: there are ${ids.length} plugins; the first ${PLUGINS_MAX} by name are read, and the rest are not.`);
  const plugins: PluginReading[] = [];
  for (const id of ids.slice(0, PLUGINS_MAX)) {
    const reading = await readPlugin(pluginsFolder, id);
    if (reading) plugins.push(reading);
  }
  return { plugins, problems };
}

/** A file of a plugin as it is sent: its bytes and what they are. */
export interface PluginFileNow {
  bytes: Buffer;
  type: string;
}

/** What the server asks of the plugins. Every answer is of the folder as it is read for it. */
export interface Plugins {
  /** Every plugin, and what `on` (the settings' `plugins.on`) switches on. */
  answer(on: unknown): Promise<PluginsAnswer>;
  /** One plugin, read afresh; null where there is none of that ID. */
  one(id: string): Promise<PluginReading | null>;
  /**
   * One file of a plugin, read afresh, or null: only while the plugin can be loaded, its digest now is `digest`, and
   * `on` switches it on at that digest or to follow changes; and only a file of a kind that is sent.
   */
  file(id: string, digest: string, name: string, on: unknown): Promise<PluginFileNow | null>;
}

/** No plugins: a server started without a data folder, and the tests that do not look at plugins. */
export const NO_PLUGINS: Plugins = {
  answer: async (on) => ({ folder: null, plugins: [], on: resolvePluginSwitches(on).on, problems: resolvePluginSwitches(on).problems }),
  one: async () => null,
  file: async () => null,
};

/** The plugins of a data folder. A problem is said once in the log, not on every reading. */
export class PluginFolder implements Plugins {
  private said = new Set<string>();

  constructor(
    private readonly dataDir: string,
    private readonly onWarning: (message: string) => void = () => {},
  ) {}

  get folder(): string {
    return path.join(this.dataDir, PLUGINS_FOLDER);
  }

  private tell(problems: readonly string[]): void {
    const now = new Set(problems);
    for (const problem of now) if (!this.said.has(problem)) this.onWarning(problem);
    this.said = now;
  }

  async answer(on: unknown): Promise<PluginsAnswer> {
    const read = await readPluginsFolder(this.folder);
    const switches = resolvePluginSwitches(on);
    const problems = [...read.problems, ...switches.problems];
    this.tell([...problems, ...read.plugins.flatMap((one) => [...(one.found.notLoaded ? [one.found.notLoaded] : []), ...one.found.problems])]);
    return { folder: this.folder, plugins: read.plugins.map((one) => one.found), on: switches.on, problems };
  }

  async one(id: string): Promise<PluginReading | null> {
    // The folder of plugins itself is looked at first: a link there is not followed to find one.
    const stats = await lstat(this.folder).catch(() => null);
    if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) return null;
    return readPlugin(this.folder, id);
  }

  async file(id: string, digest: string, name: string, on: unknown): Promise<PluginFileNow | null> {
    const type = pluginContentType(name);
    if (type === null || !isPluginFileName(name)) return null;
    const switched = resolvePluginSwitches(on).on[id];
    if (switched === undefined) return null;
    const reading = await this.one(id);
    if (!reading || reading.found.notLoaded !== null || reading.found.digest === null) return null;
    // The digest asked for is the one the plugin has now, and that is the one switched on (or it follows changes).
    if (reading.found.digest !== digest || (switched !== FOLLOW && switched !== digest)) return null;
    const bytes = reading.contents.get(name);
    return bytes === undefined ? null : { bytes, type };
  }
}

/** Why a new plugin was not written, in a sentence. */
export class PluginWriteError extends Error {}

/**
 * Writes the starter plugin (`pluginStarter`) into `plugins/<id>/` in the data folder: never into a folder that is
 * there, never through a link (`writeInside`: no folder on the way may be a link, and no file is written over).
 */
export async function writePluginStarter(dataDir: string, id: string, name: string): Promise<string> {
  const wrong = pluginIdProblem(id);
  if (wrong) throw new PluginWriteError(`“${plain(id)}”: ${wrong} Nothing was written.`);
  const dataStats = await lstat(dataDir).catch(() => null);
  if (!dataStats) throw new PluginWriteError(`The data folder (${dataDir}) is not there. Nothing was written: start the server once, or make the folder.`);
  const folder = path.join(dataDir, PLUGINS_FOLDER, id);
  if (await lstat(folder).then(() => true, () => false)) throw new PluginWriteError(`There is already something named ${id} in the folder of plugins (${folder}). Nothing was written.`);
  try {
    const pluginsFolder = path.join(dataDir, PLUGINS_FOLDER);
    const top = await lstat(pluginsFolder).catch(() => null);
    if (top?.isSymbolicLink()) throw new PluginWriteError(`${pluginsFolder} is a link. Nothing is written through a link.`);
    if (!top) await mkdir(pluginsFolder);
    for (const [file, text] of Object.entries(pluginStarter(name))) await writeInside(dataDir, `${PLUGINS_FOLDER}/${id}/${file}`, text, false);
  } catch (error) {
    if (error instanceof RepositoryWriteError) throw new PluginWriteError(`Not everything was written: ${error.message}`);
    throw error;
  }
  return folder;
}
