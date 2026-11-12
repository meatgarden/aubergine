import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { e2e } from '../playwright.config';

export default function teardown(): void {
  try {
    execFileSync('tmux', ['-L', e2e.tmuxSocket, 'kill-server'], { stdio: 'ignore' });
  } catch {
    // No server left running.
  }
  rmSync(e2e.dataDir, { recursive: true, force: true });
}
