import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableNodePath } from './node-path';

/**
 * The `aubergine` command inside canvas terminals.
 *
 * A program in a session (an agent on a workflow, a script) needs to be able
 * to run `aubergine`, whether or not the owner ever linked the command into
 * a folder on their PATH. So the server keeps a small launcher in its data
 * folder and adds that folder to the END of each new session's PATH: a
 * command of the owner's own, anywhere earlier on the PATH, is found first
 * and keeps working exactly as before. No startup file of theirs is touched.
 */

export const COMMAND_FOLDER = 'bin';

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The launcher: a shell script that starts this copy's command with a Node that survives an upgrade. */
export function commandLauncher(node: string, launcher: string): string {
  return `#!/bin/sh\n# Written by Aubergine. Runs the aubergine command of the copy that serves this canvas.\nexec ${quote(node)} ${quote(launcher)} "$@"\n`;
}

/** Writes the launcher into the data folder and returns the folder to put on the PATH. */
export async function writeCommandLauncher(dataDir: string, root: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')): Promise<string> {
  const folder = path.join(dataDir, COMMAND_FOLDER);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, 'aubergine');
  // Written beside and moved into place, so that a shell never runs half a file.
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, commandLauncher(stableNodePath(), path.join(root, 'bin', 'aubergine.mjs')), { mode: 0o755 });
  await chmod(tmp, 0o755);
  await rename(tmp, file);
  return folder;
}

/** A PATH with the folder at the end, once. */
export function pathWithCommand(basePath: string, folder: string): string {
  return [...basePath.split(':').filter((entry) => entry && entry !== folder), folder].join(':');
}
