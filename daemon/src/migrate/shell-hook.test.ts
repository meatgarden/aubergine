import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { DEFAULT_SETTINGS, SESSION_ENV } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import pty, { type IPty } from 'node-pty';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Canvas } from '../canvas';
import { TmuxRuntime } from '../runtime/tmux-runtime';
import { destroyTmuxServer, testSocketName } from '../test-support';
import { buildServer } from '../server';
import { Sessions } from '../sessions';
import { ZshIntegration } from '../shell/integration';
import { JsonStore } from '../store/json-store';
import { loadOrCreateToken } from '../token';
import { HOOK_END, HOOK_START, zshHookSnippet } from './shell-hook';

describe('the snippet text', () => {
  const snippet = zshHookSnippet("'/usr/bin/node' '/opt/aubergine/bin/aubergine.mjs'");

  it('is marked so that it is easy to find and remove', () => {
    expect(snippet.startsWith(HOOK_START)).toBe(true);
    expect(snippet.endsWith(HOOK_END)).toBe(true);
    expect(snippet).toContain('Remove these lines to undo');
  });

  it('only acts in an interactive terminal outside Aubergine and tmux, and can be switched off', () => {
    for (const guard of ['-o interactive', '-t 0', '-t 1', '-z "$AUBERGINE_DISABLE"', '-z "$AUBERGINE_SESSION_ID"', '-z "$TMUX"']) {
      expect(snippet).toContain(guard);
    }
    expect(snippet).toContain("'/opt/aubergine/bin/aubergine.mjs' here --from-shell-hook");
  });
});

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p));
const SOCKET = testSocketName('hook');

