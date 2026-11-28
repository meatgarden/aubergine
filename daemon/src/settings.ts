import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_FILE, Settings, THEME_SCHEMA_FILE, accessEntries, settingsJsonSchema, byTagProblems, resolveColors, resolveShortcuts, themeFileJsonSchema, type AppearanceAnswer, type ChangeAppearanceRequest, type Platform, type UserTheme } from '@aubergine/shared';

export const SETTINGS_FILE = 'config.json';
export { SETTINGS_SCHEMA_FILE };

/** The text of `config.schema.json`: the schema of the settings file, for an editor. */
export const settingsSchemaText = (): string => `${JSON.stringify(settingsJsonSchema(), null, 2)}\n`;
/** The text of `theme.schema.json`: the schema of a theme file, for an editor. */
export const themeSchemaText = (): string => `${JSON.stringify(themeFileJsonSchema(), null, 2)}\n`;

/**
 * Writes the schema of the settings file as `config.schema.json` beside it, and the schema of a theme file as
 * `theme.schema.json`, for an editor: each only when what is there differs, and atomically. `config.json` and the theme
 * files are not touched: a person turns a schema on by writing its `"$schema"` line. A failure is a warning, never a
 * reason not to start.
 */
export async function writeSettingsSchema(dir: string, onWarning: (message: string) => void = () => {}): Promise<'written' | 'same' | 'failed'> {
  const settings = await writeSchema(dir, SETTINGS_SCHEMA_FILE, settingsSchemaText(), 'the schema of the settings file', onWarning);
  const theme = await writeSchema(dir, THEME_SCHEMA_FILE, themeSchemaText(), 'the schema of a theme file', onWarning);
  return settings === 'failed' || theme === 'failed' ? 'failed' : settings === 'written' || theme === 'written' ? 'written' : 'same';
}

async function writeSchema(dir: string, name: string, text: string, what: string, onWarning: (message: string) => void): Promise<'written' | 'same' | 'failed'> {
  const file = path.join(dir, name);
  try {
    const current = await readFile(file, 'utf8').catch(() => null);
    if (current === text) return 'same';
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, text, { mode: 0o644 });
    await rename(tmp, file);
    return 'written';
  } catch (error) {
    onWarning(`Could not write ${file}, ${what} for an editor: ${(error as Error).message}`);
    return 'failed';
  }
}

/**
 * Reads `config.json` from the data folder. A missing file means defaults.
 * A file that cannot be used is reported and ignored, so a typo never keeps
 * the canvas from starting.
 */
export async function loadSettings(dir: string, onWarning: (message: string) => void = () => {}, themes: readonly UserTheme[] = []): Promise<Settings> {
  const file = path.join(dir, SETTINGS_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_SETTINGS;
    throw error;
  }
  try {
    const raw: unknown = JSON.parse(text);
    const settings = Settings.parse(raw);
    for (const problem of shortcutProblems(settings)) onWarning(`${file}: ${problem}`);
    for (const problem of accessProblems(raw, settings)) onWarning(`${file}: ${problem} It is skipped.`);
    for (const problem of colorProblems(raw, themes)) onWarning(`${file}: ${problem}`);
    return settings;
  } catch (error) {
    const detail =
      error instanceof SyntaxError
        ? error.message
        : ((error as { issues?: { path: PropertyKey[]; message: string }[] }).issues ?? [])
            .map((issue) => `${issue.path.join('.') || '(file)'}: ${issue.message}`)
            .join('; ');
    onWarning(`Ignoring ${file}: ${detail}. Using default settings.`);
    return DEFAULT_SETTINGS;
  }
}

/**
 * What is wrong with the keys in the settings: unknown commands, chords that
 * cannot be read, collisions, chords the browser keeps. The browser shows the
 * same list in its shortcut sheet. Checked for the system this server runs
 * on, which is where the browser is too.
 */
