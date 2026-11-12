import fs from 'node:fs';
import path from 'node:path';

type Realpath = (file: string) => string;

/**
 * The path to write into files that outlive this process (a shell snippet, a
 * login service, agent settings) when they need to start Node.
 *
 * `process.execPath` is fully resolved, so under a package manager it names
 * one exact version's folder and stops working at the next upgrade. If a
 * `node` on the PATH is that same binary, its path is the stable one.
 */
export function stableNodePath(
  execPath: string = process.execPath,
  pathVar: string = process.env.PATH ?? '',
  realpath: Realpath = fs.realpathSync,
): string {
  let target: string;
  try {
    target = realpath(execPath);
  } catch {
    return execPath;
  }
  for (const dir of pathVar.split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, path.basename(execPath));
    try {
      if (realpath(candidate) === target) return candidate;
    } catch {
      // Not there, or not readable: try the next folder.
    }
  }
  return execPath;
}
