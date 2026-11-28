import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS, Settings, accessEntries, webhookEntries, webhooksShown, resolveColors, resolveShortcuts, type AppearanceAnswer, type ChangeAppearanceRequest, type Platform, type WebhookShown } from '@aubergine/shared';

export const SETTINGS_FILE = 'config.json';

/**
 * Reads `config.json` from the data folder. A missing file means defaults.
 * A file that cannot be used is reported and ignored, so a typo never keeps
 * the canvas from starting.
 */
export async function loadSettings(dir: string, onWarning: (message: string) => void = () => {}): Promise<Settings> {
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
    for (const problem of colorProblems(raw)) onWarning(`${file}: ${problem}`);
    for (const problem of webhookProblems(raw, settings)) onWarning(`${file}: ${problem} It is skipped.`);
    return settings;
  } catch (error) {
    const detail =
      error instanceof SyntaxError
        ? jsonProblem(error)
        : ((error as { issues?: { path: PropertyKey[]; message: string }[] }).issues ?? [])
            .map((issue) => `${issue.path.join('.') || '(file)'}: ${issue.message}`)
            .join('; ');
    onWarning(`Ignoring ${file}: ${detail}. Using default settings.`);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Why the file is not JSON, in words of our own. What the parser says is not passed on: for some mistakes it quotes
 * the text around them, and beside a mistake may stand a webhook's secret or the rest of its address.
 */
export function jsonProblem(error: SyntaxError): string {
  const where = /\(line (\d+) column (\d+)\)/.exec(error.message);
  return where ? `it is not valid JSON at line ${where[1]}, column ${where[2]}` : 'it is not valid JSON: something stands where a value, a comma or a quote was expected';
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
 * still said. The problems are the same whichever theme is asked about.
 */
export function colorProblems(raw: unknown): string[] {
  const appearance = isObject(raw) ? raw.appearance : undefined;
  if (!isObject(appearance)) return [];
  return [...new Set(resolveColors(appearance.colors, 'dark').problems)];
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

/**
 * What is wrong with `webhooks` in the settings: each entry that cannot be used, and a list that is not a list (which
 * is then taken as empty). No sentence repeats an address or a secret.
 */
export function webhookProblems(raw: unknown, settings: Settings): string[] {
  const list = isObject(raw) ? raw.webhooks : undefined;
  const problems = list !== undefined && (!Array.isArray(list) || list.length > 20) ? ['webhooks: is not a list of at most 20 entries.'] : [];
  return [...problems, ...webhookEntries(settings.webhooks).problems];
}

/** The webhooks the settings file names, as the server takes them at its start: each by its name and its address's host, and what is wrong with the rest. For `aubergine doctor`. */
export async function webhookReport(dir: string): Promise<{ webhooks: WebhookShown[]; problems: string[] }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'));
  } catch {
    return { webhooks: [], problems: [] };
  }
  const settings = Settings.safeParse(raw);
  if (!settings.success) return { webhooks: [], problems: [] };
  return { webhooks: webhooksShown(webhookEntries(settings.data.webhooks).entries), problems: webhookProblems(raw, settings.data) };
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
   * `appearance.cursorBlink`, `appearance.terminal`, `font.family` and `font.size`, the ones that are sent, in one write. Every other key of
   * the file stays as it was, also the others inside `appearance` and `font`. None of them names anything that is run;
   * `appearance.colors` is written by hand only. A change that sends none of them does not write the file.
   */
  async setAppearance(change: ChangeAppearanceRequest): Promise<void> {
    const appearance: Record<string, unknown> = {};
    // `terminal` may be sent as null, which is written: the theme the page is drawn in.
    for (const key of ['light', 'dark', 'cursor', 'cursorBlink', 'terminal'] as const) if (change[key] !== undefined) appearance[key] = change[key];
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
    });
    this.lastWarnings = warnings;
    return this.current;
  }
}