export function shortcutProblems(settings: Settings, platform: Platform = process.platform === 'darwin' ? 'mac' : 'other'): string[] {
  const { shortcuts, shortcutsInAppWindow } = settings;
  const inTab = resolveShortcuts({ platform, mode: 'tab', shortcuts }).problems.map((p) => p.message);
  // The app-window keys are checked as they apply there; what is already reported is not repeated.
  const inApp = resolveShortcuts({ platform, mode: 'app', shortcuts, shortcutsInAppWindow }).problems.map((p) => p.message);
  return [...new Set([...inTab, ...inApp])];
}

/**
 * What is wrong with `appearance.colors` in the settings: each entry that names no color that can be set, no theme,
 * or no color written as `#rrggbb`. `raw` is the file as it was read, so that an entry the schema drops by itself is
 * still said. The problems are the same whichever theme is asked about. `themes` are the owner's theme files, which an
 * entry may name too.
 */
export function colorProblems(raw: unknown, themes: readonly UserTheme[] = []): string[] {
  const appearance = isObject(raw) ? raw.appearance : undefined;
  if (!isObject(appearance)) return [];
  return [...new Set([...resolveColors(appearance.colors, 'dark', themes).problems, ...byTagProblems(appearance.byTag)])];
}

/** What the settings say about how the page looks, as the appearance route answers it. */
export const appearanceOf = (settings: Settings): AppearanceAnswer => ({
  theme: settings.theme,
  light: settings.appearance.light,
  dark: settings.appearance.dark,
  font: { family: settings.font.family, size: settings.font.size },
  cursor: settings.appearance.cursor,
  cursorBlink: settings.appearance.cursorBlink,
  terminal: settings.appearance.terminal,
  byTag: settings.appearance.byTag,
  titleFormat: settings.appearance.titleFormat,
  rowFormat: settings.appearance.rowFormat,
});

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * What is wrong with `access` in the settings: each entry that is not an origin that can be used, and a list that is
 * not a list at all (which is then taken as empty). `raw` is the file as it was read, before defaults were applied.
 */
export function accessProblems(raw: unknown, settings: Settings): string[] {
  const problems: string[] = [];
  const access = raw !== null && typeof raw === 'object' ? (raw as { access?: unknown }).access : undefined;
  if (access !== undefined && (access === null || typeof access !== 'object' || Array.isArray(access))) problems.push('access: is not an object with "addresses" and "pages".');
  for (const kind of ['addresses', 'pages'] as const) {
    const list = access !== null && typeof access === 'object' ? (access as Record<string, unknown>)[kind] : undefined;
    if (list !== undefined && (!Array.isArray(list) || list.length > 20)) problems.push(`access.${kind}: is not a list of at most 20 origins.`);
    problems.push(...accessEntries(kind, settings.access[kind]).problems);
  }
  return problems;
}

/** The outside addresses and linked pages the settings file names, as the server takes them at its start, and what is wrong with `access`. For `aubergine doctor`. */
export async function accessReport(dir: string): Promise<{ addresses: string[]; pages: string[]; problems: string[] }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'));
  } catch {
    // No file, or one that is not JSON: the server starts with the defaults, and so no outside address.
    return { addresses: [], pages: [], problems: [] };
  }
  const settings = Settings.safeParse(raw);
  if (!settings.success) return { addresses: [], pages: [], problems: [] };
  return {
    addresses: accessEntries('addresses', settings.data.access.addresses).entries.map((entry) => entry.origin),
    pages: accessEntries('pages', settings.data.access.pages).entries.map((entry) => entry.origin),
    problems: accessProblems(raw, settings.data),
  };
}

/** Expands a leading `~` to the home folder. */
export function expandHome(folder: string): string {
  if (folder === '~') return os.homedir();
  return folder.startsWith('~/') ? path.join(os.homedir(), folder.slice(2)) : folder;
}

/** The settings file is there and cannot be read as settings: it is left as it is. */
export class SettingsUnreadableError extends Error {
  constructor(file: string) {
    super(`${file} is not a file of settings that can be read (it is not a JSON object). Mend it by hand; it was not changed.`);
  }
}

