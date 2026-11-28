import { z } from 'zod';
import { PLAIN_LINE } from './workflows';
import { plain } from './themes';

/**
 * Plugins: the owner's own code, loaded into the page. A plugin is a folder `plugins/<id>/` directly in the data
 * folder, with a manifest (`plugin.json`) and the files it names. It runs in the page as the owner, with everything the
 * page can do: it can read every terminal, type into any of them, and call every route the page calls. Nothing keeps it
 * apart. The server reads the folder (`daemon/src/plugins.ts`) and serves the files to the signed-in owner alone, under
 * the digest of the plugin as it reads it; it runs nothing of a plugin. What a manifest holds is decided here, by
 * `readPluginManifest`, alone.
 *
 * A plugin runs only once the owner has switched it on (`plugins.on` in the settings): by the digest the server read
 * when it was switched on, or by the word `follow`. A switch is a record of what the owner chose, not a lock: an agent
 * in a terminal runs as the owner and can write the settings file too.
 */

/** The folder of plugins in the data folder. */
export const PLUGINS_FOLDER = 'plugins';
/** The manifest's name, in a plugin's folder. */
export const PLUGIN_MANIFEST = 'plugin.json';
/** The version of the plugin API this page offers (`web/src/plugins/api.ts`). A manifest that asks for a higher one is not loaded. */
export const PLUGIN_API_VERSION = 1;
/** The ways a plugin can run. `page`: in the page, as the owner, with nothing kept apart. A later way is a new word here. */
export const PLUGIN_RUNS = ['page'] as const;
export type PluginRuns = (typeof PLUGIN_RUNS)[number];

/** How many plugins are read, how many files one may have, and how large each may be. */
export const PLUGINS_MAX = 20;
export const PLUGIN_FILES_MAX = 40;
export const PLUGIN_FILE_MAX_BYTES = 1024 * 1024;
/** How large a manifest may be. */
export const PLUGIN_MANIFEST_MAX_BYTES = 16 * 1024;

/** A plugin's ID: its folder's name. A lowercase letter, then up to 39 lowercase letters, digits and hyphens. */
export const PLUGIN_ID = /^[a-z][a-z0-9-]{0,39}$/;
/** A file's name in a plugin's folder: letters, digits, dots, hyphens and underscores, at most 80. No slashes, so no folders. */
export const PLUGIN_FILE_NAME = /^[A-Za-z0-9._-]{1,80}$/;
/** A plugin's digest: SHA-256, in 64 lowercase hexadecimal digits. */
export const PLUGIN_DIGEST = /^[0-9a-f]{64}$/;
/** The word that switches a plugin on to run whatever is in its folder: for a plugin the owner is writing. */
export const FOLLOW = 'follow';

/** Whether a name may be a file of a plugin: the pattern, and never `.` or `..`. */
export const isPluginFileName = (name: string): boolean => PLUGIN_FILE_NAME.test(name) && name !== '.' && name !== '..';

/** What the server sends a plugin's files as, by the end of their name. Anything else is not sent. */
export const PLUGIN_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** The content type a plugin's file is sent as, or null for a file that is not sent. Pure. */
export function pluginContentType(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return Object.hasOwn(PLUGIN_CONTENT_TYPES, name.slice(dot).toLowerCase()) ? (PLUGIN_CONTENT_TYPES[name.slice(dot).toLowerCase()] ?? null) : null;
}

/** Where a plugin's files are served, to the signed-in owner alone: under `/api`, so that the one hook's sign-in rule applies. */
export const PLUGIN_FILES_PATH = '/api/v1/plugins';
/**
 * The address of one file of a plugin, with the plugin's digest in the path: a file is served only under the digest
 * the plugin has now, and only while that digest is the one switched on (or the plugin follows changes). In the path,
 * not the query, so that a module's relative imports and a stylesheet's relative addresses keep it.
 */
export const pluginFileHref = (id: string, digest: string, file: string): string => `${PLUGIN_FILES_PATH}/${id}/${digest}/${encodeURIComponent(file)}`;

/* ---------- The manifest ---------- */

/** A plugin's manifest, as it was read. */
export const PluginManifest = z.object({
  name: z.string().max(120).describe('What the plugin is called: one line of plain text.'),
  version: z.string().max(40).describe('Its version, as its author writes it: one line of at most 40 characters.'),
  runs: z.enum(PLUGIN_RUNS).describe('How it runs. `page`: in the page, as the owner, with nothing kept apart.'),
  main: z.string().max(80).describe('The module the page imports: a `.js` file directly in its folder.'),
  style: z.string().max(80).nullable().describe('A stylesheet the page links while it runs: a `.css` file directly in its folder, or null.'),
  api: z.number().int().min(1).describe('The version of the plugin API it was written for.'),
});
export type PluginManifest = z.infer<typeof PluginManifest>;

/** The keys a manifest may hold. `$schema` is for an editor and is not read. */
const MANIFEST_KEYS = new Set(['$schema', 'name', 'version', 'runs', 'main', 'style', 'api', 'description']);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export type ManifestReading = { manifest: PluginManifest; problems: string[] } | { problem: string; name?: string };

