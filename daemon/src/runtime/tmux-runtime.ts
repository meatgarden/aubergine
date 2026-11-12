import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import pty from 'node-pty';
import { Id, type RuntimeStatus } from '@aubergine/shared';
import {
  SessionNotFoundError,
  type Attachment,
  type CreateOptions,
  type ExitInfo,
  type RuntimeSession,
  type SessionRuntime,
  type TerminalDimensions,
} from './runtime';

export const MIN_TMUX_VERSION = '3.2';

const CONFIG_FILE = fileURLToPath(new URL('./tmux.conf', import.meta.url));

/** Reads "tmux 3.3a", "tmux next-3.4" and the like. */
export function parseTmuxVersion(output: string): { major: number; minor: number; text: string } | null {
  const match = /(\d+)\.(\d+)[a-z]?/.exec(output);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), text: match[0] };
}

export function isSupportedTmux(version: { major: number; minor: number }): boolean {
  const [minMajor = 0, minMinor = 0] = MIN_TMUX_VERSION.split('.').map(Number);
  return version.major > minMajor || (version.major === minMajor && version.minor >= minMinor);
}

/**
 * The environment the tmux server (and so every shell) starts from.
 *
 * Shells are started as login shells, so the user's own profile files build
 * the real environment (PATH and so on) no matter how the daemon itself was
 * started. This function only supplies a sane base for that: it drops what
 * belongs to the daemon process rather than to the user (variables set by
 * the package manager that launched it, any outer tmux), and fills in the
 * basics that a process started outside a terminal, for example at login,
 * does not have.
 */
export function shellEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (/^(npm_|pnpm_|AUBERGINE_)/i.test(key)) continue;
    if (['TMUX', 'TMUX_PANE', 'NODE_ENV', 'INIT_CWD', 'NODE', 'NODE_OPTIONS', 'NODE_PATH'].includes(key)) continue;
    env[key] = value;
  }
  const inherited = (env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin').split(':').filter((p) => p && !p.includes('/node_modules/'));
  // tmux is often installed where a non-interactive process does not look.
  const extra = ['/opt/homebrew/bin', '/usr/local/bin'].filter((p) => !inherited.includes(p));
  env.PATH = [...inherited, ...extra].join(':');
  env.LANG ??= 'en_US.UTF-8';

  let user: { username: string; homedir: string; shell: string | null } | null = null;
  try {
    user = os.userInfo();
  } catch {
    // No password-database entry (some containers); leave these unset.
  }
  if (user) {
    env.HOME ??= user.homedir;
    env.USER ??= user.username;
    env.LOGNAME ??= user.username;
    if (user.shell) env.SHELL ??= user.shell;
  }
  return env;
}

interface ExecError extends Error {
  code?: string | number;
  stderr?: string;
}

export interface TmuxRuntimeOptions {
  /** Socket name passed to `tmux -L`. */
  socket: string;
  /** tmux binary; override in tests. */
  tmuxBin?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Sessions are tmux sessions named after the session ID, on a dedicated
 * socket. Each viewer is one `tmux attach` client running in its own
 * pseudo-terminal. tmux keeps the shells alive when the daemon stops.
 */
export class TmuxRuntime implements SessionRuntime {
  private readonly bin: string;
  private readonly baseArgs: string[];
  private readonly env: Record<string, string>;

  constructor(options: TmuxRuntimeOptions) {
    this.bin = options.tmuxBin ?? 'tmux';
    this.baseArgs = ['-L', options.socket, '-f', CONFIG_FILE];
    this.env = shellEnvironment(options.env ?? process.env);
  }

  async check(): Promise<RuntimeStatus> {
    let output: string;
    try {
      output = await this.exec(['-V'], false);
    } catch {
      return { status: 'missing', version: null, minVersion: MIN_TMUX_VERSION };
    }
    const version = parseTmuxVersion(output);
    if (!version) return { status: 'missing', version: null, minVersion: MIN_TMUX_VERSION };
    if (!isSupportedTmux(version)) {
      return { status: 'too_old', version: version.text, minVersion: MIN_TMUX_VERSION };
    }
    // A tmux server left running by an earlier version of the daemon still
    // has that version's settings; give it the current config.
    try {
      await this.exec(['source-file', CONFIG_FILE]);
    } catch (error) {
      if (!isNoServer(error)) throw error;
    }
    return { status: 'ok', version: version.text, minVersion: MIN_TMUX_VERSION };
  }