/** Keeps the current settings at hand and re-reads the file when asked. */
export class SettingsFile {
  private current: Settings = DEFAULT_SETTINGS;
  private lastWarnings = new Set<string>();

  constructor(
    private readonly dir: string,
    private readonly onWarning: (message: string) => void = () => {},
    /** The owner's theme files as last read, which colors set by hand may name. */
    private readonly themes: () => readonly UserTheme[] = () => [],
  ) {}

  get value(): Settings {
    return this.current;
  }

  /**
   * Changes the file by what `change` makes of it and leaves everything else in it as it was: the file is the
   * owner's. A file that is not JSON is not touched: the owner is told to mend it.
   */
  private async write(change: (whole: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
    const file = path.join(this.dir, SETTINGS_FILE);
    let whole: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SettingsUnreadableError(file);
      whole = parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof SyntaxError) throw new SettingsUnreadableError(file);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(this.dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(change(whole), null, 2)}\n`);
    await rename(tmp, file);
    await this.reload();
  }

  /** Writes `describe.remind`: whether agents are reminded to describe their terminal. It names a yes or a no and nothing that is run. */
  async setDescribeRemind(value: boolean): Promise<void> {
    await this.write((whole) => {
      const describe = whole.describe !== null && typeof whole.describe === 'object' && !Array.isArray(whole.describe) ? (whole.describe as Record<string, unknown>) : {};
      return { ...whole, describe: { ...describe, remind: value } };
    });
  }

  /** Writes `desktop.openNew`: one of the two keys the page changes. */
  async setDesktopOpenNew(value: boolean): Promise<void> {
    await this.write((whole) => {
      const desktop = whole.desktop !== null && typeof whole.desktop === 'object' && !Array.isArray(whole.desktop) ? (whole.desktop as Record<string, unknown>) : {};
      return { ...whole, desktop: { ...desktop, openNew: value } };
    });
  }

  /**
   * Writes how the page looks: of `theme`, `appearance.light`, `appearance.dark`, `appearance.cursor`,
   * `appearance.cursorBlink`, `appearance.terminal`, `appearance.byTag`, `appearance.titleFormat`, `appearance.rowFormat`, `font.family` and `font.size`, the ones that are sent, in one write. Every other key of
   * the file stays as it was, also the others inside `appearance` and `font`. None of them names anything that is run;
   * `appearance.colors` is written by hand only. A change that sends none of them does not write the file.
   */
  async setAppearance(change: ChangeAppearanceRequest): Promise<void> {
    const appearance: Record<string, unknown> = {};
    // `terminal` may be sent as null, which is written: the theme the page is drawn in.
    for (const key of ['light', 'dark', 'cursor', 'cursorBlink', 'terminal', 'byTag', 'titleFormat', 'rowFormat'] as const) if (change[key] !== undefined) appearance[key] = change[key];
    const font: Record<string, unknown> = {};
    if (change.fontFamily !== undefined) font.family = change.fontFamily;
    if (change.fontSize !== undefined) font.size = change.fontSize;
    const any = change.theme !== undefined || Object.keys(appearance).length > 0 || Object.keys(font).length > 0;
    if (!any) return;
    await this.write((whole) => ({
      ...whole,
      ...(change.theme === undefined ? {} : { theme: change.theme }),
      ...(Object.keys(appearance).length === 0 ? {} : { appearance: { ...(isObject(whole.appearance) ? whole.appearance : {}), ...appearance } }),
      ...(Object.keys(font).length === 0 ? {} : { font: { ...(isObject(whole.font) ? whole.font : {}), ...font } }),
    }));
  }

  async reload(): Promise<Settings> {
    const warnings = new Set<string>();
    this.current = await loadSettings(this.dir, (message) => {
      // Say it once per distinct problem, not on every reload.
      if (!this.lastWarnings.has(message)) this.onWarning(message);
      warnings.add(message);
    }, this.themes());
    this.lastWarnings = warnings;
    return this.current;
  }
}
