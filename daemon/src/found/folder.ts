import path from 'node:path';
import { addressProblem } from '@aubergine/shared';
import { runOwnerGit } from '../git/run';

/**
 * The branch and the repository of a folder, read with two Git commands that change nothing. A folder that is not in
 * a repository, or a Git that cannot be started, gives nothing.
 */
export interface FolderFacts {
  branch: string | null;
  repository: string | null;
  repositoryUrl: string | null;
}

export const NO_FACTS: FolderFacts = { branch: null, repository: null, repositoryUrl: null };

/**
 * A remote's address as the repository's name and, where it gives one, its page. A name or a password in the address
 * is dropped, never kept: only the host and the path are read. Pure.
 */
export function readRemote(remote: string): { repository: string | null; repositoryUrl: string | null } {
  const text = remote.trim();
  if (text === '') return { repository: null, repositoryUrl: null };
  let host: string;
  let where: string;
  const scp = /^(?:[^@/\s]+@)?([A-Za-z0-9.-]+):(?!\/\/)(.+)$/.exec(text);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      host = url.hostname;
      where = url.pathname;
    } catch {
      return { repository: null, repositoryUrl: null };
    }
  } else if (scp) {
    host = scp[1] ?? '';
    where = scp[2] ?? '';
  } else return { repository: null, repositoryUrl: null };
  const parts = where.replace(/\.git\/?$/, '').split('/').filter(Boolean);
  if (parts.length < 2 || parts.some((part) => !/^[A-Za-z0-9._~-]+$/.test(part))) return { repository: null, repositoryUrl: null };
  const repository = parts.slice(-2).join('/').slice(0, 200);
  const page = `https://${host}/${parts.join('/')}`;
  return { repository, repositoryUrl: host !== '' && addressProblem(page) === null ? page : null };
}

export async function folderFacts(folder: string): Promise<FolderFacts> {
  try {
    const top = await runOwnerGit(folder, ['rev-parse', '--show-toplevel'], { timeoutSeconds: 5, maxOut: 4000 });
    if (top.code !== 0) return NO_FACTS;
    const head = await runOwnerGit(folder, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { timeoutSeconds: 5, maxOut: 4000 });
    const branch = head.code === 0 ? head.out.trim().slice(0, 250) || null : null;
    const remote = await runOwnerGit(folder, ['config', '--get', 'remote.origin.url'], { timeoutSeconds: 5, maxOut: 4000 });
    const read = remote.code === 0 ? readRemote(remote.out) : { repository: null, repositoryUrl: null };
    return { branch, repository: read.repository ?? path.basename(top.out.trim()).slice(0, 200), repositoryUrl: read.repositoryUrl };
  } catch {
    return NO_FACTS;
  }
}
