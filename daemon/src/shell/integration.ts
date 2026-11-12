import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** What a shell says about itself. */
export interface ShellReport {
  state: 'busy' | 'idle';
  /** The command line being run, while busy. */
  commandLine: string | null;
  startedAt: Date | null;
  /** Exit code of the last finished command, once one has finished. */
  lastExit: number | null;
  lastFinishedAt: Date | null;
}

/**
 * Shell integration: makes a session's shell report when a command starts
 * and ends, in a way the daemon can read at any time. It must not depend on
 * anyone viewing the terminal, because parked and off-screen sessions have
 * no viewer.
 *
 * One implementation for now (zsh). Another shell is one more class.
 */
export interface ShellIntegration {
  /**
   * Environment variables that switch reporting on for a new session running
   * `shell`. Empty when that shell is not supported: the session then simply
   * reports nothing.
   */
  environment(sessionId: string, shell: string): Promise<Record<string, string>>;
  /** The latest report, or null when the session has not reported. */
  read(sessionId: string): Promise<ShellReport | null>;
  forget(sessionId: string): Promise<void>;
  /** Calls back, soon after any session reports something new. Returns a function that stops it. */
  watch(onChange: () => void): () => void;
}

/*
 * How it works for zsh.
 *
 * The session starts zsh with ZDOTDIR pointing at a folder of ours. Each
 * startup file there hands over to the user's own file of the same name, so
 * their configuration loads exactly as usual, and the user's dotfiles are
 * never edited. After their .zshrc, two hooks are added: one runs before
 * each command and one before each prompt. Each writes a single short line
 * to a status file with a shell builtin, so no process is started and the
 * prompt is not slowed down.
 *
 * Status line, tab-separated:
 *   busy <start, epoch seconds> <command line>
 *   idle <exit code, empty before the first command> <finish, epoch seconds>
 */

const HEADER = '# Written by Aubergine. Loads your own startup file, then reports command status.\n';

/** Runs the user's startup file `name` with ZDOTDIR as they would have it. */
function handOver(name: string): string {
  return `
if [[ -n "$AUBERGINE_SHELL_DIR" ]]; then
  if [[ -n "$AUBERGINE_USER_ZDOTDIR" ]]; then ZDOTDIR="$AUBERGINE_USER_ZDOTDIR"; else unset ZDOTDIR; fi
  [[ -f "\${ZDOTDIR:-$HOME}/${name}" ]] && source "\${ZDOTDIR:-$HOME}/${name}"
  # Their file may have moved ZDOTDIR; remember where they want it.
  AUBERGINE_USER_ZDOTDIR="\${ZDOTDIR:-}"
fi
`;
}

/** Points zsh back at our folder so that it reads our next startup file. */
const STAY = `
[[ -n "$AUBERGINE_SHELL_DIR" ]] && ZDOTDIR="$AUBERGINE_SHELL_DIR"
`;

/** Startup is over: leave ZDOTDIR as the user has it, for programs started from this shell. */
const LEAVE = `
if [[ -n "$AUBERGINE_SHELL_DIR" ]]; then
  if [[ -n "$AUBERGINE_USER_ZDOTDIR" ]]; then export ZDOTDIR="$AUBERGINE_USER_ZDOTDIR"; else unset ZDOTDIR; fi
  unset AUBERGINE_USER_ZDOTDIR AUBERGINE_SHELL_DIR
fi
`;

const HOOKS = `
if [[ -o interactive && -n "$AUBERGINE_STATUS_FILE" ]]; then
  zmodload zsh/datetime 2>/dev/null
  typeset -g _aubergine_ran=""
  _aubergine_preexec() {
    local line="\${1//$'\\n'/ }"
    line="\${line//$'\\t'/ }"
    _aubergine_ran=1
    print -r -- "busy"$'\\t'"$EPOCHSECONDS"$'\\t'"\${line[1,300]}" >| "$AUBERGINE_STATUS_FILE" 2>/dev/null
  }
  _aubergine_precmd() {
    local code=$?
    if [[ -n "$_aubergine_ran" ]]; then
      print -r -- "idle"$'\\t'"$code"$'\\t'"$EPOCHSECONDS" >| "$AUBERGINE_STATUS_FILE" 2>/dev/null
    elif [[ ! -s "$AUBERGINE_STATUS_FILE" ]]; then
      print -r -- "idle"$'\\t\\t' >| "$AUBERGINE_STATUS_FILE" 2>/dev/null
    fi
    _aubergine_ran=""
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec _aubergine_preexec
  add-zsh-hook precmd _aubergine_precmd
fi
`;