/** Why a plugin's ID is not one, or null. */
export const pluginIdProblem = (id: string): string | null => (PLUGIN_ID.test(id) ? null : 'its folder’s name is not one a plugin can have: a lowercase letter, then up to 39 lowercase letters, digits and hyphens.');

/**
 * What the text of a plugin's manifest comes to. A manifest that is not JSON, is too large, has no plain name, no
 * version of one line, a `main` that is not a `.js` file's name, a `style` that is not a `.css` file's name, or no
 * whole `api` number, is refused whole, with one sentence. A manifest whose `runs` is not a way this page can run a
 * plugin, or whose `api` is higher than this page offers, is refused with its own sentence, and never guessed at.
 * A key a manifest does not have is said and skipped. Pure.
 */
export function readPluginManifest(id: string, text: string): ManifestReading {
  const where = `${PLUGINS_FOLDER}/${plain(id)}/${PLUGIN_MANIFEST}`;
  const wrongId = pluginIdProblem(id);
  if (wrongId) return { problem: `${PLUGINS_FOLDER}/${plain(id)}: ${wrongId} It is not loaded.` };
  if (text.length > PLUGIN_MANIFEST_MAX_BYTES) return { problem: `${where}: it is larger than ${PLUGIN_MANIFEST_MAX_BYTES} bytes. It is not loaded.` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { problem: `${where}: it is not JSON. It is not loaded.` };
  }
  if (!isRecord(raw)) return { problem: `${where}: it is not a JSON object with a name, a version, how it runs, its main file and its API version. It is not loaded.` };
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name === '' || name.length > 120 || !PLAIN_LINE.test(name)) return { problem: `${where}: "name" is not a plain name of one line, at most 120 characters. It is not loaded.` };
  const named = { name };
  const version = typeof raw.version === 'string' ? raw.version.trim() : null;
  if (version === null || version === '' || version.length > 40 || !PLAIN_LINE.test(version)) return { ...named, problem: `${where}: "version" is not one line of at most 40 characters. It is not loaded.` };
  if (raw.runs === undefined) return { ...named, problem: `${where}: it does not say how it runs ("runs": "page"). It is not loaded.` };
  if (typeof raw.runs !== 'string' || !(PLUGIN_RUNS as readonly string[]).includes(raw.runs))
    return { ...named, problem: `${where}: not loaded: this Aubergine cannot run a plugin that way ("runs": ${typeof raw.runs === 'string' ? `"${plain(raw.runs)}"` : 'not a word'}; the one way there is, is "page").` };
  const main = raw.main;
  if (typeof main !== 'string' || !isPluginFileName(main) || !main.endsWith('.js')) return { ...named, problem: `${where}: "main" is not the name of a .js file directly in its folder. It is not loaded.` };
  let style: string | null = null;
  if (raw.style !== undefined && raw.style !== null) {
    if (typeof raw.style !== 'string' || !isPluginFileName(raw.style) || !raw.style.endsWith('.css')) return { ...named, problem: `${where}: "style" is not the name of a .css file directly in its folder. It is not loaded.` };
    style = raw.style;
  }
  const api = raw.api;
  if (typeof api !== 'number' || !Number.isInteger(api) || api < 1) return { ...named, problem: `${where}: "api" is not the whole number of the plugin API it was written for (1). It is not loaded.` };
  if (api > PLUGIN_API_VERSION) return { ...named, problem: `${where}: not loaded: it was written for version ${api} of the plugin API, and this Aubergine offers version ${PLUGIN_API_VERSION}.` };
  const problems: string[] = [];
  for (const key of Object.keys(raw)) if (!MANIFEST_KEYS.has(key)) problems.push(`${where}: "${plain(key)}" is not a key of a manifest. It is skipped.`);
  return { manifest: { name, version, runs: raw.runs as PluginRuns, main, style, api }, problems };
}

/* ---------- The digest ---------- */

/**
 * What a plugin's digest is the SHA-256 of: a first line that names this format, then one line for each file, in the
 * order of their names (by code unit, not by language), with its name and the SHA-256 of its content. A name cannot
 * hold a space or a line break, so no two lists of files make the same text. Pure; the hashing is the server's.
 */
export function pluginDigestText(files: readonly { name: string; sha256: string }[]): string {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return ['aubergine-plugin-digest 1', ...sorted.map((file) => `${file.name} ${file.sha256}`), ''].join('\n');
}

/* ---------- The switch ---------- */

/** How a plugin is switched on: by the digest that was switched on, or `follow` for whatever is there. */
export type PluginSwitch = string;
export const PluginSwitchValue = z.union([z.string().regex(PLUGIN_DIGEST), z.literal(FOLLOW)]);

/**
 * The switches in the settings (`plugins.on`) as they can be used: an entry whose key is no plugin's ID, or whose value
 * is neither a digest nor `follow`, is said and skipped; the rest still count. Pure.
 */
