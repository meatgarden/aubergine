import { DEFAULT_ROW_FORMAT, DEFAULT_TITLE_FORMAT } from './templates';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ChangeAppearanceRequest } from './protocol';
import { DEFAULT_SETTINGS, Settings } from './settings';
import { COMMAND_IDS } from './shortcuts';
import { applyEvent } from './events';
import { PatchSessionRequest, UpdateSessionRequest } from './protocol';
import { Session, createInitialState } from './entities';
import { newId } from './ids';
import { Appearance, COLOR_THEMES, DARK_THEME_IDS, LIGHT_THEME_IDS, THEME_COLORS, UserTheme, colorTheme, colorThemeShown, byTagProblems, colorsOver, pageThemeFrom, pageThemeOf, resolveColors, terminalThemeFrom, terminalThemeOf, themeChoices, themeFallbacks, themeOf } from './themes';

const harbor = UserTheme.parse({ id: 'harbor', name: 'Harbor', kind: 'dark', base: 'nord', colors: { bg: '#0e1a24', accent: '#5fb3b3' }, terminal: { foreground: '#d8dee9' } });
const paper = UserTheme.parse({ id: 'paper', name: 'Paper', kind: 'light', base: 'light', colors: {}, terminal: {} });
const mine = [harbor, paper];

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
    expect(colorThemeShown({ light: 'solarized-light', dark: 'nord' }, 'light', [])).toBe('solarized-light');
    expect(colorThemeShown({ light: 'solarized-light', dark: 'nord' }, 'dark', [])).toBe('nord');
    expect(colorThemeShown({ light: 'paper', dark: 'harbor' }, 'dark', mine)).toBe('harbor');
    expect(colorThemeShown({ light: 'paper', dark: 'harbor' }, 'light', mine)).toBe('paper');
  });

  it('falls back where the theme chosen is not there now, or is of the other kind, and says so', () => {
    expect(colorThemeShown({ light: 'paper', dark: 'harbor' }, 'dark', [])).toBe('dark');
    expect(colorThemeShown({ light: 'paper', dark: 'harbor' }, 'light', [])).toBe('light');
    expect(colorThemeShown({ light: 'nord', dark: 'paper' }, 'light', mine)).toBe('light');
    expect(colorThemeShown({ light: 'nord', dark: 'paper' }, 'dark', mine)).toBe('dark');
    expect(themeFallbacks({ light: 'light', dark: 'harbor', terminal: null }, mine)).toEqual([]);
    expect(themeFallbacks({ light: 'nord', dark: 'harbor', terminal: 'gone' }, [])).toEqual([
      'The light theme chosen, Nord, is a dark theme: Light is drawn in its place.',
      'The dark theme chosen, "harbor", is not there now (no theme file of that name was read): Dark is drawn in its place.',
      'The theme of terminals, "gone", is not there now: terminals are drawn as the page is.',
    ]);
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
      '[harbor]': { bg: '#000000' },
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
      'appearance.colors: "[harbor]" names no theme. It is skipped.',
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

  it('takes an entry for a theme of the owner\'s, where that theme was read', () => {
    const raw = { accent: '#111111', '[harbor]': { accent: '#222222' } };
    expect(resolveColors(raw, 'harbor', mine)).toEqual({ colors: { accent: '#222222' }, problems: [] });
    expect(resolveColors(raw, 'nord', mine)).toEqual({ colors: { accent: '#111111' }, problems: [] });
    expect(resolveColors(raw, 'harbor').problems).toEqual(['appearance.colors: "[harbor]" names no theme. It is skipped.']);
  });

  it('lays a theme\'s own colors first, then those for every theme, then those for that theme alone', () => {
    expect(colorsOver('harbor', undefined, mine).colors).toEqual({ bg: '#0e1a24', accent: '#5fb3b3' });
    expect(colorsOver('harbor', { accent: '#111111', text: '#222222' }, mine).colors).toEqual({ bg: '#0e1a24', accent: '#111111', text: '#222222' });
    expect(colorsOver('harbor', { accent: '#111111', '[harbor]': { accent: '#333333', bg: '#444444' } }, mine).colors).toEqual({ bg: '#444444', accent: '#333333' });
    expect(colorsOver('nord', { accent: '#111111' }, mine).colors).toEqual({ accent: '#111111' });
    // A theme that is not there lays nothing of its own.
    expect(colorsOver('harbor', { accent: '#111111' }, []).colors).toEqual({ accent: '#111111' });
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
    expect(Settings.parse({}).appearance).toEqual({ light: 'light', dark: 'dark', cursor: 'block', cursorBlink: true, terminal: null, byTag: [], titleFormat: DEFAULT_TITLE_FORMAT, rowFormat: DEFAULT_ROW_FORMAT, colors: {} });
    expect(DEFAULT_SETTINGS.appearance).toEqual(Appearance.parse({}));
  });

  it('lets a wrong field fall back to its default by itself, and keeps the others', () => {
    // A theme's ID is kept whatever it names now: a theme file may be there, or come back. What is drawn falls back (`colorThemeShown`).
    expect(Settings.parse({ appearance: { light: 'nord', dark: 'dracula', cursor: 'bar' } }).appearance).toEqual({ light: 'nord', dark: 'dracula', cursor: 'bar', cursorBlink: true, terminal: null, byTag: [], titleFormat: DEFAULT_TITLE_FORMAT, rowFormat: DEFAULT_ROW_FORMAT, colors: {} });
    expect(Settings.parse({ appearance: { light: 'solarized-light', dark: 'Not An Id', cursor: 'beam', cursorBlink: 'yes', terminal: 'sepia', colors: [1] } }).appearance).toEqual({ light: 'solarized-light', dark: 'dark', cursor: 'block', cursorBlink: true, terminal: 'sepia', byTag: [], titleFormat: DEFAULT_TITLE_FORMAT, rowFormat: DEFAULT_ROW_FORMAT, colors: {} });
    expect(Settings.parse({ appearance: { dark: 'harbor', terminal: '9lives' } }).appearance).toMatchObject({ dark: 'harbor', terminal: null });
    // The default theme of terminals is any theme, of either kind.
    expect(Settings.parse({ theme: 'dark', appearance: { terminal: 'solarized-light' } }).appearance.terminal).toBe('solarized-light');
    expect(Settings.parse({ appearance: { terminal: 12 } }).appearance.terminal).toBeNull();
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
    expect(ChangeAppearanceRequest.parse({ terminal: 'nord' })).toEqual({ terminal: 'nord' });
    expect(ChangeAppearanceRequest.parse({ terminal: 'solarized-light' })).toEqual({ terminal: 'solarized-light' });
    // Null is sent and kept: "as the page is". Left out is not null.
    expect(ChangeAppearanceRequest.parse({ terminal: null })).toEqual({ terminal: null });
    expect('terminal' in ChangeAppearanceRequest.parse({ theme: 'dark' })).toBe(false);
    expect(ChangeAppearanceRequest.parse({ fontFamily: '  Fira Code, "JetBrains Mono", monospace ' })).toEqual({ fontFamily: 'Fira Code, "JetBrains Mono", monospace' });
    // Unknown fields are ignored, as everywhere under /v1.
    expect(ChangeAppearanceRequest.parse({ light: 'gruvbox-light', colors: { accent: '#000000' } })).toEqual({ light: 'gruvbox-light' });
  });

  it('takes the ID of any theme, built-in or of a file: whether it names one of the right kind is the server\'s to say', () => {
    for (const body of [{ light: 'nord' }, { dark: 'harbor' }, { terminal: 'sepia' }]) expect(ChangeAppearanceRequest.parse(body)).toEqual(body);
  });

  it('refuses what cannot be an ID, and everything that cannot work', () => {
    for (const body of [
      { light: 'Nord' },
      { dark: '' },
      { light: 'x'.repeat(41) },
      { light: '-x' },
      { dark: 'a b' },
      { dark: '__proto__' },
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
      { terminal: '' },
      { terminal: 1 },
    ])
      expect(ChangeAppearanceRequest.safeParse(body).success, JSON.stringify(body)).toBe(false);
    expect(ChangeAppearanceRequest.safeParse({ fontFamily: 'x'.repeat(300) }).success).toBe(true);
    expect(ChangeAppearanceRequest.safeParse({ fontSize: 8 }).success).toBe(true);
    expect(ChangeAppearanceRequest.safeParse({ fontSize: 32 }).success).toBe(true);
  });
});

