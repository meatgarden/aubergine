import { packageRoot } from '../package-root';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import pty from 'node-pty';
import { Id, type RuntimeStatus } from '@aubergine/shared';
import {
  SessionNotFoundError,
  type Attachment,
  type CreateOptions,
  type ExitInfo,
  type HistoryHit,
  type HistorySearch,
  type RuntimeSession,
  type SessionRuntime,
  type TerminalDimensions,
  type TerminalKey,
  type TerminalScreen,
} from './runtime';

export const MIN_TMUX_VERSION = '3.2';

// The npm package keeps this file at the same place as the checkout does.
const CONFIG_FILE = path.join(packageRoot(), 'daemon', 'src', 'runtime', 'tmux.conf');

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

  /** How many viewers this runtime itself has attached to each session. */
  private readonly own = new Map<string, number>();

  async list(): Promise<RuntimeSession[]> {
    let output: string;
    try {
      output = await this.exec([
        'list-sessions',
        '-F',
        '#{session_name}\t#{pane_current_path}\t#{pane_current_command}\t#{window_activity}\t#{session_attached}',
      ]);
    } catch (error) {
      if (isNoServer(error)) return [];
      throw error;
    }
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id = '', cwd = '', command = '', activity = '', attached = ''] = line.split('\t');
        return {
          id,
          cwd: cwd || null,
          command: command || null,
          activityAt: /^\d+$/.test(activity) ? new Date(Number(activity) * 1000) : null,
          // Every client tmux counts, less the ones this runtime attached for its own viewers.
          outside: /^\d+$/.test(attached) ? Math.max(0, Number(attached) - (this.own.get(id) ?? 0)) : 0,
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

    // Counted, so that viewers from outside (a window on the desktop) can be told from these.
    this.own.set(name, (this.own.get(name) ?? 0) + 1);
    let closed = false;
    child.onExit(() => {
      closed = true;
      const left = (this.own.get(name) ?? 1) - 1;
      if (left > 0) this.own.set(name, left);
      else this.own.delete(name);
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

  async search(
    ids: readonly string[],
    query: string,
    options: { limit?: number; perSession?: number } = {},
  ): Promise<HistorySearch> {
    const limit = options.limit ?? 50;
    const perSession = options.perSession ?? 5;
    const needle = query.toLowerCase();
    const hits: HistoryHit[] = [];
    let truncated = false;

    // A few sessions at a time: each one is a tmux call that returns its whole history.
    const queue = [...ids];
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        let history: string;
        try {
          history = await this.exec(['capture-pane', '-p', '-J', '-S', '-', '-t', `=${sessionName(id)}:`]);
        } catch {
          continue; // The session ended meanwhile.
        }
        const lines = history.split('\n');
        let found = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (!(lines[i] ?? '').toLowerCase().includes(needle)) continue;
          if (found === perSession) {
            truncated = true;
            break;
          }
          found += 1;
          hits.push({
            sessionId: id,
            text: lines[i] ?? '',
            before: lines.slice(Math.max(0, i - 1), i),
            after: lines.slice(i + 1, i + 2),
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));

    // Keep the order the sessions were given in.
    const order = new Map(ids.map((id, index) => [id, index]));
    hits.sort((a, b) => (order.get(a.sessionId) ?? 0) - (order.get(b.sessionId) ?? 0));
    if (hits.length > limit) truncated = true;
    return { hits: hits.slice(0, limit), truncated };
  }

  async reveal(id: string, text: string): Promise<void> {
    const target = `=${sessionName(id)}:`;
    try {
      // tmux's own scroll-back view, searching backwards from the bottom for the text.
      await this.exec(['copy-mode', '-t', target]);
      await this.exec(['send-keys', '-X', '-t', target, 'search-backward-text', text]);
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) throw new SessionNotFoundError(id);
      // Scrolling to the match is a convenience; the session is still shown.
    }
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

  /** The session's size, cursor and how much history it keeps, in one call. */
  private async geometry(name: string): Promise<{ columns: number; rows: number; x: number; y: number; history: number; command: string }> {
    let output: string;
    try {
      output = await this.exec(['display-message', '-p', '-t', `=${name}:`, '#{pane_width}\t#{pane_height}\t#{cursor_x}\t#{cursor_y}\t#{history_size}\t#{pane_current_command}']);
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) throw new SessionNotFoundError(name);
      throw error;
    }
    const [columns = '0', rows = '0', x = '0', y = '0', history = '0', command = ''] = output.trimEnd().split('\t');
    return { columns: Number(columns), rows: Number(rows), x: Number(x), y: Number(y), history: Number(history), command };
  }

  // capture-pane reads the session's own screen and history. It attaches nothing, so it cannot change the session's size.
  async screen(id: string): Promise<TerminalScreen> {
    const name = sessionName(id);
    const at = await this.geometry(name);
    const text = await this.exec(['capture-pane', '-p', '-t', `=${name}:`]);
    return { text: text.replace(/\n$/, ''), columns: at.columns, rows: at.rows, cursor: { x: at.x, y: at.y }, line: at.history + at.y };
  }

  async lines(id: string, range: { count: number; skip: number } | { from: number }): Promise<{ lines: string[]; more: boolean; lost: boolean }> {
    const name = sessionName(id);
    const at = await this.geometry(name);
    // tmux counts rows from the top of the screen: 0 is the first visible row, and history is negative.
    let first: number;
    let last: number;
    let lost = false;
    if ('from' in range) {
      // A place remembered from before. If the history is shorter now, it was cleared: what was there is gone.
      lost = range.from > at.history + at.y;
      first = Math.max(0, range.from) - at.history;
      last = at.y;
    } else {
      // The end is the line the cursor is on, not the bottom of the screen: below the cursor a screen that is not full is empty.
      last = at.y - range.skip;
      first = last - range.count + 1;
    }
    const lowest = -at.history;
    const more = !('from' in range) && first > lowest;
    if (last < lowest || first > last) return { lines: [], more: false, lost };
    let text: string;
    try {
      text = await this.exec(['capture-pane', '-p', '-J', '-S', String(Math.max(first, lowest)), '-E', String(last), '-t', `=${name}:`]);
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) throw new SessionNotFoundError(name);
      throw error;
    }
    const lines = text.replace(/\n$/, '').split('\n');
    return { lines, more, lost };
  }

  async type(id: string, text: string, options: { paste?: boolean } = {}): Promise<void> {
    const name = sessionName(id);
    try {
      if (options.paste) {
        // A buffer of its own, filled from standard input so that the text is on no command line, and deleted when pasted.
        // -p: bracketed, when the program in the session asked for that.
        const buffer = `aubergine-${randomBytes(6).toString('hex')}`;
        await this.exec(['load-buffer', '-b', buffer, '-'], true, text);
        await this.exec(['paste-buffer', '-p', '-d', '-b', buffer, '-t', `=${name}:`]);
        return;
      }
      // The text goes as the bytes it is, in hexadecimal (-H): tmux reads nothing in it as the name of a key, an option,
      // or the end of a command. A few hundred bytes a call, in order.
      const bytes = Buffer.from(text, 'utf8');
      for (let start = 0; start < bytes.length; start += TYPE_CHUNK) {
        const chunk = bytes.subarray(start, start + TYPE_CHUNK);
        await this.exec(['send-keys', '-t', `=${name}:`, '-H', ...Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0'))]);
      }
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) throw new SessionNotFoundError(name);
      throw error;
    }
  }

  async press(id: string, keys: readonly TerminalKey[]): Promise<void> {
    const name = sessionName(id);
    try {
      // One key per call, by tmux's own name for it, from the fixed table: nothing a caller wrote is on this command line.
      for (const key of keys) await this.exec(['send-keys', '-t', `=${name}:`, TMUX_KEY[key] as string]);
    } catch (error) {
      if (isNoServer(error) || isNoSession(error)) throw new SessionNotFoundError(name);
      throw error;
    }
  }

  async foreground(id: string): Promise<string | null> {
    return (await this.geometry(sessionName(id))).command || null;
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

  private exec(args: string[], withSocket = true, input?: string): Promise<string> {
    const fullArgs = withSocket ? [...this.baseArgs, ...args] : args;
    return new Promise((resolve, reject) => {
      const child = execFile(
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
      if (input !== undefined) child.stdin?.end(input);
    });
  }
}

/** Session IDs go onto a command line as tmux targets, so only real IDs get through. */
/** How many bytes of typed text go in one tmux call. A multi-byte character may be split over two calls; the session reads them as one stream. */
const TYPE_CHUNK = 512;

/** tmux's name for each key that can be pressed by name. */
const TMUX_KEY: Record<TerminalKey, string> = {
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'BSpace',
  Delete: 'DC',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PPage',
  PageDown: 'NPage',
  Space: 'Space',
  'Ctrl+C': 'C-c',
  'Ctrl+D': 'C-d',
  'Ctrl+Z': 'C-z',
  'Ctrl+L': 'C-l',
  'Ctrl+U': 'C-u',
  'Ctrl+A': 'C-a',
  'Ctrl+E': 'C-e',
  'Ctrl+R': 'C-r',
};

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
