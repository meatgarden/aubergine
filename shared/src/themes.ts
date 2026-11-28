import { z } from 'zod';
import { TEMPLATE_MAX, rowFormat, titleFormat } from './templates';
import { PlainName } from './workflows';
import { Tag } from './tags';

/**
 * Color themes. A theme is light or dark (its `kind`) and gives every color token a value; nothing else differs
 * between themes. The setting `theme` still says which of the two is drawn (light, dark, or as the system is);
 * `appearance.light` and `appearance.dark` say which theme that is. The colors themselves are in the web app's
 * stylesheets (`tokens.css` for the two that come first, `themes.css` for the rest) and a terminal's own in
 * `terminal-themes.ts`. These ten are the built-in themes; the owner may add themes of their own as files (`themes/<id>.json`
 * in the data folder, read by `readThemeFile`), each a built-in theme with colors over it. A settings file and a
 * request may name either; what an ID comes to is `themeOf`.
 */
export const COLOR_THEMES = [
  { id: 'light', name: 'Light', kind: 'light' },
  { id: 'high-contrast-light', name: 'High contrast light', kind: 'light' },
  { id: 'solarized-light', name: 'Solarized light', kind: 'light' },
  { id: 'gruvbox-light', name: 'Gruvbox light', kind: 'light' },
  { id: 'dark', name: 'Dark', kind: 'dark' },
  { id: 'high-contrast-dark', name: 'High contrast dark', kind: 'dark' },
  { id: 'solarized-dark', name: 'Solarized dark', kind: 'dark' },
  { id: 'gruvbox-dark', name: 'Gruvbox dark', kind: 'dark' },
  { id: 'nord', name: 'Nord', kind: 'dark' },
  { id: 'dracula', name: 'Dracula', kind: 'dark' },
] as const satisfies readonly { id: string; name: string; kind: 'light' | 'dark' }[];

export type ColorTheme = (typeof COLOR_THEMES)[number];
/** The ID of a built-in theme. */
export type ColorThemeId = ColorTheme['id'];
export type ThemeKind = 'light' | 'dark';
export type LightThemeId = Extract<ColorTheme, { kind: 'light' }>['id'];
export type DarkThemeId = Extract<ColorTheme, { kind: 'dark' }>['id'];

export const LIGHT_THEME_IDS = COLOR_THEMES.filter((theme) => theme.kind === 'light').map((theme) => theme.id) as LightThemeId[];
export const DARK_THEME_IDS = COLOR_THEMES.filter((theme) => theme.kind === 'dark').map((theme) => theme.id) as DarkThemeId[];
export const LightThemeId = z.enum(LIGHT_THEME_IDS as [LightThemeId, ...LightThemeId[]]);
export const DarkThemeId = z.enum(DARK_THEME_IDS as [DarkThemeId, ...DarkThemeId[]]);
export const ColorThemeId = z.enum(COLOR_THEMES.map((theme) => theme.id) as [ColorThemeId, ...ColorThemeId[]]);

/** The built-in theme of that ID, or undefined for a word that names none. */
export const colorTheme = (id: string): ColorTheme | undefined => COLOR_THEMES.find((theme) => theme.id === id);

/** What the ID of a theme may be, built-in or of a file: a lowercase letter, then up to 39 lowercase letters, digits and hyphens. */
export const THEME_ID = /^[a-z][a-z0-9-]{0,39}$/;
/**
 * The ID of a color theme as a setting or a request names it: a built-in theme's, or one of the owner's theme files'
 * (its file's name without `.json`). Whether it names a theme now is asked of `themeOf`: an ID whose file was removed
 * still parses, and is drawn as something else.
 */
export const ThemeId = z.string().regex(THEME_ID, 'The ID of a theme is a lowercase letter, then up to 39 lowercase letters, digits and hyphens.');

/** The shapes a terminal's cursor can have. */
export const CURSOR_STYLES = ['block', 'bar', 'underline'] as const;
export const CursorStyle = z.enum(CURSOR_STYLES);
export type CursorStyle = z.infer<typeof CursorStyle>;
export const CURSOR_WORDS: Record<CursorStyle, string> = { block: 'Block', bar: 'Bar', underline: 'Underline' };

