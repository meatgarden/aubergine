import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { e2e, second } from '../playwright.config';

/** Ends this run's own tmux servers (of both its Aubergine servers), and no other, and removes what the run left behind. */
export default function teardown(): void {
  for (const where of [e2e, second]) {
    try {
      execFileSync('tmux', ['-L', where.tmuxSocket, 'kill-server'], { stdio: 'ignore' });
    } catch {
      // No server left running.
    }
    rmSync(path.join(process.env.TMUX_TMPDIR || '/tmp', `tmux-${process.getuid?.() ?? 0}`, where.tmuxSocket), { force: true });
    rmSync(where.dataDir, { recursive: true, force: true });
  }
}
