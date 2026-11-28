import { useMemo, useSyncExternalStore } from 'react';
import {
  THEME_COLORS,
  colorThemeShown,
  colorsOver,
  themeOf,
  themeShown,
  type Appearance,
  type ChangeAppearanceRequest,
  type ThemeSetting,
  type UserTheme,
  terminalThemeOf,
} from '@aubergine/shared';
import type { CSSProperties } from 'react';
import { ownApi } from './api';
import { appearanceTried, useTrying, withTried } from './appearance/trying';
import { useApp } from './store';

/**
 * How the page looks. The choice is one of the settings (light, dark, or match the system) and is kept in the
 * settings file, so every browser and the next start agree. What is drawn is that choice, or for "match the
 * system" whichever the system has now: followed while the page is open. Each of the two kinds is drawn in the color
 * theme chosen for it (`appearance.light`, `appearance.dark`), with the colors set by hand in the file over it. A theme
 * of the owner's own (a theme file) is drawn as the built-in theme it is laid over, with its colors over that
 * (`themeOf`, `colorsOver`): the same way as colors set by hand.
 */

const KEY = 'aubergine.theme';
/** Copies kept in this browser for the next load's first paint, read by the lines in index.html: the base drawn, the theme's own ID, and what is laid over it. */
const THEME_KEY = { light: 'aubergine.theme.light', dark: 'aubergine.theme.dark' } as const;
const THEME_ID_KEY = { light: 'aubergine.theme.light.id', dark: 'aubergine.theme.dark.id' } as const;
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

/** The theme that is drawn now: `light` or `dark`. While a proposed theme is tried on the page, its kind. */
export function useThemeShown(): 'light' | 'dark' {
  const setting = useApp((s) => s.settings.theme);
  const system = themeShown(setting, useSystemIsLight());
  return useTrying((s) => s.theme?.kind) ?? system;
}

/** The owner's themes of their own, as the own server read them; with a proposed theme among them while it is tried. */
export function useUserThemes(): UserTheme[] {
  const themes = useApp((s) => s.themes.themes);
  const tried = useTrying((s) => s.theme);
  return useMemo(() => withTried(themes, tried), [themes, tried]);
}

/** The appearance as it is drawn: the settings', with a proposed theme as the theme of its kind while it is tried. */
export function useAppearanceShown(): Appearance {
  const appearance = useApp((s) => s.settings.appearance);
  const tried = useTrying((s) => s.theme);
  return useMemo(() => appearanceTried(appearance, tried), [appearance, tried]);
}

/** The color theme that is drawn now, built-in or of a file. Everything that draws colors of its own (a terminal) reads this. */
export function useColorThemeShown(): string {
  return colorThemeShown(useAppearanceShown(), useThemeShown(), useUserThemes());
}

/**
 * The color theme a terminal's body is drawn in now: its own, else the default for terminals, else the page's
 * (`terminalThemeOf`). Its live terminal, its snapshot and the ground under both read this, so they never disagree.
 */
export function useTerminalTheme(sessionId: string): string {
  const own = useApp((s) => s.whole?.sessions.find((x) => x.id === sessionId)?.theme ?? null);
  return terminalThemeOf(own, useAppearanceShown(), useThemeShown(), useUserThemes());
}

/** What is put on an element so that it is drawn in a theme: its base's tokens, the theme's own ID, and what is laid over the base. */
export interface BodyTheme {
  'data-theme-preview'?: string;
  /** A theme of the owner's: its own ID, beside the base it is drawn as. */
  'data-theme-id'?: string;
  style?: CSSProperties;
}

/**
 * How an element shows a theme whatever the page is drawn in: a preview of its base (the tokens of tokens.css or
 * themes.css), with what is laid over the base (a theme file's own colors, then the colors set by hand for it) written
 * on the element itself. Pure.
 */
export function previewOf(id: string, colors: unknown, themes: readonly UserTheme[]): BodyTheme {
  const theme = themeOf(id, themes);
  const base = theme?.base ?? id;
  const style = Object.fromEntries(pairsOf(colorsLine(colors, id, themes)).map(([name, value]) => [`--${name}`, value])) as CSSProperties;
  return { 'data-theme-preview': base, ...(theme?.own ? { 'data-theme-id': id } : {}), ...(Object.keys(style).length > 0 ? { style } : {}) };
}

/**
 * How a terminal's body carries its theme. Where it is the page's, nothing: the body is drawn as the page is, what is
 * laid over the page's root included. Where it is another, the body is a preview of that theme (`previewOf`). Only the
 * body: the terminal's title and its note stay the page's. Pure.
 */
export function bodyThemeOf(id: string, pageId: string, colors: unknown, themes: readonly UserTheme[] = []): BodyTheme {
  return id === pageId ? {} : previewOf(id, colors, themes);
}