describe('the theme a terminal is drawn in', () => {
  const appearance = (terminal: Appearance['terminal'], byTag: Appearance['byTag'] = []) => ({ light: 'gruvbox-light', dark: 'nord', terminal, byTag });
  const own = (theme: string | null | undefined, tags: string[] = []) => ({ theme, tags });

  it('is its own, else the default for terminals, else the theme the page is drawn in', () => {
    expect(terminalThemeOf(own(null), appearance(null), 'dark', [])).toBe('nord');
    expect(terminalThemeOf(own(null), appearance(null), 'light', [])).toBe('gruvbox-light');
    expect(terminalThemeOf(own(undefined), appearance(null), 'light', [])).toBe('gruvbox-light');
    expect(terminalThemeOf({}, appearance(null), 'light', [])).toBe('gruvbox-light');
    expect(terminalThemeOf(own(null), appearance('dracula'), 'light', [])).toBe('dracula');
    expect(terminalThemeOf(own(null), appearance('solarized-light'), 'dark', [])).toBe('solarized-light');
    expect(terminalThemeOf(own('high-contrast-dark'), appearance('dracula'), 'light', [])).toBe('high-contrast-dark');
    expect(terminalThemeOf(own('light'), appearance(null), 'dark', [])).toBe('light');
    expect(terminalThemeOf(own('harbor'), appearance(null), 'light', mine)).toBe('harbor');
    expect(terminalThemeOf(own(null), appearance('paper'), 'dark', mine)).toBe('paper');
  });

  it('passes over a theme that is not there now for the next', () => {
    expect(terminalThemeOf(own('harbor'), appearance('dracula'), 'light', [])).toBe('dracula');
    expect(terminalThemeOf(own('harbor'), appearance('paper'), 'dark', [])).toBe('nord');
    expect(terminalThemeOf(own('harbor'), { light: 'gone', dark: 'gone', terminal: 'gone' }, 'dark', [])).toBe('dark');
    // Every combination gives a theme that exists.
    for (const mark of [null, ...COLOR_THEMES.map((t) => t.id)])
      for (const terminal of [null, ...COLOR_THEMES.map((t) => t.id)])
        for (const shown of ['light', 'dark'] as const) expect(colorTheme(terminalThemeOf(own(mark), appearance(terminal), shown, []))).toBeDefined();
  });

  it('by tag: the first entry whose tag it has and whose theme is there, after its own and before the default for terminals', () => {
    const byTag = [
      { tag: 'gone', theme: 'harbor' },
      { tag: 'prod', theme: 'dracula' },
      { tag: 'docs', theme: 'paper' },
      { tag: 'prod', theme: 'solarized-light' },
    ];
    // In the list's order, not the terminal's tags' order.
    expect(terminalThemeFrom(own(null, ['docs', 'prod']), appearance('nord', byTag), 'dark', mine)).toEqual({ id: 'dracula', from: 'tag', tag: 'prod' });
    // The capitals of a tag do not count; the tag is said as the terminal has it.
    expect(terminalThemeFrom(own(null, ['PROD']), appearance(null, byTag), 'light', mine)).toEqual({ id: 'dracula', from: 'tag', tag: 'PROD' });
    expect(terminalThemeFrom(own(null, ['docs']), appearance(null, byTag), 'dark', mine)).toEqual({ id: 'paper', from: 'tag', tag: 'docs' });
    // A theme that is not there now passes to the next entry, then to the default for terminals.
    expect(terminalThemeFrom(own(null, ['gone']), appearance(null, byTag), 'dark', [])).toEqual({ id: 'nord', from: 'page' });
    expect(terminalThemeFrom(own(null, ['gone']), appearance('solarized-dark', byTag), 'dark', [])).toEqual({ id: 'solarized-dark', from: 'terminals' });
    expect(terminalThemeFrom(own(null, ['gone', 'prod']), appearance(null, byTag), 'dark', [])).toEqual({ id: 'dracula', from: 'tag', tag: 'prod' });
    expect(terminalThemeFrom(own(null, ['docs']), appearance(null, byTag), 'dark', [])).toEqual({ id: 'nord', from: 'page' });
    // Its own wins; a tag it does not have does nothing.
    expect(terminalThemeFrom(own('light', ['prod']), appearance(null, byTag), 'dark', mine)).toEqual({ id: 'light', from: 'own' });
    expect(terminalThemeFrom(own(null, ['other']), appearance(null, byTag), 'dark', mine)).toEqual({ id: 'nord', from: 'page' });
    // A wrong own theme passes to the tag.
    expect(terminalThemeFrom(own('gone', ['prod']), appearance(null, byTag), 'dark', mine)).toEqual({ id: 'dracula', from: 'tag', tag: 'prod' });
  });

  it('last, the page’s: the project’s where it names a theme of the kind drawn', () => {
    const project = { light: 'paper', dark: 'harbor' };
    expect(terminalThemeFrom(own(null), appearance(null), 'dark', mine, project)).toEqual({ id: 'harbor', from: 'project' });
    expect(terminalThemeFrom(own(null), appearance(null), 'light', mine, project)).toEqual({ id: 'paper', from: 'project' });
    expect(terminalThemeFrom(own(null), appearance('dracula'), 'light', mine, project)).toEqual({ id: 'dracula', from: 'terminals' });
    expect(terminalThemeFrom(own(null, ['prod']), appearance(null, [{ tag: 'prod', theme: 'light' }]), 'dark', mine, project)).toEqual({ id: 'light', from: 'tag', tag: 'prod' });
    // Gone, the page's own.
    expect(terminalThemeFrom(own(null), appearance(null), 'dark', [], project)).toEqual({ id: 'nord', from: 'page' });
  });
});

