import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@aubergine/shared';
import { TmuxRuntime } from '../runtime/tmux-runtime';
import { destroyTmuxServer, testSocketName } from '../test-support';
import { ZshIntegration, parseStatusLine, type ShellReport } from './integration';

describe('parseStatusLine', () => {
  it('reads a busy line with its command', () => {
    expect(parseStatusLine('busy\t1767225600\tmake test  -j4\n')).toEqual({
      state: 'busy',
      commandLine: 'make test  -j4',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      lastExit: null,
      lastFinishedAt: null,
    });
  });

  it('reads an idle line with and without an exit code', () => {
    expect(parseStatusLine('idle\t2\t1767225600\n')).toMatchObject({
      state: 'idle',
      lastExit: 2,
      lastFinishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(parseStatusLine('idle\t\t\n')).toMatchObject({ state: 'idle', lastExit: null, lastFinishedAt: null });
  });

  it('ignores anything else', () => {
    expect(parseStatusLine('')).toBeNull();
    expect(parseStatusLine('garbage')).toBeNull();
  });
});

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p));

describe.runIf(ZSH)('zsh integration', () => {
  const socket = testSocketName('shell');
  const runtime = new TmuxRuntime({ socket });
  let dir: string;
  let userDir: string;
  let integration: ZshIntegration;

  beforeAll(async () => {
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-shell-')));
    // A stand-in for the user's own zsh files, to check that each one is loaded, in order.
    userDir = path.join(dir, 'user');
    execFileSync('mkdir', ['-p', userDir]);
    for (const name of ['.zshenv', '.zprofile', '.zshrc', '.zlogin']) {
      await writeFile(path.join(userDir, name), `LOADED="$LOADED ${name.slice(1)}:\${ZDOTDIR:-unset}"\n`);
    }
    await writeFile(path.join(userDir, '.zshrc'), `LOADED="$LOADED zshrc:\${ZDOTDIR:-unset}"\nPROMPT='ready> '\nMY_SETTING=from-my-zshrc\n`);
    integration = new ZshIntegration(path.join(dir, 'ours'), userDir);
  });

  afterAll(async () => {
    await destroyTmuxServer(runtime, socket);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function start(): Promise<string> {
    const id = newId();
    const env = await integration.environment(id, ZSH!);
    await runtime.create({ id, shell: ZSH!, env });
    const started = Date.now();
    while (!(await runtime.snapshot(id)).includes('ready>')) {
      if (Date.now() - started > 15_000) throw new Error('No prompt');
      await sleep(25);
    }
    return id;
  }

  const type = (id: string, text: string): void => {
    execFileSync('tmux', ['-L', socket, 'send-keys', '-t', `=${id}:`, '-l', text]);
    execFileSync('tmux', ['-L', socket, 'send-keys', '-t', `=${id}:`, 'Enter']);
  };

  async function waitForReport(id: string, check: (report: ShellReport) => boolean): Promise<ShellReport> {
    const started = Date.now();
    for (;;) {
      const report = await integration.read(id);
      if (report && check(report)) return report;
      if (Date.now() - started > 10_000) throw new Error(`No matching report; last: ${JSON.stringify(report)}`);
      await sleep(25);
    }
  }

  it("loads every one of the user's startup files, with ZDOTDIR as they have it", async () => {
    const id = await start();
    type(id, `print -r -- "loaded=[$LOADED] setting=[$MY_SETTING] zdotdir=[$ZDOTDIR] hist=[$HISTFILE]" > ${path.join(dir, 'loaded.txt')}`);
    const file = path.join(dir, 'loaded.txt');
    const started = Date.now();
    while (!existsSync(file) || !(await readFile(file, 'utf8')).includes('zdotdir=')) {
      if (Date.now() - started > 10_000) throw new Error('The shell did not write the file');
      await sleep(25);
    }
    const text = await readFile(file, 'utf8');
    expect(text).toContain(`loaded=[ zshenv:${userDir} zprofile:${userDir} zshrc:${userDir} zlogin:${userDir}]`);
    expect(text).toContain('setting=[from-my-zshrc]');
    // Once startup is over, ZDOTDIR is the user's again, and history is not kept in our folder.
    expect(text).toContain(`zdotdir=[${userDir}]`);
    expect(text).not.toContain(path.join(dir, 'ours'));
    await runtime.kill(id);
  });

  it('reports idle at the first prompt, before any command', async () => {
    const id = await start();
    expect(await waitForReport(id, (r) => r.state === 'idle')).toMatchObject({ lastExit: null, lastFinishedAt: null });
    await runtime.kill(id);
  });

  it('reports a running command, then its exit code and finish time', async () => {
    const id = await start();
    const before = Date.now();
    type(id, 'sleep 1; false');
    const busy = await waitForReport(id, (r) => r.state === 'busy');
    expect(busy.commandLine).toBe('sleep 1; false');
    expect(busy.startedAt!.getTime()).toBeGreaterThan(before - 2000);

    const idle = await waitForReport(id, (r) => r.state === 'idle');
    expect(idle.lastExit).toBe(1);
    expect(idle.lastFinishedAt!.getTime()).toBeGreaterThanOrEqual(busy.startedAt!.getTime());

    type(id, 'true');
    expect((await waitForReport(id, (r) => r.state === 'idle' && r.lastExit === 0)).lastExit).toBe(0);

    // An empty line is not a command: the last exit code stays.
    type(id, '');
    await sleep(300);
    expect((await integration.read(id))?.lastExit).toBe(0);
    await runtime.kill(id);
  });

  it('does not carry the integration into shells started from the session', async () => {
    const id = await start();
    const out = path.join(dir, 'nested.txt');
    type(id, `zsh -c 'print -r -- "nested=[\${ZDOTDIR}] [\${AUBERGINE_SHELL_DIR}]"' > ${out}`);
    const started = Date.now();
    while (!existsSync(out) || (await readFile(out, 'utf8')) === '') {
      if (Date.now() - started > 10_000) throw new Error('No output');
      await sleep(25);
    }
    expect(await readFile(out, 'utf8')).toBe(`nested=[${userDir}] []\n`);
    await runtime.kill(id);
  });

  it('gives other shells no integration and no report', async () => {
    expect(await integration.environment(newId(), '/bin/bash')).toEqual({});
    expect(await integration.read(newId())).toBeNull();
  });

  it('tells a watcher when a shell reports', async () => {
    let calls = 0;
    const stop = integration.watch(() => {
      calls += 1;
    });
    const id = await start();
    type(id, 'true');
    const started = Date.now();
    while (calls === 0) {
      if (Date.now() - started > 10_000) throw new Error('The watcher was never called');
      await sleep(25);
    }
    stop();
    await runtime.kill(id);
  });
});
