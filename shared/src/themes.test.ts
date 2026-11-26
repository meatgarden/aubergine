import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ChangeAppearanceRequest } from './protocol';
import { DEFAULT_SETTINGS, Settings } from './settings';
import { COMMAND_IDS } from './shortcuts';
import { Appearance, COLOR_THEMES, DARK_THEME_IDS, LIGHT_THEME_IDS, THEME_COLORS, colorTheme, colorThemeShown, resolveColors } from './themes';

describe('the color themes', () => {
  it('have unique IDs and names, both kinds, and the two that come first', () => {
    const ids = COLOR_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(COLOR_THEMES.map((theme) => theme.name)).size).toBe(ids.length);
    expect(colorTheme('light')?.kind).toBe('light');
    expect(colorTheme('dark')?.kind).toBe('dark');
    expect(LIGHT_THEME_IDS.length).toBeGreaterThan(0);
    expect(DARK_THEME_IDS.length).toBeGreaterThan(0);
    expect([...LIGHT_THEME_IDS, ...DARK_THEME_IDS].sort()).toEqual([...ids].sort());
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(colorTheme('sepia')).toBeUndefined();
    expect(colorTheme('__proto__')).toBeUndefined();
  });

  it('each have a command of their own, and the commands name no theme that is not there', () => {
    const commands = COMMAND_IDS.filter((id) => id.startsWith('theme.use.')).map((id) => id.slice('theme.use.'.length));
    expect(commands).toEqual(COLOR_THEMES.map((theme) => theme.id));
    expect(COMMAND_IDS).toContain('theme.choose');
  });

  it('the one shown is the light one or the dark one as the page is', () => {
    expect(colorThemeShown({ light: 'solarized-light', dark: 'nord' }, 'light')).toBe('solarized-light');
    expect(colorThemeShown({ light: 'solarized-light', dark: 'nord' }, 'dark')).toBe('nord');
  });

  it('color names are plain words', () => {
    expect(new Set(THEME_COLORS).size).toBe(THEME_COLORS.length);
    for (const name of THEME_COLORS) expect(name).toMatch(/^[a-z][a-z-]*$/);
  });
});

