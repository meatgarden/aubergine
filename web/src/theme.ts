import { useSyncExternalStore } from 'react';
import {
  THEME_COLORS,
  colorTheme,
  colorThemeShown,
  resolveColors,
  themeShown,
  type Appearance,
  type ChangeAppearanceRequest,
  type ColorThemeId,
  type ThemeSetting,
  terminalThemeOf,
} from '@aubergine/shared';
import type { CSSProperties } from 'react';
import { ownApi } from './api';
import { useApp } from './store';

/**
 * How the page looks. The choice is one of the settings (light, dark, or match the system) and is kept in the
 * settings file, so every browser and the next start agree. What is drawn is that choice, or for "match the
 * system" whichever the system has now: followed while the page is open. Each of the two kinds is drawn in the color
 * theme chosen for it (`appearance.light`, `appearance.dark`), with the colors set by hand in the file over it.
 */

const KEY = 'aubergine.theme';
/** Copies kept in this browser for the next load's first paint, read by the lines in index.html. */
const THEME_KEY = { light: 'aubergine.theme.light', dark: 'aubergine.theme.dark' } as const;
const COLORS_KEY = { light: 'aubergine.colors.light', dark: 'aubergine.colors.dark' } as const;
const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;

const subscribe = (listener: () => void): (() => void) => {
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

/** Whether the system is set to light, followed as it changes. */
export function useSystemIsLight(): boolean {
  return useSyncExternalStore(subscribe, () => query?.matches ?? false);
}

/** The theme that is drawn now: `light` or `dark`. */
export function useThemeShown(): 'light' | 'dark' {
  const setting = useApp((s) => s.settings.theme);
  return themeShown(setting, useSystemIsLight());
}

/** The color theme that is drawn now. Everything that draws colors of its own (a terminal) reads this. */
export function useColorThemeShown(): ColorThemeId {
  const appearance = useApp((s) => s.settings.appearance);
  return colorThemeShown(appearance, useThemeShown());
}

/**
 * The color theme a terminal's body is drawn in now: its own, else the default for terminals, else the page's
 * (`terminalThemeOf`). Its live terminal, its snapshot and the ground under both read this, so they never disagree.
 */
export function useTerminalTheme(sessionId: string): ColorThemeId {
  const own = useApp((s) => s.whole?.sessions.find((x) => x.id === sessionId)?.theme ?? null);
  const appearance = useApp((s) => s.settings.appearance);
  return terminalThemeOf(own, appearance, useThemeShown());
}

/** What is put on a terminal's body element so that it is drawn in its theme. */
export interface BodyTheme {
  'data-theme-preview'?: ColorThemeId;
  style?: CSSProperties;
}

/**
 * How a terminal's body carries its theme. Where it is the page's, nothing: the body is drawn as the page is, the colors
 * set by hand on the page's root included. Where it is another, the body is a preview of that theme (its tokens, from
 * tokens.css or themes.css) with that theme's own colors set by hand over it, written on the body itself. Only the
 * body: the terminal's title and its note stay the page's. Pure.
 */
export function bodyThemeOf(id: ColorThemeId, pageId: ColorThemeId, colors: unknown): BodyTheme {
  if (id === pageId) return {};
  const style = Object.fromEntries(pairsOf(colorsLine(colors, id)).map(([name, value]) => [`--${name}`, value])) as CSSProperties;
  return Object.keys(style).length > 0 ? { 'data-theme-preview': id, style } : { 'data-theme-preview': id };
}

/** `bodyThemeOf` for the terminal of that session, followed as anything it depends on changes. */
export function useBodyTheme(sessionId: string): BodyTheme {
  const id = useTerminalTheme(sessionId);
  const page = useColorThemeShown();
  const colors = useApp((s) => s.settings.appearance.colors);
  return bodyThemeOf(id, page, colors);
}

/** One color as it may be written on the page: a name of `THEME_COLORS`, a colon, `#rrggbb`. The same rule as index.html's. */
const PAIR = /^([a-z-]+):(#[0-9a-f]{6})$/;
const NAMES = new Set<string>(THEME_COLORS);

/**
 * The colors set by hand for one theme, as `name:#rrggbb` pairs joined by `,` (the shape the server writes on the
 * page), from what `resolveColors` gives; each pair is held to that shape again, and anything else is left out.
 */
export function colorsLine(raw: unknown, id: ColorThemeId): string {
  const { colors } = resolveColors(raw, id);
  return THEME_COLORS.flatMap((name) => {
    const pair = `${name}:${colors[name] ?? ''}`;
    const shape = PAIR.exec(pair);
    return shape && NAMES.has(shape[1] ?? '') ? [pair] : [];
  }).join(',');
}

/** A line of pairs read back into token names and values. Pure. */
export function pairsOf(line: string): [string, string][] {
  return line
    .split(',')
    .map((pair) => PAIR.exec(pair))
    .filter((shape): shape is RegExpExecArray => shape !== null && NAMES.has(shape[1] ?? ''))
    .map((shape) => [shape[1] ?? '', shape[2] ?? '']);
}

/** The colors set by hand that are on the page now, in the same shape. */
function colorsOnPage(root: HTMLElement): string {
  return THEME_COLORS.flatMap((name) => {
    const value = root.style.getPropertyValue(`--${name}`).trim();
    return value ? [`${name}:${value}`] : [];
  }).join(',');
}

/**
 * Puts the theme on the page: which kind, which color theme, and the colors set by hand over it; and keeps copies of
 * the choice in this browser for the next load's first paint.
 */
export function applyTheme(setting: ThemeSetting, shown: 'light' | 'dark', appearance: Appearance): void {
  const root = document.documentElement;
  const id = colorThemeShown(appearance, shown);
  const lines = { light: colorsLine(appearance.colors, appearance.light), dark: colorsLine(appearance.colors, appearance.dark) };
  const colors = lines[shown];
  if (root.dataset.theme !== shown || root.dataset.colorTheme !== id || colorsOnPage(root) !== colors) {
    // The change is at once: for this moment nothing on the page takes time to change color, so that no part of it
    // is caught half-way between the two themes.
    root.classList.add('theme-changing');
    window.setTimeout(() => root.classList.remove('theme-changing'), 60);
  }
  root.dataset.theme = shown;
  root.dataset.colorTheme = id;
  root.dataset.themeSetting = setting;
  const set = new Map(pairsOf(colors));
  for (const name of THEME_COLORS) {
    const value = set.get(name);
    if (value === undefined) root.style.removeProperty(`--${name}`);
    else root.style.setProperty(`--${name}`, value);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--surface').trim() || '#17181c');
  try {
    localStorage.setItem(KEY, setting);
    localStorage.setItem(THEME_KEY.light, appearance.light);
    localStorage.setItem(THEME_KEY.dark, appearance.dark);
    for (const kind of ['light', 'dark'] as const) {
      if (lines[kind]) localStorage.setItem(COLORS_KEY[kind], lines[kind]);
      else localStorage.removeItem(COLORS_KEY[kind]);
    }
  } catch {
    // Not being able to remember this is harmless: the server writes the choice on the page it sends.
  }
}

/** What the settings say now about the fields of a change: to put back if the change cannot be saved. */
function lookNow(change: ChangeAppearanceRequest): ChangeAppearanceRequest {
  const { settings } = useApp.getState();
  const was: ChangeAppearanceRequest = {};
  if (change.theme !== undefined) was.theme = settings.theme;
  if (change.light !== undefined) was.light = settings.appearance.light;
  if (change.dark !== undefined) was.dark = settings.appearance.dark;
  if (change.fontSize !== undefined) was.fontSize = settings.font.size;
  if (change.fontFamily !== undefined) was.fontFamily = settings.font.family;
  if (change.cursor !== undefined) was.cursor = settings.appearance.cursor;
  if (change.cursorBlink !== undefined) was.cursorBlink = settings.appearance.cursorBlink;
  if (change.terminal !== undefined) was.terminal = settings.appearance.terminal;
  return was;
}

/**
 * Changes how the page looks. The page follows at once; the change is written into the own server's settings file,
 * and if that cannot be done the page goes back to what it was and says why.
 */
function changeLook(change: ChangeAppearanceRequest, what: string): void {
  const was = lookNow(change);
  if ((Object.keys(change) as (keyof ChangeAppearanceRequest)[]).every((key) => was[key] === change[key])) return;
  useApp.getState().setLook(change);
  void ownApi.setLook(change).catch((error: unknown) => {
    useApp.getState().setLook(was);
    useApp.getState().setNotice(`${what} could not be saved: ${(error as Error).message}`);
  });
}

/** Chooses light, dark or matching the system. */
export function chooseTheme(theme: ThemeSetting): void {
  changeLook({ theme }, 'The theme');
}

/**
 * Chooses the color theme of its kind. Where the page is not drawing that kind now, it is drawn as that kind from
 * now on, so that what was chosen is seen: one request with both.
 */
export function chooseColorTheme(id: ColorThemeId): void {
  const theme = colorTheme(id);
  if (!theme) return;
  const settings = useApp.getState().settings;
  const change: ChangeAppearanceRequest = theme.kind === 'light' ? { light: theme.id as ChangeAppearanceRequest['light'] } : { dark: theme.id as ChangeAppearanceRequest['dark'] };
  if (themeShown(settings.theme, query?.matches ?? false) !== theme.kind) change.theme = theme.kind;
  changeLook(change, 'The color theme');
}

export const setFontSize = (fontSize: number): void => changeLook({ fontSize }, 'The size of the text');
export const setFontFamily = (fontFamily: string): void => changeLook({ fontFamily }, 'The font');
export const setTerminalFont = (fontFamily: string, fontSize: number): void => changeLook({ fontFamily, fontSize }, 'The font');
export const setCursor = (cursor: Appearance['cursor']): void => changeLook({ cursor }, 'The cursor');
/** The theme of every terminal that has none of its own; null: as the page is drawn. */
export const setTerminalTheme = (terminal: ColorThemeId | null): void => changeLook({ terminal }, 'The theme of terminals');
export const setCursorBlink = (cursorBlink: boolean): void => changeLook({ cursorBlink }, 'The cursor');
