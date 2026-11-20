import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where this copy of Aubergine is: the checkout, the installer's `app` folder,
 * or the folder npm installed the package into. It is the nearest folder above
 * this module that has the command (`bin/aubergine.mjs`), so it is the same
 * whether the code runs from its TypeScript source or from the compiled files
 * of the npm package, which sit at another depth.
 */
export function packageRoot(from: string = path.dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'bin', 'aubergine.mjs'))) return dir;
    if (path.dirname(dir) === dir) throw new Error(`Could not find the Aubergine command above ${from}`);
  }
}

/** The compiled program of the npm package, when this copy is one. */
export const compiledEntry = (root: string, name: 'cli' | 'main'): string => path.join(root, 'dist', `${name}.mjs`);

/**
 * The arguments for Node that run the CLI or the server of a copy: the
 * compiled file in the npm package, or the TypeScript source through tsx in a
 * checkout. `bin/aubergine.mjs` makes the same choice in plain JavaScript.
 */
export function entryArguments(root: string, name: 'cli' | 'main'): string[] {
  const compiled = compiledEntry(root, name);
  if (existsSync(compiled)) return [compiled];
  const daemonDir = path.join(root, 'daemon');
  const require = createRequire(path.join(daemonDir, 'package.json'));
  return [require.resolve('tsx/cli'), path.join(daemonDir, 'src', `${name}.ts`)];
}