describe('colors set by hand', () => {
  it('takes plain entries for every theme, lowered and trimmed', () => {
    expect(resolveColors({ accent: '#AA66CC', bg: ' #101010 ' }, 'dark')).toEqual({ colors: { accent: '#aa66cc', bg: '#101010' }, problems: [] });
    expect(resolveColors({ accent: '#aa66cc' }, 'light').colors).toEqual({ accent: '#aa66cc' });
    expect(resolveColors(undefined, 'dark')).toEqual({ colors: {}, problems: [] });
    expect(resolveColors(null, 'dark')).toEqual({ colors: {}, problems: [] });
    expect(resolveColors({}, 'dark')).toEqual({ colors: {}, problems: [] });
  });

  it('lets an entry for one theme win for that theme only', () => {
    const raw = { accent: '#111111', '[nord]': { accent: '#222222', bg: '#333333' }, '[light]': { text: '#444444' } };
    expect(resolveColors(raw, 'nord')).toEqual({ colors: { accent: '#222222', bg: '#333333' }, problems: [] });
    expect(resolveColors(raw, 'light')).toEqual({ colors: { accent: '#111111', text: '#444444' }, problems: [] });
    expect(resolveColors(raw, 'dracula')).toEqual({ colors: { accent: '#111111' }, problems: [] });
    // Written in either order, the theme's own wins.
    expect(resolveColors({ '[nord]': { accent: '#222222' }, accent: '#111111' }, 'nord').colors).toEqual({ accent: '#222222' });
  });

  it('reports every kind of wrong entry and skips it; the rest still counts', () => {
    const raw = {
      accent: '#aa66cc',
      nope: '#000000',
      '--bg': '#000000',
      bg: 'red; }',
      text: '#fff',
      border: 'rgb(1, 2, 3)',
      'text-muted': '#12345g',
      ok: 12,
      danger: null,
      selection: '#1234567',
      '[sepia]': { bg: '#000000' },
      '[]': {},
      '[nord]': 'dark',
      '[dracula]': [1],
    };
    const { colors, problems } = resolveColors(raw, 'dark');
    expect(colors).toEqual({ accent: '#aa66cc' });
    expect(problems).toEqual([
      'appearance.colors: "nope" is not a color that can be set. It is skipped.',
      'appearance.colors: "--bg" is not a color that can be set. It is skipped.',
      'appearance.colors: "bg" is not a color written as #rrggbb. It is skipped.',
      'appearance.colors: "text" is not a color written as #rrggbb. It is skipped.',
      'appearance.colors: "border" is not a color written as #rrggbb. It is skipped.',
      'appearance.colors: "text-muted" is not a color written as #rrggbb. It is skipped.',
      'appearance.colors: "ok" is not a color written as #rrggbb. It is skipped.',
      'appearance.colors: "danger" is not a color written as #rrggbb. It is skipped.',
      'appearance.colors: "selection" is not a color written as #rrggbb. It is skipped.',
      'appearance.colors: "[sepia]" names no theme. It is skipped.',
      'appearance.colors: "[]" names no theme. It is skipped.',
      'appearance.colors: "[nord]" is not a list of colors by name. It is skipped.',
      'appearance.colors: "[dracula]" is not a list of colors by name. It is skipped.',
    ]);
  });

  it('says the same problems whichever theme is asked about', () => {
    const raw = { '[nord]': { bg: 'red', nope: '#000000', accent: '#111111' }, '[light]': { text: '#12' }, x: '#000000' };
    const problems = resolveColors(raw, 'nord').problems;
    expect(problems).toHaveLength(4);
    for (const id of COLOR_THEMES.map((theme) => theme.id)) expect(resolveColors(raw, id).problems.sort()).toEqual([...problems].sort());
  });

  it('takes nothing but a list of colors by name', () => {
    for (const raw of ['accent', 12, true, [{ accent: '#000000' }]]) expect(resolveColors(raw, 'dark')).toEqual({ colors: {}, problems: ['appearance.colors is not a list of colors by name: it is left out.'] });
  });

  it('cuts a hostile name short in the sentence, and puts nothing in it that is not plainly text', () => {
    const long = 'x'.repeat(500);
    const hostile = { [`a\u0007\u001b[31mb\n"c`]: '#000000', [long]: '#000000', [`[${long}\u202e]`]: {}, '<script>alert(1)</script>': '#000000' };
    const { colors, problems } = resolveColors(hostile, 'dark');
    expect(colors).toEqual({});
    expect(problems).toHaveLength(4);
    for (const problem of problems) {
      expect(problem).not.toMatch(/[^\x20-\x7e]/);
      expect(problem.length).toBeLessThan(140);
    }
    expect(problems[0]).toBe('appearance.colors: "a??[31mb?"c" is not a color that can be set. It is skipped.');
    expect(problems[1]).toContain(`"${'x'.repeat(40)}"`);
  });

  it('says a key such as __proto__, which an object would lose without a word', () => {
    const raw: unknown = JSON.parse('{ "__proto__": { "accent": "#000000" }, "[nord]": { "__proto__": "#000000" }, "accent": "#aa66cc" }');
    const { colors, problems } = resolveColors(raw, 'nord');
    expect(colors).toEqual({ accent: '#aa66cc' });
    expect(problems).toEqual(['appearance.colors: "__proto__" is not a color that can be set. It is skipped.', 'appearance.colors, [nord]: "__proto__" is not a color that can be set. It is skipped.']);
    expect(({} as Record<string, unknown>).accent).toBeUndefined();
  });

  it('only ever gives a known name and six lower-case hexadecimal digits', () => {
    const raw = Object.fromEntries([...THEME_COLORS.map((name) => [name, '#ABCDEF']), ['[dark]', Object.fromEntries(THEME_COLORS.map((name) => [name, '#012345']))]]);
    for (const id of COLOR_THEMES.map((theme) => theme.id)) {
      const { colors, problems } = resolveColors(raw, id);
      expect(problems).toEqual([]);
      expect(Object.keys(colors).sort()).toEqual([...THEME_COLORS].sort());
      for (const [name, value] of Object.entries(colors)) {
        expect(THEME_COLORS).toContain(name);
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('the appearance in the settings', () => {
  it('has its defaults in a file without it', () => {
    expect(Settings.parse({}).appearance).toEqual({ light: 'light', dark: 'dark', cursor: 'block', cursorBlink: true, colors: {} });
    expect(DEFAULT_SETTINGS.appearance).toEqual(Appearance.parse({}));
  });

  it('lets a wrong field fall back to its default by itself, and keeps the others', () => {
    expect(Settings.parse({ appearance: { light: 'nord', dark: 'dracula', cursor: 'bar' } }).appearance).toEqual({ light: 'light', dark: 'dracula', cursor: 'bar', cursorBlink: true, colors: {} });
    expect(Settings.parse({ appearance: { light: 'solarized-light', dark: 'light', cursor: 'beam', cursorBlink: 'yes', colors: [1] } }).appearance).toEqual({ light: 'solarized-light', dark: 'dark', cursor: 'block', cursorBlink: true, colors: {} });
    expect(Settings.parse({ appearance: { cursorBlink: false, colors: { accent: '#000000' }, later: 1 } }).appearance).toMatchObject({ cursorBlink: false, colors: { accent: '#000000' } });
    // The rest of the file still counts.
    expect(Settings.parse({ theme: 'dark', appearance: { light: 12 } }).theme).toBe('dark');
  });

  it('is its defaults where it is not an object, and the rest of the file still counts', () => {
    for (const appearance of ['nord', 12, null, [1], true]) {
      const parsed = Settings.safeParse({ theme: 'light', appearance });
      expect(parsed.success, JSON.stringify(appearance)).toBe(true);
      expect(parsed.data?.appearance).toEqual(DEFAULT_SETTINGS.appearance);
      expect(parsed.data?.theme).toBe('light');
    }
  });

  it('can still be described as a schema', () => {
    expect(() => z.toJSONSchema(Settings, { io: 'output', unrepresentable: 'any' })).not.toThrow();
    expect(() => z.toJSONSchema(ChangeAppearanceRequest, { io: 'input' })).not.toThrow();
  });
});

describe('a change of how the page looks', () => {
  it('may send any field alone, or none, and nothing it leaves out is filled in', () => {
    expect(ChangeAppearanceRequest.parse({})).toEqual({});
    expect(ChangeAppearanceRequest.parse({ theme: 'dark' })).toEqual({ theme: 'dark' });
    expect(ChangeAppearanceRequest.parse({ cursorBlink: false })).toEqual({ cursorBlink: false });
    expect(ChangeAppearanceRequest.parse({ fontFamily: '  Fira Code, "JetBrains Mono", monospace ' })).toEqual({ fontFamily: 'Fira Code, "JetBrains Mono", monospace' });
    // Unknown fields are ignored, as everywhere under /v1.
    expect(ChangeAppearanceRequest.parse({ light: 'gruvbox-light', colors: { accent: '#000000' } })).toEqual({ light: 'gruvbox-light' });
  });

  it('refuses a theme of the other kind, and everything that cannot work', () => {
    for (const body of [
      { light: 'nord' },
      { dark: 'light' },
      { light: 'sepia' },
      { theme: 'sepia' },
      { fontSize: 7 },
      { fontSize: 33 },
      { fontSize: 12.5 },
      { fontSize: '13' },
      { cursor: 'beam' },
      { cursorBlink: 'yes' },
      { fontFamily: '' },
      { fontFamily: '   ' },
      { fontFamily: 'x'.repeat(301) },
      { fontFamily: 'Mono; color: red' },
      { fontFamily: 'Mono} body {' },
      { fontFamily: 'Mono</style><script>' },
      { fontFamily: 'Mono\nmonospace' },
      { fontFamily: 'Mono\u0000' },
      { fontFamily: 'Mono\u2028monospace' },
      { fontFamily: 12 },
    ])
      expect(ChangeAppearanceRequest.safeParse(body).success, JSON.stringify(body)).toBe(false);
    expect(ChangeAppearanceRequest.safeParse({ fontFamily: 'x'.repeat(300) }).success).toBe(true);
    expect(ChangeAppearanceRequest.safeParse({ fontSize: 8 }).success).toBe(true);
    expect(ChangeAppearanceRequest.safeParse({ fontSize: 32 }).success).toBe(true);
  });
});
