import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { THEME_FILES_MAX, THEME_FILE_MAX_BYTES } from '@aubergine/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeFolder, readThemeFolder } from './theme-files';

/** The folder of theme files, read from a temporary data folder. Nothing outside it is opened. */

let dir: string;
let folder: string;
const theme = (name: string, kind = 'dark') => JSON.stringify({ name, kind });

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-themes-'));
  folder = path.join(dir, 'themes');
});
afterEach(async () => {
  await chmod(folder, 0o755).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

describe('the folder of theme files', () => {
  it('is no themes and no problem where it is not there', async () => {
    expect(await readThemeFolder(folder)).toEqual({ themes: [], problems: [] });
  });

  it('reads each file by its name, in order, and says what was wrong', async () => {
    await mkdir(folder);
    await writeFile(path.join(folder, 'harbor.json'), JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3', bg: 'red' } }));
    await writeFile(path.join(folder, 'paper.json'), theme('Paper', 'light'));
    await writeFile(path.join(folder, 'Bad Name.json'), theme('Bad'));
    await writeFile(path.join(folder, 'notes.txt'), 'not a theme');
    const { themes, problems } = await readThemeFolder(folder);
    expect(themes.map((one) => [one.id, one.kind, one.base])).toEqual([
      ['harbor', 'dark', 'nord'],
      ['paper', 'light', 'light'],
    ]);
    expect(problems).toEqual([
      'themes/Bad Name.json: its name is not one a theme can have: a lowercase letter, then up to 39 lowercase letters, digits and hyphens, then .json. It is not read.',
      'themes/harbor.json, colors: "bg" is not a color written as #rrggbb. It is skipped.',
    ]);
  });

  it('follows no link, of a file or of the folder itself, and reads no folder named like a file', async () => {
    const outside = path.join(dir, 'outside.json');
    await writeFile(outside, theme('Outside'));
    await mkdir(folder);
    await symlink(outside, path.join(folder, 'linked.json'));
    await mkdir(path.join(folder, 'x.json'));
    await writeFile(path.join(folder, 'real.json'), theme('Real'));
    const { themes, problems } = await readThemeFolder(folder);
    expect(themes.map((one) => one.id)).toEqual(['real']);
    expect(problems).toEqual(['themes/linked.json: it is a link, and links are not followed. It is not read.', 'themes/x.json: it is not a regular file. It is not read.']);

    const elsewhere = path.join(dir, 'elsewhere');
    await mkdir(elsewhere);
    await writeFile(path.join(elsewhere, 'real.json'), theme('Real'));
    await rm(folder, { recursive: true });
    await symlink(elsewhere, folder);
    expect(await readThemeFolder(folder)).toEqual({ themes: [], problems: ['themes: it is a link, and links are not followed. No theme of your own is read.'] });
  });

  it('reads at most fifty files, and none larger than its limit', async () => {
    await mkdir(folder);
    for (let at = 0; at < THEME_FILES_MAX + 1; at += 1) await writeFile(path.join(folder, `t${String(at).padStart(2, '0')}.json`), theme(`T ${at}`));
    await writeFile(path.join(folder, 't00.json'), JSON.stringify({ name: 'Big', kind: 'dark', pad: 'x'.repeat(THEME_FILE_MAX_BYTES) }));
    const { themes, problems } = await readThemeFolder(folder);
    expect(themes).toHaveLength(THEME_FILES_MAX - 1);
    expect(themes.map((one) => one.id)).not.toContain('t50');
    expect(problems[0]).toBe(`themes: there are ${THEME_FILES_MAX + 1} files; the first ${THEME_FILES_MAX} by name are read, and the rest are not.`);
    expect(problems[1]).toMatch(/^themes\/t00\.json: It is \d+ bytes; at most 65536 are read\. It is not read\.$/);
  });

  it('is no themes and one problem where it is not a folder, or cannot be read', async () => {
    await writeFile(folder, 'a file');
    expect(await readThemeFolder(folder)).toEqual({ themes: [], problems: ['themes: it is not a folder. No theme of your own is read.'] });
    await rm(folder);
    await mkdir(folder);
    await writeFile(path.join(folder, 'a.json'), theme('A'));
    await chmod(folder, 0o000);
    // Someone who may read anything (as in a container run as root) reads it all the same.
    const root = process.getuid?.() === 0;
    expect(await readThemeFolder(folder)).toEqual(root ? { themes: [expect.objectContaining({ id: 'a' })], problems: [] } : { themes: [], problems: ['themes: the folder could not be read. No theme of your own is read.'] });
  });

  it('says a problem once, and again only after it went away and came back', async () => {
    const said: string[] = [];
    const themes = new ThemeFolder(dir, (message) => said.push(message));
    await mkdir(folder);
    await writeFile(path.join(folder, 'bad.json'), '{');
    await themes.reload();
    await themes.reload();
    expect(said).toEqual(['themes/bad.json: it is not JSON. It is not read.']);
    await writeFile(path.join(folder, 'bad.json'), theme('Fixed'));
    expect((await themes.reload()).themes.map((one) => one.id)).toEqual(['bad']);
    await writeFile(path.join(folder, 'bad.json'), '{');
    await themes.reload();
    expect(said).toHaveLength(2);
    expect(themes.value.themes).toEqual([]);
  });

  it('writes nothing into the data folder, and changes no file it reads', async () => {
    await mkdir(folder);
    await writeFile(path.join(folder, 'a.json'), theme('A'));
    await new ThemeFolder(dir).reload();
    expect(await readdir(dir)).toEqual(['themes']);
    expect(await readdir(folder)).toEqual(['a.json']);
    expect(await readFile(path.join(folder, 'a.json'), 'utf8')).toBe(theme('A'));
  });
});
