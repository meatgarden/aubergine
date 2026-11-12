#!/usr/bin/env node
// The `aubergine` command. It runs the CLI from this checkout, wherever it
// is called from (a symlink to this file on your PATH works).
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))), '..');
const daemon = path.join(root, 'daemon');
const require = createRequire(path.join(daemon, 'package.json'));

const result = spawnSync(
  process.execPath,
  [require.resolve('tsx/cli'), path.join(daemon, 'src', 'cli.ts'), ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
