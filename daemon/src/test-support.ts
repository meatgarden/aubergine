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

/**
 * How a stand-in agent is started, as the beginning of a command line: its script is given as the argument.
 * The script is a shell script, but what is in front of the terminal must not be a shell by name, as it is not
 * with a real agent. So a small program of another name runs the script and stays in front while it does.
 */
export async function standInProgram(dir: string): Promise<string> {
  const { writeFile } = await import('node:fs/promises');
  const launcher = `${dir}/stand-in-agent.mjs`;
  await writeFile(launcher, "import { spawnSync } from 'node:child_process';\nprocess.exit(spawnSync('/bin/sh', process.argv.slice(2), { stdio: 'inherit' }).status ?? 1);\n");
  return `'${process.execPath}' '${launcher}'`;
}
