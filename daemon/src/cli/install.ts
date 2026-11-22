import { entryArguments, packageRoot } from '../package-root';
import { GIT_MINIMUM, gitNewEnough } from '../git/copies';
import { gitVersion } from '../git/run';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../config';
import { parseTmuxVersion } from '../runtime/tmux-runtime';
import { accessReport } from '../settings';

/**
 * The commands that make a copy of Aubergine usable from anywhere: start,
 * open, update, version, uninstall, doctor. They work the same for a copy
 * made by the installer and for a checkout made by hand; the only difference
 * is that `uninstall` removes the folder of a copy the installer made, and
 * never a folder someone made themselves.
 */

/** The folder this command's code is in: the checkout, or the installer's `app` folder. */
export function installRoot(): string {
  return packageRoot();
}

/** The file the installer leaves beside the `app` folder, to say that it made it. */
export const INSTALLER_MARK = '.installed-by-installer';
/** The file an archive install has inside it, in place of a git folder. */
export const ARCHIVE_MARK = '.installed-from-archive';
/** The file the npm package has inside it (written by `scripts/npm-package.mjs`). */
export const NPM_MARK = '.installed-from-npm';

export type CopyKind = 'git' | 'archive' | 'npm' | 'folder';

export function copyKind(root: string): CopyKind {
  if (existsSync(path.join(root, '.git'))) return 'git';
  if (existsSync(path.join(root, NPM_MARK))) return 'npm';
  return existsSync(path.join(root, ARCHIVE_MARK)) ? 'archive' : 'folder';
}

/** The name and version a copy gives itself: the npm package's own, else the daemon's. */
function nameAndVersion(root: string): { name: string | null; version: string | null } {
  for (const file of [path.join(root, 'package.json'), path.join(root, 'daemon', 'package.json')]) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown; version?: unknown };
      if (typeof parsed.version === 'string') return { name: typeof parsed.name === 'string' ? parsed.name : null, version: parsed.version };
    } catch {
      // An incomplete copy: try the next file.
    }
  }
  return { name: null, version: null };
}

/** What a person types to change an npm install, with the package's own name. */
export const npmLine = (root: string, verb: 'install' | 'uninstall'): string => `  npm ${verb} -g ${nameAndVersion(root).name ?? 'aubergine'}${verb === 'install' ? '@latest' : ''}`;

/** Whether the installer made this copy (as opposed to someone cloning it themselves). */
export function madeByInstaller(root: string): boolean {
  return path.basename(root) === 'app' && existsSync(path.join(root, '..', INSTALLER_MARK));
}

function git(root: string, args: string[]): { ok: boolean; out: string; err: string } {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() };
}

export interface VersionInfo {
  version: string;
  commit: string | null;
  kind: CopyKind;
  root: string;
  dataDir: string;
}

export function versionInfo(root: string, config: Pick<Config, 'dataDir'>): VersionInfo {
  const version = nameAndVersion(root).version ?? 'unknown';
  const kind = copyKind(root);
  const head = kind === 'git' ? git(root, ['rev-parse', '--short', 'HEAD']) : null;
  return { version, commit: head?.ok ? head.out : null, kind, root, dataDir: config.dataDir };
}

const KIND_WORDS: Record<Exclude<CopyKind, 'git'>, string> = { archive: 'installed from an archive', npm: 'installed with npm', folder: 'not a git checkout' };

export function formatVersion(info: VersionInfo): string {
  const from = info.kind === 'git' ? `commit ${info.commit ?? 'unknown'}` : KIND_WORDS[info.kind];
  return [`Aubergine ${info.version} (${from})`, `Installed in: ${info.root}`, `Data folder:  ${info.dataDir}`].join('\n');
}

/** What is answering on the port: this program, something else, or nothing. */
export type Answering = 'aubergine' | 'other' | 'none';

