import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, accentColors } from './accent';
import { contrastRatio } from './contrast';
import { BUILT_IN_THEME_COLORS, accentThemeFile, readThemeFile } from './theme-files';
import { COLOR_THEMES, themeOf, type ThemeColor } from './themes';

/** A color of that hue, saturation and lightness, written #rrggbb. */
function hsl(h: number, s: number, l: number): string {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Hues all round, each pale, middling and deep, and the greys at either end. */
const ACCENTS = [...Array.from({ length: 12 }, (_, i) => i * 30).flatMap((h) => [hsl(h, 0.7, 0.8), hsl(h, 0.65, 0.5), hsl(h, 0.8, 0.25)]), '#000000', '#ffffff', '#808080', '#ffff00'];

/** The pairs the stylesheets' test asks of every built-in theme, where the accent is in them: [words, ground, ratio]. */
const pairs = (strong: boolean): [ThemeColor, ThemeColor, number][] => [
  ['text', 'accent-soft', 4.5],
  ['accent-text', 'surface', strong ? 7 : 4.5],
  ['accent-text', 'surface-raised', 4.5],
  ['accent-text', 'accent-soft', strong ? 7 : 4.5],
  ['on-accent', 'accent', 4.5],
  ['accent', 'bg', 3],
  ['accent', 'surface', 3],
  // What is selected in a terminal is read on it.
  ['text', 'selection', 4.5],
];

describe('the colors of an accent', () => {
  for (const base of COLOR_THEMES) {
    it(`hold the pairs every built-in theme is tested for, over ${base.name}, for a spread of hues`, () => {
      const colors = BUILT_IN_THEME_COLORS[base.id];
      const strong = base.id.startsWith('high-contrast-');
      const failing: string[] = [];
      for (const accent of ACCENTS) {
        const worked = { ...colors, ...accentColors(accent, colors, base.kind, strong).colors };
        for (const [a, b, ratio] of pairs(strong)) if (contrastRatio(worked[a], worked[b]) < ratio) failing.push(`${accent}: ${a} on ${b} is ${contrastRatio(worked[a], worked[b]).toFixed(2)}`);
      }
      expect(failing).toEqual([]);
    });
  }

  it('keep an accent that can be read as it is, and say when one was moved', () => {
    const dark = BUILT_IN_THEME_COLORS.dark;
    const light = BUILT_IN_THEME_COLORS.light;
    // The built-in themes' own accents are kept.
    expect(accentColors(dark.accent, dark, 'dark')).toMatchObject({ moved: false, colors: { accent: dark.accent } });
    expect(accentColors(light.accent, light, 'light')).toMatchObject({ moved: false, colors: { accent: light.accent } });
    // A pale yellow on a light page cannot be a line there: it is darkened.
    const pale = accentColors('#ffee88', light, 'light');
    expect(pale.moved).toBe(true);
    expect(contrastRatio(pale.colors.accent, light.surface)).toBeGreaterThanOrEqual(3);
    // On a dark page an accent is lightened, and the words on it are the page's dark.
    const deep = accentColors('#202080', dark, 'dark');
    expect(deep.moved).toBe(true);
    expect(deep.colors['on-accent']).toBe(dark.bg);
    // Pressed is further from the surface than the accent.
    expect(contrastRatio(pale.colors['accent-pressed'], light.surface)).toBeGreaterThan(contrastRatio(pale.colors.accent, light.surface));
    expect(contrastRatio(deep.colors['accent-pressed'], dark.surface)).toBeGreaterThan(contrastRatio(deep.colors.accent, dark.surface));
    for (const color of Object.values(deep.colors)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(deep.colors)).toEqual([...ACCENT_COLORS]);
  });

  it('make a theme file of only those six over its base, which reads back as a theme', () => {
    const nord = themeOf('nord', [])!;
    const made = accentThemeFile('Teal', nord, '#2f9e8f');
    const read = readThemeFile('teal', made.text);
    if ('problem' in read) throw new Error(read.problem);
    expect(read.problems).toEqual([]);
    expect(read.theme).toMatchObject({ kind: 'dark', base: 'nord' });
    expect(Object.keys(read.theme.colors).sort()).toEqual([...ACCENT_COLORS].sort());
    // From a theme file, its own colors are kept beside the accent's.
    const harbor = { ...nord, id: 'harbor', own: true, colors: { bg: '#0e1a24', accent: '#5fb3b3' } };
    const over = readThemeFile('harbor-teal', accentThemeFile('Harbor teal', harbor, '#2f9e8f').text);
    if ('problem' in over) throw new Error(over.problem);
    expect(over.theme.colors.bg).toBe('#0e1a24');
    expect(over.theme.colors.accent).not.toBe('#5fb3b3');
  });
});
