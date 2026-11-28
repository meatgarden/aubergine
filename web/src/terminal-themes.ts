import { ANSI_NAMES, colorsOver, themeOf, type ColorThemeId, type UserTheme } from '@aubergine/shared';
import type { ITheme } from '@xterm/xterm';

/**
 * A terminal's own colors in each color theme: its ground, its words, the cursor, what is selected, and the sixteen
 * colors a program asks for by number. The ground is the theme's `--terminal-bg` token (tokens.css, themes.css).
 *
 * Light and dark keep the four colors they always had and leave the sixteen to the terminal's defaults. The named
 * themes take the sixteen from their published palettes; where a published color is less than 4.5 to 1 on the ground
 * (every color but black on a dark theme, every one but white and bright white on a light one), it is made lighter or
 * darker, with its hue kept, just far enough to be read.
 */
export type TerminalColors = Required<Pick<ITheme, 'background' | 'foreground' | 'cursor' | 'selectionBackground'>> &
  Pick<
    ITheme,
    | 'cursorAccent'
    | 'black'
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'magenta'
    | 'cyan'
    | 'white'
    | 'brightBlack'
    | 'brightRed'
    | 'brightGreen'
    | 'brightYellow'
    | 'brightBlue'
    | 'brightMagenta'
    | 'brightCyan'
    | 'brightWhite'
  >;

export const TERMINAL_THEMES: Record<ColorThemeId, TerminalColors> = {
  light: { background: '#fbfbfc', foreground: '#24262b', cursor: '#24262b', selectionBackground: '#c9d3e6' },
  dark: { background: '#101114', foreground: '#d7dae0', cursor: '#d7dae0', selectionBackground: '#3f4f73' },
  'high-contrast-light': {
    background: '#ffffff', foreground: '#000000', cursor: '#000000', cursorAccent: '#ffffff', selectionBackground: '#e8c9e3',
    black: '#000000', red: '#b0001e', green: '#17661b', yellow: '#735000', blue: '#0049a8', magenta: '#8a1f82', cyan: '#005f66', white: '#c8c8cc',
    brightBlack: '#45454d', brightRed: '#d0002a', brightGreen: '#1f7a24', brightYellow: '#875f00', brightBlue: '#1a5fd0', brightMagenta: '#a3239a', brightCyan: '#00737c', brightWhite: '#ececef',
  },
  'solarized-light': {
    background: '#fdf6e3', foreground: '#073642', cursor: '#586e75', cursorAccent: '#fdf6e3', selectionBackground: '#eee8d5',
    black: '#073642', red: '#d82824', green: '#677600', yellow: '#8c6a00', blue: '#2075b1', magenta: '#cc2d7a', cyan: '#217d76', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#c24815', brightGreen: '#586e75', brightYellow: '#5f737b', brightBlue: '#637375', brightMagenta: '#6267c0', brightCyan: '#647373', brightWhite: '#fdf6e3',
  },
  'gruvbox-light': {
    background: '#fbf1c7', foreground: '#3c3836', cursor: '#3c3836', cursorAccent: '#fbf1c7', selectionBackground: '#d5c4a1',
    black: '#282828', red: '#9d0006', green: '#746f0d', yellow: '#966211', blue: '#076678', magenta: '#8f3f71', cyan: '#417856', white: '#d5c4a1',
    brightBlack: '#776b60', brightRed: '#cc241d', brightGreen: '#706f13', brightYellow: '#8e6516', brightBlue: '#3d7679', brightMagenta: '#a35177', brightCyan: '#4d774f', brightWhite: '#ebdbb2',
  },
  'high-contrast-dark': {
    background: '#000000', foreground: '#ffffff', cursor: '#ffffff', cursorAccent: '#000000', selectionBackground: '#5e3a59',
    black: '#000000', red: '#ff5c5c', green: '#5fd860', yellow: '#ffd24d', blue: '#6cb8ff', magenta: '#ff7ff0', cyan: '#5ff2ff', white: '#e0e0e6',
    brightBlack: '#a0a0aa', brightRed: '#ff8a8a', brightGreen: '#8af08a', brightYellow: '#ffe680', brightBlue: '#9ccfff', brightMagenta: '#ffa8f5', brightCyan: '#9cf8ff', brightWhite: '#ffffff',
  },
  'solarized-dark': {
    background: '#002b36', foreground: '#a9b4b4', cursor: '#a9b4b4', cursorAccent: '#002b36', selectionBackground: '#073642',
    black: '#073642', red: '#e56663', green: '#859900', yellow: '#b58900', blue: '#3194da', magenta: '#dd659f', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#79929a', brightRed: '#e96630', brightGreen: '#79929a', brightYellow: '#7d929a', brightBlue: '#839496', brightMagenta: '#8589ce', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'gruvbox-dark': {
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828', selectionBackground: '#504945',
    black: '#282828', red: '#e86660', green: '#98971a', yellow: '#d79921', blue: '#519b9f', magenta: '#be7c9a', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#9b8d7f', brightRed: '#fb5642', brightGreen: '#b8bb26', brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
  },
  nord: {
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440', selectionBackground: '#434c5e',
    black: '#3b4252', red: '#cf8a90', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b692b0', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#939db2', brightRed: '#cf8a90', brightGreen: '#a3be8c', brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b692b0', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  dracula: {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36', selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5757', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#8591b8', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
};

/** The colors of a terminal drawn in that theme. */
export function terminalTheme(id: ColorThemeId): TerminalColors {
  return TERMINAL_THEMES[id];
}

/**
 * The colors of a terminal drawn in a theme, built-in or of a file: the base's, with a theme file's own terminal colors
 * over them (the sixteen by number), and the ground of the theme (`terminal-bg` of the file, then as set by hand) where
 * one is laid over the base. A theme that names nothing now is drawn as Dark. Pure.
 */
export function terminalColorsOf(id: string, colors: unknown, themes: readonly UserTheme[]): TerminalColors {
  const theme = themeOf(id, themes);
  const out: TerminalColors = { ...TERMINAL_THEMES[theme?.base ?? 'dark'] };
  const own = theme?.terminal ?? {};
  if (own.foreground) out.foreground = own.foreground;
  if (own.cursor) out.cursor = own.cursor;
  if (own.selection) out.selectionBackground = own.selection;
  own.ansi?.forEach((hex, at) => {
    const name = ANSI_NAMES[at];
    if (hex && name) out[name] = hex;
  });
  const ground = colorsOver(id, colors, themes).colors['terminal-bg'];
  if (ground) out.background = ground;
  return out;
}
