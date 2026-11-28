import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StateResponse } from './protocol';
import { BUILT_IN_THEME_COLORS, THEME_FILE_MAX_BYTES, ThemesAnswer, mayBeHardToRead, readThemeFile, starterThemeFile, themeColorValues, themeFileJsonSchema, themeIdProblem } from './theme-files';
import { COLOR_THEMES, THEME_COLORS, UserTheme, themeOf } from './themes';

const HARBOR = {
  name: 'Harbor',
  kind: 'dark',
  base: 'nord',
  colors: { bg: '#0e1a24', accent: '#5FB3B3' },
  terminal: { foreground: '#d8dee9', cursor: '#5fb3b3', selection: '#2b4252', ansi: ['#000000', null, '#00ff00'] },
};
const read = (id: string, value: unknown) => readThemeFile(id, typeof value === 'string' ? value : JSON.stringify(value));
const themeOfReading = (reading: ReturnType<typeof readThemeFile>) => {
  if (!('theme' in reading)) throw new Error(reading.problem);
  return reading;
};

describe('a theme file', () => {
  it('is a built-in theme with colors over it, lowered, and the base of its kind where it names none', () => {
    const { theme, problems } = themeOfReading(read('harbor', HARBOR));
    expect(problems).toEqual([]);
    expect(theme).toEqual({ id: 'harbor', name: 'Harbor', kind: 'dark', base: 'nord', colors: { bg: '#0e1a24', accent: '#5fb3b3' }, terminal: { foreground: '#d8dee9', cursor: '#5fb3b3', selection: '#2b4252', ansi: ['#000000', null, '#00ff00'] } });
    expect(themeOfReading(read('plain', { name: 'Plain', kind: 'light' })).theme).toEqual({ id: 'plain', name: 'Plain', kind: 'light', base: 'light', colors: {}, terminal: {} });
    expect(themeOfReading(read('night-2', { name: ' Night ', kind: 'dark', colors: { text: '#ffffff' } })).theme).toMatchObject({ name: 'Night', base: 'dark', colors: { text: '#ffffff' } });
    // `$schema` is for an editor.
    expect(themeOfReading(read('with-schema', { $schema: '../theme.schema.json', name: 'S', kind: 'dark' })).problems).toEqual([]);
  });

  it('is refused whole, with one sentence, where it cannot be a theme', () => {
    const refused: [string, unknown, string][] = [
      ['bad', '{ not json', 'themes/bad.json: it is not JSON. It is not read.'],
      ['bad', [1, 2], 'themes/bad.json: it is not a JSON object with a name, a kind and colors. It is not read.'],
      ['bad', 'null', 'themes/bad.json: it is not a JSON object with a name, a kind and colors. It is not read.'],
      ['bad', { kind: 'dark' }, 'themes/bad.json: "name" is not a plain name of one line, at most 60 characters. It is not read.'],
      ['bad', { name: 'a\nb', kind: 'dark' }, 'themes/bad.json: "name" is not a plain name of one line, at most 60 characters. It is not read.'],
      ['bad', { name: 'x'.repeat(61), kind: 'dark' }, 'themes/bad.json: "name" is not a plain name of one line, at most 60 characters. It is not read.'],
      ['bad', { name: 'Bad', kind: 'sepia' }, 'themes/bad.json: "kind" is not "light" or "dark". It is not read.'],
      ['bad', { name: 'Bad' }, 'themes/bad.json: "kind" is not "light" or "dark". It is not read.'],
      ['bad', { name: 'Bad', kind: 'dark', base: 'light' }, 'themes/bad.json: "base" is not a dark theme that comes with Aubergine (dark, high-contrast-dark, solarized-dark, gruvbox-dark, nord, dracula). It is not read.'],
      ['bad', { name: 'Bad', kind: 'light', base: 'harbor' }, 'themes/bad.json: "base" is not a light theme that comes with Aubergine (light, high-contrast-light, solarized-light, gruvbox-light). It is not read.'],
      ['bad', { name: 'Bad', kind: 'light', base: 12 }, 'themes/bad.json: "base" is not a light theme that comes with Aubergine (light, high-contrast-light, solarized-light, gruvbox-light). It is not read.'],
      ['nord', { name: 'Mine', kind: 'dark' }, 'themes/nord.json: "nord" is the name of a theme that comes with Aubergine: a file of your own needs another name. It is not read.'],
      ['Big', { name: 'Big', kind: 'dark' }, 'themes/Big.json: its name is not one a theme can have: a lowercase letter, then up to 39 lowercase letters, digits and hyphens, then .json. It is not read.'],
      ['bad', `{"name":"x","kind":"dark","pad":"${'x'.repeat(THEME_FILE_MAX_BYTES)}"}`, `themes/bad.json: it is larger than ${THEME_FILE_MAX_BYTES} bytes. It is not read.`],
    ];
    for (const [id, value, sentence] of refused) expect(read(id, value), sentence.slice(0, 60)).toEqual({ problem: sentence });
  });

  it('skips what is wrong, says it, and keeps the rest', () => {
    const reading = themeOfReading(
      read('mixed', {
        name: 'Mixed',
        kind: 'light',
        later: true,
        colors: { accent: '#123456', bg: 'red', nope: '#000000', text: '#fff', 'terminal-bg': ' #ABCDEF ' },
        terminal: { foreground: 'white', cursor: '#000000', background: '#ffffff', ansi: ['#111111', 'blue', 3, null, ...Array(14).fill('#222222')] },
      }),
    );
    expect(reading.theme.colors).toEqual({ accent: '#123456', 'terminal-bg': '#abcdef' });
    expect(reading.theme.terminal).toEqual({ cursor: '#000000', ansi: ['#111111', null, null, null, '#222222', '#222222', '#222222', '#222222', '#222222', '#222222', '#222222', '#222222', '#222222', '#222222', '#222222', '#222222'] });
    expect(reading.problems).toEqual([
      'themes/mixed.json: "later" is not a key of a theme file. It is skipped.',
      'themes/mixed.json, colors: "bg" is not a color written as #rrggbb. It is skipped.',
      'themes/mixed.json, colors: "nope" is not a color that can be set. It is skipped.',
      'themes/mixed.json, colors: "text" is not a color written as #rrggbb. It is skipped.',
      'themes/mixed.json, terminal: "foreground" is not a color written as #rrggbb. It is skipped.',
      'themes/mixed.json, terminal: "background" is not a color a terminal has here (foreground, cursor, selection, ansi). It is skipped.',
      'themes/mixed.json, terminal: "ansi" has more than sixteen colors. Those after the sixteenth are skipped.',
      'themes/mixed.json, terminal: color 1 of "ansi" (red) is not a color written as #rrggbb. It is skipped.',
      'themes/mixed.json, terminal: color 2 of "ansi" (green) is not a color written as #rrggbb. It is skipped.',
    ]);
    expect(themeOfReading(read('x', { name: 'X', kind: 'dark', colors: 'red', terminal: [1] })).problems).toEqual([
      'themes/x.json: "colors" is not a list of colors by name. It is skipped.',
      'themes/x.json: "terminal" is not a list of a terminal\'s colors. It is skipped.',
    ]);
  });

  it('lets nothing out of a hostile file but a plain name and colors written #rrggbb', () => {
    const hostile = `{
      "__proto__": { "polluted": true },
      "constructor": "x",
      "name": "Evil </style><script>alert(1)</script>",
      "kind": "dark",
      "colors": { "__proto__": "#000000", "accent": "#000000; } body { display: none", "bg": "#000000\\"><script>", "text\\u001b[31m": "#000000", "surface": "#101010" },
      "terminal": { "ansi": ["#000000; color: red", "<b>"], "cursor": "javascript:alert(1)" }
    }`;
    const reading = themeOfReading(readThemeFile('evil', hostile));
    expect(reading.theme.colors).toEqual({ surface: '#101010' });
    expect(reading.theme.terminal).toEqual({ ansi: [null, null] });
    // The name is the owner's words: plain text, shown as text, never put into a style or markup.
    expect(reading.theme.name).toBe('Evil </style><script>alert(1)</script>');
    for (const value of Object.values(reading.theme.colors)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    for (const problem of reading.problems) expect(problem).not.toMatch(/[^\x20-\x7e]/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(reading.problems[0]).toBe('themes/evil.json: "__proto__" is not a key of a theme file. It is skipped.');
    expect(read('evil', { name: 'a‮b', kind: 'dark' })).toEqual({ problem: 'themes/evil.json: "name" is not a plain name of one line, at most 60 characters. It is not read.' });
    expect(read('evil', { name: 'a\u0007b', kind: 'dark' })).toHaveProperty('problem');
  });

  it('may have an ID of the shape of one, and not a built-in theme\'s', () => {
    for (const id of ['harbor', 'a', 'my-theme-2', 'x'.repeat(40)]) expect(themeIdProblem(id), id).toBeNull();
    for (const id of ['', 'Harbor', '2nd', '-x', 'a_b', 'a.b', 'x'.repeat(41), '../x', 'dark', 'nord', '__proto__']) expect(themeIdProblem(id), id).not.toBeNull();
  });
});

describe('what comes out of a theme file', () => {
  it('is a schema that can be described, in the state answer and in the answer of the route', () => {
    expect(() => z.toJSONSchema(UserTheme, { io: 'output' })).not.toThrow();
    expect(() => z.toJSONSchema(ThemesAnswer, { io: 'output' })).not.toThrow();
    expect(() => z.toJSONSchema(StateResponse, { io: 'output', unrepresentable: 'any' })).not.toThrow();
  });

  it('is drawn as its base with its colors over it', () => {
    const { theme } = themeOfReading(read('harbor', HARBOR));
    const shown = themeOf('harbor', [theme]);
    expect(shown).toMatchObject({ base: 'nord', own: true });
    expect(themeColorValues(shown!)).toEqual({ ...BUILT_IN_THEME_COLORS.nord, bg: '#0e1a24', accent: '#5fb3b3' });
  });

  it('may be hard to read where its text is less than 4.5 to 1 on its ground or its surface: advice only', () => {
    expect(mayBeHardToRead({ base: 'nord', colors: {} })).toBe(false);
    expect(mayBeHardToRead({ base: 'nord', colors: { text: '#3b4252' } })).toBe(true);
    expect(mayBeHardToRead({ base: 'light', colors: { surface: '#202020' } })).toBe(true);
    for (const theme of COLOR_THEMES) expect(mayBeHardToRead({ base: theme.id, colors: {} }), theme.id).toBe(false);
  });
});

describe('the colors of the built-in themes, outside the browser', () => {
  it('has every color a person may set, for every built-in theme, each #rrggbb', () => {
    expect(Object.keys(BUILT_IN_THEME_COLORS).sort()).toEqual(COLOR_THEMES.map((theme) => theme.id).sort());
    for (const theme of COLOR_THEMES) {
      expect(Object.keys(BUILT_IN_THEME_COLORS[theme.id]), theme.id).toEqual([...THEME_COLORS]);
      for (const value of Object.values(BUILT_IN_THEME_COLORS[theme.id])) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('a new theme file', () => {
  it('names every color with its base\'s value, points an editor at the schema, and reads back as its base', () => {
    for (const theme of COLOR_THEMES) {
      const text = starterThemeFile('Mine', { base: theme.id, colors: {} });
      expect(JSON.parse(text).$schema).toBe('../theme.schema.json');
      const { theme: read, problems } = themeOfReading(readThemeFile('mine', text));
      expect(problems).toEqual([]);
      expect(read).toMatchObject({ name: 'Mine', kind: theme.kind, base: theme.id });
      expect(read.colors).toEqual(BUILT_IN_THEME_COLORS[theme.id]);
    }
    // Started from a theme of the owner's: its base, and its colors as it draws them.
    const from = JSON.parse(starterThemeFile('Copy', { base: 'nord', colors: { accent: '#5fb3b3' } }));
    expect(from).toMatchObject({ kind: 'dark', base: 'nord', colors: { ...BUILT_IN_THEME_COLORS.nord, accent: '#5fb3b3' } });
  });

  it('has a schema that lists every key a file may hold', () => {
    const schema = themeFileJsonSchema() as { properties: Record<string, { properties?: Record<string, unknown>; enum?: string[] }> };
    expect(Object.keys(schema.properties)).toEqual(['$schema', 'name', 'kind', 'base', 'colors', 'terminal']);
    expect(Object.keys(schema.properties.colors?.properties ?? {})).toEqual([...THEME_COLORS]);
    expect(schema.properties.base?.enum).toEqual(COLOR_THEMES.map((theme) => theme.id));
    expect(Object.keys(schema.properties.terminal?.properties ?? {})).toEqual(['foreground', 'cursor', 'selection', 'ansi']);
  });
});
