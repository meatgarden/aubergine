import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The installer, run for real: against a copy of this repository made for the
 * test, with a home folder and a PATH that exist only for the test. Nothing
 * here touches the developer's home, PATH folders or data.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const script = path.join(repoRoot, 'install.sh');

/** The system tools the script may use. Linked one by one, so that leaving one out is possible. */
const TOOLS = ['sh', 'sed', 'uname', 'mkdir', 'ln', 'readlink', 'rm', 'mv', 'cat', 'tar', 'curl', 'gzip', 'dirname', 'basename', 'tr', 'grep', 'ls', 'cp', 'chmod', 'env', 'awk', 'head', 'sort', 'cut', 'pwd', 'date', 'touch', 'find', 'xargs', 'wc', 'test', 'true', 'false', 'printf', 'echo', 'tee', 'mktemp', 'id', 'which', 'git'];

function whereIs(tool: string): string | null {
  const found = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
  return found.startsWith('/') ? found : null;
}

let work: string;
let source: string;

interface World {
  home: string;
  bin: string;
  env: NodeJS.ProcessEnv;
}

/** A fresh home and PATH. `tools` are stand-ins by name: a version to report, `real` for the real one, or absent. */
function world(options: { node?: string | 'real' | null; tmux?: string | null; pnpm?: 'fake' | 'real' | null; git?: boolean; pathDirs?: string[]; env?: Record<string, string> } = {}): World {
  const root = mkdtempSync(path.join(work, 'world-'));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'tools');
  mkdirSync(home);
  mkdirSync(bin);
  for (const tool of TOOLS) {
    if (tool === 'git' && options.git === false) continue;
    const real = whereIs(tool);
    if (real) symlinkSync(real, path.join(bin, tool));
  }
  const stub = (name: string, body: string): void => {
    writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(path.join(bin, name), 0o755);
  };
  const node = options.node === undefined ? 'real' : options.node;
  if (node === 'real') symlinkSync(process.execPath, path.join(bin, 'node'));
  else if (node !== null) stub('node', `case "$1" in -p) echo ${node} ;; -e) exit 1 ;; esac`);
  const tmux = options.tmux === undefined ? '3.4' : options.tmux;
  if (tmux !== null) stub('tmux', `echo "tmux ${tmux}"`);
  const pnpm = options.pnpm === undefined ? 'fake' : options.pnpm;
  if (pnpm === 'fake') stub('pnpm', `echo "pnpm $*" >> "${path.join(root, 'pnpm.log')}"`);
  else if (pnpm === 'real') symlinkSync(realpathSync(whereIs('pnpm')!), path.join(bin, 'pnpm'));
  const dirs = (options.pathDirs ?? []).map((dir) => dir.replace('~', home));
  for (const dir of dirs) mkdirSync(dir, { recursive: true });
  return {
    home,
    bin,
    env: {
      HOME: home,
      PATH: [bin, ...dirs].join(':'),
      SHELL: '/bin/zsh',
      AUBERGINE_REPO: source,
      AUBERGINE_REF: 'main',
      AUBERGINE_SKIP_BUILD: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      ...options.env,
    },
  };
}

/** Runs the installer the way the one-line form does: the script on standard input, nothing to prompt. */
function install(w: World, args: string[] = [], input: Buffer | string = readFileSync(script), shell = path.join(w.bin, 'sh')): { code: number; out: string; err: string } {
  const result = spawnSync(shell, ['-s', '--', ...args], { input, env: w.env, cwd: w.home, encoding: 'utf8', timeout: 600_000 });
  return { code: result.status ?? -1, out: result.stdout, err: result.stderr };
}

/** Everything under a folder, as paths, to show that nothing was added or removed. */
function listing(dir: string): string[] {
  const found: string[] = [];
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort()) {
      const full = path.join(at, name);
      found.push(path.relative(dir, full));
      if (lstatSync(full).isDirectory()) walk(full);
    }
  };
  walk(dir);
  return found;
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } }).trim();

