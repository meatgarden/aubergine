// Runs shellcheck on the shell scripts in the repository, as part of `pnpm check`.
// Where shellcheck is not installed this is skipped, and says so.
import { spawnSync } from 'node:child_process';

const scripts = ['install.sh', 'daemon/demo/lib.sh', 'daemon/demo/fixing.sh', 'daemon/demo/waiting.sh', 'daemon/demo/checklist.sh', 'daemon/demo/project/run-tests.sh', 'docker/entrypoint.sh'];
const found = spawnSync('shellcheck', ['--version'], { stdio: 'ignore' });
if (found.error || found.status !== 0) {
  console.log(`shellcheck is not installed: skipping the check of ${scripts.join(', ')}.`);
  process.exit(0);
}
const result = spawnSync('shellcheck', ['--shell=sh', '--severity=style', ...scripts], { stdio: 'inherit' });
if (result.status === 0) console.log(`shellcheck: ${scripts.join(', ')} clean.`);
process.exit(result.status ?? 1);
