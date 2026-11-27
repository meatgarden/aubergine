import { COLOR_THEMES } from '@aubergine/shared';
import { describe, expect, it } from 'vitest';
import { TERMINAL_THEMES, terminalTheme, type TerminalColors } from './terminal-themes';
import themesText from './themes.css?raw';
import tokensText from './tokens.css?raw';

/** Relative luminance and contrast, as the accessibility guidelines define them. */
function luminance(hex: string): number {
  const channel = (at: number): number => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

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
