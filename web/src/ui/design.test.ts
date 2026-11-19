import { describe, expect, it } from 'vitest';
import stylesText from '../styles.css?raw';
import tokensText from '../tokens.css?raw';
import uiText from './ui.css?raw';

/**
 * The stylesheets keep to the tokens. A size, a weight, a corner, a colour or a control's height that is written
 * as a number, and a space that is off the grid of four, fail here, with the line. What may differ is listed
 * below, each with its reason; docs/design.md says the same in words.
 */
const sheets = { 'styles.css': stylesText, 'ui/ui.css': uiText };
const tokens = tokensText;

interface Declaration {
  sheet: string;
  line: number;
  selector: string;
  property: string;
  value: string;
}

/** Every declaration of a sheet, with the selector it is under. Enough of a parser for these files: no strings hold braces. */
function declarations(sheet: string, text: string): Declaration[] {
  const found: Declaration[] = [];
  const plain = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let match = rule.exec(plain); match; match = rule.exec(plain)) {
    const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ');
    const bodyStart = match.index + (match[1] ?? '').length + 1;
    let offset = 0;
    for (const part of (match[2] ?? '').split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) {
        const line = plain.slice(0, bodyStart + offset + part.search(/\S/)).split('\n').length;
        found.push({ sheet, line, selector, property: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim().replace(/\s+/g, ' ') });
      }
      offset += part.length + 1;
    }
  }
  return found;
}

const all = Object.entries(sheets).flatMap(([sheet, text]) => declarations(sheet, text));
const where = (d: Declaration): string => `${d.sheet}:${d.line} ${d.selector} { ${d.property}: ${d.value} }`;

/** What a person picks for a terminal, a tab or a frame is a colour of theirs, not of the system. */
const PICKED = /swatch|color-own|conic-gradient/;
/** The terminal itself: its text is the terminal's, at the size the terminal has. */
const TERMINAL = /\.snapshot|\.xterm|\.node-body pre|\.key-tester/;

