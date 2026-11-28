import { contrastRatio } from './contrast';
import type { ThemeColor, ThemeKind } from './themes';

/**
 * The colors an accent needs, worked out from one accent and the colors of the theme it is laid over: what
 * `aubergine theme new <id> --from <theme> --accent "#rrggbb"` writes, so that a theme that only changes the accent is
 * a file of six colors. Nothing else of the theme changes. The pairs that every built-in theme is tested for hold for
 * what comes out: the accent's words on the surfaces and on its own soft tint, the words on the accent, the page's words
 * on the soft tint and on the selection, and the accent as a line against the page and the surface. Where the accent
 * given cannot meet them it is moved, toward black on a light theme and toward white on a dark one, and `moved` says so.
 */

/** The colors `accentColors` writes, in the order a file has them. */
export const ACCENT_COLORS = ['accent', 'accent-soft', 'accent-text', 'on-accent', 'accent-pressed', 'selection'] as const satisfies readonly ThemeColor[];
export type AccentColor = (typeof ACCENT_COLORS)[number];

export interface AccentColors {
  colors: Record<AccentColor, string>;
  /** True where the accent given was moved so that a line of it, or the words on it, could be read. */
  moved: boolean;
}

type Rgb = [number, number, number];
const rgbOf = (hex: string): Rgb => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as Rgb;
const hexOf = (rgb: Rgb): string => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
/** `weight` of `a` and the rest of `b`, channel by channel. */
const mix = (a: string, b: string, weight: number): string => {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return hexOf([0, 1, 2].map((i) => (x[i] as number) * weight + (y[i] as number) * (1 - weight)) as Rgb);
};
/** One step of `STEP` from a color toward black (a light theme) or white (a dark one). */
const STEP = 0.06;
const away = (hex: string, kind: ThemeKind, steps = 1): string => mix(kind === 'light' ? '#000000' : '#ffffff', hex, Math.min(1, STEP * steps));
/** At most this many steps are taken: enough to reach black or white from anywhere. */
const MAX_STEPS = 60;

/**
 * The six colors of an accent over a theme whose colors are `base` and whose kind is `kind`. `strong`: the stronger
 * ratios of a high-contrast theme (7 to 1 for the accent's words). Pure.
 */
export function accentColors(accent: string, base: Readonly<Record<ThemeColor, string>>, kind: ThemeKind, strong = false): AccentColors {
  const words = strong ? 7 : 4.5;
  const given = accent.toLowerCase();
  const onCandidates = [base.bg, base.text];
  const bestOn = (a: string): string => onCandidates.reduce((best, one) => (contrastRatio(one, a) > contrastRatio(best, a) ? one : best));
  // The accent: a line of it against the page and the surface, and words on it, can be read.
  let value = given;
  for (let i = 0; i < MAX_STEPS; i++) {
    if (contrastRatio(value, base.bg) >= 3 && contrastRatio(value, base.surface) >= 3 && contrastRatio(bestOn(value), value) >= words) break;
    value = away(value, kind);
  }
  const onAccent = bestOn(value);
  // Its soft tint: the accent mixed into the surface, less of it until the page's words read on it.
  let softWeight = kind === 'light' ? 0.12 : 0.2;
  let soft = mix(value, base.surface, softWeight);
  while (contrastRatio(base.text, soft) < words && softWeight > 0) {
    softWeight = Math.max(0, softWeight - 0.02);
    soft = mix(value, base.surface, softWeight);
  }
  // Its words: from the accent, toward black or white until they read on the surfaces and on the tint.
  let text = value;
  for (let i = 0; i < MAX_STEPS && [base.surface, base['surface-raised'], soft].some((ground) => contrastRatio(text, ground) < words); i++) text = away(text, kind);
  // Pressed is one step further from the surface than the accent.
  const pressed = away(value, kind, kind === 'light' ? 5 : 7);
  // The selection: the accent mixed into a terminal's ground, less of it until the page's words read on it.
  let selectionWeight = kind === 'light' ? 0.25 : 0.35;
  let selection = mix(value, base['terminal-bg'], selectionWeight);
  while (contrastRatio(base.text, selection) < words && selectionWeight > 0) {
    selectionWeight = Math.max(0, selectionWeight - 0.03);
    selection = mix(value, base['terminal-bg'], selectionWeight);
  }
  return { colors: { accent: value, 'accent-soft': soft, 'accent-text': text, 'on-accent': onAccent, 'accent-pressed': pressed, selection }, moved: value !== given };
}
