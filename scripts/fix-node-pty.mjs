// node-pty ships a prebuilt `spawn-helper` binary. Some package managers
// unpack it without the executable bit, and then no terminal can start.
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const daemonDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'daemon');
const require = createRequire(path.join(daemonDir, 'package.json'));

let root;
try {
  root = path.dirname(require.resolve('node-pty/package.json'));
} catch {
  process.exit(0); // not installed yet
}

for (const base of [path.join(root, 'prebuilds'), path.join(root, 'build', 'Release')]) {
  if (!existsSync(base)) continue;
  const dirs = base.endsWith('prebuilds') ? readdirSync(base).map((d) => path.join(base, d)) : [base];
  for (const dir of dirs) {
    const helper = path.join(dir, 'spawn-helper');
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
