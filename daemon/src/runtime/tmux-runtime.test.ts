import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { newId } from '@aubergine/shared';
import { destroyTmuxServer, testSocketName } from '../test-support';
import { SessionNotFoundError, type Attachment } from './runtime';
import {
  TmuxRuntime,
  isSupportedTmux,
  parseTmuxVersion,
  shellEnvironment,
} from './tmux-runtime';

const SOCKET = testSocketName('runtime');
const runtime = new TmuxRuntime({ socket: SOCKET });
const open: Attachment[] = [];

/** Collects a viewer's output as text and lets a test wait for something to appear. */
function collect(attachment: Attachment) {
  open.push(attachment);
  const decoder = new TextDecoder();
  let text = '';
  let exited = false;
  attachment.onData((chunk) => {
    text += decoder.decode(chunk, { stream: true });
  });
  attachment.onExit(() => {
    exited = true;
  });
  return {
    get text() {
      return text;
    },
    get exited() {
      return exited;
    },
    clear() {
      text = '';
    },
    async waitFor(pattern: RegExp | (() => boolean), timeoutMs = 8000): Promise<void> {
      const started = Date.now();
      const done = () => (typeof pattern === 'function' ? pattern() : pattern.test(text));
      while (!done()) {
        if (Date.now() - started > timeoutMs) {
          throw new Error(`Timed out waiting for ${pattern}. Output so far:\n${text.slice(-2000)}`);
        }
        await sleep(20);
      }
    },
  };
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out');
    await sleep(25);
  }
}

/**
 * Starts a session and waits until its shell has drawn its prompt. A shell
 * throws away anything typed while it is still starting up, so tests must
 * not type sooner.
 */
async function createReady(target: TmuxRuntime, id: string, options: { shell?: string } = {}): Promise<void> {
  await target.create({ id, ...options });
  await waitUntil(async () => (await target.snapshot(id)).trim() !== '', 15_000);
}

afterEach(() => {
  for (const attachment of open.splice(0)) attachment.close();
});

afterAll(async () => {
  await destroyTmuxServer(runtime, SOCKET);
});

describe('version check', () => {
  it('parses the version formats tmux prints', () => {
    expect(parseTmuxVersion('tmux 3.8')).toMatchObject({ major: 3, minor: 8 });
    expect(parseTmuxVersion('tmux 3.3a')).toMatchObject({ major: 3, minor: 3, text: '3.3a' });
    expect(parseTmuxVersion('tmux next-3.4')).toMatchObject({ major: 3, minor: 4 });
    expect(parseTmuxVersion('nonsense')).toBeNull();
  });

  it('requires 3.2 or newer', () => {
    expect(isSupportedTmux({ major: 3, minor: 2 })).toBe(true);
    expect(isSupportedTmux({ major: 4, minor: 0 })).toBe(true);
    expect(isSupportedTmux({ major: 3, minor: 1 })).toBe(false);
    expect(isSupportedTmux({ major: 2, minor: 9 })).toBe(false);
  });

  it('reports the installed tmux as usable', async () => {
    const status = await runtime.check();
    expect(status.status).toBe('ok');
    expect(status.version).toMatch(/^\d+\.\d+/);
  });

  it('reports a missing tmux', async () => {
    const broken = new TmuxRuntime({ socket: SOCKET, tmuxBin: 'tmux-that-does-not-exist' });
    expect(await broken.check()).toEqual({ status: 'missing', version: null, minVersion: '3.2' });
  });
});

describe('shellEnvironment', () => {
  it('drops variables that belong to the daemon process, not the user', () => {
    const env = shellEnvironment({
      HOME: '/home/u',
      TMUX: '/tmp/outer,1,0',
      npm_config_registry: 'x',
      PNPM_HOME: '/p',
      AUBERGINE_PORT: '1',
      NODE_ENV: 'development',
      PATH: '/repo/node_modules/.bin:/usr/bin:/bin',
    });
    expect(env.HOME).toBe('/home/u');
    expect(Object.keys(env).sort()).toEqual(['HOME', 'LANG', 'LOGNAME', 'PATH', 'SHELL', 'USER']);
    expect(env.PATH?.split(':')).toEqual(['/usr/bin', '/bin', '/opt/homebrew/bin', '/usr/local/bin']);
  });
});