describe('the theme the page is drawn in', () => {
  const appearance = { light: 'gruvbox-light', dark: 'nord' };

  it('is the project’s of the kind drawn where it names one there is now and of that kind, else the page’s own', () => {
    expect(pageThemeFrom(appearance, 'dark', [], null)).toEqual({ id: 'nord', from: 'page' });
    expect(pageThemeFrom(appearance, 'dark', [], undefined)).toEqual({ id: 'nord', from: 'page' });
    expect(pageThemeFrom(appearance, 'dark', [], { light: null, dark: null })).toEqual({ id: 'nord', from: 'page' });
    expect(pageThemeFrom(appearance, 'dark', [], { light: 'solarized-light', dark: 'dracula' })).toEqual({ id: 'dracula', from: 'project' });
    expect(pageThemeFrom(appearance, 'light', [], { light: 'solarized-light', dark: 'dracula' })).toEqual({ id: 'solarized-light', from: 'project' });
    // Only one kind set: the other is the page's own.
    expect(pageThemeFrom(appearance, 'light', [], { light: null, dark: 'dracula' })).toEqual({ id: 'gruvbox-light', from: 'page' });
    // A theme of the wrong kind, or one that is not there now: the page's own.
    expect(pageThemeFrom(appearance, 'dark', [], { light: 'dracula', dark: 'light' })).toEqual({ id: 'nord', from: 'page' });
    expect(pageThemeFrom(appearance, 'light', [], { light: 'dracula', dark: null })).toEqual({ id: 'gruvbox-light', from: 'page' });
    expect(pageThemeFrom(appearance, 'dark', [], { light: null, dark: 'harbor' })).toEqual({ id: 'nord', from: 'page' });
    // Theme files.
    expect(pageThemeFrom(appearance, 'dark', mine, { light: 'paper', dark: 'harbor' })).toEqual({ id: 'harbor', from: 'project' });
    expect(pageThemeFrom(appearance, 'light', mine, { light: 'harbor', dark: 'paper' })).toEqual({ id: 'gruvbox-light', from: 'page' });
    // The page's own falls back as ever, under a project that names nothing.
    expect(pageThemeOf({ light: 'gone', dark: 'gone' }, 'dark', [], null)).toBe('dark');
    expect(pageThemeOf({ light: 'gone', dark: 'gone' }, 'dark', [], { light: null, dark: 'gruvbox-dark' })).toBe('gruvbox-dark');
  });
});

