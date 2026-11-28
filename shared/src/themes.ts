import { z } from 'zod';

/**
 * Color themes. A theme is light or dark (its `kind`) and gives every color token a value; nothing else differs
 * between themes. The setting `theme` still says which of the two is drawn (light, dark, or as the system is);
 * `appearance.light` and `appearance.dark` say which theme that is. The colors themselves are in the web app's
 * stylesheets (`tokens.css` for the two that come first, `themes.css` for the rest) and a terminal's own in
 * `terminal-themes.ts`; this list is what a settings file and a request may name.
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
export type ColorThemeId = ColorTheme['id'];
export type ThemeKind = 'light' | 'dark';
export type LightThemeId = Extract<ColorTheme, { kind: 'light' }>['id'];
export type DarkThemeId = Extract<ColorTheme, { kind: 'dark' }>['id'];

export const LIGHT_THEME_IDS = COLOR_THEMES.filter((theme) => theme.kind === 'light').map((theme) => theme.id) as LightThemeId[];
export const DARK_THEME_IDS = COLOR_THEMES.filter((theme) => theme.kind === 'dark').map((theme) => theme.id) as DarkThemeId[];
export const LightThemeId = z.enum(LIGHT_THEME_IDS as [LightThemeId, ...LightThemeId[]]);
export const DarkThemeId = z.enum(DARK_THEME_IDS as [DarkThemeId, ...DarkThemeId[]]);
export const ColorThemeId = z.enum(COLOR_THEMES.map((theme) => theme.id) as [ColorThemeId, ...ColorThemeId[]]);

/** The theme of that ID, or undefined for a word that names none. */
export const colorTheme = (id: string): ColorTheme | undefined => COLOR_THEMES.find((theme) => theme.id === id);

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
 * `THEME_COLORS` and a value is six hexadecimal digits, so what comes out can be put on a page as it is.
 */
export function resolveColors(raw: unknown, themeId: ColorThemeId): ResolvedColors {
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
    if (!colorTheme(id)) {
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

/** The problems of a theme's own entries, where that theme is not the one asked about. */
function resolveInto(entries: Record<string, unknown>, where: string, known: Set<string>, problems: string[]): void {
  for (const [name, value] of Object.entries(entries)) {
    if (!known.has(name)) problems.push(`${where}: "${plain(name)}" is not a color that can be set. It is skipped.`);
    else if (typeof value !== 'string' || !HEX.test(value.trim().toLowerCase())) problems.push(`${where}: "${name}" is not a color written as #rrggbb. It is skipped.`);
  }
}

/** A name from a file, short and with nothing in it that is not plainly text, for a sentence. */
const plain = (name: string): string => name.replace(/[^\x20-\x7e]/g, '?').slice(0, 40);

/**
 * How the page looks beyond light or dark: which theme each of the two is, a terminal's cursor, and colors set by
 * hand. Every field that is wrong in a file falls back to its default by itself; the rest of the file still counts.
 */
export const Appearance = z.object({
  light: LightThemeId.default('light').catch('light').describe('The color theme drawn when the page is light.'),
  dark: DarkThemeId.default('dark').catch('dark').describe('The color theme drawn when the page is dark.'),
  cursor: CursorStyle.default('block').catch('block').describe('The shape of a terminal’s cursor.'),
  cursorBlink: z.boolean().default(true).catch(true).describe('Whether a terminal’s cursor blinks.'),
  terminal: ColorThemeId.nullable().default(null).catch(null).describe('The color theme of every terminal that has none of its own. Null: the theme the page is drawn in.'),
  /** Read by `resolveColors`. */
  colors: z
    .record(z.string(), z.unknown())
    .default({})
    .catch({})
    .describe('Colors set by hand over the theme that is drawn: `"<color>": "#rrggbb"` for every theme, or `"[<theme id>]": { … }` for one theme alone, which wins. Written by hand only.'),
});
export type Appearance = z.infer<typeof Appearance>;

/** The theme that is drawn: the light one or the dark one, as the page is. */
export const colorThemeShown = (appearance: Pick<Appearance, 'light' | 'dark'>, shown: ThemeKind): ColorThemeId => (shown === 'light' ? appearance.light : appearance.dark);

/**
 * The theme a terminal is drawn in: its own where it has one; else the default for terminals (`appearance.terminal`)
 * where one is set; else the theme the page is drawn in. Nothing else decides it. Only the terminal's body is drawn in
 * it; its title and its note are the page's.
 */
export const terminalThemeOf = (own: ColorThemeId | null | undefined, appearance: Pick<Appearance, 'light' | 'dark' | 'terminal'>, shown: ThemeKind): ColorThemeId =>
  own ?? appearance.terminal ?? colorThemeShown(appearance, shown);