export function resolvePluginSwitches(on: unknown): { on: Record<string, PluginSwitch>; problems: string[] } {
  const out: Record<string, PluginSwitch> = {};
  const problems: string[] = [];
  if (on === undefined || on === null) return { on: out, problems };
  if (!isRecord(on)) return { on: out, problems: ['plugins.on: is not a map from a plugin’s ID to its digest or "follow". No plugin is switched on.'] };
  for (const [id, value] of Object.entries(on)) {
    if (!PLUGIN_ID.test(id)) {
      problems.push(`plugins.on: "${plain(id)}" is not a plugin’s ID. It is skipped.`);
      continue;
    }
    if (!PluginSwitchValue.safeParse(value).success) {
      problems.push(`plugins.on.${id}: is neither the digest of the plugin (64 hexadecimal digits) nor "follow". It is skipped: the plugin is off.`);
      continue;
    }
    out[id] = value as string;
  }
  return { on: out, problems };
}

/* ---------- What the server found ---------- */

export const PluginFile = z.object({
  name: z.string().max(80).describe('The file’s name, directly in the plugin’s folder.'),
  bytes: z.number().int().min(0).describe('Its size, in bytes.'),
});
export type PluginFile = z.infer<typeof PluginFile>;

/** One plugin as the server found its folder: what its manifest says, its digest, its files, and what is wrong. */
export const PluginFound = z.object({
  id: z.string().regex(PLUGIN_ID).describe('Its folder’s name.'),
  name: z.string().max(120).describe('What its manifest calls it, else its ID.'),
  manifest: PluginManifest.nullable().describe('Its manifest, or null where it could not be read.'),
  digest: z.string().regex(PLUGIN_DIGEST).nullable().describe('The SHA-256 over its files’ names and contents, as read now; null where they could not all be read.'),
  files: z.array(PluginFile).max(PLUGIN_FILES_MAX).describe('The files read, by name.'),
  notLoaded: z.string().max(1000).nullable().describe('Why it cannot be loaded, in a sentence; null where it can.'),
  problems: z.array(z.string().max(1000)).max(200).describe('What was skipped in its folder, one sentence each: a link, a folder, a name a file cannot have, a key a manifest does not have.'),
});
export type PluginFound = z.infer<typeof PluginFound>;

/** Every plugin found, what the settings switch on, and what was wrong with the folder or the switches. */
export const PluginsAnswer = z.object({
  folder: z.string().max(4000).nullable().describe('Where the folder of plugins is, on the computer the server runs on; null where the server does not say.'),
  plugins: z.array(PluginFound).max(PLUGINS_MAX).describe('Every plugin found, in the order of their IDs.'),
  on: z.record(z.string(), PluginSwitchValue).describe('What the settings switch on, by plugin ID: the digest that was switched on, or `follow`.'),
  problems: z.array(z.string().max(1000)).max(200).describe('What was wrong with the folder of plugins or with `plugins.on`, one sentence each.'),
});
export type PluginsAnswer = z.infer<typeof PluginsAnswer>;
export const NO_PLUGINS_ANSWER: PluginsAnswer = { folder: null, plugins: [], on: {}, problems: [] };

/** Body of switching one plugin on or off. */
export const ChangePluginRequest = z.object({
  id: z.string().regex(PLUGIN_ID).describe('The plugin’s ID: its folder’s name.'),
  on: PluginSwitchValue.nullable().describe(
    'The digest of the plugin as the server answered it just now (another is refused with 409: what is switched on is what was read), `follow` to run whatever is in its folder (for a plugin you are writing), or null to switch it off.',
  ),
});
export type ChangePluginRequest = z.infer<typeof ChangePluginRequest>;

/** Where a plugin stands: what the settings say of it against what is in its folder now. */
export type PluginStanding = 'off' | 'on' | 'following' | 'changed' | 'not-loaded';

/**
 * Where a plugin stands. Not loaded: its folder could not be read as a plugin. Off: not switched on. Following: on,
 * whatever is there. On: switched on at the digest it has now. Changed: switched on at another digest, so it does not
 * run until the owner switches it on again. Pure.
 */
export function pluginStanding(found: Pick<PluginFound, 'digest' | 'notLoaded' | 'manifest'>, switched: PluginSwitch | undefined): PluginStanding {
  if (found.notLoaded !== null || found.manifest === null || found.digest === null) return 'not-loaded';
  if (switched === undefined) return 'off';
  if (switched === FOLLOW) return 'following';
  return switched === found.digest ? 'on' : 'changed';
}

/** Whether a plugin in this standing is loaded into the page. */
export const pluginRuns = (standing: PluginStanding): boolean => standing === 'on' || standing === 'following';

/** The starter a new plugin is written from (`aubergine plugin new`): its manifest. */
export function starterManifest(name: string): string {
  return `${JSON.stringify({ name, version: '0.1.0', runs: 'page', main: 'index.js', style: 'style.css', api: PLUGIN_API_VERSION }, null, 2)}\n`;
}