/** `bodyThemeOf` for the terminal of that session, followed as anything it depends on changes. */
export function useBodyTheme(sessionId: string): BodyTheme {
  const id = useTerminalTheme(sessionId);
  const page = useColorThemeShown();
  const colors = useApp((s) => s.settings.appearance.colors);
  return bodyThemeOf(id, page, colors, useUserThemes());
}

/** One color as it may be written on the page: a name of `THEME_COLORS`, a colon, `#rrggbb`. The same rule as index.html's. */
const PAIR = /^([a-z-]+):(#[0-9a-f]{6})$/;
const NAMES = new Set<string>(THEME_COLORS);

/**
 * What is laid over one theme's base, as `name:#rrggbb` pairs joined by `,` (the shape the server writes on the page):
 * a theme file's own colors, then the colors set by hand (`colorsOver`); each pair is held to that shape again, and
 * anything else is left out.
 */
export function colorsLine(raw: unknown, id: string, themes: readonly UserTheme[] = []): string {
  const { colors } = colorsOver(id, raw, themes);
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
 * the choice in this browser for the next load's first paint, unless `remember` is off (a theme only tried).
 */
export function applyTheme(setting: ThemeSetting, shown: 'light' | 'dark', appearance: Appearance, themes: readonly UserTheme[] = [], remember = true): void {
  const root = document.documentElement;
  const ids = { light: colorThemeShown(appearance, 'light', themes), dark: colorThemeShown(appearance, 'dark', themes) };
  const bases = { light: themeOf(ids.light, themes)?.base ?? 'light', dark: themeOf(ids.dark, themes)?.base ?? 'dark' };
  const id = ids[shown];
  const base = bases[shown];
  const lines = { light: colorsLine(appearance.colors, ids.light, themes), dark: colorsLine(appearance.colors, ids.dark, themes) };
  const colors = lines[shown];
  if (root.dataset.theme !== shown || root.dataset.colorTheme !== base || root.dataset.colorThemeId !== id || colorsOnPage(root) !== colors) {
    // The change is at once: for this moment nothing on the page takes time to change color, so that no part of it
    // is caught half-way between the two themes.
    root.classList.add('theme-changing');
    window.setTimeout(() => root.classList.remove('theme-changing'), 60);
  }
  root.dataset.theme = shown;
  // Drawn as the base's block of colors; the theme's own ID beside it, for a theme file.
  root.dataset.colorTheme = base;
  root.dataset.colorThemeId = id;
  root.dataset.themeSetting = setting;
  const set = new Map(pairsOf(colors));
  for (const name of THEME_COLORS) {
    const value = set.get(name);
    if (value === undefined) root.style.removeProperty(`--${name}`);
    else root.style.setProperty(`--${name}`, value);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--surface').trim() || '#17181c');
  // A theme only tried on the page is not remembered for the next load.
  if (!remember) return;
  try {
    localStorage.setItem(KEY, setting);
    for (const kind of ['light', 'dark'] as const) {
      localStorage.setItem(THEME_KEY[kind], bases[kind]);
      localStorage.setItem(THEME_ID_KEY[kind], ids[kind]);
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
export function chooseColorTheme(id: string): void {
  const { settings, themes } = useApp.getState();
  const theme = themeOf(id, themes.themes);
  if (!theme) return;
  const change: ChangeAppearanceRequest = theme.kind === 'light' ? { light: theme.id } : { dark: theme.id };
  if (themeShown(settings.theme, query?.matches ?? false) !== theme.kind) change.theme = theme.kind;
  changeLook(change, 'The color theme');
}

export const setFontSize = (fontSize: number): void => changeLook({ fontSize }, 'The size of the text');
export const setFontFamily = (fontFamily: string): void => changeLook({ fontFamily }, 'The font');
export const setTerminalFont = (fontFamily: string, fontSize: number): void => changeLook({ fontFamily, fontSize }, 'The font');
export const setCursor = (cursor: Appearance['cursor']): void => changeLook({ cursor }, 'The cursor');
/** The theme of every terminal that has none of its own; null: as the page is drawn. */
export const setTerminalTheme = (terminal: string | null): void => changeLook({ terminal }, 'The theme of terminals');
export const setCursorBlink = (cursorBlink: boolean): void => changeLook({ cursorBlink }, 'The cursor');

/**
 * Reads the owner's theme files again, on the own server, and keeps what it answers. What is drawn follows at once: a
 * theme whose file is gone falls back. The answer is said in one sentence.
 */
export async function readThemesAgain(): Promise<void> {
  try {
    const answer = await ownApi.readThemes();
    useApp.getState().setThemes(answer);
    const count = answer.themes.length;
    useApp.getState().say(`${count === 0 ? 'No theme' : count === 1 ? 'One theme' : `${count} themes`} of your own${answer.problems.length > 0 ? `, and ${answer.problems.length === 1 ? 'one problem' : `${answer.problems.length} problems`} in the files` : ''}.`);
  } catch (error) {
    useApp.getState().setNotice(`The theme files could not be read again: ${(error as Error).message}`);
  }
}
