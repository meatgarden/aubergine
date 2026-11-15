#!/usr/bin/env node
// The `aubergine` command. It runs the CLI from this checkout, wherever it
// is called from (a symlink to this file on your PATH works).
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))), '..');
const daemon = path.join(root, 'daemon');
const require = createRequire(path.join(daemon, 'package.json'));

const child = spawn(process.execPath, [require.resolve('tsx/cli'), path.join(daemon, 'src', 'cli.ts'), ...process.argv.slice(2)], {
  stdio: 'inherit',
});

// A signal sent to this process is passed on, so that stopping `aubergine start`
// stops the server it started. Ctrl-C needs no passing on: the terminal sends
// it to the whole group, and this process only has to outlive it.
for (const signal of ['SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
process.on('SIGINT', () => {});

child.on('error', (error) => {
  console.error(`Could not start the aubergine command: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