  async create(options: CreateOptions): Promise<RuntimeSession> {
    const id = sessionName(options.id);
    const shell = options.shell ?? this.env.SHELL;
    await this.execWhenServerSettles([
      // tmux starts its default shell as a login shell; say which shell that is.
      ...(shell && path.isAbsolute(shell) ? ['set-option', '-g', 'default-shell', shell, ';'] : []),
      'new-session',
      ...Object.entries(options.env ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
      '-d',
      '-s',
      id,
      '-x',
      String(options.cols ?? 80),
      '-y',
      String(options.rows ?? 24),
      '-c',
      options.cwd ?? os.homedir(),
    ]);
    const created = (await this.list()).find((s) => s.id === id);
    return created ?? { id, cwd: null, command: null, activityAt: null };
  }

  async list(): Promise<RuntimeSession[]> {
    let output: string;
    try {
      output = await this.exec([
        'list-sessions',
        '-F',
        '#{session_name}\t#{pane_current_path}\t#{pane_current_command}\t#{window_activity}',
      ]);
    } catch (error) {
      if (isNoServer(error)) return [];
      throw error;
    }
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id = '', cwd = '', command = '', activity = ''] = line.split('\t');
        return {
          id,
          cwd: cwd || null,
          command: command || null,
          activityAt: /^\d+$/.test(activity) ? new Date(Number(activity) * 1000) : null,
        };
      });
  }

  async has(id: string): Promise<boolean> {
    try {
      await this.exec(['has-session', '-t', `=${sessionName(id)}`]);
      return true;
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) return false;
      throw error;
    }
  }

  async kill(id: string): Promise<void> {
    try {
      await this.exec(['kill-session', '-t', `=${sessionName(id)}`]);
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) return;
      throw error;
    }
  }

  async attach(id: string, viewer: TerminalDimensions): Promise<Attachment> {
    const name = sessionName(id);
    if (!(await this.has(name))) throw new SessionNotFoundError(name);

    const child = pty.spawn(this.bin, this.attachCommand(name).args, {
      name: 'xterm-256color',
      cols: viewer.cols,
      rows: viewer.rows,
      cwd: os.homedir(),
      env: this.env,
      encoding: null, // raw bytes; the browser terminal does the decoding
    });

    let closed = false;
    child.onExit(() => {
      closed = true;
    });

    // tmux paints the screen on attach, but a client that joins a session
    // which was last sized by another viewer can end up with a stale
    // picture. Ask for one full redraw once the client is registered.
    void this.redrawClient(child.pid).catch(() => {});

    return {
      onData: (listener) => {
        child.onData((chunk) => listener(chunk as unknown as Uint8Array));
      },
      onExit: (listener: (info: ExitInfo) => void) => {
        child.onExit(({ exitCode }) => listener({ exitCode }));
      },
      write: (data) => {
        if (!closed) child.write(data);
      },
      resize: ({ cols, rows }) => {
        if (closed) return;
        try {
          child.resize(cols, rows);
        } catch {
          // The client exited between the check and the call.
        }
      },
      pause: () => {
        if (!closed) child.pause();
      },
      resume: () => {
        if (!closed) child.resume();
      },
      close: () => {
        if (closed) return;
        closed = true;
        try {
          child.kill();
        } catch {
          // Already gone.
        }
      },
    };
  }

  async typeLine(id: string, line: string): Promise<void> {
    const name = sessionName(id);
    // A shell discards what arrives while it is starting, so wait for its prompt.
    for (let attempt = 0; attempt < 400; attempt++) {
      if ((await this.snapshot(name)).trim() !== '') break;
      await sleep(25);
    }
    await this.exec(['send-keys', '-t', `=${name}:`, '-l', '--', line]);
    await this.exec(['send-keys', '-t', `=${name}:`, 'Enter']);
  }

  async snapshot(id: string): Promise<string> {
    const name = sessionName(id);
    try {
      return await this.exec(['capture-pane', '-p', '-t', `=${name}:`]);
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) throw new SessionNotFoundError(name);
      throw error;
    }
  }

  /**
   * The command a native terminal runs to view a session, with the same
   * socket and config the daemon uses.
   */
  attachCommand(id: string): { bin: string; args: string[]; env: Record<string, string> } {
    return {
      bin: this.bin,
      args: [...this.baseArgs, 'attach-session', '-t', `=${sessionName(id)}`],
      env: this.env,
    };
  }

  /** Stops the tmux server and every session on this socket. Used by tests. */
  async killServer(): Promise<void> {
    try {
      await this.exec(['kill-server']);
    } catch (error) {
      if (!isNoServer(error)) throw error;
    }
  }

  private async redrawClient(clientPid: number): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const clients = await this.exec(['list-clients', '-F', '#{client_pid}\t#{client_name}']);
      for (const line of clients.split('\n')) {
        const [pid, clientName] = line.split('\t');
        if (Number(pid) === clientPid && clientName) {
          await this.exec(['refresh-client', '-t', clientName]);
          return;
        }
      }
      await sleep(25);
    }
  }

  /**
   * tmux shuts its server down when the last session ends. A command sent in
   * that moment reaches a server that is on its way out and fails; sent again
   * a moment later, it starts a fresh server. Only for commands that are safe
   * to repeat.
   */
  private async execWhenServerSettles(args: string[]): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.exec(args);
      } catch (error) {
        if (attempt >= 8 || !isServerGoingAway(error)) throw error;
        await sleep(40 * attempt);
      }
    }
  }

  private exec(args: string[], withSocket = true): Promise<string> {
    const fullArgs = withSocket ? [...this.baseArgs, ...args] : args;
    return new Promise((resolve, reject) => {
      execFile(
        this.bin,
        fullArgs,
        { env: this.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            (error as ExecError).stderr = stderr;
            reject(error);
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }
}

/** Session IDs go onto a command line as tmux targets, so only real IDs get through. */
function sessionName(id: string): string {
  const parsed = Id.safeParse(id);
  if (!parsed.success) throw new Error(`Not a session ID: ${JSON.stringify(id)}`);
  return parsed.data;
}

function isNoServer(error: unknown): boolean {
  // The last two appear when the server goes away while a command is under way.
  return /no server running|error connecting to|No such file or directory|server exited unexpectedly|lost server/i.test(
    (error as ExecError).stderr ?? '',
  );
}

function isServerGoingAway(error: unknown): boolean {
  return /server exited unexpectedly|lost server|error connecting to/i.test((error as ExecError).stderr ?? '');
}

function isNoSession(error: unknown): boolean {
  return /can't find session|session not found|can't find pane|can't find window/i.test(
    (error as ExecError).stderr ?? '',
  );
}