/**
 * The colors a person may set by hand, over whichever theme is drawn: each is a color token of the page (without
 * its `--`) whose value is one plain color. Shadows, the scrim and the focus ring are made of more than one value
 * and are not in this list; a QR code keeps its own two.
 */
export const THEME_COLORS = [
  'bg',
  'surface',
  'surface-raised',
  'field',
  'surface-active',
  'border',
  'border-strong',
  'border-control',
  'text',
  'text-muted',
  'accent',
  'accent-soft',
  'accent-text',
  'on-accent',
  'accent-pressed',
  'attention',
  'attention-soft',
  'attention-text',
  'on-attention',
  'attention-pressed',
  'working',
  'working-soft',
  'working-text',
  'ok',
  'ok-soft',
  'ok-text',
  'danger',
  'danger-soft',
  'danger-text',
  'on-danger',
  'danger-pressed',
  'selection',
  'terminal-bg',
  'canvas-dot',
  'minimap-node',
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

const HEX = /^#[0-9a-f]{6}$/;
const Hex = z.string().regex(HEX, 'A color is written #rrggbb, in lowercase.');

/** Colors laid over a built-in theme: any of `THEME_COLORS`, each `#rrggbb`. */
export const ThemeColors = z
  .object(Object.fromEntries(THEME_COLORS.map((name) => [name, Hex.optional().describe(`The page’s color token --${name}, as #rrggbb.`)])) as { [K in ThemeColor]: z.ZodOptional<typeof Hex> })
  .describe('Colors laid over the base theme, by the names of the page’s color tokens. What is not named is the base’s.');
export type ThemeColors = z.infer<typeof ThemeColors>;

/** The sixteen colors a program asks for by number, in this order. */
export const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;

/** A terminal's own colors in a theme of the owner's, laid over the base's. Its ground is the theme's `terminal-bg`. */
export const ThemeTerminal = z
  .object({
    foreground: Hex.optional().describe('The color of a terminal’s words, as #rrggbb.'),
    cursor: Hex.optional().describe('The color of a terminal’s cursor, as #rrggbb.'),
    selection: Hex.optional().describe('The color behind what is selected in a terminal, as #rrggbb.'),
    ansi: z
      .array(Hex.nullable())
      .max(16)
      .optional()
      .describe('The sixteen colors a program asks for by number, in order: black, red, green, yellow, blue, magenta, cyan, white, then the bright eight. Null, or left out at the end: the base’s.'),
  })
  .describe('A terminal’s own colors, over the base’s. Its ground is the theme’s terminal-bg.');
export type ThemeTerminal = z.infer<typeof ThemeTerminal>;

/**
 * A theme of the owner's, as the server read it from its file: a built-in theme (`base`, of the same kind) with colors
 * over it. Nothing in it is anything but a plain name and colors written `#rrggbb`.
 */
export const UserTheme = z.object({
  id: ThemeId.describe('The name of its file, without `.json`.'),
  name: PlainName.describe('What the theme is called: one line of plain text.'),
  kind: z.enum(['light', 'dark']).describe('Whether it is drawn as the light page or the dark one.'),
  base: ColorThemeId.describe('The built-in theme it is laid over, of the same kind. Its shadows, scrim and focus ring are the base’s.'),
  colors: ThemeColors,
  terminal: ThemeTerminal,
});
export type UserTheme = z.infer<typeof UserTheme>;

/** What a theme's ID comes to: built-in or of a file, drawn as `base`'s block of colors with `colors` over it. */
export interface ThemeOf {
  id: string;
  name: string;
  kind: ThemeKind;
  /** The built-in theme whose block of colors is drawn: the theme itself, for a built-in one. */
  base: ColorThemeId;
  /** True for a theme of the owner's, from a file. */
  own: boolean;
  /** What is laid over the base's colors: nothing, for a built-in theme. */
  colors: Partial<Record<ThemeColor, string>>;
  /** A terminal's colors over the base's: nothing, for a built-in theme. */
  terminal: ThemeTerminal;
}

/**
 * What a theme's ID comes to, for built-in themes and the owner's alike, or undefined where it names none now (a file
 * that was removed, a word that is no ID). The one function that answers this. Pure.
 */
export function themeOf(id: string | null | undefined, themes: readonly UserTheme[]): ThemeOf | undefined {
  if (!id) return undefined;
  const built = colorTheme(id);
  if (built) return { id: built.id, name: built.name, kind: built.kind, base: built.id, own: false, colors: {}, terminal: {} };
  const file = themes.find((theme) => theme.id === id);
  // A theme laid over a base of the other kind would be drawn as neither: it is not a theme.
  if (!file || colorTheme(file.base)?.kind !== file.kind) return undefined;
  return { id: file.id, name: file.name, kind: file.kind, base: file.base, own: true, colors: { ...file.colors }, terminal: { ...file.terminal } };
}

/** Every theme there is, of one kind or both: the built-in ones first, in their order, then the owner's by name. Pure. */
export function themeChoices(themes: readonly UserTheme[], kind?: ThemeKind): ThemeOf[] {
  const built = COLOR_THEMES.map((theme) => themeOf(theme.id, themes) as ThemeOf);
  const own = [...themes]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((theme) => themeOf(theme.id, themes))
    .filter((theme): theme is ThemeOf => theme !== undefined);
  return [...built, ...own].filter((theme) => kind === undefined || theme.kind === kind);
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export interface ResolvedColors {
  /** Token name (without `--`) to `#rrggbb`, for the theme asked about. */
  colors: Partial<Record<ThemeColor, string>>;
  /** One sentence for each entry that was skipped. */
  problems: string[];
}

/**
 * What `appearance.colors` of the settings file comes to for one theme. An entry is `"<color>": "#rrggbb"`, for
 * every theme, or `"[<theme id>]": { "<color>": "#rrggbb" }`, for that theme alone, which wins. An entry that is
 * wrong is reported and skipped; the rest still counts. Nothing else is read from it: a name is one of
 * `THEME_COLORS` and a value is six hexadecimal digits, so what comes out can be put on a page as it is. `themes` are
 * the owner's theme files, so that `"[<id>]"` may name one of them too.
 */
export function resolveColors(raw: unknown, themeId: string, themes: readonly UserTheme[] = []): ResolvedColors {
  const colors: Partial<Record<ThemeColor, string>> = {};
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { colors, problems };
  if (!isRecord(raw)) return { colors, problems: ['appearance.colors is not a list of colors by name: it is left out.'] };
  const known = new Set<string>(THEME_COLORS);
  const take = (entries: [string, unknown][], where: string): void => {
    for (const [name, value] of entries) {
      if (!known.has(name)) {
        problems.push(`${where}: "${plain(name)}" is not a color that can be set. It is skipped.`);
        continue;
      }
      const hex = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (!HEX.test(hex)) {
        problems.push(`${where}: "${name}" is not a color written as #rrggbb. It is skipped.`);
        continue;
      }
      colors[name as ThemeColor] = hex;
    }
  };
  // Kept as lists of pairs, not copied into an object: a key such as `__proto__` would otherwise vanish unreported.
  const forAll: [string, unknown][] = [];
  const forThemes: [string, unknown][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('[') && key.endsWith(']')) forThemes.push([key.slice(1, -1), value]);
    else forAll.push([key, value]);
  }
  take(forAll, 'appearance.colors');
  for (const [id, value] of forThemes) {
    if (!themeOf(id, themes)) {
      problems.push(`appearance.colors: "[${plain(id)}]" names no theme. It is skipped.`);
      continue;
    }
    if (!isRecord(value)) {
      problems.push(`appearance.colors: "[${id}]" is not a list of colors by name. It is skipped.`);
      continue;
    }
    // Checked whichever theme is asked about, so that a wrong entry is said once and not only when its theme is drawn.
    if (id === themeId) take(Object.entries(value), `appearance.colors, [${id}]`);
    else resolveInto(value, `appearance.colors, [${id}]`, known, problems);
  }
  return { colors, problems };
}

/**
 * Everything laid over a theme's base block when it is drawn, in order: the theme's own colors (a file's), then the
 * colors set by hand for every theme, then those set by hand for that theme alone. Each later one wins. The problems are
 * those of `appearance.colors`. Pure.
 */
export function colorsOver(id: string, raw: unknown, themes: readonly UserTheme[]): ResolvedColors {
  const own = themeOf(id, themes)?.colors ?? {};
  const byHand = resolveColors(raw, id, themes);
  return { colors: { ...own, ...byHand.colors }, problems: byHand.problems };
}

/** The problems of a theme's own entries, where that theme is not the one asked about. */
function resolveInto(entries: Record<string, unknown>, where: string, known: Set<string>, problems: string[]): void {
  for (const [name, value] of Object.entries(entries)) {
    if (!known.has(name)) problems.push(`${where}: "${plain(name)}" is not a color that can be set. It is skipped.`);
    else if (typeof value !== 'string' || !HEX.test(value.trim().toLowerCase())) problems.push(`${where}: "${name}" is not a color written as #rrggbb. It is skipped.`);
  }
}

/** A name from a file, short and with nothing in it that is not plainly text, for a sentence. */
export const plain = (name: string): string => name.replace(/[^\x20-\x7e]/g, '?').slice(0, 40);

/** How many entries `appearance.byTag` may have. */
export const BY_TAG_MAX = 20;

/** One entry of `appearance.byTag`: terminals with this tag are drawn in this theme. */
export const ThemeByTag = z.object({
  tag: Tag.describe('A terminal’s tag, as tags are written: whatever the capitals, the same tag.'),
  theme: ThemeId.describe('The color theme of the terminals with that tag, of either kind, built-in or of a theme file.'),
});
export type ThemeByTag = z.infer<typeof ThemeByTag>;
/** A list of them, as a request sends it: every entry right, at most `BY_TAG_MAX`. */
export const ThemesByTag = z.array(ThemeByTag).max(BY_TAG_MAX);
/** What stands for an entry of a file that is not one, until it is dropped: no tag is empty. */
const SKIPPED = { tag: '', theme: '' };
/**
 * The list as a settings file holds it: an entry that is wrong is dropped and the rest kept, in order, up to
 * `BY_TAG_MAX` (and each dropped one is said by `byTagProblems`). `overwrite` and a fixed `catch`, so that it can still
 * be described.
 */
const ThemesByTagInFile = z
  .array(ThemeByTag.catch(SKIPPED))
  .overwrite((list) => list.filter((entry) => entry.tag !== '').slice(0, BY_TAG_MAX))
  .max(BY_TAG_MAX);

/** What is wrong with `appearance.byTag` as written in the file, one sentence for each entry that is skipped. Pure. */
export function byTagProblems(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return ['appearance.byTag is not a list of a tag and a theme: it is left out.'];
  const problems: string[] = [];
  raw.forEach((entry, at) => {
    if (!ThemeByTag.safeParse(entry).success) problems.push(`appearance.byTag, entry ${at + 1}: it is not a tag and a theme's ID ({ "tag": "prod", "theme": "nord" }). It is skipped.`);
  });
  if (raw.length > BY_TAG_MAX) problems.push(`appearance.byTag has more than ${BY_TAG_MAX} entries. Those after the ${BY_TAG_MAX}th are skipped.`);
  return problems;
}

/**
 * The themes of one project: the theme of the light page and of the dark page while that project is looked at. Null:
 * the page's own (`appearance.light`, `appearance.dark`). The IDs name the page's themes: those of the server that
 * sent the page.
 */
export const ProjectThemes = z.object({
  light: ThemeId.nullable().describe('The color theme of the light page while this project is looked at: a light one. Null: the page’s own.'),
  dark: ThemeId.nullable().describe('The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own.'),
});
export type ProjectThemes = z.infer<typeof ProjectThemes>;

/**
 * How the page looks beyond light or dark: which theme each of the two is, a terminal's cursor, and colors set by
 * hand. Every field that is wrong in a file falls back to its default by itself; the rest of the file still counts.
 */
export const Appearance = z.object({
  light: ThemeId.default('light').catch('light').describe('The color theme drawn when the page is light: a built-in one of that kind, or the ID of a theme file of that kind.'),
  dark: ThemeId.default('dark').catch('dark').describe('The color theme drawn when the page is dark: a built-in one of that kind, or the ID of a theme file of that kind.'),
  cursor: CursorStyle.default('block').catch('block').describe('The shape of a terminal’s cursor.'),
  cursorBlink: z.boolean().default(true).catch(true).describe('Whether a terminal’s cursor blinks.'),
  terminal: ThemeId.nullable().default(null).catch(null).describe('The color theme of every terminal that has none of its own, of either kind, built-in or of a theme file. Null: the theme the page is drawn in.'),
  byTag: ThemesByTagInFile.default([])
    .catch([])
    .describe('Color themes for terminals by tag, in order: a terminal that has no theme of its own is drawn in the theme of the first entry whose tag it has (whatever the capitals) and whose theme is there now. At most 20. A wrong entry is skipped and the rest still count.'),
  titleFormat: titleFormat.describe(`What a terminal’s title says after its name, on the canvas and at the head of a terminal in a browser tab of its own: a template, text with placeholders such as {state} and {folder} (see docs/templates.md). One line, at most ${TEMPLATE_MAX} characters. A placeholder that is not known is skipped; a template that is wrong as a whole is the default.`),
  rowFormat: rowFormat.describe(`What a terminal’s row in the list says on its second line: a template, as \`titleFormat\` is (see docs/templates.md). Compact, a row has no second line and says its state alone. One line, at most ${TEMPLATE_MAX} characters.`),
  customCss: z.boolean().default(true).catch(true).describe('Whether your own stylesheet, `custom.css` in the data folder, is linked on the page when there is one (docs/custom-css.md). Off: the page is drawn without it, as with `?plain` after its address.'),
  /** Read by `resolveColors`. */
  colors: z
    .record(z.string(), z.unknown())
    .default({})
    .catch({})
    .describe('Colors set by hand over the theme that is drawn: `"<color>": "#rrggbb"` for every theme, or `"[<theme id>]": { … }` for one theme alone (built-in or of a theme file), which wins. Written by hand only.'),
});
export type Appearance = z.infer<typeof Appearance>;

/**
 * The theme that is drawn: the light one or the dark one, as the page is. Where the one chosen names no theme now (its
 * file was removed) or one of the other kind, the built-in theme of that kind's own name is drawn (`light`, `dark`).
 */
export function colorThemeShown(appearance: Pick<Appearance, 'light' | 'dark'>, shown: ThemeKind, themes: readonly UserTheme[]): string {
  const theme = themeOf(shown === 'light' ? appearance.light : appearance.dark, themes);
  return theme && theme.kind === shown ? theme.id : shown;
}

/** Where the theme the page is drawn in comes from: the project looked at, or the page's own choice. */
export interface PageThemeFrom {
  id: string;
  from: 'project' | 'page';
}

/**
 * The theme the page is drawn in while it looks at a project: the project's theme of the kind drawn, where it names one
 * there is now and of that kind; else the page's own (`colorThemeShown`). The one function that decides it. Pure.
 */
export function pageThemeFrom(appearance: Pick<Appearance, 'light' | 'dark'>, shown: ThemeKind, themes: readonly UserTheme[], project?: Partial<ProjectThemes> | null): PageThemeFrom {
  const theirs = themeOf(project?.[shown], themes);
  if (theirs && theirs.kind === shown) return { id: theirs.id, from: 'project' };
  return { id: colorThemeShown(appearance, shown, themes), from: 'page' };
}

/** The theme the page is drawn in while it looks at a project (`pageThemeFrom`), by its ID. */
export const pageThemeOf = (appearance: Pick<Appearance, 'light' | 'dark'>, shown: ThemeKind, themes: readonly UserTheme[], project?: Partial<ProjectThemes> | null): string => pageThemeFrom(appearance, shown, themes, project).id;

/** What of a terminal its theme depends on: its own theme and its tags. */
export interface TerminalLook {
  theme?: string | null | undefined;
  tags?: readonly string[] | undefined;
}

/** Where the theme a terminal is drawn in comes from, and for a tag, which. */
export interface TerminalThemeFrom {
  id: string;
  from: 'own' | 'tag' | 'terminals' | 'project' | 'page';
  /** The tag whose entry of `appearance.byTag` it is, as the terminal has it. */
  tag?: string;
}

/**
 * The theme a terminal is drawn in, and where it comes from: its own where it has one; else the theme of the first
 * entry of `appearance.byTag` whose tag it has; else the default for terminals (`appearance.terminal`); else the theme
 * the page is drawn in, the project's included (`pageThemeFrom`). One that names no theme now is passed over for the
 * next. Nothing else decides it. Only the terminal's body is drawn in it; its title and its note are the page's. Pure.
 */
export function terminalThemeFrom(
  terminal: TerminalLook,
  appearance: Pick<Appearance, 'light' | 'dark' | 'terminal'> & Partial<Pick<Appearance, 'byTag'>>,
  shown: ThemeKind,
  themes: readonly UserTheme[],
  project?: Partial<ProjectThemes> | null,
): TerminalThemeFrom {
  const own = themeOf(terminal.theme, themes);
  if (own) return { id: own.id, from: 'own' };
  const tags = new Map((terminal.tags ?? []).map((tag) => [tag.trim().toLowerCase(), tag]));
  for (const entry of appearance.byTag ?? []) {
    const tag = tags.get(entry.tag.trim().toLowerCase());
    const theme = tag === undefined ? undefined : themeOf(entry.theme, themes);
    if (tag !== undefined && theme) return { id: theme.id, from: 'tag', tag };
  }
  const forTerminals = themeOf(appearance.terminal, themes);
  if (forTerminals) return { id: forTerminals.id, from: 'terminals' };
  return pageThemeFrom(appearance, shown, themes, project);
}

/** The theme a terminal is drawn in (`terminalThemeFrom`), by its ID. */
export const terminalThemeOf = (
  terminal: TerminalLook,
  appearance: Pick<Appearance, 'light' | 'dark' | 'terminal'> & Partial<Pick<Appearance, 'byTag'>>,
  shown: ThemeKind,
  themes: readonly UserTheme[],
  project?: Partial<ProjectThemes> | null,
): string => terminalThemeFrom(terminal, appearance, shown, themes, project).id;

/**
 * What of the appearance names a theme that is not drawn, each in one sentence: a theme of either kind that is not
 * there now, or one of the other kind. Empty when every one is drawn as chosen. Pure.
 */
export function themeFallbacks(appearance: Pick<Appearance, 'light' | 'dark' | 'terminal'> & Partial<Pick<Appearance, 'byTag'>>, themes: readonly UserTheme[]): string[] {
  const says: string[] = [];
  for (const kind of ['light', 'dark'] as const) {
    const id = appearance[kind];
    const theme = themeOf(id, themes);
    const instead = colorTheme(kind)?.name ?? kind;
    if (!theme) says.push(`The ${kind} theme chosen, "${plain(id)}", is not there now (no theme file of that name was read): ${instead} is drawn in its place.`);
    else if (theme.kind !== kind) says.push(`The ${kind} theme chosen, ${theme.name}, is a ${theme.kind} theme: ${instead} is drawn in its place.`);
  }
  if (appearance.terminal && !themeOf(appearance.terminal, themes)) says.push(`The theme of terminals, "${plain(appearance.terminal)}", is not there now: terminals are drawn as the page is.`);
  for (const entry of appearance.byTag ?? []) if (!themeOf(entry.theme, themes)) says.push(`The theme of terminals tagged ${plain(entry.tag)}, "${plain(entry.theme)}", is not there now: they are drawn as if that line were not there.`);
  return says;
}
