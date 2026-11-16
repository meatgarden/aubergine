import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_ENV, newId } from '@aubergine/shared';
import { commandLauncher, pathWithCommand, writeCommandLauncher } from './command-path';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { ZshIntegration } from './shell/integration';
import { destroyTmuxServer, testSocketName } from './test-support';

describe('the launcher for the aubergine command', () => {
  it('starts this copy with a fixed Node, passing every argument on', () => {
    expect(commandLauncher('/opt/node/bin/node', '/somewhere/app/bin/aubergine.mjs')).toBe(
      "#!/bin/sh\n# Written by Aubergine. Runs the aubergine command of the copy that serves this canvas.\nexec '/opt/node/bin/node' '/somewhere/app/bin/aubergine.mjs' \"$@\"\n",
    );
    expect(commandLauncher("/it's/node", '/a b/aubergine.mjs')).toContain(`exec '/it'\\''s/node' '/a b/aubergine.mjs' "$@"`);
  });

  it('goes at the end of a PATH, once', () => {
    expect(pathWithCommand('/usr/bin:/bin', '/data/bin')).toBe('/usr/bin:/bin:/data/bin');
    expect(pathWithCommand('/data/bin:/usr/bin::/bin', '/data/bin')).toBe('/usr/bin:/bin:/data/bin');
    expect(pathWithCommand('', '/data/bin')).toBe('/data/bin');
  });

  it('is written into the data folder, can be run, and is rewritten in place', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-command-'));
    try {
      const folder = await writeCommandLauncher(dir);
      expect(folder).toBe(path.join(dir, 'bin'));
      const file = path.join(folder, 'aubergine');
      expect((await stat(file)).mode & 0o111).not.toBe(0);
      expect(await readFile(file, 'utf8')).toContain(path.join('bin', 'aubergine.mjs'));
      // It is the real command: it knows the workflow commands.
      expect(execFileSync(file, ['help'], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } })).toContain('workflow status');
      await writeCommandLauncher(dir);
      expect(await readFile(file, 'utf8')).toMatch(/^#!\/bin\/sh\n/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p));

/**
 * What a session's shell finds when it asks for `aubergine`, with stand-ins
 * for the user's startup files. Never the developer's own files.
 */
describe.runIf(ZSH)('aubergine on the PATH of a session', () => {
  const socket = testSocketName('command-path');
  const runtime = new TmuxRuntime({ socket });
  let dir: string;
  let ours: string;

  beforeAll(async () => {
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-command-path-')));
    ours = path.join(dir, 'data', 'bin');
    await mkdir(ours, { recursive: true });
    // A stand-in for the launcher: all that matters here is which file the shell finds.
    await writeFile(path.join(ours, 'aubergine'), '#!/bin/sh\necho ours\n', { mode: 0o755 });
  });

  afterAll(async () => {
    await destroyTmuxServer(runtime, socket);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  /** Starts a session whose user has the given `.zshrc`, and says what `aubergine` is there: the file found, and what a child process finds. */
  async function found(name: string, zshrc: string): Promise<{ interactive: string; child: string; path: string }> {
    const userDir = path.join(dir, name);
    await mkdir(userDir, { recursive: true });
    await writeFile(path.join(userDir, '.zshrc'), `${zshrc}\nPROMPT='ready> '\n`);
    const integration = new ZshIntegration(path.join(dir, `${name}-ours`), userDir);
    const id = newId();
    await runtime.create({
      id,
      shell: ZSH!,
      env: { ...(await integration.environment(id, ZSH!)), [SESSION_ENV.bin]: ours, PATH: pathWithCommand('/usr/bin:/bin:/usr/sbin:/sbin', ours) },
    });
    const started = Date.now();
    while (!(await runtime.snapshot(id)).includes('ready>')) {
      if (Date.now() - started > 15_000) throw new Error('No prompt');
      await sleep(25);
    }
    const out = path.join(dir, `${name}.txt`);
    // What the shell itself finds, what a program started from it finds (as an agent's commands are), and the PATH.
    const line = `{ whence -p aubergine; /bin/sh -c 'command -v aubergine'; print -r -- "$PATH" } > ${out} 2>&1; print done >> ${out}`;
    execFileSync('tmux', ['-L', socket, 'send-keys', '-t', `=${id}:`, '-l', line]);
    execFileSync('tmux', ['-L', socket, 'send-keys', '-t', `=${id}:`, 'Enter']);
    while (!existsSync(out) || !(await readFile(out, 'utf8')).includes('done')) {
      if (Date.now() - started > 25_000) throw new Error('The shell did not answer');
      await sleep(25);
    }
    await runtime.kill(id);
    const [interactive = '', child = '', pathLine = ''] = (await readFile(out, 'utf8')).split('\n');
    return { interactive, child, path: pathLine };
  }

  it('is found in a plain session, last on the PATH', async () => {
    const result = await found('plain', '');
    expect(result.interactive).toBe(path.join(ours, 'aubergine'));
    expect(result.child).toBe(path.join(ours, 'aubergine'));
    expect(result.path.split(':').at(-1)).toBe(ours);
  });

  it('is still found when the startup file builds PATH from nothing', async () => {
    const result = await found('reset', 'export PATH=/usr/bin:/bin');
    expect(result.interactive).toBe(path.join(ours, 'aubergine'));
    // Also by a program started from the shell, which is how an agent runs it.
    expect(result.child).toBe(path.join(ours, 'aubergine'));
    expect(result.path).toBe(`/usr/bin:/bin:${ours}`);
  });

  it("leaves a command of the user's own in charge, wherever on the PATH they put it", async () => {
    const theirs = path.join(dir, 'their-bin');
    await mkdir(theirs, { recursive: true });
    await writeFile(path.join(theirs, 'aubergine'), '#!/bin/sh\necho theirs\n', { mode: 0o755 });
    // Put first, as most do.
    const first = await found('theirs-first', `export PATH="${theirs}:$PATH"`);
    expect(first.interactive).toBe(path.join(theirs, 'aubergine'));
    expect(first.child).toBe(path.join(theirs, 'aubergine'));
    // Put last, after ours was already on the PATH: ours is found first only because theirs came later; nothing of theirs was removed.
    const rebuilt = await found('theirs-only', `export PATH="/usr/bin:/bin:${theirs}"`);
    expect(rebuilt.interactive).toBe(path.join(theirs, 'aubergine'));
    expect(rebuilt.path).toBe(`/usr/bin:/bin:${theirs}`);
  });
});