describe('shell environment when the daemon starts outside a terminal', () => {
  const bare = new TmuxRuntime({ socket: `${SOCKET}-bare`, env: { PATH: '/usr/bin:/bin' } });
  afterAll(async () => {
    await destroyTmuxServer(bare, `${SOCKET}-bare`);
  });

  it('still gives sessions a normal login environment', async () => {
    const id = newId();
    await createReady(bare, id);
    const attachment = await bare.attach(id, { cols: 200, rows: 24 });
    const viewer = collect(attachment);
    attachment.write('echo "home=[$HOME] user=[$USER] shell=[$SHELL] lang=[$LANG] term=[$TERM]"\r');
    await viewer.waitFor(/home=\[\/[^\]]+\] user=\[[^\]]+\] shell=\[\/[^\]]+\] lang=\[[^\]]+\] term=\[tmux-256color\]/);
    // The login shell builds PATH from the user's profile, so it has more than the two folders above.
    attachment.write('echo "paths=$(echo "$PATH" | tr ":" "\\n" | wc -l | tr -d " ")"\r');
    await viewer.waitFor(/paths=([3-9]|\d\d)/);
    await bare.kill(id);
  });

  it('starts the configured shell instead of the default, as a login shell', async () => {
    const id = newId();
    await bare.create({ id, shell: '/bin/sh' });
    const pid = execFileSync('tmux', ['-L', `${SOCKET}-bare`, 'display-message', '-p', '-t', `=${id}:`, '#{pane_pid}'], {
      encoding: 'utf8',
    }).trim();
    expect(execFileSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' }).trim()).toBe('-sh');
    await bare.kill(id);
  });
});