describe('the stylesheets keep to the tokens', () => {
  it('reads something', () => {
    expect(all.length).toBeGreaterThan(1500);
  });

  it('a font size is one of the four', () => {
    const drift = all.filter((d) => d.property === 'font-size' && !/^var\(--font-(meta|body|title|screen)\)$|^inherit$/.test(d.value) && !TERMINAL.test(d.selector));
    expect(drift.map(where)).toEqual([]);
    // The shorthand may not bring a size in by another door.
    const short = all.filter((d) => d.property === 'font' && !/^inherit$|var\(--font-(meta|body|title|screen)\)/.test(d.value) && !TERMINAL.test(d.selector));
    expect(short.map(where)).toEqual([]);
  });

  it('a weight is one of the two', () => {
    const drift = all.filter((d) => d.property === 'font-weight' && !/^var\(--weight-(normal|strong)\)$|^inherit$/.test(d.value));
    expect(drift.map(where)).toEqual([]);
  });

  it('a corner is one of the three, or square', () => {
    const drift = all.filter((d) => /radius/.test(d.property) && !d.property.startsWith('--') && !d.value.split(' ').every((part) => /^(0|inherit|var\(--radius-(control|surface|pill)\))$/.test(part)));
    expect(drift.map(where)).toEqual([]);
  });

  it('no colour is written outside the tokens, but those a person picks', () => {
    const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|red|blue|green|orange|yellow|gray|grey)\b/;
    const drift = all.filter((d) => colour.test(d.value) && !PICKED.test(`${d.selector} ${d.property} ${d.value}`));
    expect(drift.map(where)).toEqual([]);
  });

  it('a space is on the grid of four, a hairline, or a token', () => {
    const spacing = /^(padding|margin)(-(top|right|bottom|left|inline|block))?$|^(row-|column-)?gap$/;
    const off = (value: string): boolean =>
      [...value.matchAll(/(?<![\w.-])(-?\d+(?:\.\d+)?)px/g)].some((m) => {
        const n = Math.abs(Number(m[1]));
        return n > 2 && n % 4 !== 0;
      });
    const drift = all.filter((d) => spacing.test(d.property) && off(d.value));
    expect(drift.map(where)).toEqual([]);
  });

  it('a control has no height of its own: the height is a token', () => {
    const control = /(^|[\s,>+~(])(button|input|select)\b|\.ui-(button|field|chip|badge|tab)\b/;
    const drift = all.filter((d) => /^(min-|max-)?height$/.test(d.property) && control.test(d.selector) && /\d+px/.test(d.value));
    expect(drift.map(where)).toEqual([]);
  });

  it('a layer is a token', () => {
    const drift = all.filter((d) => d.property === 'z-index' && !/^var\(--z-[a-z]+\)$|^calc\(var\(--z-[a-z]+\) [+-] \d\)$|^-?[0-3]$|^auto$/.test(d.value));
    expect(drift.map(where)).toEqual([]);
  });

  it('every token that is used exists, in both themes where it is a colour', () => {
    const [dark = '', light = ''] = tokens.split(":root[data-theme='light']");
    const defined = new Set([...dark.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    // Set where they are used: a picked colour, the height controls have in a place, and what the canvas library is told.
    const local = /^--(swatch|control-h|xy-.*)$/;
    const used = new Set(all.flatMap((d) => [...d.value.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1] ?? '')));
    expect([...used].filter((name) => !defined.has(name) && !local.test(name))).toEqual([]);
    // The light theme redefines colours and nothing else, and every colour it redefines is one the dark theme has.
    const lightNames = [...light.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1] ?? '');
    expect(lightNames.filter((name) => !defined.has(name))).toEqual([]);
    expect(lightNames.filter((name) => /^--(font|weight|leading|space|gutter|radius|control|chip|motion|z)/.test(name))).toEqual([]);
  });

  it('motion is the tokens: a quick one, one for what opens, one easing, and the slow beat of a busy button', () => {
    const [dark = ''] = tokens.split(":root[data-theme='light']");
    expect([...dark.matchAll(/(--motion-[a-z]+):/g)].map((m) => m[1])).toEqual(['--motion-quick', '--motion-open', '--motion-ease', '--motion-busy', '--motion-travel']);
    const timed = all.filter((d) => /^(transition|animation)(-duration|-timing-function|-delay)?$/.test(d.property) && d.value !== 'none' && !d.value.startsWith('none '));
    expect(timed.length).toBeGreaterThan(8);
    // No time and no curve is written as a number or by name: each is a token.
    const drift = timed.filter((d) => /\d(ms|s)\b|cubic-bezier|\b(ease|ease-in|ease-out|ease-in-out|linear|steps)\b/.test(d.value.replace(/var\(--motion-[a-z]+\)/g, '')));
    expect(drift.map(where)).toEqual([]);
    // What opens and what changes use the two durations; only a busy button uses the slow beat.
    const durations = (d: Declaration): string[] => [...d.value.matchAll(/var\(--motion-(quick|open|busy)\)/g)].map((m) => m[1] ?? '');
    expect(timed.filter((d) => durations(d).includes('busy')).map((d) => d.selector)).toEqual(["button[aria-busy='true']"]);
    expect(timed.filter((d) => d.property === 'transition' && durations(d).some((name) => name !== 'quick')).map(where)).toEqual([]);
  });

  it('nothing travels for someone who asked for less motion, and nothing grows or moves under the pointer', () => {
    const plain = uiText.replace(/\/\*[\s\S]*?\*\//g, '');
    // Every keyframe that travels is named, and the reduced-motion block replaces each of them by the fade.
    const travelling = [...plain.matchAll(/@keyframes ([a-z-]+) \{([\s\S]*?)\n\}/g)].filter((m) => /transform/.test(m[2] ?? '')).map((m) => m[1] ?? '');
    expect(travelling.sort()).toEqual(['ui-open-down', 'ui-open-side', 'ui-open-up']);
    const reduced = plain.slice(plain.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('animation-name: ui-fade');
    const users = all.filter((d) => d.property === 'animation' && travelling.some((name) => d.value.startsWith(`${name} `))).flatMap((d) => d.selector.split(',').map((part) => part.trim()));
    expect(users.length).toBeGreaterThan(5);
    expect(users.filter((selector) => !reduced.includes(selector))).toEqual([]);
    // Hover and pressed change a surface or a colour, never a size or a place.
    // (A rule that names the rest state beside the hover says the same for both, and changes nothing.)
    const moving = all.filter((d) => d.selector.split(',').every((part) => /:(hover|active)/.test(part)) && /^(transform|width|height|padding|margin|font-size|scale|translate)/.test(d.property));
    expect(moving.map(where)).toEqual([]);
    // No transition animates a transform, anywhere.
    expect(all.filter((d) => d.property === 'transition' && /transform|all\b/.test(d.value)).map(where)).toEqual([]);
  });
});

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

describe('the colours can be read', () => {
  const [darkText = '', lightText = ''] = tokens.split(":root[data-theme='light']");
  const values = (text: string): Record<string, string> => Object.fromEntries([...text.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
  const dark = values(darkText);
  const themes = { dark, light: { ...dark, ...values(lightText) } };
  const surfaces = ['--bg', '--surface', '--surface-raised', '--surface-active'];
  const text: [string, string][] = [
    ...surfaces.flatMap((surface): [string, string][] => [
      ['--text', surface],
      ['--text-muted', surface],
    ]),
    // A sentence on a soft tint (a banner, what a terminal asks) is the text colour, and a help line under it the muted one.
    ['--text', '--attention-soft'],
    ['--text', '--ok-soft'],
    ['--text', '--accent-soft'],
    ['--text', '--danger-soft'],
    ['--text', '--working-soft'],
    ['--text-muted', '--terminal-bg'],
    ['--accent-text', '--surface'],
    ['--accent-text', '--surface-raised'],
    ['--accent-text', '--accent-soft'],
    ['--on-accent', '--accent'],
    ['--attention-text', '--surface'],
    ['--attention-text', '--attention-soft'],
    ['--on-attention', '--attention'],
    ['--working-text', '--surface'],
    ['--working-text', '--working-soft'],
    ['--ok-text', '--surface'],
    ['--ok-text', '--ok-soft'],
    ['--danger-text', '--surface'],
    ['--danger-text', '--danger-soft'],
    ['--on-danger', '--danger'],
  ];
  const lines: [string, string][] = [
    ['--border-control', '--bg'],
    ['--border-control', '--surface'],
    ['--border-control', '--surface-raised'],
    ['--accent', '--bg'],
    ['--accent', '--surface'],
  ];
  for (const [name, theme] of Object.entries(themes)) {
    it(`text is at least 4.5 to 1 on what it lies on, in the ${name} theme`, () => {
      expect(text.filter(([a, b]) => contrast(theme[a] ?? '', theme[b] ?? '') < 4.5)).toEqual([]);
    });
    it(`the line round a control and the focus ring are at least 3 to 1, in the ${name} theme`, () => {
      expect(lines.filter(([a, b]) => contrast(theme[a] ?? '', theme[b] ?? '') < 3)).toEqual([]);
    });
  }
});
