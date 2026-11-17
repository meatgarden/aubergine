import { spawn } from 'node:child_process';
import { chmod, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Id, type Settings } from '@aubergine/shared';

/**
 * Opening a canvas terminal in the owner's own terminal application.
 *
 * Both views are the same session: what is opened is `aubergine attach` for
 * that session, started for the owner in a window of their terminal app.
 * Nothing is typed anywhere and no other application is scripted. A small
 * script file is written for the session, and the app is asked to open that
 * file. That is all.
 *
 * This is the only module that starts a program on the owner's desktop.
 * Which program is a registered kind; the server holds a `DesktopOpener`,
 * and tests hold a stand-in.
 */

export const DESKTOP_FOLDER = 'desktop';
/** The ending a terminal application on macOS takes as "run this in a new window". */
export const SCRIPT_ENDING = '.command';
/** Where the script file goes in a command line the owner wrote. */
export const FILE_PLACEHOLDER = '{file}';

/** What opening did, in a sentence; or why it could not. */
export interface DesktopOpened {
  ok: boolean;
  says: string;
}

/** What the server holds. One implementation; a test passes a stand-in. */
export interface DesktopOpener {
  /** Opens the session in the owner's terminal app. Never rejects for an app that is missing: it says so. */
  open(sessionId: string): Promise<DesktopOpened>;
  /** Removes the script file of a session that ended or was removed. */
  forget(sessionId: string): Promise<void>;
  /** Removes the script files of sessions that are no longer there. `existing`: the sessions that are. */
  sweep(existing: ReadonlySet<string>): Promise<void>;
}

/* ---------- Quoting, and the script ---------- */

/** One word for `sh`, whatever it holds: in single quotes, with each single quote closed, escaped and opened again. */
export function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** What the script needs to know. All of it is this server's own; nothing here is chosen by a caller. */
export interface ScriptFacts {
  /** This copy's `aubergine` command. */
  command: string;
  port: number;
  dataDir: string;
  /** The name of the socket this server's sessions are on. */
  socket: string;
  /** The tmux program, when the server was told to use a particular one. */
  tmuxBin: string | null;
}

/**
 * The script for one session: one command, which attaches this window to it.
 * It holds the session's ID and this server's own port, folders and socket,
 * each quoted for `sh`. No name, title or folder of the session is in it.
 */
export function scriptFor(sessionId: string, facts: ScriptFacts): string {
  // Checked here again, whatever the caller checked: an ID is letters, digits and dashes.
  const id = Id.parse(sessionId);
  const env = [`AUBERGINE_PORT=${shQuote(String(facts.port))}`, `AUBERGINE_DATA_DIR=${shQuote(facts.dataDir)}`, `AUBERGINE_TMUX_SOCKET=${shQuote(facts.socket)}`, ...(facts.tmuxBin ? [`AUBERGINE_TMUX_BIN=${shQuote(facts.tmuxBin)}`] : [])];
  return `#!/bin/sh\n# Written by Aubergine. Shows one of its terminals in this window; closing the window ends nothing.\n${env.join(' ')} exec ${shQuote(facts.command)} attach ${shQuote(id)}\n`;
}

/* ---------- Starting a program: the one place ---------- */

export type Started = { ok: true } | { ok: false; reason: string };
/**
 * Starts one program with its arguments, without a shell. `wait`: the program is expected to end at once (it hands
 * the work to something else), and how it ended is the answer. Otherwise it is left running, and the answer is
 * whether it could be started at all.
 */
export type StartProgram = (program: string, args: readonly string[], wait: boolean) => Promise<Started>;

export const startProgram: StartProgram = (program, args, wait) =>
  new Promise((resolve) => {
    let errors = '';
    const child = spawn(program, [...args], { shell: false, detached: !wait, stdio: ['ignore', 'ignore', wait ? 'pipe' : 'ignore'] });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (errors.length < 2000) errors += chunk.toString('utf8');
    });
    child.once('error', (error: NodeJS.ErrnoException) => resolve({ ok: false, reason: error.code === 'ENOENT' ? `There is no program “${program}” here.` : `“${program}” could not be started: ${error.message}` }));
    if (wait) child.once('exit', (code) => resolve(code === 0 ? { ok: true } : { ok: false, reason: errors.trim().split('\n')[0]?.slice(0, 300) || `“${program}” ended with ${code ?? 'a signal'}.` }));
    else
      child.once('spawn', () => {
        // It lives on by itself: the server neither waits for it nor is kept up by it.
        child.unref();
        resolve({ ok: true });
      });
  });

/* ---------- Kinds: which program is asked, and how ---------- */

export interface DesktopKindContext {
  platform: NodeJS.Platform;
  settings: Settings['desktop'];
  start: StartProgram;
}

/** A way of opening the script file in a terminal application. Another app is another registration. */
export interface DesktopKind {
  kind: string;
  /** What the owner calls it. */
  title: string;
  /** Why this kind cannot be used here, in a sentence; null when it can. Starts nothing. */
  problem(context: Omit<DesktopKindContext, 'start'>): string | null;
  open(file: string, context: DesktopKindContext): Promise<Started>;
}
const kinds = new Map<string, DesktopKind>();
export function registerDesktopKind(kind: DesktopKind): void {
  kinds.set(kind.kind, kind);
}
export function unregisterDesktopKind(kind: string): void {
  kinds.delete(kind);
}
export const desktopKind = (kind: string): DesktopKind | undefined => kinds.get(kind);
export const desktopKinds = (): DesktopKind[] => [...kinds.values()];