export async function whoAnswers(port: number, timeoutMs = 1500): Promise<Answering> {
  try {
    // Without the access cookie, Aubergine says so in its own words; anything else on the port does not.
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/state`, { signal: AbortSignal.timeout(timeoutMs) });
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | { state?: unknown } | null;
    if (body && typeof body === 'object' && ('state' in body || (body as { error?: { code?: string } }).error?.code === 'unauthorized')) return 'aubergine';
    return 'other';
  } catch (error) {
    return (error as { name?: string }).name === 'TimeoutError' ? 'other' : 'none';
  }
}

export const serverAddress = (config: Pick<Config, 'port'>): string => `http://127.0.0.1:${config.port}`;

/** The address that signs a browser in. It carries the access token: open it, do not show it. */
export async function signInAddress(config: Pick<Config, 'port' | 'dataDir'>): Promise<string> {
  const token = (await readFile(path.join(config.dataDir, 'token'), 'utf8')).trim();
  return `${serverAddress(config)}/auth?token=${token}`;
}

export const webIsBuilt = (root: string): boolean => existsSync(path.join(root, 'web', 'dist', 'index.html'));

/** Runs a tool in the copy's folder, showing its output. Returns whether it succeeded. */
export type Run = (file: string, args: string[], cwd: string) => boolean;

export const runShown: Run = (file, args, cwd) => spawnSync(file, args, { cwd, stdio: 'inherit' }).status === 0;

/** Builds the web app if it has not been built. Returns false if that was needed and failed. */
export function ensureBuilt(root: string, say: (line: string) => void, run: Run = runShown): boolean {
  if (webIsBuilt(root)) return true;
  say('The web app has not been built yet. Building it (pnpm build) ...');
  if (!existsSync(path.join(root, 'node_modules'))) {
    if (!run('pnpm', ['install', '--frozen-lockfile'], root)) return false;
  }
  return run('pnpm', ['build'], root) && webIsBuilt(root);
}

/**
 * Starts the server of this copy in the foreground and resolves with its
 * exit code when it ends. `whenUp` is called once it answers.
 */
export function serve(root: string, config: Pick<Config, 'port'>, whenUp?: () => void): Promise<number> {
  const child = spawn(process.execPath, entryArguments(root, 'main'), { cwd: root, stdio: 'inherit' });
  // Ctrl-C reaches the server by itself (same terminal); a signal sent to this command is passed on.
  const pass = (signal: NodeJS.Signals) => () => child.kill(signal);
  const onTerm = pass('SIGTERM');
  const onHup = pass('SIGHUP');
  const onInt = (): void => {};
  process.on('SIGTERM', onTerm);
  process.on('SIGHUP', onHup);
  process.on('SIGINT', onInt);

  let ended = false;
  if (whenUp) {
    void (async () => {
      for (let i = 0; i < 150 && !ended; i++) {
        if ((await whoAnswers(config.port, 500)) === 'aubergine') return whenUp();
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    })();
  }
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      ended = true;
      process.off('SIGTERM', onTerm);
      process.off('SIGHUP', onHup);
      process.off('SIGINT', onInt);
      resolve(code ?? (signal ? 0 : 1));
    });
  });
}

export interface UpdateResult {
  ok: boolean;
  lines: string[];
}

/**
 * Brings a git copy up to date: fetch, fast-forward, install, build. Refuses
 * a copy with local changes, and tells an archive copy to run the installer.
 */
export function update(root: string, run: Run = runShown): UpdateResult {
  const kind = copyKind(root);
  if (kind === 'npm') {
    return { ok: false, lines: [`The copy in ${root} was installed with npm, so npm updates it:`, npmLine(root, 'install'), 'Then restart the server. Your terminals keep running.'] };
  }
  if (kind !== 'git') {
    return {
      ok: false,
      lines: [
        `The copy in ${root} is not a git checkout, so it cannot update itself.`,
        'Run the installer again; it replaces the copy and keeps your data:',
        '  curl -fsSL https://raw.githubusercontent.com/meatgarden/aubergine/main/install.sh | sh',
      ],
    };
  }
  const changes = git(root, ['status', '--porcelain']);
  if (!changes.ok) return { ok: false, lines: [`Could not look at ${root}: ${changes.err}`] };
  if (changes.out !== '') {
    return {
      ok: false,
      lines: [`The code in ${root} has local changes, so it was not updated:`, ...changes.out.split('\n').slice(0, 10).map((line) => `  ${line}`), 'Commit, stash or undo them, and run this again.'],
    };
  }
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.ok || branch.out === 'HEAD') {
    return { ok: false, lines: [`The copy in ${root} is not on a branch (it is at a tag or a single commit).`, 'Run the installer again, with AUBERGINE_REF set to the version you want.'] };
  }
  const before = git(root, ['rev-parse', '--short', 'HEAD']).out;
  const fetched = git(root, ['fetch', '--quiet', 'origin', branch.out]);
  if (!fetched.ok) return { ok: false, lines: [`Could not fetch "${branch.out}": ${fetched.err}`] };
  const merged = git(root, ['merge', '--quiet', '--ff-only', 'FETCH_HEAD']);
  if (!merged.ok) return { ok: false, lines: [`The copy in ${root} has commits of its own, so it could not be fast-forwarded.`, merged.err] };
  const after = git(root, ['rev-parse', '--short', 'HEAD']).out;
  if (before === after && webIsBuilt(root)) return { ok: true, lines: [`Already up to date (${after}).`] };

  if (!run('pnpm', ['install', '--frozen-lockfile'], root)) return { ok: false, lines: ['pnpm install failed; the code is updated but its dependencies are not. Fix what it reported and run this again.'] };
  if (!run('pnpm', ['build'], root)) return { ok: false, lines: ['pnpm build failed; fix what it reported and run this again.'] };
  return { ok: true, lines: [before === after ? `Built ${after}.` : `Updated from ${before} to ${after}.`, 'Restart the server to use it: stop it (Ctrl-C), then aubergine start. Your terminals keep running.'] };
}

