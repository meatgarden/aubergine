import { DarkThemeId, LightThemeId, THEME_COLORS, ThemeSetting, resolveColors, type ColorThemeId, type Settings } from '@aubergine/shared';

/** One color as it may be written on the page: a name of `THEME_COLORS`, a colon, `#rrggbb`. */
const PAIR = /^([a-z-]+):(#[0-9a-f]{6})$/;
const NAMES = new Set<string>(THEME_COLORS);

/**
 * The colors set by hand for one theme, as `name:#rrggbb` pairs joined by `,`; empty when there are none. Built from
 * what `resolveColors` gives, and each pair is held to that shape again here: anything else is left out, so nothing
 * of the file but a known name and six hexadecimal digits can reach the page.
 */
export function colorsAttribute(raw: unknown, themeId: ColorThemeId): string {
  const { colors } = resolveColors(raw, themeId);
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
 * dark, the color theme of each, and the colors set by hand over each. Only these words of the settings are in it:
 * the choice of three, two theme IDs parsed again (the default where one is wrong), and colors in the one shape
 * `colorsAttribute` allows. Nothing in it needs escaping.
 */
export function pageAttributes(settings: Settings): string {
  const theme = ThemeSetting.safeParse(settings.theme);
  const light = LightThemeId.safeParse(settings.appearance?.light);
  const dark = DarkThemeId.safeParse(settings.appearance?.dark);
  const lightId = light.success ? light.data : 'light';
  const darkId = dark.success ? dark.data : 'dark';
  const raw = settings.appearance?.colors;
  const attributes = [`data-theme-setting="${theme.success ? theme.data : 'system'}"`, `data-theme-light="${lightId}"`, `data-theme-dark="${darkId}"`];
  const lightColors = colorsAttribute(raw, lightId);
  const darkColors = colorsAttribute(raw, darkId);
  if (lightColors) attributes.push(`data-colors-light="${lightColors}"`);
  if (darkColors) attributes.push(`data-colors-dark="${darkColors}"`);
  return attributes.join(' ');
}
