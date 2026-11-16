import { createHash } from 'node:crypto';
import { constants, type Dirent } from 'node:fs';
import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { REPOSITORY_FOLDER, REPOSITORY_MAX_BYTES, REPOSITORY_MAX_FILES, importWorkflow, repositoryFileName, validateContent, type WorkflowContent, type WorkflowLimits } from '@aubergine/shared';

/**
 * Reading (and, when the owner asks, writing) the workflow files of a
 * repository. Everything here is about the file system and nothing else, so
 * that what is safe to read is decided in one place:
 *
 * - the repository is found by walking up from a folder, without running Git;
 * - only regular files directly in `.aubergine/workflows/` are read;
 * - a symbolic link is never followed: not the folder, not a file;
 * - there is a limit on how many files and how large each may be;
 * - a file that cannot be read is reported, and never stops the others.
 */

/**
 * The top folder of the Git repository a folder is in: the first folder, going
 * up, that holds `.git` (a folder, or a file as in a worktree). The search
 * never looks at the home folder or above it, nor past the root. Git is not
 * run.
 */
export async function findRepository(folder: string, home: string): Promise<string | null> {
  let dir = path.resolve(folder);
  const stopAt = path.resolve(home);
  for (;;) {
    // The home folder is where the search ends: a `.git` there (some keep their dotfiles so) makes nothing below it a project.
    if (dir === stopAt) return null;
    if (await lstat(path.join(dir, '.git')).then(() => true, () => false)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export type FoundFile =
  | { file: string; ok: true; hash: string; content: WorkflowContent }
  | { file: string; ok: false; hash: string | null; reason: string };

export interface FolderReading {
  files: FoundFile[];
  /** True when there were more files than are looked at. */
  truncated: boolean;
}

const isLink = (target: string): Promise<boolean> => lstat(target).then((s) => s.isSymbolicLink(), () => false);

/** The workflow folder of a repository, or null when there is none to read (missing, or reached through a link). */
async function workflowFolder(root: string): Promise<string | null> {
  const [first, second] = REPOSITORY_FOLDER.split('/') as [string, string];
  const outer = path.join(root, first);
  const inner = path.join(outer, second);
  for (const dir of [outer, inner]) {
    const stats = await lstat(dir).catch(() => null);
    // A link here could point anywhere on the machine: it is not followed.
    if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) return null;
  }
  return inner;
}

/** Reads one file's bytes without following a link, up to the cap. */
async function readBounded(file: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: string }> {
  let handle;
  try {
    // O_NOFOLLOW: if the name became a link between listing and opening, the open fails.
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    return { ok: false, reason: (error as NodeJS.ErrnoException).code === 'ELOOP' ? 'It is a link; links are not followed.' : 'It could not be opened.' };
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return { ok: false, reason: 'It is not a regular file.' };
    if (stats.size > REPOSITORY_MAX_BYTES) return { ok: false, reason: `It is ${stats.size} bytes; at most ${REPOSITORY_MAX_BYTES} are read.` };
    const bytes = Buffer.alloc(stats.size);
    await handle.read(bytes, 0, stats.size, 0);
    return { ok: true, bytes };
  } catch {
    return { ok: false, reason: 'It could not be read.' };
  } finally {
    await handle.close();
  }
}

export const hashOf = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

/** Bytes of a file, as the workflow they hold; or why they are not one. */
export function parseWorkflowBytes(bytes: Buffer, limits: WorkflowLimits): { ok: true; content: WorkflowContent } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    return { ok: false, reason: `It is not JSON: ${(error as Error).message.slice(0, 120)}` };
  }
  try {
    const { content } = importWorkflow(json);
    const problems = validateContent(content, limits);
    return problems.length > 0 ? { ok: false, reason: problems.join(' ') } : { ok: true, content };
  } catch (error) {
    const issue = (error as { issues?: { path: PropertyKey[]; message: string }[] }).issues?.[0];
    return { ok: false, reason: issue ? `${issue.path.join('.')}: ${issue.message}` : (error as Error).message.slice(0, 200) };
  }
}

