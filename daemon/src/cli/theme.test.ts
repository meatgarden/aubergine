import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BUILT_IN_THEME_COLORS, COLOR_THEMES, readThemeFile } from '@aubergine/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageError, parseCommand } from './commands';
import { parseThemeCommand, runThemeCommand, type ThemeCommand } from './theme';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-cli-theme-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function run(command: ThemeCommand): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runThemeCommand(command, { dataDir: dir, print: (text) => out.push(text), warn: (text) => err.push(text) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
describe('parsing the theme commands', () => {
  it('reads list, path, check and new, and list by itself', () => {
    expect(parseCommand(['theme'])).toEqual({ name: 'theme', words: [] });
    expect(parseCommand(['themes', 'list'])).toEqual({ name: 'theme', words: ['list'] });
    expect(parseThemeCommand([])).toEqual({ action: 'list' });
    expect(parseThemeCommand(['path'])).toEqual({ action: 'path' });
    expect(parseThemeCommand(['check', 'a.json'])).toEqual({ action: 'check', file: 'a.json' });
    expect(parseThemeCommand(['new', 'harbor'])).toEqual({ action: 'new', id: 'harbor', from: null, name: null });
    expect(parseThemeCommand(['new', 'harbor', '--from', 'nord', '--name', 'Harbor night'])).toEqual({ action: 'new', id: 'harbor', from: 'nord', name: 'Harbor night' });
    for (const words of [['set'], ['check'], ['check', 'a', 'b'], ['new'], ['new', 'a', 'b'], ['path', 'x'], ['new', '--from', 'nord']]) expect(() => parseThemeCommand(words), words.join(' ')).toThrow(UsageError);
  });
});

describe('aubergine theme', () => {
  it('says where the folder is', async () => {
    expect((await run({ action: 'path' })).out).toBe(path.join(dir, 'themes'));
  });

  it('lists the themes that come with Aubergine and the owner\'s, and what is wrong in a file, through showControl', async () => {
    const empty = await run({ action: 'list' });
    for (const theme of COLOR_THEMES) expect(empty.out).toContain(theme.name);
    expect(empty.out).toContain('No theme of your own yet.');
    await mkdir(path.join(dir, 'themes'));
    await writeFile(path.join(dir, 'themes', 'harbor.json'), JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord' }));
    await writeFile(path.join(dir, 'themes', 'odd.json'), JSON.stringify({ name: 'Odd', kind: 'light', 'x\u001b[31m': 1 }));
    const { code, out } = await run({ action: 'list' });
    expect(code).toBe(0);
    expect(out).toMatch(/harbor +yours, over nord +Harbor/);
    expect(out).toContain('Not read, or skipped:');
    // eslint-disable-next-line no-control-regex -- control characters are what is looked for
    expect(out).not.toMatch(/[\u0000-\u0008\u000b-\u001f]/);
  });

  it('writes a new file to start from with every color of the theme it is from, and never over one that is there', async () => {
    const made = await run({ action: 'new', id: 'harbor', from: 'nord', name: null });
    expect(made.code, made.err).toBe(0);
    const file = path.join(dir, 'themes', 'harbor.json');
    expect(made.out).toContain(`Wrote ${file}`);
    const text = await readFile(file, 'utf8');
    expect(JSON.parse(text)).toMatchObject({ $schema: '../theme.schema.json', name: 'Harbor', kind: 'dark', base: 'nord', colors: BUILT_IN_THEME_COLORS.nord });
    expect(readThemeFile('harbor', text)).toMatchObject({ problems: [] });

    const again = await run({ action: 'new', id: 'harbor', from: 'dracula', name: null });
    expect(again.code).toBe(1);
    expect(again.err).toContain('There is already a file named harbor.json');
    expect(await readFile(file, 'utf8')).toBe(text);

    // From a theme of the owner's: its base, and its colors as it draws them.
    await writeFile(file, JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3' } }));
    expect((await run({ action: 'new', id: 'harbor-2', from: 'harbor', name: 'Second harbor' })).code).toBe(0);
    expect(JSON.parse(await readFile(path.join(dir, 'themes', 'harbor-2.json'), 'utf8'))).toMatchObject({ name: 'Second harbor', base: 'nord', colors: { ...BUILT_IN_THEME_COLORS.nord, accent: '#5fb3b3' } });
    // Left out, from Dark.
    expect((await run({ action: 'new', id: 'mine', from: null, name: null })).code).toBe(0);
    expect(JSON.parse(await readFile(path.join(dir, 'themes', 'mine.json'), 'utf8'))).toMatchObject({ kind: 'dark', base: 'dark' });
  });

  it('refuses an ID that cannot be one, a name that is not plain, a theme that is not there, and a link in the way', async () => {
    for (const id of ['Harbor', 'nord', '../x', 'a b']) expect((await run({ action: 'new', id, from: null, name: null })).code, id).toBe(1);
    expect((await run({ action: 'new', id: 'x', from: null, name: 'a\nb' })).code).toBe(1);
    expect((await run({ action: 'new', id: 'x', from: 'sepia', name: null })).err).toContain('names no theme');
    const outside = path.join(dir, 'outside');
    await mkdir(outside);
    await symlink(outside, path.join(dir, 'themes'));
    const linked = await run({ action: 'new', id: 'x', from: null, name: null });
    expect(linked.code).toBe(1);
    expect(linked.err).toContain('Nothing was written');
    expect(await readdir(outside)).toEqual([]);
  });

  it('checks a file with the server\'s own reader, and starts nothing', async () => {
    const good = path.join(dir, 'good.json');
    await writeFile(good, JSON.stringify({ name: 'Good', kind: 'light', colors: { accent: '#123456' } }));
    expect(await run({ action: 'check', file: good })).toEqual({ code: 0, out: 'Good: a light theme over light, 1 of its colors its own.\nNothing in it is wrong.', err: '' });
    const skipped = path.join(dir, 'skipped.json');
    await writeFile(skipped, JSON.stringify({ name: 'S', kind: 'dark', colors: { accent: 'red' } }));
    const some = await run({ action: 'check', file: skipped });
    expect(some.code).toBe(1);
    expect(some.out).toContain('"accent" is not a color written as #rrggbb');
    const bad = path.join(dir, 'bad.json');
    await writeFile(bad, '{');
    expect(await run({ action: 'check', file: bad })).toEqual({ code: 1, out: '', err: 'themes/bad.json: it is not JSON. It is not read.' });
    expect((await run({ action: 'check', file: path.join(dir, 'missing.json') })).code).toBe(1);
    expect((await run({ action: 'check', file: path.join(dir, 'a.txt') })).err).toContain('ends in .json');
  });
});