// A real server, a real tmux, and real shells that read a stand-in .zshrc holding the snippet.
// The developer's own .zshrc is not involved.
describe.runIf(ZSH)('the snippet in a new shell', () => {
  const runtime = new TmuxRuntime({ socket: SOCKET });
  let dir: string;
  let zdotdir: string;
  let work: string;
  let app: FastifyInstance;
  let canvas: Canvas;
  let port: number;
  const shells: IPty[] = [];
  let lastText: () => string = () => '';

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-hook-')));
    zdotdir = path.join(dir, 'zdotdir');
    work = path.join(dir, 'my project');
    await mkdir(zdotdir);
    await mkdir(work);
    await writeFile(path.join(zdotdir, '.zshrc'), `PROMPT='plain> '\n${zshHookSnippet()}\n`);

    const data = path.join(dir, 'data');
    const token = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    canvas = new Canvas(await store.load(), store);
    // Session shells read the same stand-in .zshrc, snippet included: this is the loop to guard against.
    const sessions = new Sessions(canvas, runtime, {
      integration: new ZshIntegration(path.join(data, 'shell'), zdotdir),
      sessionEnv: (sessionId) => ({ [SESSION_ENV.sessionId]: sessionId }),
    });
    app = await buildServer({
      canvas,
      sessions,
      runtime,
      settings: async () => DEFAULT_SETTINGS,
      token,
      devOrigin: null,
      webDist: path.join(dir, 'no-web'),
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
    await sessions.status();
  });

  afterEach(() => {
    for (const shell of shells.splice(0)) shell.kill();
  });

  afterAll(async () => {
    await canvas.flush();
    await app.close();
    await destroyTmuxServer(runtime, SOCKET);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  /** Opens a new interactive shell, the way a terminal app opens a tab. */
  function openTab(overrides: Record<string, string> = {}) {
    const env: Record<string, string> = {
      HOME: os.homedir(),
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      ZDOTDIR: zdotdir,
      AUBERGINE_PORT: String(port),
      AUBERGINE_DATA_DIR: path.join(dir, 'data'),
      AUBERGINE_TMUX_SOCKET: SOCKET,
      ...overrides,
    };
    const shell = pty.spawn(ZSH!, ['-i'], { name: 'xterm-256color', cols: 100, rows: 24, cwd: work, env });
    shells.push(shell);
    const tab = { text: '', exited: false, shell };
    shell.onData((data) => {
      tab.text += data;
    });
    lastText = () => tab.text.slice(-500);
    shell.onExit(() => {
      tab.exited = true;
    });
    return tab;
  }

  async function waitFor(check: () => boolean | Promise<boolean>, what: string, timeoutMs = 8000): Promise<void> {
    const started = Date.now();
    while (!(await check())) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for ${what}. Tab shows: ${JSON.stringify(shells.at(-1) ? lastText() : '')}`);
      }
      await sleep(40);
    }
  }

  const clients = async (): Promise<number> => {
    try {
      return execFileSync('tmux', ['-L', SOCKET, 'list-clients'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\n')
        .filter(Boolean).length;
    } catch {
      return 0;
    }
  };

  it('starts the tab inside a new canvas session in its folder, exactly one, and the session outlives the tab', async () => {
    const before = canvas.state.sessions.length;
    const tab = openTab();
    await waitFor(() => canvas.state.sessions.length === before + 1, 'a session');
    const session = canvas.state.sessions.at(-1)!;
    expect(session.name).toBe('my project');
    expect(session.cwd).toBe(work);
    await waitFor(async () => (await clients()) === 1, 'the tab to become a view');

    // What is typed in the tab goes to the session's shell.
    await waitFor(async () => (await runtime.snapshot(session.id)).includes('plain>'), 'the session prompt');
    tab.shell.write('echo "inside=${AUBERGINE_SESSION_ID:+yes}"\r');
    await waitFor(async () => (await runtime.snapshot(session.id)).includes('inside=yes'), 'input reaching the session');

    // The session's own shell read the same .zshrc and did not start another session.
    await sleep(1500);
    expect(canvas.state.sessions.length).toBe(before + 1);

    // Closing the tab only detaches.
    tab.shell.kill();
    await waitFor(async () => (await clients()) === 0, 'detach');
    expect(await runtime.has(session.id)).toBe(true);
  });

  it('does nothing when switched off', async () => {
    const before = canvas.state.sessions.length;
    const tab = openTab({ AUBERGINE_DISABLE: '1' });
    await waitFor(() => tab.text.includes('plain> '), 'a normal prompt');
    tab.shell.write('echo "works=$((6 * 7))"\r');
    await waitFor(() => tab.text.includes('works=42'), 'a working shell');
    expect(canvas.state.sessions.length).toBe(before);
  });

  it('falls back to a normal shell when the server is stopped', async () => {
    const closed = net.createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    const tab = openTab({ AUBERGINE_PORT: String(deadPort) });
    await waitFor(() => tab.text.includes('plain> '), 'a normal prompt');
    tab.shell.write('echo "works=$((6 * 7)) disabled=$AUBERGINE_DISABLE"\r');
    await waitFor(() => tab.text.includes('works=42 disabled=1'), 'a working shell');
    expect(tab.exited).toBe(false);
  });

  it('falls back to a normal shell, within seconds, when the server hangs', async () => {
    // Accepts connections and never answers.
    const sockets: net.Socket[] = [];
    const hanging = net.createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve));
    try {
      const started = Date.now();
      const tab = openTab({ AUBERGINE_PORT: String((hanging.address() as AddressInfo).port) });
      await waitFor(() => tab.text.includes('plain> '), 'a normal prompt', 15_000);
      expect(Date.now() - started).toBeLessThan(10_000);
      tab.shell.write('echo "works=$((6 * 7))"\r');
      await waitFor(() => tab.text.includes('works=42'), 'a working shell');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => hanging.close(resolve));
    }
  });

  it('falls back to a normal shell when the command itself is missing', async () => {
    const broken = path.join(dir, 'broken');
    await mkdir(broken);
    await writeFile(path.join(broken, '.zshrc'), `PROMPT='plain> '\n${zshHookSnippet("'/nonexistent/node' '/nonexistent/aubergine.mjs'")}\n`);
    const tab = openTab({ ZDOTDIR: broken });
    await waitFor(() => tab.text.includes('plain> '), 'a normal prompt');
    tab.shell.write('echo "works=$((6 * 7))"\r');
    await waitFor(() => tab.text.includes('works=42'), 'a working shell');
  });
});