/** A history file placed in our folder by a system-wide startup file belongs with the user's files. */
const FIX_HISTORY = `
if [[ -n "$AUBERGINE_SHELL_DIR" && "$HISTFILE" == "$AUBERGINE_SHELL_DIR"/* ]]; then
  HISTFILE="\${AUBERGINE_USER_ZDOTDIR:-$HOME}/\${HISTFILE:t}"
fi
`;

export const ZSH_FILES: Record<string, string> = {
  // Read by every zsh. Only an interactive one goes on to read our other files.
  '.zshenv': `${HEADER}${handOver('.zshenv')}
if [[ -o interactive ]]; then${STAY.trimEnd()}
else${LEAVE.trimEnd()}
fi
`,
  '.zprofile': `${HEADER}${handOver('.zprofile')}${STAY}`,
  '.zshrc': `${HEADER}${FIX_HISTORY}${handOver('.zshrc')}${HOOKS}
if [[ -o login ]]; then${STAY.trimEnd()}
else${LEAVE.trimEnd()}
fi
`,
  '.zlogin': `${HEADER}${handOver('.zlogin')}${LEAVE}`,
};

export function parseStatusLine(text: string): ShellReport | null {
  const line = text.split('\n')[0] ?? '';
  const [state, second = '', ...rest] = line.split('\t');
  const date = (seconds: string): Date | null => (/^\d+$/.test(seconds) ? new Date(Number(seconds) * 1000) : null);
  if (state === 'busy') {
    return {
      state: 'busy',
      commandLine: rest.join(' ').trim() || null,
      startedAt: date(second),
      lastExit: null,
      lastFinishedAt: null,
    };
  }
  if (state === 'idle') {
    return {
      state: 'idle',
      commandLine: null,
      startedAt: null,
      lastExit: /^-?\d+$/.test(second) ? Number(second) : null,
      lastFinishedAt: date(rest[0] ?? ''),
    };
  }
  return null;
}

export class ZshIntegration implements ShellIntegration {
  private readonly zshDir: string;
  private readonly statusDir: string;
  private written = false;

  /**
   * `dir` is a folder of our own, inside the data folder. `userZdotdir` is
   * where the user keeps their zsh files when that is not their home folder.
   */
  constructor(
    dir: string,
    private readonly userZdotdir: string = process.env.ZDOTDIR ?? '',
  ) {
    this.zshDir = path.join(dir, 'zsh');
    this.statusDir = path.join(dir, 'status');
  }

  async environment(sessionId: string, shell: string): Promise<Record<string, string>> {
    if (path.basename(shell) !== 'zsh') return {};
    await this.writeFiles();
    // Start from a clean slate, so a report from an earlier shell is not mistaken for this one's.
    await rm(this.statusFile(sessionId), { force: true });
    return {
      ZDOTDIR: this.zshDir,
      AUBERGINE_SHELL_DIR: this.zshDir,
      AUBERGINE_USER_ZDOTDIR: this.userZdotdir,
      AUBERGINE_STATUS_FILE: this.statusFile(sessionId),
    };
  }

  async read(sessionId: string): Promise<ShellReport | null> {
    try {
      return parseStatusLine(await readFile(this.statusFile(sessionId), 'utf8'));
    } catch {
      return null;
    }
  }

  async forget(sessionId: string): Promise<void> {
    await rm(this.statusFile(sessionId), { force: true });
  }

  watch(onChange: () => void): () => void {
    let watcher: FSWatcher | null = null;
    let timer: NodeJS.Timeout | null = null;
    let stopped = false;
    void mkdir(this.statusDir, { recursive: true, mode: 0o700 }).then(() => {
      if (stopped) return;
      try {
        watcher = watch(this.statusDir, () => {
          // Several writes close together become one call.
          timer ??= setTimeout(() => {
            timer = null;
            onChange();
          }, 60);
        });
        watcher.on('error', () => {});
      } catch {
        // Without a watcher, reports are still picked up by the regular refresh.
      }
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      watcher?.close();
    };
  }

  private statusFile(sessionId: string): string {
    return path.join(this.statusDir, sessionId);
  }

  private async writeFiles(): Promise<void> {
    if (this.written) return;
    await mkdir(this.zshDir, { recursive: true, mode: 0o700 });
    await mkdir(this.statusDir, { recursive: true, mode: 0o700 });
    for (const [name, body] of Object.entries(ZSH_FILES)) {
      await writeFile(path.join(this.zshDir, name), body, { mode: 0o600 });
    }
    this.written = true;
  }
}

/** For sessions and tests that want no integration at all. */
export const noIntegration: ShellIntegration = {
  environment: async () => ({}),
  read: async () => null,
  forget: async () => {},
  watch: () => () => {},
};