/** The folders a link to the command may be in: everything on PATH, and the two in the home folder. */
export function linkFolders(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string[] {
  const onPath = (env.PATH ?? '').split(':').filter(Boolean);
  return [...new Set([...onPath, path.join(home, '.local', 'bin'), path.join(home, 'bin')])];
}

/** Links named `aubergine` in those folders that point at this copy's command. Never a file, never another copy's link. */
export function findLinks(root: string, folders: readonly string[]): string[] {
  const target = path.join(root, 'bin', 'aubergine.mjs');
  let real = target;
  try {
    real = realpathSync(target);
  } catch {
    // The copy is incomplete; compare by name alone.
  }
  const found: string[] = [];
  for (const folder of folders) {
    const link = path.join(folder, 'aubergine');
    try {
      if (!lstatSync(link).isSymbolicLink()) continue;
      const to = path.resolve(folder, readlinkSync(link));
      if (to === target || to === real || (existsSync(to) && realpathSync(to) === real)) found.push(link);
    } catch {
      // Nothing there.
    }
  }
  return found;
}

/** The first `aubergine` a shell would find, with whether it is this copy's. */
export function commandOnPath(root: string, env: NodeJS.ProcessEnv = process.env): { file: string; ours: boolean } | null {
  for (const folder of (env.PATH ?? '').split(':').filter(Boolean)) {
    const file = path.join(folder, 'aubergine');
    if (!existsSync(file)) continue;
    let ours = false;
    try {
      ours = realpathSync(file) === realpathSync(path.join(root, 'bin', 'aubergine.mjs'));
    } catch {
      // A link to nowhere: found, but not ours.
    }
    return { file, ours };
  }
  return null;
}

export interface UninstallPlan {
  links: string[];
  /** The folder to remove, when the installer made this copy; null for a checkout someone made. */
  folder: string | null;
  /** The login service file, when it starts this copy. */
  service: string | null;
}

export function uninstallPlan(root: string, folders: readonly string[], serviceFile: string): UninstallPlan {
  let service: string | null = null;
  try {
    // The service runs this copy's server: the source in a checkout, the compiled file in the npm package.
    const text = readFileSync(serviceFile, 'utf8');
    if (text.includes(path.join(root, 'daemon') + path.sep) || text.includes(path.join(root, 'dist') + path.sep)) service = serviceFile;
  } catch {
    // No login service.
  }
  // npm made the command and the folder of an npm install, so npm removes them (`npmLine`).
  if (copyKind(root) === 'npm') return { links: [], folder: null, service };
  return { links: findLinks(root, folders), folder: madeByInstaller(root) ? root : null, service };
}

/** Removes the links and, for a copy the installer made, its folder. The data folder is not involved. */
export function removeCopy(plan: UninstallPlan): void {
  for (const link of plan.links) rmSync(link, { force: true });
  if (!plan.folder) return;
  const base = path.dirname(plan.folder);
  rmSync(plan.folder, { recursive: true, force: true });
  rmSync(path.join(base, INSTALLER_MARK), { force: true });
  // The folder the installer made for it, if nothing else is in it.
  try {
    if (readdirSync(base).length === 0) rmSync(base, { recursive: true });
  } catch {
    // Already gone, or not ours to remove.
  }
}

export interface Check {
  /** true: fine. false: needs fixing. null: for information. */
  ok: boolean | null;
  text: string;
}

function toolVersion(file: string, args: string[]): string | null {
  const result = spawnSync(file, args, { encoding: 'utf8' });
  return result.status === 0 ? (result.stdout ?? '').trim() : null;
}

function has(tool: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
}

/** The same checks as the installer, plus the state of this copy. One line each. */
export async function doctor(root: string, config: Config, env: NodeJS.ProcessEnv = process.env): Promise<Check[]> {
  const checks: Check[] = [];
  const node = Number(process.versions.node.split('.')[0]);
  checks.push({ ok: node >= 22, text: `Node.js ${process.versions.node}${node >= 22 ? '' : ': version 22 or newer is needed'}` });

  const kind = copyKind(root);
  if (kind !== 'npm') {
    const pnpm = toolVersion('pnpm', ['--version']);
    checks.push({ ok: pnpm !== null, text: pnpm ? `pnpm ${pnpm}` : 'pnpm is not installed (needed to install and update)' });
  }

  const tmuxText = toolVersion(config.tmuxBin, ['-V']);
  const tmux = tmuxText ? parseTmuxVersion(tmuxText) : null;
  if (!tmuxText) checks.push({ ok: false, text: `tmux is not installed${config.tmuxBin === 'tmux' ? '' : ` at ${config.tmuxBin}`} (version 3.2 or newer is needed)` });
  else if (!tmux) checks.push({ ok: null, text: `tmux: could not read the version from "${tmuxText}"` });
  else {
    const enough = tmux.major > 3 || (tmux.major === 3 && tmux.minor >= 2);
    checks.push({ ok: enough, text: `tmux ${tmux.text}${enough ? '' : ': version 3.2 or newer is needed'}` });
  }

  const gitThere = has('git');
  const archive = has('curl') && has('tar');
  if (kind !== 'npm') checks.push({ ok: gitThere || archive, text: gitThere ? 'git, for updates' : archive ? 'curl and tar, for updates by archive (no git)' : 'neither git nor curl with tar: updates are not possible' });

  // Working copies and library sources start Git. Without it, or with an old one, everything else still works.
  const git = await gitVersion();
  checks.push(
    git === null
      ? { ok: null, text: 'git is not installed: working copies and library sources from Git need it; everything else works without' }
      : gitNewEnough(git)
        ? { ok: true, text: `git ${git}, for working copies and library sources` }
        : { ok: false, text: `git ${git}: working copies need version ${GIT_MINIMUM.join('.')} or newer` },
  );

  const info = versionInfo(root, config);
  checks.push({ ok: null, text: `this copy: ${info.root} (${info.kind === 'git' ? `commit ${info.commit ?? 'unknown'}` : KIND_WORDS[info.kind]})` });
  if (kind !== 'npm') checks.push({ ok: existsSync(path.join(root, 'node_modules')), text: existsSync(path.join(root, 'node_modules')) ? 'dependencies are installed' : 'dependencies are not installed: run pnpm install in that folder, or aubergine update' });
  checks.push({ ok: webIsBuilt(root), text: webIsBuilt(root) ? 'the web app is built' : 'the web app is not built: aubergine start builds it' });

  const command = commandOnPath(root, env);
  if (!command) checks.push({ ok: false, text: 'the "aubergine" command is not on your PATH: link it, or add its folder to PATH (see the README)' });
  else if (command.ours) checks.push({ ok: true, text: `the "aubergine" command is on your PATH: ${command.file}` });
  else checks.push({ ok: false, text: `"aubergine" on your PATH is ${command.file}, which is not this copy` });

  const answering = await whoAnswers(config.port);
  checks.push(
    answering === 'aubergine'
      ? { ok: true, text: `the server is answering at ${serverAddress(config)}` }
      : answering === 'other'
        ? { ok: false, text: `something else is answering on port ${config.port}: stop it, or choose another port with AUBERGINE_PORT` }
        : { ok: null, text: `the server is not running (start it with: aubergine start)` },
  );
  checks.push({ ok: null, text: `data folder: ${config.dataDir}` });
  // Outside addresses, as the server takes them when it starts. Each wrong entry is one thing to fix.
  const access = await accessReport(config.dataDir);
  checks.push({ ok: null, text: access.addresses.length === 0 ? 'outside addresses: none (another device cannot reach this server)' : `outside addresses: ${access.addresses.join(', ')}` });
  for (const problem of access.problems) checks.push({ ok: false, text: problem });
  return checks;
}

export function formatChecks(checks: readonly Check[]): string {
  return checks.map((check) => `${check.ok === true ? 'ok ' : check.ok === false ? 'x  ' : '-  '} ${check.text}`).join('\n');
}