/** Reads one file of a repository's workflow folder by name. The name must be a single path segment. */
export async function readRepositoryFile(root: string, file: string, limits: WorkflowLimits): Promise<FoundFile | null> {
  if (file !== path.basename(file) || file === '.' || file === '..' || !file.endsWith('.json')) return null;
  const folder = await workflowFolder(root);
  if (!folder) return null;
  const target = path.join(folder, file);
  if (await isLink(target)) return { file, ok: false, hash: null, reason: 'It is a link; links are not followed.' };
  const read = await readBounded(target);
  if (!read.ok) return read.reason === 'It could not be opened.' ? null : { file, ok: false, hash: null, reason: read.reason };
  const hash = hashOf(read.bytes);
  const parsed = parseWorkflowBytes(read.bytes, limits);
  return parsed.ok ? { file, ok: true, hash, content: parsed.content } : { file, ok: false, hash, reason: parsed.reason };
}

/** Every workflow file of a repository, in name order, read afresh: nothing is remembered between calls. */
export async function readRepositoryFolder(root: string, limits: WorkflowLimits): Promise<FolderReading> {
  const folder = await workflowFolder(root);
  if (!folder) return { files: [], truncated: false };
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return { files: [], truncated: false };
  }
  const named = entries.filter((entry) => entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name));
  const files: FoundFile[] = [];
  for (const entry of named.slice(0, REPOSITORY_MAX_FILES)) {
    if (entry.isSymbolicLink()) {
      files.push({ file: entry.name, ok: false, hash: null, reason: 'It is a link; links are not followed.' });
      continue;
    }
    if (!entry.isFile()) continue;
    const found = await readRepositoryFile(root, entry.name, limits);
    if (found) files.push(found);
  }
  return { files, truncated: named.length > REPOSITORY_MAX_FILES };
}

export class RepositoryWriteError extends Error {}

/**
 * Writes a workflow file into a repository's workflow folder, for the owner.
 * The file's name is made here from the workflow's name by a strict rule, so
 * nothing a name holds can choose another place. Nothing is replaced unless
 * `overwrite` says so, and never through a link.
 */
export async function writeRepositoryFile(root: string, workflowName: string, text: string, overwrite: boolean): Promise<{ file: string; path: string; overwritten: boolean }> {
  const file = repositoryFileName(workflowName);
  const [first, second] = REPOSITORY_FOLDER.split('/') as [string, string];
  const outer = path.join(root, first);
  const folder = path.join(outer, second);
  for (const dir of [outer, folder]) {
    if (await isLink(dir)) throw new RepositoryWriteError(`${path.relative(root, dir)} is a link. Nothing is written through a link.`);
    await mkdir(dir, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw new RepositoryWriteError(`${path.relative(root, dir)} could not be made.`);
    });
    if (!(await lstat(dir)).isDirectory()) throw new RepositoryWriteError(`${path.relative(root, dir)} is not a folder.`);
  }
  const target = path.join(folder, file);
  // Belt and braces: the name was made by the rule above, and still must land in the folder.
  if (path.dirname(target) !== folder) throw new RepositoryWriteError('That name cannot be written.');
  const existing = await lstat(target).catch(() => null);
  if (existing?.isSymbolicLink()) throw new RepositoryWriteError(`${file} is a link. Nothing is written through a link.`);
  if (existing && !existing.isFile()) throw new RepositoryWriteError(`${file} is there and is not a file.`);
  if (existing && !overwrite) throw new RepositoryWriteError(`There is already a file named ${file} in ${REPOSITORY_FOLDER}. Nothing was written. Say so if it should be replaced.`);
  let handle;
  try {
    handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (existing ? constants.O_TRUNC : constants.O_EXCL), 0o644);
  } catch {
    throw new RepositoryWriteError(`${file} could not be written.`);
  }
  try {
    await handle.writeFile(text, 'utf8');
  } finally {
    await handle.close();
  }
  return { file, path: target, overwritten: existing !== null };
}
