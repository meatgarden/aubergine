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
async function readBounded(file: string, maxBytes: number = REPOSITORY_MAX_BYTES): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: string }> {
  let handle;
  try {
    // O_NOFOLLOW: if the name became a link between listing and opening, the open fails. O_NONBLOCK: if it became a
    // pipe, the open does not wait for a writer (the stat below then refuses it); on a regular file it changes nothing.
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    return { ok: false, reason: (error as NodeJS.ErrnoException).code === 'ELOOP' ? 'It is a link; links are not followed.' : 'It could not be opened.' };
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return { ok: false, reason: 'It is not a regular file.' };
    if (stats.size > maxBytes) return { ok: false, reason: `It is ${stats.size} bytes; at most ${maxBytes} are read.` };
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

/* ---------- A file somewhere inside a folder, by a path its index gave ---------- */

/** Whether a path, given by something that was fetched, is one that may be looked for inside a folder: plain names, no way up, not absolute. */
function partsInside(relative: string): string[] | null {
  if (relative === '' || relative.length > 300 || path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0')) return null;
  const parts = relative.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..') ? parts : null;
}

/**
 * Reads one regular file inside a folder, by a path from that folder's root:
 * the index of a library source, or a file that index names. The same care
 * as for a repository's workflow files, and the same reader: the path may
 * not leave the folder, no part of it may be a link (the root itself
 * included), and at most `maxBytes` are read. Nothing outside the folder is
 * ever opened.
 */
export async function readInside(root: string, relative: string, maxBytes: number = REPOSITORY_MAX_BYTES): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: string }> {
  const parts = partsInside(relative);
  if (!parts) return { ok: false, reason: 'Its path is not a plain path inside the source: it may not be absolute or go up.' };
  let dir = path.resolve(root);
  const rootStats = await lstat(dir).catch(() => null);
  if (!rootStats || rootStats.isSymbolicLink() || !rootStats.isDirectory()) return { ok: false, reason: 'The folder of the source is not there, or is a link.' };
  for (const part of parts.slice(0, -1)) {
    dir = path.join(dir, part);
    const stats = await lstat(dir).catch(() => null);
    if (!stats) return { ok: false, reason: 'There is no such file in the source.' };
    // A link here could point anywhere on the machine: it is not followed.
    if (stats.isSymbolicLink()) return { ok: false, reason: 'A folder on its path is a link; links are not followed.' };
    if (!stats.isDirectory()) return { ok: false, reason: 'There is no such file in the source.' };
  }
  const target = path.join(dir, parts[parts.length - 1] as string);
  // Belt and braces: whatever the path said, the file opened is under the root.
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) return { ok: false, reason: 'Its path leaves the source.' };
  if (await isLink(target)) return { ok: false, reason: 'It is a link; links are not followed.' };
  const read = await readBounded(target, maxBytes);
  return read.ok ? read : { ok: false, reason: read.reason === 'It could not be opened.' ? 'There is no such file in the source.' : read.reason };
}

/**
 * Writes one file inside a folder the owner named, for publishing: by a path
 * of plain names from that folder's root. Folders on the way are made; none
 * may be a link, and neither may the file. Nothing outside the folder is
 * written. With `replace` false, a file that is there is never written over: it is refused, and a file that
 * appears between looking and writing is refused too (it is opened to be made, never to be emptied).
 */
export async function writeInside(root: string, relative: string, text: string, replace = true): Promise<{ path: string; replaced: boolean }> {
  const parts = partsInside(relative);
  if (!parts) throw new RepositoryWriteError('That is not a plain path inside the folder.');
  let dir = path.resolve(root);
  const rootStats = await lstat(dir).catch(() => null);
  if (!rootStats || rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new RepositoryWriteError(`${root} is not a folder (or is a link). Nothing is written through a link.`);
  for (const part of parts.slice(0, -1)) {
    dir = path.join(dir, part);
    if (await isLink(dir)) throw new RepositoryWriteError(`${part} is a link. Nothing is written through a link.`);
    await mkdir(dir, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw new RepositoryWriteError(`${part} could not be made.`);
    });
    if (!(await lstat(dir)).isDirectory()) throw new RepositoryWriteError(`${part} is not a folder.`);
  }
  const target = path.join(dir, parts[parts.length - 1] as string);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new RepositoryWriteError('That path leaves the folder.');
  const existing = await lstat(target).catch(() => null);
  if (existing?.isSymbolicLink()) throw new RepositoryWriteError(`${relative} is a link. Nothing is written through a link.`);
  if (existing && !existing.isFile()) throw new RepositoryWriteError(`${relative} is there and is not a file.`);
  if (existing && !replace) throw new RepositoryWriteError(`${relative} is there already, and is not written over.`);
  let handle;
  try {
    handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (existing ? constants.O_TRUNC : constants.O_EXCL), 0o644);
  } catch {
    throw new RepositoryWriteError(`${relative} could not be written.`);
  }
  try {
    await handle.writeFile(text, 'utf8');
  } finally {
    await handle.close();
  }
  return { path: target, replaced: existing !== null };
}
