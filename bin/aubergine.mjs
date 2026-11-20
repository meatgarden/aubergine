#!/usr/bin/env node
// The `aubergine` command. It runs the CLI of this copy, wherever it is called
// from (a symlink to this file on your PATH works): the compiled file in the
// npm package, or the TypeScript source through tsx in a checkout. The same
// choice is `entryArguments` in daemon/src/package-root.ts.
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))), '..');
const compiled = path.join(root, 'dist', 'cli.mjs');
const daemon = path.join(root, 'daemon');
const entry = existsSync(compiled)
  ? [compiled]
  : [createRequire(path.join(daemon, 'package.json')).resolve('tsx/cli'), path.join(daemon, 'src', 'cli.ts')];

const child = spawn(process.execPath, [...entry, ...process.argv.slice(2)], {
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
