import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { e2e } from '../playwright.config';

/** Ends this run's own tmux server, and no other, and removes what the run left behind. */
export default function teardown(): void {
  try {
    execFileSync('tmux', ['-L', e2e.tmuxSocket, 'kill-server'], { stdio: 'ignore' });
  } catch {
    // No server left running.
  }
  rmSync(path.join(process.env.TMUX_TMPDIR || '/tmp', `tmux-${process.getuid?.() ?? 0}`, e2e.tmuxSocket), { force: true });
  rmSync(e2e.dataDir, { recursive: true, force: true });
}