/** An application of macOS that runs a `.command` file in a new window when it is handed one. Opening the file is all that is asked of it. */
const macApp = (kind: string, title: string, application: string): void =>
  registerDesktopKind({
    kind,
    title,
    problem: ({ platform }) => (platform === 'darwin' ? null : `${title} is an application of macOS. On this system, set desktop.app to "command" and write desktop.command.`),
    open: async (file, { start }) => {
      const opened = await start('/usr/bin/open', ['-a', application, file], true);
      return opened.ok ? opened : { ok: false, reason: `${title} could not be asked to open it. Is it installed? (${opened.reason})` };
    },
  });
macApp('terminal', 'Terminal', 'Terminal');
macApp('iterm', 'iTerm', 'iTerm');

/**
 * A command line of the owner's, split into arguments once: at spaces, with single or double quotes keeping a part
 * together. Nothing is expanded and there are no escapes: this is not a shell. Null when a quote is left open.
 */
export function splitCommand(line: string): string[] | null {
  const parts: string[] = [];
  let part: string | null = null;
  let quote: string | null = null;
  for (const char of line) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else part = (part ?? '') + char;
    } else if (char === '"' || char === "'") {
      quote = char;
      part = part ?? '';
    } else if (/\s/.test(char)) {
      if (part !== null) parts.push(part);
      part = null;
    } else part = (part ?? '') + char;
  }
  if (quote !== null) return null;
  if (part !== null) parts.push(part);
  return parts;
}

/** The program and arguments of the owner's command for one file, or what is wrong with the command. The file is one argument, whatever its path holds. */
export function commandFor(line: string | null, file: string): { program: string; args: string[] } | { problem: string } {
  if (line === null || line.trim() === '') return { problem: `desktop.app is "command", and desktop.command is not written. It is a command line with ${FILE_PLACEHOLDER} where the script file goes.` };
  const parts = splitCommand(line);
  if (parts === null) return { problem: 'desktop.command has a quote that is not closed.' };
  const [program, ...rest] = parts;
  if (program === undefined || program.includes(FILE_PLACEHOLDER)) return { problem: 'desktop.command must begin with the program to start.' };
  if (rest.filter((part) => part.includes(FILE_PLACEHOLDER)).length !== 1) return { problem: `desktop.command needs ${FILE_PLACEHOLDER} once, where the script file goes.` };
  // Replaced inside the argument it is in: that argument stays one argument.
  return { program, args: rest.map((part) => part.replace(FILE_PLACEHOLDER, () => file)) };
}

registerDesktopKind({
  kind: 'command',
  title: 'your own command',
  problem: ({ settings }) => {
    const made = commandFor(settings.command, '/');
    return 'problem' in made ? made.problem : null;
  },
  open: async (file, { settings, start }) => {
    const made = commandFor(settings.command, file);
    if ('problem' in made) return { ok: false, reason: made.problem };
    // Left running: a terminal application started this way usually is the window.
    return start(made.program, made.args, false);
  },
});

/** The kind the settings name; where they name none, the usual one for this system, if it has one. */
export function chosenKind(settings: Settings['desktop'], platform: NodeJS.Platform): { kind: DesktopKind } | { problem: string } {
  const name = settings.app ?? (platform === 'darwin' ? 'terminal' : settings.command ? 'command' : null);
  if (name === null) return { problem: 'No terminal application is known for this system. Set desktop.app to "command" in the settings file, and write desktop.command.' };
  const kind = kinds.get(name);
  if (!kind) return { problem: `desktop.app is “${name}”, which is not one of: ${[...kinds.keys()].join(', ')}.` };
  const problem = kind.problem({ platform, settings });
  return problem === null ? { kind } : { problem };
}

/* ---------- The opener ---------- */

export interface FileDesktopOpenerOptions {
  dataDir: string;
  facts: () => ScriptFacts;
  /** The settings as they are now: the owner may have changed the file. */
  settings: () => Promise<Settings['desktop']>;
  platform?: NodeJS.Platform;
  start?: StartProgram;
}

export const scriptFile = (dataDir: string, sessionId: string): string => path.join(dataDir, DESKTOP_FOLDER, `${Id.parse(sessionId)}${SCRIPT_ENDING}`);

export class FileDesktopOpener implements DesktopOpener {
  constructor(private readonly options: FileDesktopOpenerOptions) {}

  async open(sessionId: string): Promise<DesktopOpened> {
    const settings = await this.options.settings();
    const platform = this.options.platform ?? process.platform;
    const chosen = chosenKind(settings, platform);
    if ('problem' in chosen) return { ok: false, says: chosen.problem };
    const file = scriptFile(this.options.dataDir, sessionId);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    // Written beside and moved into place, so that nothing runs half a file. Only the owner may read or run it.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, scriptFor(sessionId, this.options.facts()), { mode: 0o700 });
    await chmod(tmp, 0o700);
    await rename(tmp, file);
    const started = await chosen.kind.open(file, { platform, settings, start: this.options.start ?? startProgram });
    return started.ok ? { ok: true, says: `Asked ${chosen.kind.title} to open it. The window shows the same terminal; closing the window ends nothing.` } : { ok: false, says: started.reason };
  }

  async forget(sessionId: string): Promise<void> {
    if (!Id.safeParse(sessionId).success) return;
    await rm(scriptFile(this.options.dataDir, sessionId), { force: true });
  }

  async sweep(existing: ReadonlySet<string>): Promise<void> {
    const folder = path.join(this.options.dataDir, DESKTOP_FOLDER);
    const names = await readdir(folder).catch(() => [] as string[]);
    for (const name of names) {
      const id = name.endsWith(SCRIPT_ENDING) ? name.slice(0, -SCRIPT_ENDING.length) : null;
      // Anything in this folder that is not the script of a session that is there: a session that is gone, or half a file from a stop.
      if (id === null || !existing.has(id)) await rm(path.join(folder, name), { force: true, recursive: false }).catch(() => {});
    }
  }
}