describe('themes by tag in the settings', () => {
  it('keep the entries that are right, in order, and drop the rest, and say each that is dropped', () => {
    const raw = [{ tag: 'prod', theme: 'dracula' }, { tag: '', theme: 'nord' }, { tag: 'docs' }, 'x', { tag: ' qa ', theme: 'Not An ID' }, { tag: 'qa', theme: 'paper', extra: 1 }];
    expect(Appearance.parse({ byTag: raw }).byTag).toEqual([
      { tag: 'prod', theme: 'dracula' },
      { tag: 'qa', theme: 'paper' },
    ]);
    expect(byTagProblems(raw)).toHaveLength(4);
    expect(byTagProblems(raw)[0]).toContain('entry 2');
    expect(Appearance.parse({ byTag: 'prod' }).byTag).toEqual([]);
    expect(byTagProblems('prod')).toEqual(['appearance.byTag is not a list of a tag and a theme: it is left out.']);
    expect(byTagProblems(undefined)).toEqual([]);
    const many = Array.from({ length: 25 }, (_, i) => ({ tag: `t${i}`, theme: 'nord' }));
    expect(Appearance.parse({ byTag: many }).byTag).toHaveLength(20);
    expect(byTagProblems(many)).toEqual(['appearance.byTag has more than 20 entries. Those after the 20th are skipped.']);
    // The other fields stay as they are.
    expect(Appearance.parse({ byTag: raw, dark: 'dracula' }).dark).toBe('dracula');
    expect(Appearance.parse({}).byTag).toEqual([]);
  });

  it('a theme that is not there now is said, as the other fallbacks are', () => {
    expect(themeFallbacks({ light: 'light', dark: 'dark', terminal: null, byTag: [{ tag: 'prod', theme: 'gone' }] }, [])).toEqual(['The theme of terminals tagged prod, "gone", is not there now: they are drawn as if that line were not there.']);
    expect(themeFallbacks({ light: 'light', dark: 'dark', terminal: null, byTag: [{ tag: 'prod', theme: 'harbor' }] }, mine)).toEqual([]);
  });

  it('are taken by the appearance route as a whole list, and only one that is right', () => {
    expect(ChangeAppearanceRequest.safeParse({ byTag: [] }).success).toBe(true);
    expect(ChangeAppearanceRequest.safeParse({ byTag: [{ tag: 'prod', theme: 'nord' }] }).success).toBe(true);
    for (const byTag of [[{ tag: '', theme: 'nord' }], [{ tag: 'prod' }], [{ tag: 'x'.repeat(33), theme: 'nord' }], Array.from({ length: 21 }, () => ({ tag: 'a', theme: 'nord' })), 'prod'])
      expect(ChangeAppearanceRequest.safeParse({ byTag }).success, JSON.stringify(byTag)).toBe(false);
  });
});

