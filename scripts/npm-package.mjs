#!/usr/bin/env node
// Builds the npm package of Aubergine into dist/npm, ready for `npm pack` or
// `npm publish`. It never publishes: a pushed tag v<version> does, through
// .github/workflows/publish.yml.
//
//   node scripts/npm-package.mjs [--name @scope/aubergine] [--pack]
//
// The package keeps the layout of a checkout, so that every path the code
// works out from `packageRoot()` is the same: the command in bin/, the web app
// in web/dist, templates/, library/, daemon/demo and the tmux configuration.
// The TypeScript of daemon/, shared/, client/ and mcp/ becomes two compiled
// files in dist/ (with shared chunks), which bin/aubergine.mjs prefers when
// they are there. Packages from npm stay dependencies; tsx is not one.
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'npm');
const args = process.argv.slice(2);
const nameAt = args.indexOf('--name');
const name = nameAt >= 0 ? args[nameAt + 1] : '@meatgarden/aubergine';
if (!name || !/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) {
  console.error(`Not a name npm takes: ${name ?? '(missing)'}`);
  process.exit(2);
}

const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const run = (file, argv, cwd = root) => {
  const result = spawnSync(file, argv, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${file} ${argv.join(' ')} failed`);
    process.exit(1);
  }
};

// What the compiled code imports from npm: the dependencies of the packages it is made of.
const dependencies = {};
for (const pkg of ['daemon', 'mcp', 'shared', 'client']) {
  for (const [dep, version] of Object.entries(readJson(`${pkg}/package.json`).dependencies ?? {})) {
    if (dep.startsWith('@aubergine/') || dep === 'tsx') continue;
    if (dependencies[dep] && dependencies[dep] !== version) {
      console.error(`${dep} is wanted at ${dependencies[dep]} and at ${version}; make them the same first.`);
      process.exit(1);
    }
    dependencies[dep] = version;
  }
}

console.log('Building the web app ...');
run('pnpm', ['build']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log('Compiling the server and the command ...');
await build({
  entryPoints: { cli: path.join(root, 'daemon/src/cli.ts'), main: path.join(root, 'daemon/src/main.ts') },
  outdir: path.join(out, 'dist'),
  outExtension: { '.js': '.mjs' },
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: Object.keys(dependencies),
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});

const copy = (from, to = from) => cpSync(path.join(root, from), path.join(out, to), { recursive: true });
copy('bin/aubergine.mjs');
chmodSync(path.join(out, 'bin/aubergine.mjs'), 0o755);
copy('web/dist');
copy('templates');
copy('library');
copy('daemon/demo');
copy('daemon/src/runtime/tmux.conf');
copy('scripts/fix-node-pty.mjs');
copy('README.md');
copy('LICENSE');
// What `aubergine version`, `update`, `uninstall` and `doctor` look for (NPM_MARK in daemon/src/cli/install.ts).
writeFileSync(path.join(out, '.installed-from-npm'), 'This copy of Aubergine was installed with npm; npm updates and removes it.\n');

const daemon = readJson('daemon/package.json');
const manifest = {
  name,
  version: daemon.version,
  description: 'A local, browser-based canvas of terminals, where each terminal session is a node you can arrange and use.',
  type: 'module',
  license: 'MIT',
  repository: { type: 'git', url: 'git+https://github.com/thirstyeggplant/aubergine.git' },
  bin: { aubergine: 'bin/aubergine.mjs' },
  engines: readJson('package.json').engines,
  os: ['darwin', 'linux'],
  scripts: { postinstall: 'node scripts/fix-node-pty.mjs' },
  dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`The package ${name}@${manifest.version} is in ${path.relative(root, out)}.`);

if (args.includes('--pack')) run('npm', ['pack', '--pack-destination', path.join(root, 'dist')], out);
