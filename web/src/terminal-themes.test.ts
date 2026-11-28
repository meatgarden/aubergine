import { COLOR_THEMES, UserTheme, contrastRatio as contrast } from '@aubergine/shared';
import { describe, expect, it } from 'vitest';
import { TERMINAL_THEMES, terminalColorsOf, terminalTheme, type TerminalColors } from './terminal-themes';
import themesText from './themes.css?raw';
import tokensText from './tokens.css?raw';


/** `--terminal-bg` of the block whose selector names that preview, in tokens.css or themes.css. */
function terminalBg(id: string): string | undefined {
  const plain = `${tokensText}\n${themesText}`.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!(m[1] ?? '').includes(`[data-theme-preview='${id}']`)) continue;
    return /--terminal-bg:\s*(#[0-9a-f]{6});/.exec(m[2] ?? '')?.[1];
  }
  return undefined;
}

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;

describe("a terminal's own colors", () => {
  it('has a set for every theme and none for anything else', () => {
    expect(Object.keys(TERMINAL_THEMES).sort()).toEqual(COLOR_THEMES.map((theme) => theme.id).sort());
    for (const theme of COLOR_THEMES) expect(terminalTheme(theme.id)).toBe(TERMINAL_THEMES[theme.id]);
  });

  it("lies on the theme's own terminal ground", () => {
    for (const theme of COLOR_THEMES) expect(TERMINAL_THEMES[theme.id].background, theme.id).toBe(terminalBg(theme.id));
  });

  it('writes every color as #rrggbb', () => {
    for (const theme of COLOR_THEMES) {
      const wrong = Object.entries(TERMINAL_THEMES[theme.id]).filter(([, value]) => !/^#[0-9a-f]{6}$/.test(String(value)));
      expect(wrong, theme.id).toEqual([]);
    }
  });

  it('keeps light and dark as they were, with no colors of its own for programs', () => {
    expect(TERMINAL_THEMES.light).toEqual({ background: '#fbfbfc', foreground: '#24262b', cursor: '#24262b', selectionBackground: '#c9d3e6' });
    expect(TERMINAL_THEMES.dark).toEqual({ background: '#101114', foreground: '#d7dae0', cursor: '#d7dae0', selectionBackground: '#3f4f73' });
  });

  it('gives each named theme the sixteen colors and a cursor of its own', () => {
    for (const theme of COLOR_THEMES.filter((t) => t.id !== 'light' && t.id !== 'dark')) {
      const colors: TerminalColors = TERMINAL_THEMES[theme.id];
      expect([...ANSI, 'cursorAccent'].filter((name) => colors[name as keyof TerminalColors] === undefined), theme.id).toEqual([]);
    }
  });

  it('draws its words at least 7 to 1 on its ground', () => {
    for (const theme of COLOR_THEMES) {
      const { foreground, background } = TERMINAL_THEMES[theme.id];
      expect(contrast(foreground, background), theme.id).toBeGreaterThanOrEqual(7);
    }
  });

  it('draws the colors a program asks for at least 4.5 to 1 on its ground, but the one that is meant to be the ground', () => {
    for (const theme of COLOR_THEMES) {
      const colors = TERMINAL_THEMES[theme.id];
      const exempt: readonly string[] = theme.kind === 'light' ? ['white', 'brightWhite'] : ['black'];
      const faint = ANSI.filter((name) => !exempt.includes(name) && colors[name] !== undefined && contrast(colors[name] ?? '', colors.background) < 4.5);
      expect(faint, theme.id).toEqual([]);
    }
  });
});

describe("a terminal's colors in a theme of the owner's", () => {
  const harbor = UserTheme.parse({
    id: 'harbor',
    name: 'Harbor',
    kind: 'dark',
    base: 'nord',
    colors: { 'terminal-bg': '#0b1620' },
    terminal: { foreground: '#d8dee9', cursor: '#5fb3b3', selection: '#2b4252', ansi: ['#000001', null, '#000003'] },
  });

  it('are the base\'s, with the file\'s own over them, the sixteen by number, on the theme\'s ground', () => {
    expect(terminalColorsOf('harbor', {}, [harbor])).toEqual({
      ...TERMINAL_THEMES.nord,
      background: '#0b1620',
      foreground: '#d8dee9',
      cursor: '#5fb3b3',
      selectionBackground: '#2b4252',
      black: '#000001',
      green: '#000003',
    });
  });

  it('take the ground set by hand over the file\'s, and are a built-in theme\'s own where nothing is laid over it', () => {
    expect(terminalColorsOf('harbor', { '[harbor]': { 'terminal-bg': '#101010' } }, [harbor]).background).toBe('#101010');
    for (const theme of COLOR_THEMES) expect(terminalColorsOf(theme.id, {}, [harbor])).toEqual(TERMINAL_THEMES[theme.id]);
    expect(terminalColorsOf('nord', { 'terminal-bg': '#000000' }, []).background).toBe('#000000');
  });

  it('are Dark\'s for a theme that is not there now', () => {
    expect(terminalColorsOf('harbor', {}, [])).toEqual(TERMINAL_THEMES.dark);
  });
});
