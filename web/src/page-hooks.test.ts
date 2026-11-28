import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, PART_NAMES, TOKEN_HOOKS, type Session } from '@aubergine/shared';
import tokensText from './tokens.css?raw';
import { pageWord, rootHooks, terminalHooks } from './page-hooks';
import { rowState } from './terminal-rows';
import { sizeWords, stylesheetLink } from './custom-css';
import { stylesheetFileOf, stylesheetSays } from './appearance/StylesheetPart';

/** Every component of the page, as written: the parts it marks are read from the source. */
const sources = import.meta.glob('./**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** Every `data-part` a component writes: a literal, or the quoted names of an expression; one that names none is said as it is. */
const partsWritten = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  const add = (name: string, file: string): void => void found.set(name, [...(found.get(name) ?? []), file]);
  for (const [file, text] of Object.entries(sources)) {
    if (file.endsWith('.test.tsx')) continue;
    for (const match of text.matchAll(/data-part=(\{[^}]*\}|"[^"]*")|setAttribute\('data-part', ([^)]*)\)/g)) {
      const written = match[1] ?? match[2] ?? '';
      const names = [...written.matchAll(/['"]([a-z-]+)['"]/g)].map((one) => one[1] ?? '');
      if (names.length === 0) add(`(not a name of the list: ${written})`, file);
      for (const name of names) add(name, file);
    }
  }
  return found;
};

describe('the hooks the page keeps', () => {
  it('every token in the list is declared in tokens.css', () => {
    for (const token of TOKEN_HOOKS) expect(tokensText, `--${token.name}`).toMatch(new RegExp(`--${token.name}\\s*:`));
  });

  it('marks only parts that are in the list, and every part in the list somewhere', () => {
    const written = partsWritten();
    const unknown = [...written.keys()].filter((name) => !(PART_NAMES as readonly string[]).includes(name));
    expect(unknown, `data-part ${unknown.map((name) => `"${name}" (in ${written.get(name)?.join(', ')})`).join(', ')} is not in UI_HOOKS in shared/src/hooks.ts: a part that is drawn is a promise, so add it to the list (and so to docs/hooks.md) or take it away`).toEqual([]);
    const unused = PART_NAMES.filter((name) => !written.has(name));
    expect(unused, `these parts of UI_HOOKS are drawn nowhere: ${unused.join(', ')}`).toEqual([]);
  });
});

const session = (over: Partial<Session> = {}): Session => ({
  id: '0190c2a4-0000-7000-8000-000000000001',
  projectId: '',
  name: 'prod api',
  createdAt: '2026-01-01T00:00:00.000Z',
  state: 'open',
  cwd: '/tmp',
  command: 'zsh',
  note: '',
  status: NO_STATUS,
  attention: NO_ATTENTION,
  noteLog: [],
  agent: null,
  parkedFrom: null,
  peopleOnly: false,
  typedBy: null,
  recap: null,
  takesMessages: false,
  theme: null,
  untold: null,
  messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null },
  links: [],
  written: {},
  suggested: {},
  found: { branch: null, repository: null, repositoryUrl: null, pullRequest: null, at: '2026-01-01T00:00:00.000Z' },
  lastInputAt: null,
  lastOutputAt: null,
  tags: ['Prod', 'api'],
  fields: [],
  ...over,
});

describe('a terminal’s attributes', () => {
  it('are the same values from the same functions, wherever it is drawn', () => {
    const one = session();
    expect(terminalHooks(one, 'red')).toEqual({ 'data-session': one.id, 'data-name': 'prod api', 'data-state': rowState(one), 'data-tags': 'prod api', 'data-agent': undefined, 'data-color': 'red' });
    expect(terminalHooks(session({ agent: { kind: 'claude-code', conversationId: null, program: 'claude' }, tags: [] }), '#123456', { selected: true, focused: false })).toMatchObject({ 'data-agent': 'claude-code', 'data-tags': '', 'data-color': '#123456', 'data-selected': 'true', 'data-focused': undefined });
    expect(terminalHooks(session({ state: 'exited' }), 'none')['data-state']).toBe('ended');
  });
});

describe('the root’s attributes', () => {
  it('say the place, the project, the server, and whether the page is at this computer', () => {
    expect(pageWord(null, false)).toBe('canvas');
    expect(pageWord('queue', false)).toBe('runs');
    expect(pageWord('board', false)).toBe('runs');
    expect(pageWord('library', false)).toBe('library');
    expect(pageWord(null, true)).toBe('terminal');
    expect(rootHooks({ project: 'p', page: 'workflows', alone: false, server: null, here: true })).toEqual({ 'data-page': 'workflows', 'data-project': 'p', 'data-server': 'own', 'data-here': '' });
    expect(rootHooks({ project: null, page: null, alone: false, server: 'abcd1234', here: false })).toEqual({ 'data-page': 'canvas', 'data-project': null, 'data-server': 'linked', 'data-here': null });
  });
});

describe('the owner’s stylesheet on the page', () => {
  it('is linked by its version while it is on, and never on a page opened ?plain', () => {
    expect(stylesheetLink('0123456789ab', true, false)).toBe('/api/v1/custom.css?v=0123456789ab');
    expect(stylesheetLink('0123456789ab', false, false)).toBeNull();
    expect(stylesheetLink('0123456789ab', true, true)).toBeNull();
    expect(stylesheetLink(null, true, false)).toBeNull();
  });

  it('is said where it is and what is the case, in a sentence', () => {
    expect(stylesheetFileOf('/home/you/.aubergine-data/config.json')).toBe('/home/you/.aubergine-data/custom.css');
    expect(stylesheetFileOf(null)).toBeNull();
    expect(sizeWords(12)).toBe('12 bytes');
    expect(sizeWords(2048)).toBe('2.0 KB');
    expect(sizeWords(200 * 1024)).toBe('200 KB');
    expect(stylesheetSays(null, null, true, false)).toMatch(/aubergine css new/);
    expect(stylesheetSays(null, 'custom.css: it is a link.', true, false)).toBe('custom.css: it is a link.');
    expect(stylesheetSays({ bytes: 30 }, null, true, false)).toMatch(/drawn on this page/);
    expect(stylesheetSays({ bytes: 30 }, null, false, false)).toMatch(/switched off/);
    expect(stylesheetSays({ bytes: 30 }, null, true, true)).toMatch(/opened without your stylesheet/);
  });
});
