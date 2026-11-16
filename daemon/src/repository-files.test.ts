import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPOSITORY_MAX_BYTES, REPOSITORY_MAX_FILES, repositoryFileName } from '@aubergine/shared';
import { findRepository, hashOf, readRepositoryFile, readRepositoryFolder, writeRepositoryFile } from './repository-files';

const LIMITS = { maxElements: 50, maxElementChars: 20_000 };
const fileOf = (name: string, more: object = {}): string => JSON.stringify({ aubergine: 'workflow', format: 1, workflow: { name, elements: [{ name: 'One', instructions: 'Do one.' }], ...more } });

let dir: string;
/** A stand-in for the home folder; nothing here touches the real one. */
let home: string;
beforeEach(async () => {
  dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-repository-')));
  home = path.join(dir, 'home');
  await mkdir(home);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function repository(root: string, files: Record<string, string> = {}): Promise<string> {
  await mkdir(path.join(root, '.git'), { recursive: true });
  await mkdir(path.join(root, '.aubergine', 'workflows'), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(root, '.aubergine', 'workflows', name), text);
  return root;
}

describe('finding the repository a folder is in', () => {
  it('walks up to the first folder that holds .git, without running anything', async () => {
    const project = await repository(path.join(home, 'work', 'project'));
    await mkdir(path.join(project, 'src', 'deep', 'down'), { recursive: true });
    expect(await findRepository(path.join(project, 'src', 'deep', 'down'), home)).toBe(project);
    expect(await findRepository(project, home)).toBe(project);
    expect(await findRepository(path.join(home, 'work'), home)).toBeNull();
    expect(await findRepository(path.join(project, 'no', 'such', 'folder'), home)).toBe(project);
  });

  it('takes the innermost of nested repositories', async () => {
    const outer = await repository(path.join(home, 'outer'));
    const inner = await repository(path.join(outer, 'vendor', 'inner'));
    await mkdir(path.join(inner, 'lib'), { recursive: true });
    expect(await findRepository(path.join(inner, 'lib'), home)).toBe(inner);
    expect(await findRepository(path.join(outer, 'vendor'), home)).toBe(outer);
  });

  it('knows a worktree, where .git is a file', async () => {
    const tree = path.join(home, 'trees', 'feature');
    await mkdir(path.join(tree, 'src'), { recursive: true });
    await writeFile(path.join(tree, '.git'), 'gitdir: /somewhere/else/.git/worktrees/feature\n');
    expect(await findRepository(path.join(tree, 'src'), home)).toBe(tree);
  });

  it('stops at the home folder, even when that holds .git, and at the root', async () => {
    await mkdir(path.join(home, '.git'));
    await mkdir(path.join(home, 'notes'), { recursive: true });
    expect(await findRepository(path.join(home, 'notes'), home)).toBeNull();
    expect(await findRepository(home, home)).toBeNull();
    // Outside the home folder the walk ends at the root of the file system.
    const elsewhere = path.join(dir, 'elsewhere', 'a', 'b');
    await mkdir(elsewhere, { recursive: true });
    expect(await findRepository(elsewhere, home)).toBeNull();
    const project = await repository(path.join(dir, 'elsewhere'));
    expect(await findRepository(elsewhere, home)).toBe(project);
  });
});

describe('reading a repository\'s workflow files', () => {
  it('reads each file, in name order, with a hash of its bytes', async () => {
    const root = await repository(path.join(home, 'p'), { 'b.json': fileOf('Second'), 'a.json': fileOf('First'), 'notes.txt': 'not a workflow', 'README.md': '# hi' });
    const { files, truncated } = await readRepositoryFolder(root, LIMITS);
    expect(truncated).toBe(false);
    expect(files.map((f) => [f.file, f.ok && f.content.name])).toEqual([
      ['a.json', 'First'],
      ['b.json', 'Second'],
    ]);
    expect(files[0]?.hash).toBe(hashOf(fileOf('First')));
    // Nothing is remembered: a change is seen by the next reading, with another hash.
    await writeFile(path.join(root, '.aubergine', 'workflows', 'a.json'), fileOf('First, changed'));
    const again = await readRepositoryFolder(root, LIMITS);
    expect(again.files[0]).toMatchObject({ ok: true, content: { name: 'First, changed' } });
    expect(again.files[0]?.hash).not.toBe(files[0]?.hash);
  });

  it('gives nothing for a repository without the folder, and reads no folders inside it', async () => {
    const bare = path.join(home, 'bare');
    await mkdir(path.join(bare, '.git'), { recursive: true });
    expect(await readRepositoryFolder(bare, LIMITS)).toEqual({ files: [], truncated: false });
    const root = await repository(path.join(home, 'p'), { 'a.json': fileOf('First') });
    await mkdir(path.join(root, '.aubergine', 'workflows', 'more.json'));
    await writeFile(path.join(root, '.aubergine', 'workflows', 'more.json', 'inner.json'), fileOf('Hidden'));
    expect((await readRepositoryFolder(root, LIMITS)).files.map((f) => f.file)).toEqual(['a.json']);
  });

  it('never follows a link: a linked file is skipped and reported, a linked folder is not read at all', async () => {
    const secret = path.join(dir, 'outside.json');
    await writeFile(secret, fileOf('From outside the repository'));
    const root = await repository(path.join(home, 'p'), { 'good.json': fileOf('Good') });
    await symlink(secret, path.join(root, '.aubergine', 'workflows', 'linked.json'));
    const { files } = await readRepositoryFolder(root, LIMITS);
    expect(files).toEqual([
      expect.objectContaining({ file: 'good.json', ok: true }),
      { file: 'linked.json', ok: false, hash: null, reason: 'It is a link; links are not followed.' },
    ]);
    expect(JSON.stringify(files)).not.toContain('From outside');
    expect(await readRepositoryFile(root, 'linked.json', LIMITS)).toMatchObject({ ok: false, reason: 'It is a link; links are not followed.' });

    // The folder itself, or .aubergine, as a link to somewhere else.
    const elsewhere = path.join(dir, 'elsewhere');
    await mkdir(elsewhere);
    await writeFile(path.join(elsewhere, 'x.json'), fileOf('Elsewhere'));
    const linkedFolder = path.join(home, 'q');
    await mkdir(path.join(linkedFolder, '.git'), { recursive: true });
    await mkdir(path.join(linkedFolder, '.aubergine'));
    await symlink(elsewhere, path.join(linkedFolder, '.aubergine', 'workflows'));
    expect((await readRepositoryFolder(linkedFolder, LIMITS)).files).toEqual([]);
    const linkedOuter = path.join(home, 'r');
    await mkdir(path.join(linkedOuter, '.git'), { recursive: true });
    await mkdir(path.join(elsewhere, 'workflows'));
    await writeFile(path.join(elsewhere, 'workflows', 'y.json'), fileOf('Elsewhere too'));
    await symlink(elsewhere, path.join(linkedOuter, '.aubergine'));
    expect((await readRepositoryFolder(linkedOuter, LIMITS)).files).toEqual([]);
    expect(await readRepositoryFile(linkedOuter, 'y.json', LIMITS)).toBeNull();
  });

  it('reports a file that is not a workflow beside the ones that are, with the reason', async () => {
    const root = await repository(path.join(home, 'p'), {
      'a-good.json': fileOf('Good'),
      'b-broken.json': '{ not json',
      'c-other.json': JSON.stringify({ name: 'no envelope' }),
      'd-empty-element.json': JSON.stringify({ aubergine: 'workflow', format: 1, workflow: { name: 'Empty', elements: [{ name: 'One', instructions: ' ' }] } }),
      'e-bad-name.json': JSON.stringify({ aubergine: 'workflow', format: 1, workflow: { name: 'Bad\u001bname', elements: [{ name: 'One', instructions: 'x' }] } }),
      'f-good.json': fileOf('Also good'),
    });
    const { files } = await readRepositoryFolder(root, LIMITS);
    expect(files.map((f) => [f.file, f.ok])).toEqual([
      ['a-good.json', true],
      ['b-broken.json', false],
      ['c-other.json', false],
      ['d-empty-element.json', false],
      ['e-bad-name.json', false],
      ['f-good.json', true],
    ]);
    const reason = (file: string): string => (files.find((f) => f.file === file) as { reason: string }).reason;
    expect(reason('b-broken.json')).toContain('It is not JSON');
    expect(reason('c-other.json')).toBe('This is not an Aubergine workflow file.');
    expect(reason('d-empty-element.json')).toContain('has no instructions');
    expect(reason('e-bad-name.json')).toContain('plain text');
  });

  it('holds to the limits: so many files, so many bytes, so many elements', async () => {
    const many: Record<string, string> = {};
    for (let n = 0; n < REPOSITORY_MAX_FILES + 5; n += 1) many[`w-${String(n).padStart(3, '0')}.json`] = fileOf(`Workflow ${n}`);
    const root = await repository(path.join(home, 'p'), many);
    const { files, truncated } = await readRepositoryFolder(root, LIMITS);
    expect(files).toHaveLength(REPOSITORY_MAX_FILES);
    expect(truncated).toBe(true);

    const big = await repository(path.join(home, 'big'), { 'huge.json': fileOf('Huge', { description: 'x'.repeat(REPOSITORY_MAX_BYTES) }), 'ok.json': fileOf('Fine') });
    const read = await readRepositoryFolder(big, LIMITS);
    expect(read.files[0]).toMatchObject({ file: 'huge.json', ok: false, hash: null });
    expect((read.files[0] as { reason: string }).reason).toMatch(/bytes; at most 524288 are read/);
    expect(read.files[1]).toMatchObject({ file: 'ok.json', ok: true });
    const three = fileOf('Three', { elements: [1, 2, 3].map((n) => ({ name: `E${n}`, instructions: 'x' })) });
    const small = await repository(path.join(home, 'small'), { 'three.json': three });
    expect((await readRepositoryFolder(small, { maxElements: 2, maxElementChars: 100 })).files[0]).toMatchObject({ ok: false, reason: 'It has 3 elements; at most 2 are allowed.' });
  });

  it('reads one file only by a plain name in the folder', async () => {
    const root = await repository(path.join(home, 'p'), { 'a.json': fileOf('First') });
    await writeFile(path.join(root, 'top.json'), fileOf('At the top'));
    expect(await readRepositoryFile(root, 'a.json', LIMITS)).toMatchObject({ ok: true });
    for (const name of ['../../top.json', '../a.json', '/etc/hosts', path.join(root, 'top.json'), 'a', '.', '..', 'sub/a.json', 'missing.json']) {
      expect(await readRepositoryFile(root, name, LIMITS), name).toBeNull();
    }
  });
});

describe('writing a workflow file into a repository', () => {
  it('makes the name by a strict rule, whatever the workflow is called', () => {
    expect(repositoryFileName('Fix a bug')).toBe('fix-a-bug.json');
    expect(repositoryFileName('  Étape 2 — revue!  ')).toBe('etape-2-revue.json');
    for (const [hostile, file] of [
      ['../x', 'x.json'],
      ['../../etc/passwd', 'etc-passwd.json'],
      ['/absolute/path', 'absolute-path.json'],
      ['a\u0000b\u001b[2Jc', 'a-b-2jc.json'],
      ['..', 'workflow.json'],
      ['修复错误', 'workflow.json'],
      ['.git/hooks/pre-commit', 'git-hooks-pre-commit.json'],
      ['x'.repeat(300), `${'x'.repeat(80)}.json`],
      ['con\\..\\..\\up', 'con-up.json'],
    ] as const) {
      expect(repositoryFileName(hostile), JSON.stringify(hostile)).toBe(file);
      expect(repositoryFileName(hostile)).toMatch(/^[a-z0-9][a-z0-9-]{0,79}\.json$/);
    }
  });

  it('writes one file, only inside the folder, and makes the folder when it is not there', async () => {
    const root = path.join(home, 'p');
    await mkdir(path.join(root, '.git'), { recursive: true });
    const written = await writeRepositoryFile(root, '../../Escape /me', fileOf('x'), false);
    expect(written).toEqual({ file: 'escape-me.json', path: path.join(root, '.aubergine', 'workflows', 'escape-me.json'), overwritten: false });
    expect(await readdir(path.join(root, '.aubergine', 'workflows'))).toEqual(['escape-me.json']);
    // Nothing appeared anywhere else.
    expect((await readdir(root)).sort()).toEqual(['.aubergine', '.git']);
    expect((await readdir(home)).sort()).toEqual(['p']);
    expect((await readdir(dir)).sort()).toEqual(['home']);
  });

  it('does not replace a file unless told to, and says so', async () => {
    const root = await repository(path.join(home, 'p'), { 'fix-a-bug.json': 'the old one' });
    await expect(writeRepositoryFile(root, 'Fix a bug', 'the new one', false)).rejects.toThrow('There is already a file named fix-a-bug.json');
    expect(await readFile(path.join(root, '.aubergine', 'workflows', 'fix-a-bug.json'), 'utf8')).toBe('the old one');
    expect(await writeRepositoryFile(root, 'Fix a bug', 'the new one', true)).toMatchObject({ overwritten: true });
    expect(await readFile(path.join(root, '.aubergine', 'workflows', 'fix-a-bug.json'), 'utf8')).toBe('the new one');
  });

  it('never writes through a link: not a linked file, not a linked folder', async () => {
    const outside = path.join(dir, 'outside.txt');
    await writeFile(outside, 'untouched');
    const root = await repository(path.join(home, 'p'));
    await symlink(outside, path.join(root, '.aubergine', 'workflows', 'fix-a-bug.json'));
    await expect(writeRepositoryFile(root, 'Fix a bug', 'x', true)).rejects.toThrow('is a link');
    await expect(writeRepositoryFile(root, 'Fix a bug', 'x', false)).rejects.toThrow('is a link');
    expect(await readFile(outside, 'utf8')).toBe('untouched');

    const elsewhere = path.join(dir, 'elsewhere');
    await mkdir(elsewhere);
    const linked = path.join(home, 'q');
    await mkdir(path.join(linked, '.git'), { recursive: true });
    await symlink(elsewhere, path.join(linked, '.aubergine'));
    await expect(writeRepositoryFile(linked, 'Fix a bug', 'x', false)).rejects.toThrow('is a link');
    expect(await readdir(elsewhere)).toEqual([]);
  });
});