describe('TmuxRuntime', () => {
  it('lists nothing when no server is running', async () => {
    const idle = new TmuxRuntime({ socket: `${SOCKET}-idle` });
    expect(await idle.list()).toEqual([]);
    expect(await idle.has(newId())).toBe(false);
    await idle.kill(newId());
  });

  it('creates, lists and kills sessions', async () => {
    const a = newId();
    const b = newId();
    const cwd = realpathSync(os.tmpdir());
    const created = await runtime.create({ id: a, cwd });
    await runtime.create({ id: b });

    expect(created.id).toBe(a);
    const ids = (await runtime.list()).map((s) => s.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(await runtime.has(a)).toBe(true);
    await waitUntil(async () => {
      const found = (await runtime.list()).find((s) => s.id === a);
      return found?.cwd !== null && realpathSync(found?.cwd ?? '/') === cwd;
    });

    await runtime.kill(a);
    expect(await runtime.has(a)).toBe(false);
    expect((await runtime.list()).map((s) => s.id)).not.toContain(a);
    await runtime.kill(a); // already gone: no error
    await runtime.kill(b);
  });

  it('can start a session in the moment the server is shutting down after its last one ended', async () => {
    const lonely = new TmuxRuntime({ socket: `${SOCKET}-lonely` });
    try {
      for (let round = 0; round < 25; round++) {
        const id = newId();
        await lonely.create({ id });
        expect(await lonely.has(id)).toBe(true);
        await lonely.kill(id); // the only session: tmux now stops its server
      }
    } finally {
      await destroyTmuxServer(lonely, `${SOCKET}-lonely`);
    }
  });

  it('refuses IDs that are not UUIDv7, so nothing else reaches the command line', async () => {
    await expect(runtime.create({ id: 'main; rm -rf /' })).rejects.toThrow(/Not a session ID/);
    await expect(runtime.has('0')).rejects.toThrow(/Not a session ID/);
  });

  it("starts the user's shell as a login shell", async () => {
    const id = newId();
    await runtime.create({ id });
    const pid = execFileSync(
      'tmux',
      ['-L', SOCKET, 'display-message', '-p', '-t', `=${id}:`, '#{pane_pid}'],
      { encoding: 'utf8' },
    ).trim();
    const argv0 = execFileSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' }).trim();
    expect(argv0.startsWith('-')).toBe(true);
    const shell = process.env.SHELL;
    if (shell) expect(argv0.slice(1).split(' ')[0]).toBe(shell.split('/').pop());
    await runtime.kill(id);
  });

  it('applies its own config', async () => {
    const id = newId();
    await runtime.create({ id });
    const show = (option: string, flag = '-gv') =>
      execFileSync('tmux', ['-L', SOCKET, 'show-options', flag, option], { encoding: 'utf8' }).trim();
    expect(show('status')).toBe('off');
    expect(show('prefix')).toBe('None');
    expect(show('history-limit')).toBe('50000');
    expect(show('window-size')).toBe('latest');
    expect(show('mouse')).toBe('on');
    expect(show('escape-time', '-sv')).toBe('0');
    await runtime.kill(id);
  });

  it('streams output to a viewer and takes its input', async () => {
    const id = newId();
    await createReady(runtime, id);
    const viewer = collect(await runtime.attach(id, { cols: 80, rows: 24 }));
    const attachment = open.at(-1)!;

    attachment.write('echo "mar""ker-$((40 + 2))"\r');
    await viewer.waitFor(/marker-42/);
    expect(await runtime.snapshot(id)).toContain('marker-42');
    await runtime.kill(id);
  });

  it('keeps the session and its shell state when a viewer detaches and another attaches', async () => {
    const id = newId();
    await createReady(runtime, id);

    const first = await runtime.attach(id, { cols: 80, rows: 24 });
    const firstView = collect(first);
    first.write('KEEP_ME=still-here-$((1 + 1))\r');
    first.write('echo "set"" done"\r');
    await firstView.waitFor(/set done/);
    first.close();
    await firstView.waitFor(() => firstView.exited);
    expect(await runtime.has(id)).toBe(true);

    const second = await runtime.attach(id, { cols: 80, rows: 24 });
    const secondView = collect(second);
    // The earlier screen is redrawn for the new viewer without any input.
    await secondView.waitFor(/set done/);
    second.write('echo "value=$KEEP_ME"\r');
    await secondView.waitFor(/value=still-here-2/);
    await runtime.kill(id);
  });

  it('hands copied text to the viewer as an OSC 52 sequence', async () => {
    const id = newId();
    await createReady(runtime, id);
    const viewer = collect(await runtime.attach(id, { cols: 80, rows: 24 }));
    await viewer.waitFor(() => viewer.text.length > 0);
    await sleep(200);
    // What tmux does when a mouse selection ends: set a buffer and forward it.
    execFileSync('tmux', ['-L', SOCKET, 'set-buffer', '-w', 'copied text']);
    const encoded = Buffer.from('copied text').toString('base64');
    await viewer.waitFor(() => viewer.text.includes(`\u001b]52;`) && viewer.text.includes(encoded));
    await runtime.kill(id);
  });

  it('turns on bracketed paste for the viewer when the program asks for it', async () => {
    const id = newId();
    await createReady(runtime, id);
    const attachment = await runtime.attach(id, { cols: 80, rows: 24 });
    const viewer = collect(attachment);
    await viewer.waitFor(() => viewer.text.length > 0);
    attachment.write("printf '\\033[?2004h'; cat\r");
    await viewer.waitFor(() => viewer.text.includes("\u001b[?2004h"));
    // A bracketed paste reaches the program with its markers intact.
    attachment.write('\u001b[200~pasted line\u001b[201~');
    await waitUntil(async () => (await runtime.snapshot(id)).includes('pasted line'));
    await runtime.kill(id);
  });

  it('resizes the session to the viewer', async () => {
    const id = newId();
    await createReady(runtime, id);
    const windowSize = () =>
      execFileSync(
        'tmux',
        ['-L', SOCKET, 'display-message', '-p', '-t', `=${id}:`, '#{window_width}x#{window_height}'],
        { encoding: 'utf8' },
      ).trim();

    const attachment = await runtime.attach(id, { cols: 100, rows: 30 });
    const viewer = collect(attachment);
    await waitUntil(async () => windowSize() === '100x30');
    attachment.write('echo "size=$(tput cols)x$(tput lines)"\r');
    await viewer.waitFor(/size=100x30/);

    attachment.resize({ cols: 90, rows: 20 });
    await waitUntil(async () => windowSize() === '90x20');
    // tmux passes the new size on to the shell a moment later, so ask until it has arrived.
    await waitUntil(async () => {
      attachment.write('clear; echo "size=$(tput cols)x$(tput lines)"\r');
      await sleep(200);
      return /size=90x20/.test(viewer.text);
    });
    await runtime.kill(id);
  });

  it('ends the attachment when the session is killed or the shell exits', async () => {
    const killed = newId();
    await runtime.create({ id: killed });
    const killedView = collect(await runtime.attach(killed, { cols: 80, rows: 24 }));
    await runtime.kill(killed);
    await killedView.waitFor(() => killedView.exited);

    const exiting = newId();
    await createReady(runtime, exiting);
    const attachment = await runtime.attach(exiting, { cols: 80, rows: 24 });
    const exitingView = collect(attachment);
    attachment.write('exit\r');
    await exitingView.waitFor(() => exitingView.exited);
    await waitUntil(async () => !(await runtime.has(exiting)));
  });

  it('searches the history of sessions, with nobody viewing them', async () => {
    const one = newId();
    const two = newId();
    await createReady(runtime, one);
    await createReady(runtime, two);
    const send = (id: string, text: string): void => {
      execFileSync('tmux', ['-L', SOCKET, 'send-keys', '-t', `=${id}:`, '-l', text]);
      execFileSync('tmux', ['-L', SOCKET, 'send-keys', '-t', `=${id}:`, 'Enter']);
    };
    // Enough output to push the interesting line off the visible screen and into the history.
    send(one, 'echo "needle-""in-history"; seq 1 200');
    send(two, 'echo "nothing to see"; seq 1 5');
    await waitUntil(async () => (await runtime.snapshot(one)).includes('200'));
    expect(await runtime.snapshot(one)).not.toContain('needle-in-history');

    const found = await runtime.search([two, one], 'NEEDLE-IN-HISTORY');
    expect(found.truncated).toBe(false);
    expect(found.hits).toHaveLength(1);
    expect(found.hits[0]).toMatchObject({ sessionId: one, text: 'needle-in-history', after: ['1'] });

    // Newest first, capped per session and overall.
    const many = await runtime.search([one, two], '1', { perSession: 3, limit: 4 });
    expect(many.truncated).toBe(true);
    expect(many.hits.filter((h) => h.sessionId === one)).toHaveLength(3);
    expect(many.hits.find((h) => h.sessionId === one)?.text).toBe('199');
    expect(many.hits).toHaveLength(4);

    expect((await runtime.search([one, newId()], 'needle-in-history')).hits).toHaveLength(1);

    // Scroll back to the match: tmux's scroll-back view opens, moved up from the bottom.
    await runtime.reveal(one, 'needle-in-history');
    await waitUntil(async () => {
      const [inMode, position] = execFileSync(
        'tmux',
        ['-L', SOCKET, 'display-message', '-p', '-t', `=${one}:`, '#{pane_in_mode} #{scroll_position}'],
        { encoding: 'utf8' },
      )
        .trim()
        .split(' ');
      return inMode === '1' && Number(position) > 100;
    });
    await runtime.kill(one);
    await runtime.kill(two);
  });

  it("rejects attaching to or capturing a session that is not running", async () => {
    const id = newId();
    await expect(runtime.attach(id, { cols: 80, rows: 24 })).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(runtime.snapshot(id)).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('finds sessions that were started by an earlier runtime instance', async () => {
    const id = newId();
    await createReady(runtime, id);
    const later = new TmuxRuntime({ socket: SOCKET });
    expect((await later.list()).map((s) => s.id)).toContain(id);
    const viewer = collect(await later.attach(id, { cols: 80, rows: 24 }));
    open.at(-1)!.write('echo "re""attached"\r');
    await viewer.waitFor(/reattached/);
    await runtime.kill(id);
  });
});