describe('the theme of a session', () => {
  const state = createInitialState(new Date('2026-01-01T00:00:00Z'));
  const session = Session.parse({ id: newId(), projectId: state.projects[0]!.id, name: 'build', createdAt: '2026-01-01T00:00:00.000Z' });

  it('is none in a stored session without it, and only a theme or null in one with it', () => {
    expect(session.theme).toBeNull();
    expect(Session.parse({ ...session, theme: 'nord' }).theme).toBe('nord');
    // A theme file's ID is kept, whether or not the file is there now; what cannot be an ID is not.
    expect(Session.parse({ ...session, theme: 'sepia' }).theme).toBe('sepia');
    expect(Session.safeParse({ ...session, theme: 'Sepia Tone' }).success).toBe(false);
  });

  it('changes by its one event, through the shared reducer', () => {
    const withIt = { ...state, sessions: [session] };
    const themed = applyEvent(withIt, { type: 'session.themed', sessionId: session.id, theme: 'dracula' });
    expect(themed.sessions[0]!.theme).toBe('dracula');
    expect({ ...themed.sessions[0], theme: null }).toEqual(session);
    expect(applyEvent(themed, { type: 'session.themed', sessionId: session.id, theme: null }).sessions[0]!.theme).toBeNull();
  });

  it('is sent in the bodies that change a session: a theme, or null to clear it; left out is not null', () => {
    for (const Body of [PatchSessionRequest, UpdateSessionRequest]) {
      expect(Body.parse({ theme: 'nord' })).toEqual({ theme: 'nord' });
      expect(Body.parse({ theme: null })).toEqual({ theme: null });
      expect('theme' in Body.parse({ name: 'x' })).toBe(false);
      expect(Body.parse({ theme: 'harbor' })).toEqual({ theme: 'harbor' });
      for (const theme of ['Sepia', '', 3, {}, 'a;b']) expect(Body.safeParse({ theme }).success, JSON.stringify(theme)).toBe(false);
    }
    expect(() => z.toJSONSchema(PatchSessionRequest, { io: 'input' })).not.toThrow();
  });
});

describe('what a theme ID comes to', () => {
  it('is a built-in theme as itself, with nothing over it', () => {
    expect(themeOf('nord', mine)).toEqual({ id: 'nord', name: 'Nord', kind: 'dark', base: 'nord', own: false, colors: {}, terminal: {} });
  });

  it('is a theme file as its base with its colors over it', () => {
    expect(themeOf('harbor', mine)).toEqual({ id: 'harbor', name: 'Harbor', kind: 'dark', base: 'nord', own: true, colors: { bg: '#0e1a24', accent: '#5fb3b3' }, terminal: { foreground: '#d8dee9' } });
  });

  it('is nothing for an ID that names no theme now, a word that is no ID, or a file over a base of the other kind', () => {
    for (const id of ['harbor', 'sepia', '', null, undefined, '__proto__', 'constructor']) expect(themeOf(id, []), String(id)).toBeUndefined();
    expect(themeOf('odd', [{ ...harbor, id: 'odd', base: 'light' }])).toBeUndefined();
  });

  it('lists the built-in themes first, then the owner\'s by name, of a kind or both', () => {
    expect(themeChoices(mine).map((theme) => theme.id)).toEqual([...COLOR_THEMES.map((theme) => theme.id), 'harbor', 'paper']);
    expect(themeChoices(mine, 'light').map((theme) => theme.id)).toEqual([...LIGHT_THEME_IDS, 'paper']);
    expect(themeChoices([], 'dark').map((theme) => theme.id)).toEqual(DARK_THEME_IDS);
  });
});
