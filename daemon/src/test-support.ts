import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { TmuxRuntime } from './runtime/tmux-runtime';

/**
 * Helpers for tests that start a real tmux server.
 *
 * Two test runs on one machine (a second checkout, a second terminal) must
 * not share a tmux server: one run's teardown would end the other's
 * sessions. So every socket name is unique to the run.
 */

/** A tmux socket name nobody else is using: the label, this process's ID and a random part. */
export function testSocketName(label: string): string {
  return `aubergine-test-${label}-${process.pid}-${randomBytes(4).toString('hex')}`;
}

/** Where tmux keeps the socket file for a name. */
export function tmuxSocketFile(socket: string): string {
  return path.join(process.env.TMUX_TMPDIR || '/tmp', `tmux-${process.getuid?.() ?? 0}`, socket);
}

/** Ends this test's own tmux server, and no other, and removes the socket file it leaves behind. */
export async function destroyTmuxServer(runtime: TmuxRuntime, socket: string): Promise<void> {
  await runtime.killServer();
  await rm(tmuxSocketFile(socket), { force: true });
}