beforeAll(() => {
  work = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'aubergine-install-')));
  // A repository to install from: this checkout's files as they are now, as one commit on "main".
  source = path.join(work, 'source');
  mkdirSync(source);
  const files = git(repoRoot, 'ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean);
  for (const file of files) {
    const from = path.join(repoRoot, file);
    if (!existsSync(from)) continue;
    mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    cpSync(from, path.join(source, file));
  }
  git(source, 'init', '--quiet', '--initial-branch', 'main');
  git(source, 'add', '-A');
  git(source, 'commit', '--quiet', '-m', 'A copy for the installer test');
}, 120_000);

afterAll(() => {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('install.sh', () => {
  it('installs into a fresh home and links the command in a folder on PATH', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    const result = install(w);
    expect(result.err).toBe('');
    expect(result.code).toBe(0);

    const app = path.join(w.home, '.aubergine', 'app');
    expect(existsSync(path.join(app, 'bin', 'aubergine.mjs'))).toBe(true);
    expect(existsSync(path.join(app, '.git'))).toBe(true);
    const link = path.join(w.home, '.local', 'bin', 'aubergine');
    expect(readlinkSync(link)).toBe(path.join(app, 'bin', 'aubergine.mjs'));

    // It says what it is about to do before doing it, and what comes next.
    expect(result.out.indexOf('This will:')).toBeLessThan(result.out.indexOf('Downloading the code'));
    expect(result.out).toContain(`link the command: ${link}`);
    expect(result.out).toContain('aubergine start');
    expect(result.out).not.toContain('is not on your PATH');
    // Nothing else appeared in the home folder.
    expect(readdirSync(w.home).sort()).toEqual(['.aubergine', '.local']);
  });

  it.runIf(existsSync('/bin/dash'))('runs under a plain POSIX shell, not only the one that happens to be sh here', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    const result = install(w, [], readFileSync(script), '/bin/dash');
    expect(result.err).toBe('');
    expect(result.code).toBe(0);
    expect(existsSync(path.join(w.home, '.local', 'bin', 'aubergine'))).toBe(true);
    // And the paths that print the most: nothing usable on PATH, and a tool missing.
    expect(install(world(), [], readFileSync(script), '/bin/dash').out).toContain('is not on your PATH yet');
    const missing = install(world({ tmux: null, node: '18.0.0' }), [], readFileSync(script), '/bin/dash');
    expect(missing.code).toBe(1);
    expect(missing.out).toContain('tmux is not installed');
    expect(missing.out).toContain('Node.js 18.0.0 is too old');
  });

  it('runs pnpm install and pnpm build in the install folder', () => {
    const w = world({ pathDirs: ['~/.local/bin'], env: { AUBERGINE_SKIP_BUILD: '0' } });
    const result = install(w);
    expect(result.code).toBe(0);
    expect(readFileSync(path.join(w.home, '..', 'pnpm.log'), 'utf8')).toBe('pnpm install --frozen-lockfile\npnpm build\n');
  });

  it('updates in place on a second run, and is safe to repeat', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    expect(install(w).code).toBe(0);
    const app = path.join(w.home, '.aubergine', 'app');
    const before = git(app, 'rev-parse', 'HEAD');

    writeFileSync(path.join(source, 'NEWS'), 'a later change\n');
    git(source, 'add', 'NEWS');
    git(source, 'commit', '--quiet', '-m', 'A later change');
    try {
      const again = install(w);
      expect(again.err).toBe('');
      expect(again.code).toBe(0);
      expect(again.out).toContain(`update the code in ${app}`);
      expect(readFileSync(path.join(app, 'NEWS'), 'utf8')).toBe('a later change\n');
      expect(git(app, 'rev-parse', 'HEAD')).not.toBe(before);
      expect(readlinkSync(path.join(w.home, '.local', 'bin', 'aubergine'))).toBe(path.join(app, 'bin', 'aubergine.mjs'));

      // A third run with nothing new changes nothing and still succeeds.
      const head = git(app, 'rev-parse', 'HEAD');
      expect(install(w).code).toBe(0);
      expect(git(app, 'rev-parse', 'HEAD')).toBe(head);
    } finally {
      git(source, 'reset', '--quiet', '--hard', 'HEAD~1');
    }
  });

  it('refuses to update a copy that was changed by hand, and leaves it as it is', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    expect(install(w).code).toBe(0);
    const app = path.join(w.home, '.aubergine', 'app');
    writeFileSync(path.join(app, 'README.md'), 'my own notes\n');
    const again = install(w);
    expect(again.code).toBe(1);
    expect(again.err).toContain('has been changed by hand');
    expect(readFileSync(path.join(app, 'README.md'), 'utf8')).toBe('my own notes\n');
  });

  it('with --dry-run prints the plan and changes nothing', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    const before = listing(w.home);
    const result = install(w, ['--dry-run']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('This will:');
    expect(result.out).toContain(`download the code into ${path.join(w.home, '.aubergine', 'app')}`);
    expect(result.out).toContain('Dry run: nothing was changed.');
    expect(listing(w.home)).toEqual(before);
    expect(existsSync(path.join(w.home, '..', 'pnpm.log'))).toBe(false);
  });

  it('creates ~/.local/bin when no folder on PATH can be used, and says the one line to add', () => {
    const w = world();
    const result = install(w);
    expect(result.code).toBe(0);
    const link = path.join(w.home, '.local', 'bin', 'aubergine');
    expect(readlinkSync(link)).toBe(path.join(w.home, '.aubergine', 'app', 'bin', 'aubergine.mjs'));
    expect(result.out).toContain(`${path.join(w.home, '.local', 'bin')} is not on your PATH yet`);
    expect(result.out).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(result.out).toContain(`Add this line to ${path.join(w.home, '.zshrc')}`);
    // It names the startup file; it does not write it.
    expect(existsSync(path.join(w.home, '.zshrc'))).toBe(false);
  });

  it('prefers the first usable folder: ~/.local/bin before ~/bin, and ~/bin when that is the one on PATH', () => {
    const both = world({ pathDirs: ['~/bin', '~/.local/bin'] });
    expect(install(both).code).toBe(0);
    expect(existsSync(path.join(both.home, '.local', 'bin', 'aubergine'))).toBe(true);
    expect(existsSync(path.join(both.home, 'bin', 'aubergine'))).toBe(false);

    const onlyBin = world({ pathDirs: ['~/bin'] });
    expect(install(onlyBin).code).toBe(0);
    expect(existsSync(path.join(onlyBin.home, 'bin', 'aubergine'))).toBe(true);
    expect(existsSync(path.join(onlyBin.home, '.local'))).toBe(false);
  });

  it("uses Homebrew's folder when brew exists and that folder can be written to", () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    const prefix = path.join(w.home, '..', 'brew');
    mkdirSync(path.join(prefix, 'bin'), { recursive: true });
    writeFileSync(path.join(w.bin, 'brew'), `#!/bin/sh\necho "${prefix}"\n`);
    chmodSync(path.join(w.bin, 'brew'), 0o755);
    w.env.PATH = `${w.env.PATH}:${path.join(prefix, 'bin')}`;
    expect(install(w).code).toBe(0);
    expect(existsSync(path.join(prefix, 'bin', 'aubergine'))).toBe(true);
    expect(existsSync(path.join(w.home, '.local', 'bin', 'aubergine'))).toBe(false);
  });

  it('leaves alone whatever else is at the place of the link, and says so', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    const link = path.join(w.home, '.local', 'bin', 'aubergine');
    writeFileSync(link, '#!/bin/sh\necho mine\n');
    const result = install(w);
    expect(result.code).toBe(0);
    expect(readFileSync(link, 'utf8')).toBe('#!/bin/sh\necho mine\n');
    expect(result.out).toContain(`leave ${link} alone`);
    expect(result.out).toContain('Not linked');
    expect(result.out).toContain(path.join(w.home, '.aubergine', 'app', 'bin', 'aubergine.mjs'));

    // A link that points somewhere else is not ours either.
    const other = world({ pathDirs: ['~/.local/bin'] });
    const otherLink = path.join(other.home, '.local', 'bin', 'aubergine');
    symlinkSync('/somewhere/else/aubergine.mjs', otherLink);
    expect(install(other).code).toBe(0);
    expect(readlinkSync(otherLink)).toBe('/somewhere/else/aubergine.mjs');
  });

  it('stops when tmux is missing, says how to get it, and changes nothing', () => {
    const w = world({ tmux: null, pathDirs: ['~/.local/bin'] });
    const before = listing(w.home);
    const result = install(w);
    expect(result.code).toBe(1);
    expect(result.out).toContain('tmux is not installed (version 3.2 or newer is needed)');
    expect(result.out).toMatch(/brew install tmux|apt install tmux/);
    expect(result.out).toContain('Without admin rights');
    expect(result.err).toContain('Nothing was installed or changed');
    expect(listing(w.home)).toEqual(before);
  });

  it('stops when tmux or Node is too old, naming the version found', () => {
    const oldTmux = install(world({ tmux: '3.1c' }));
    expect(oldTmux.code).toBe(1);
    expect(oldTmux.out).toContain('tmux 3.1c is too old: version 3.2 or newer is needed');
    expect(install(world({ tmux: '3.2a' })).code).toBe(0);
    expect(install(world({ tmux: 'next-3.6' })).code).toBe(0);
    expect(install(world({ tmux: '2.9' })).code).toBe(1);

    const w = world({ node: '18.19.0' });
    const before = listing(w.home);
    const oldNode = install(w);
    expect(oldNode.code).toBe(1);
    expect(oldNode.out).toContain('Node.js 18.19.0 is too old: version 22 or newer is needed');
    expect(listing(w.home)).toEqual(before);
  });

  it('names everything that is missing at once', () => {
    const result = install(world({ node: null, tmux: null, pnpm: null }));
    expect(result.code).toBe(1);
    expect(result.out).toContain('Node.js is not installed');
    expect(result.out).toContain('pnpm is not installed');
    expect(result.out).toContain('tmux is not installed');
  });

  it('does nothing when the download was cut off', () => {
    const whole = readFileSync(script, 'utf8');
    // Cut at several places, each inside the script: the last line, which starts it, is never reached.
    for (const fraction of [0.2, 0.5, 0.8, 0.99]) {
      const w = world({ pathDirs: ['~/.local/bin'] });
      const before = listing(w.home);
      const cut = whole.slice(0, Math.floor(whole.length * fraction));
      const result = install(w, [], cut.slice(0, cut.lastIndexOf('\n') + 1));
      expect(result.out, `cut at ${fraction}`).toBe('');
      expect(listing(w.home), `cut at ${fraction}`).toEqual(before);
    }
    expect(whole.trimEnd().endsWith('main "$@"')).toBe(true);
  });

  it('installs from an archive when there is no git, and updates by replacing it', () => {
    const archive = path.join(work, 'main.tar.gz');
    execFileSync('git', ['archive', '--format=tar.gz', '--prefix=aubergine-main/', '-o', archive, 'main'], { cwd: source });
    const w = world({ git: false, pathDirs: ['~/.local/bin'], env: { AUBERGINE_ARCHIVE: `file://${archive}` } });
    const result = install(w);
    expect(result.err).toBe('');
    expect(result.code).toBe(0);
    expect(result.out).toContain('as an archive');
    const app = path.join(w.home, '.aubergine', 'app');
    expect(existsSync(path.join(app, 'bin', 'aubergine.mjs'))).toBe(true);
    expect(existsSync(path.join(app, '.git'))).toBe(false);
    expect(existsSync(path.join(app, '.installed-from-archive'))).toBe(true);
    expect(install(w).code).toBe(0);
    expect(readdirSync(path.join(w.home, '.aubergine')).sort()).toEqual(['.installed-by-installer', 'app']);
  });

  it('will not write over a folder it did not make', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    const app = path.join(w.home, '.aubergine', 'app');
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, 'thesis.txt'), 'important\n');
    const result = install(w);
    expect(result.code).toBe(1);
    expect(result.err).toContain('was not put there by this installer');
    expect(readFileSync(path.join(app, 'thesis.txt'), 'utf8')).toBe('important\n');
  });

  it('installs under AUBERGINE_HOME when that is set', () => {
    const w = world({ pathDirs: ['~/.local/bin'] });
    w.env.AUBERGINE_HOME = path.join(w.home, 'tools', 'aubergine');
    expect(install(w).code).toBe(0);
    expect(existsSync(path.join(w.home, 'tools', 'aubergine', 'app', 'bin', 'aubergine.mjs'))).toBe(true);
    expect(existsSync(path.join(w.home, '.aubergine'))).toBe(false);
  });

  // The whole thing once, for real: the dependencies are installed and the web app is built,
  // and the linked command runs. Everything else in this file skips those two steps.
  it('installs end to end: dependencies, build, and a command that runs', () => {
    const realPnpm = whereIs('pnpm');
    if (!realPnpm) return;
    const w = world({ pnpm: 'real', pathDirs: ['~/.local/bin'], env: { AUBERGINE_SKIP_BUILD: '0' } });
    // The packages come from the store pnpm already has, not from a new one in the temporary home.
    w.env.npm_config_store_dir = execFileSync(realPnpm, ['store', 'path'], { encoding: 'utf8' }).trim();
    w.env.CI = 'true';
    const result = install(w);
    expect(result.code, result.out + result.err).toBe(0);

    const app = path.join(w.home, '.aubergine', 'app');
    expect(existsSync(path.join(app, 'node_modules'))).toBe(true);
    expect(existsSync(path.join(app, 'web', 'dist', 'index.html'))).toBe(true);
    expect(result.out).toContain('Aubergine is installed in');

    // The command, found by name on the PATH the installer linked into.
    const run = (args: string): { code: number; out: string } => {
      const done = spawnSync(path.join(w.bin, 'sh'), ['-c', `aubergine ${args}`], { env: { ...w.env, AUBERGINE_DATA_DIR: path.join(w.home, 'data'), AUBERGINE_PORT: '1' }, cwd: w.home, encoding: 'utf8', timeout: 60_000 });
      return { code: done.status ?? -1, out: done.stdout + done.stderr };
    };
    const version = run('version');
    expect(version.code, version.out).toBe(0);
    expect(version.out).toContain(`Installed in: ${app}`);
    expect(version.out).toMatch(/\(commit [0-9a-f]+\)/);
    const doctor = run('doctor');
    expect(doctor.out).toContain('ok  the web app is built');
    expect(doctor.out).toContain('ok  dependencies are installed');
    expect(doctor.out).toContain(`ok  the "aubergine" command is on your PATH: ${path.join(w.home, '.local', 'bin', 'aubergine')}`);

    // Uninstalling removes the link and the code, and leaves the data.
    mkdirSync(path.join(w.home, 'data'));
    writeFileSync(path.join(w.home, 'data', 'state.json'), '{}');
    const removed = run('uninstall --yes');
    expect(removed.code, removed.out).toBe(0);
    expect(removed.out).toContain('rm -rf');
    expect(existsSync(path.join(w.home, '.aubergine'))).toBe(false);
    expect(existsSync(path.join(w.home, '.local', 'bin', 'aubergine'))).toBe(false);
    expect(readFileSync(path.join(w.home, 'data', 'state.json'), 'utf8')).toBe('{}');
  }, 600_000);

  it('never asks for more rights, and never writes a startup file', () => {
    const text = readFileSync(script, 'utf8');
    const code = text.split('\n').filter((line) => !line.trim().startsWith('#') && !/\bsay\b/.test(line)).join('\n');
    expect(code).not.toMatch(/\bsudo\b/);
    expect(code).not.toMatch(/>>?\s*"?\$HOME\/\.(zshrc|bashrc|profile|bash_profile)/);
  });
});
