import { UserTheme } from '@aubergine/shared';
import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';
import { colorThemeSays, familyProblem, hardToReadSays, sizeProblem, themesFolderOf } from './appearance/AppearancePart';
import { bodyThemeOf, colorsLine, pairsOf } from './theme';
import { defaultThemeWords } from './TerminalTheme';

/** The lines index.html runs before first paint, run against a stand-in page and storage. */
function firstPaint({ attributes = {}, stored = {}, systemIsLight = false }: { attributes?: Record<string, string>; stored?: Record<string, string>; systemIsLight?: boolean }) {
  const script = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1];
  if (!script) throw new Error('index.html has no script before first paint');
  // Plain ES5 without a module: nothing in it may be newer than what an old browser runs first.
  expect(script).not.toMatch(/\b(let|const|import|export)\b|=>|`/);
  const set: Record<string, string> = { ...attributes };
  const style: Record<string, string> = {};
  const root = {
    getAttribute: (name: string) => set[name] ?? null,
    hasAttribute: (name: string) => name in set,
    setAttribute: (name: string, value: string) => (set[name] = value),
    style: { setProperty: (name: string, value: string) => (style[name] = value) },
  };
  const storage = { getItem: (key: string) => stored[key] ?? null };
  const window = { matchMedia: () => ({ matches: systemIsLight }) };
  new Function('document', 'localStorage', 'window', script)({ documentElement: root }, storage, window);
  return { theme: set['data-theme'], colorTheme: set['data-color-theme'], style, id: set['data-color-theme-id'] };
}

const harbor = UserTheme.parse({ id: 'harbor', name: 'Harbor', kind: 'dark', base: 'nord', colors: { bg: '#0e1a24', accent: '#5fb3b3' }, terminal: {} });
const dim = UserTheme.parse({ id: 'dim', name: 'Dim', kind: 'dark', base: 'dark', colors: { text: '#303030' }, terminal: {} });

describe('the lines before first paint', () => {
  it('draw the kind and its color theme the server wrote on the page', () => {
    const page = { 'data-theme-setting': 'system', 'data-theme-light': 'solarized-light', 'data-theme-dark': 'nord' };
    expect(firstPaint({ attributes: page })).toEqual({ theme: 'dark', colorTheme: 'nord', style: {}, id: 'nord' });
    expect(firstPaint({ attributes: page, systemIsLight: true })).toEqual({ theme: 'light', colorTheme: 'solarized-light', style: {}, id: 'solarized-light' });
    expect(firstPaint({ attributes: { ...page, 'data-theme-setting': 'light' } }).colorTheme).toBe('solarized-light');
  });

  it('take the colors set by hand that have the one shape, and skip the rest', () => {
    const drawn = firstPaint({ attributes: { 'data-theme-setting': 'dark', 'data-theme-dark': 'dracula', 'data-colors-dark': 'accent:#112233,bg:red,;x:#zzzzzz,text:#ABCDEF,terminal-bg:#000000' } });
    expect(drawn.style).toEqual({ '--accent': '#112233', '--terminal-bg': '#000000' });
  });

  it('use this browser’s copies where the server wrote nothing, and never a word that is not an ID', () => {
    const stored = { 'aubergine.theme': 'light', 'aubergine.theme.light': 'gruvbox-light', 'aubergine.colors.light': 'accent:#445566' };
    expect(firstPaint({ stored })).toEqual({ theme: 'light', colorTheme: 'gruvbox-light', style: { '--accent': '#445566' }, id: 'gruvbox-light' });
    expect(firstPaint({ stored: { 'aubergine.theme': 'dark', 'aubergine.theme.dark': 'x"><b>' } }).colorTheme).toBe('dark');
    // Where the server wrote the page, its word counts and no copy is read: no colors from the copy either.
    expect(firstPaint({ attributes: { 'data-theme-setting': 'light', 'data-theme-light': 'light' }, stored }).style).toEqual({});
  });

  it('fall back to the system and the kind itself where nothing is known', () => {
    expect(firstPaint({})).toEqual({ theme: 'dark', colorTheme: 'dark', style: {}, id: 'dark' });
    expect(firstPaint({ systemIsLight: true })).toEqual({ theme: 'light', colorTheme: 'light', style: {}, id: 'light' });
  });

  it('draw a theme file as its base, with its colors over it and its own ID beside, from the page or this browser\'s copies', () => {
    const attributes = { 'data-theme-setting': 'dark', 'data-theme-dark': 'nord', 'data-theme-dark-id': 'harbor', 'data-colors-dark': 'bg:#0e1a24,accent:#5fb3b3' };
    expect(firstPaint({ attributes })).toEqual({ theme: 'dark', colorTheme: 'nord', style: { '--bg': '#0e1a24', '--accent': '#5fb3b3' }, id: 'harbor' });
    const stored = { 'aubergine.theme': 'dark', 'aubergine.theme.dark': 'nord', 'aubergine.theme.dark.id': 'harbor', 'aubergine.colors.dark': 'accent:#5fb3b3' };
    expect(firstPaint({ stored })).toEqual({ theme: 'dark', colorTheme: 'nord', style: { '--accent': '#5fb3b3' }, id: 'harbor' });
    // An ID that is not one is the base's.
    expect(firstPaint({ attributes: { ...attributes, 'data-theme-dark-id': 'x"><b>' } }).id).toBe('nord');
    // Where the server wrote the page, no copy of this browser is read.
    expect(firstPaint({ attributes: { 'data-theme-setting': 'dark', 'data-theme-dark': 'dark' }, stored }).id).toBe('dark');
  });
});

describe('the colors set by hand, as the page writes them', () => {
  it('are the pairs resolveColors gives, in the order of the names, and read back the same', () => {
    const raw = { text: '#AABBCC', accent: '#112233', '[nord]': { accent: '#445566' }, nonsense: '#000000', bg: 'blue' };
    expect(colorsLine(raw, 'nord')).toBe('text:#aabbcc,accent:#445566');
    expect(colorsLine(raw, 'dark')).toBe('text:#aabbcc,accent:#112233');
    expect(colorsLine(undefined, 'dark')).toBe('');
    // A theme file's own colors first, then those set by hand over them.
    expect(colorsLine(raw, 'harbor', [harbor])).toBe('bg:#0e1a24,text:#aabbcc,accent:#112233');
    expect(colorsLine({ '[harbor]': { accent: '#000000' } }, 'harbor', [harbor])).toBe('bg:#0e1a24,accent:#000000');
    expect(pairsOf('text:#aabbcc,accent:#445566,bogus:#000000,bg:#12')).toEqual([
      ['text', '#aabbcc'],
      ['accent', '#445566'],
    ]);
  });
});

describe('what Appearance says', () => {
  it('says which theme is drawn when', () => {
    expect(colorThemeSays('system', 'light', 'nord')).toBe('Light is used while the system is light, Nord while it is dark.');
    expect(colorThemeSays('light', 'solarized-light', 'dark')).toBe('The page is drawn in Solarized light. Dark is the theme of the dark page.');
    expect(colorThemeSays('dark', 'light', 'dracula')).toBe('The page is drawn in Dracula. Light is the theme of the light page.');
    expect(colorThemeSays('dark', 'light', 'harbor', [harbor])).toBe('The page is drawn in Harbor. Light is the theme of the light page.');
  });

  it('says where the theme files are, and which of them may be hard to read', () => {
    expect(themesFolderOf('/home/someone/.aubergine/data/config.json')).toBe('/home/someone/.aubergine/data/themes');
    expect(themesFolderOf(null)).toBeNull();
    expect(hardToReadSays([harbor, dim])).toEqual(['Dim may be hard to read: its text is less than 4.5 to 1 on its background or its surface.']);
    expect(hardToReadSays([])).toEqual([]);
  });

  it('takes a size from 8 to 32 and a font-family list the server takes, and says why not otherwise', () => {
    expect(['8', '13', '32'].map(sizeProblem)).toEqual([null, null, null]);
    expect(sizeProblem('7')).toBe('The size is from 8 to 32 pixels.');
    expect(sizeProblem('13.5')).toBe('The size is a whole number of pixels, from 8 to 32.');
    expect(sizeProblem('')).toBe('The size is a whole number of pixels, from 8 to 32.');
    expect(familyProblem('"JetBrains Mono", monospace')).toBeNull();
    expect(familyProblem('  ')).toMatch(/^A font is needed/);
    expect(familyProblem('Mono; color: red')).toMatch(/without control characters or any of/);
    expect(familyProblem('a'.repeat(301))).toBe('A font-family list is at most 300 characters.');
  });
});

describe('the body of a terminal', () => {
  it('carries nothing where its theme is the page\'s, so the page\'s colors set by hand stay over it', () => {
    expect(bodyThemeOf('nord', 'nord', { 'terminal-bg': '#000000' })).toEqual({});
  });

  it('is a preview of its own theme where that is another, with that theme\'s colors set by hand on it alone', () => {
    expect(bodyThemeOf('dracula', 'dark', {})).toEqual({ 'data-theme-preview': 'dracula' });
    const colors = { 'terminal-bg': '#101010', '[dracula]': { 'terminal-bg': '#202020', text: '#EEEEEE' }, '[dark]': { 'terminal-bg': '#303030' } };
    expect(bodyThemeOf('dracula', 'dark', colors)).toEqual({ 'data-theme-preview': 'dracula', style: { '--text': '#eeeeee', '--terminal-bg': '#202020' } });
    expect(bodyThemeOf('nord', 'dark', colors)).toEqual({ 'data-theme-preview': 'nord', style: { '--terminal-bg': '#101010' } });
    // Nothing of a wrong entry reaches the style.
    expect(bodyThemeOf('nord', 'dark', { 'terminal-bg': '#000000; color: red', 'x-y': '#000000', '[nord]': { bg: 'red' } })).toEqual({ 'data-theme-preview': 'nord' });
  });

  it('is a preview of a theme file\'s base, with the file\'s colors and then those set by hand on it, and the file\'s ID beside', () => {
    expect(bodyThemeOf('harbor', 'dark', { text: '#eeeeee' }, [harbor])).toEqual({ 'data-theme-preview': 'nord', 'data-theme-id': 'harbor', style: { '--bg': '#0e1a24', '--text': '#eeeeee', '--accent': '#5fb3b3' } });
    expect(bodyThemeOf('harbor', 'harbor', {}, [harbor])).toEqual({});
  });
});

describe('the words for the default of terminals', () => {
  it('name the default, or say it is the page\'s', () => {
    expect(defaultThemeWords({ terminal: 'gruvbox-dark' }, 'light')).toBe('Gruvbox dark');
    expect(defaultThemeWords({ terminal: null }, 'nord')).toBe('as the page: Nord');
    expect(defaultThemeWords({ terminal: 'harbor' }, 'nord', [harbor])).toBe('Harbor');
    // A default that is not there now is the page's, as it is drawn.
    expect(defaultThemeWords({ terminal: 'harbor' }, 'nord')).toBe('as the page: Nord');
  });
});
