import { THEME_COLORS, ThemeSetting, colorThemeShown, colorsOver, themeOf, type Settings, type UserTheme } from '@aubergine/shared';

/** One color as it may be written on the page: a name of `THEME_COLORS`, a colon, `#rrggbb`. */
const PAIR = /^([a-z-]+):(#[0-9a-f]{6})$/;
const NAMES = new Set<string>(THEME_COLORS);
/** A built-in theme's ID as it may be written on the page; the lines in index.html hold it to the same shape. */
const BASE = /^[a-z-]{1,40}$/;
/** Any theme's ID, as the lines in index.html hold it. */
const ID = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Everything laid over a theme's base block, for one theme, as `name:#rrggbb` pairs joined by `,`; empty when there is
 * nothing. For a theme file that is its own colors, then the colors set by hand (`colorsOver`). Each pair is held to that
 * shape again here: anything else is left out, so nothing of a file but a known name and six hexadecimal digits can
 * reach the page.
 */
export function colorsAttribute(raw: unknown, themeId: string, themes: readonly UserTheme[] = []): string {
  const { colors } = colorsOver(themeId, raw, themes);
  const pairs: string[] = [];
  for (const name of THEME_COLORS) {
    const value = colors[name];
    if (value === undefined) continue;
    const pair = `${name}:${value}`;
    const shape = PAIR.exec(pair);
    if (shape && NAMES.has(shape[1]!)) pairs.push(pair);
  }
  return pairs.join(',');
}

/**
 * What is written on the page's `<html>` tag so that it is drawn as chosen from the first paint: which of light and
 * dark, the base theme of each (a theme file is drawn as the built-in theme it is laid over) and the theme's own ID
 * beside it (`data-theme-light-id`, `data-theme-dark-id`, which the page carries as `data-color-theme-id`), and what is laid over each:
 * a theme file's own colors and the colors set by hand. Only these words of the settings are in it: the choice of three,
 * two IDs of built-in themes (as `colorThemeShown` falls back, the default where one names no theme of its kind), and
 * colors in the one shape `colorsAttribute` allows. Nothing in it needs escaping.
 */
export function pageAttributes(settings: Settings, themes: readonly UserTheme[] = []): string {
  const theme = ThemeSetting.safeParse(settings.theme);
  const appearance = { light: String(settings.appearance?.light ?? 'light'), dark: String(settings.appearance?.dark ?? 'dark') };
  const ids = { light: colorThemeShown(appearance, 'light', themes), dark: colorThemeShown(appearance, 'dark', themes) };
  const base = (kind: 'light' | 'dark'): string => {
    const id = themeOf(ids[kind], themes)?.base ?? kind;
    return BASE.test(id) ? id : kind;
  };
  const raw = settings.appearance?.colors;
  const real = (kind: 'light' | 'dark'): string => (ID.test(ids[kind]) ? ids[kind] : kind);
  const attributes = [
    `data-theme-setting="${theme.success ? theme.data : 'system'}"`,
    `data-theme-light="${base('light')}"`,
    `data-theme-dark="${base('dark')}"`,
    `data-theme-light-id="${real('light')}"`,
    `data-theme-dark-id="${real('dark')}"`,
  ];
  const lightColors = colorsAttribute(raw, ids.light, themes);
  const darkColors = colorsAttribute(raw, ids.dark, themes);
  if (lightColors) attributes.push(`data-colors-light="${lightColors}"`);
  if (darkColors) attributes.push(`data-colors-dark="${darkColors}"`);
  return attributes.join(' ');
}
