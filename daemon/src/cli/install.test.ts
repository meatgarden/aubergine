import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_SETTINGS } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TmuxRuntime } from '../runtime/tmux-runtime';
import { buildServer } from '../server';
import { Sessions } from '../sessions';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { destroyTmuxServer, testSocketName } from '../test-support';
import { loadOrCreateToken } from '../token';
import { entryArguments, packageRoot } from '../package-root';
import {
  ARCHIVE_MARK,
  INSTALLER_MARK,
  NPM_MARK,
  commandOnPath,
  copyKind,
  ensureBuilt,
  findLinks,
  formatChecks,
  formatVersion,
  installRoot,
  linkFolders,
  madeByInstaller,
  removeCopy,
  uninstallPlan,
  update,
  versionInfo,
  whoAnswers,
} from './install';

const run = promisify(execFile);
const COMMAND = fileURLToPath(new URL('../../../bin/aubergine.mjs', import.meta.url));

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'aubergine-copy-')));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv }).trim();

/** A stand-in copy: the files `uninstall` and `findLinks` look at, nothing more. */
function fakeCopy(base: string, options: { byInstaller?: boolean } = {}): string {
  const root = path.join(base, 'app');
  mkdirSync(path.join(root, 'bin'), { recursive: true });
  mkdirSync(path.join(root, 'daemon'), { recursive: true });
  writeFileSync(path.join(root, 'bin', 'aubergine.mjs'), '#!/usr/bin/env node\n');
  writeFileSync(path.join(root, 'daemon', 'package.json'), JSON.stringify({ version: '9.9.9' }));
  if (options.byInstaller) writeFileSync(path.join(base, INSTALLER_MARK), '');
  return root;
}

describe('what kind of copy this is', () => {
  it('tells a git checkout, an archive install and a plain folder apart', () => {
    const root = fakeCopy(dir);
    expect(copyKind(root)).toBe('folder');
    writeFileSync(path.join(root, ARCHIVE_MARK), '');
    expect(copyKind(root)).toBe('archive');
    mkdirSync(path.join(root, '.git'));
    expect(copyKind(root)).toBe('git');
  });

  it('knows a copy the installer made from one someone made themselves', () => {
    expect(madeByInstaller(fakeCopy(path.join(dir, 'a'), { byInstaller: true }))).toBe(true);
    expect(madeByInstaller(fakeCopy(path.join(dir, 'b')))).toBe(false);
    // The mark beside a folder with another name does not count.
    const other = path.join(dir, 'c', 'checkout');
    mkdirSync(other, { recursive: true });
    writeFileSync(path.join(dir, 'c', INSTALLER_MARK), '');
    expect(madeByInstaller(other)).toBe(false);
    // This very checkout was not made by the installer.
    expect(madeByInstaller(installRoot())).toBe(false);
  });

  it('reports version, commit, and both folders', () => {
    const root = fakeCopy(dir);
    const info = versionInfo(root, { dataDir: '/data/aubergine' });
    expect(info).toEqual({ version: '9.9.9', commit: null, kind: 'folder', root, dataDir: '/data/aubergine' });
    expect(formatVersion(info)).toBe(`Aubergine 9.9.9 (not a git checkout)\nInstalled in: ${root}\nData folder:  /data/aubergine`);
    expect(formatVersion({ ...info, kind: 'git', commit: 'abc1234' })).toContain('(commit abc1234)');
    expect(formatVersion(versionInfo(installRoot(), { dataDir: '/d' }))).toMatch(/^Aubergine \d+\.\d+\.\d+ \(commit [0-9a-f]{7,}\)/);
  });
});

describe('links to the command', () => {
  it('finds links to this copy, and nothing else', () => {
    const root = fakeCopy(dir);
    const target = path.join(root, 'bin', 'aubergine.mjs');
    const a = path.join(dir, 'a');
    const b = path.join(dir, 'b');
    const c = path.join(dir, 'c');
    const d = path.join(dir, 'd');
    for (const folder of [a, b, c, d]) mkdirSync(folder);
    symlinkSync(target, path.join(a, 'aubergine'));
    writeFileSync(path.join(b, 'aubergine'), '#!/bin/sh\necho mine\n'); // a file with the same name
    symlinkSync('/somewhere/else/aubergine.mjs', path.join(c, 'aubergine')); // another copy's link
    symlinkSync(path.join('..', 'app', 'bin', 'aubergine.mjs'), path.join(d, 'aubergine')); // a relative link to this copy
    expect(findLinks(root, [a, b, c, d, path.join(dir, 'missing')])).toEqual([path.join(a, 'aubergine'), path.join(d, 'aubergine')]);
  });

  it('looks on PATH and in the two folders of the home folder', () => {
    expect(linkFolders({ PATH: '/one:/two::/one' }, '/home/pat')).toEqual(['/one', '/two', '/home/pat/.local/bin', '/home/pat/bin']);
  });

  it('says what a shell would find, and whether that is this copy', () => {
    const root = fakeCopy(dir);
    const mine = path.join(dir, 'mine');
    const theirs = path.join(dir, 'theirs');
    mkdirSync(mine);
    mkdirSync(theirs);
    symlinkSync(path.join(root, 'bin', 'aubergine.mjs'), path.join(mine, 'aubergine'));
    writeFileSync(path.join(theirs, 'aubergine'), '');
    expect(commandOnPath(root, { PATH: `${mine}:${theirs}` })).toEqual({ file: path.join(mine, 'aubergine'), ours: true });
    expect(commandOnPath(root, { PATH: `${theirs}:${mine}` })).toEqual({ file: path.join(theirs, 'aubergine'), ours: false });
    expect(commandOnPath(root, { PATH: path.join(dir, 'empty') })).toBeNull();
  });
});

describe('uninstall', () => {
  it('removes the link and the installer\'s folder, and nothing of the data', () => {
    const base = path.join(dir, '.aubergine');
    const root = fakeCopy(base, { byInstaller: true });
    const bin = path.join(dir, 'bin');
    const data = path.join(dir, 'data');
    mkdirSync(bin);
    mkdirSync(data);
    writeFileSync(path.join(data, 'state.json'), '{}');
    symlinkSync(path.join(root, 'bin', 'aubergine.mjs'), path.join(bin, 'aubergine'));
    writeFileSync(path.join(bin, 'other-tool'), '');

    const plan = uninstallPlan(root, [bin], path.join(dir, 'no-service.plist'));
    expect(plan).toEqual({ links: [path.join(bin, 'aubergine')], folder: root, service: null });
    removeCopy(plan);
    expect(existsSync(base)).toBe(false);
    expect(existsSync(path.join(bin, 'aubergine'))).toBe(false);
    expect(existsSync(path.join(bin, 'other-tool'))).toBe(true);
    expect(readFileSync(path.join(data, 'state.json'), 'utf8')).toBe('{}');
  });

  it('keeps the folder the installer made when something else is in it', () => {
    const base = path.join(dir, '.aubergine');
    const root = fakeCopy(base, { byInstaller: true });
    writeFileSync(path.join(base, 'my-notes.txt'), 'keep');
    removeCopy(uninstallPlan(root, [], path.join(dir, 'none')));
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(path.join(base, 'my-notes.txt'), 'utf8')).toBe('keep');
  });

  it('never removes a checkout someone made themselves: only the link', () => {
    const root = fakeCopy(path.join(dir, 'code'));
    const bin = path.join(dir, 'bin');
    mkdirSync(bin);
    symlinkSync(path.join(root, 'bin', 'aubergine.mjs'), path.join(bin, 'aubergine'));
    const plan = uninstallPlan(root, [bin], path.join(dir, 'none'));
    expect(plan.folder).toBeNull();
    removeCopy(plan);
    expect(existsSync(path.join(root, 'bin', 'aubergine.mjs'))).toBe(true);
    expect(existsSync(path.join(bin, 'aubergine'))).toBe(false);
    // And for this checkout, the plan never names its folder.
    expect(uninstallPlan(installRoot(), [], path.join(dir, 'none')).folder).toBeNull();
  });

  it('notices a login service that starts this copy, and leaves one that starts another', () => {
    const root = fakeCopy(dir);
    const service = path.join(dir, 'agent.plist');
    writeFileSync(service, `<string>${path.join(root, 'daemon')}/src/main.ts</string>`);
    expect(uninstallPlan(root, [], service).service).toBe(service);
    writeFileSync(service, '<string>/another/copy/daemon/src/main.ts</string>');
    expect(uninstallPlan(root, [], service).service).toBeNull();
  });
});

describe('update', () => {
  /** A repository to update from, and a copy cloned from it with the web app "built". */
  function cloned(name = 'copy'): { origin: string; root: string } {
    const origin = path.join(dir, `${name}-origin`);
    mkdirSync(origin);
    git(origin, 'init', '--quiet', '--initial-branch', 'main');
    writeFileSync(path.join(origin, 'README.md'), 'one\n');
    git(origin, 'add', '-A');
    git(origin, 'commit', '--quiet', '-m', 'one');
    const root = path.join(dir, name);
    git(dir, 'clone', '--quiet', origin, root);
    mkdirSync(path.join(root, 'web', 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'web', 'dist', 'index.html'), '');
    writeFileSync(path.join(root, '.git', 'info', 'exclude'), 'web/\n');
    return { origin, root };
  }
  const commit = (origin: string, text: string): void => {
    writeFileSync(path.join(origin, 'README.md'), text);
    git(origin, 'commit', '--quiet', '-am', text.trim());
  };

  it('fast-forwards, installs and builds when there is something new', () => {
    const { origin, root } = cloned();
    const calls: string[] = [];
    const record = (file: string, args: string[], cwd: string): boolean => (calls.push(`${file} ${args.join(' ')} in ${path.basename(cwd)}`), true);

    expect(update(root, record)).toMatchObject({ ok: true, lines: [expect.stringMatching(/^Already up to date/)] });
    expect(calls).toEqual([]);

    commit(origin, 'two\n');
    const result = update(root, record);
    expect(result.ok).toBe(true);
    expect(result.lines[0]).toMatch(/^Updated from [0-9a-f]+ to [0-9a-f]+\.$/);
    expect(result.lines[1]).toContain('Restart the server');
    expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('two\n');
    expect(calls).toEqual(['pnpm install --frozen-lockfile in copy', 'pnpm build in copy']);
  });

  it('refuses a copy with local changes, and leaves them', () => {
    const { origin, root } = cloned();
    commit(origin, 'two\n');
    writeFileSync(path.join(root, 'README.md'), 'my change\n');
    const result = update(root, () => true);
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('has local changes');
    expect(result.lines.join('\n')).toContain('README.md');
    expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('my change\n');
  });

  it('says so when the install or the build fails', () => {
    const { origin, root } = cloned();
    commit(origin, 'two\n');
    expect(update(root, (_file, args) => args[0] !== 'install')).toMatchObject({ ok: false, lines: [expect.stringContaining('pnpm install failed')] });
    commit(origin, 'three\n');
    expect(update(root, (_file, args) => args[0] !== 'build')).toMatchObject({ ok: false, lines: [expect.stringContaining('pnpm build failed')] });
  });

  it('will not rewrite a copy that has commits of its own, or one that is not on a branch', () => {
    const { origin, root } = cloned();
    commit(origin, 'two\n');
    writeFileSync(path.join(root, 'local.txt'), 'x');
    git(root, 'add', 'local.txt');
    git(root, 'commit', '--quiet', '-m', 'mine');
    expect(update(root, () => true).lines[0]).toContain('has commits of its own');

    const detached = cloned('detached');
    git(detached.root, 'checkout', '--quiet', '--detach');
    expect(update(detached.root, () => true).lines[0]).toContain('is not on a branch');
  });

  it('tells a copy that is not a git checkout to run the installer again', () => {
    const root = fakeCopy(dir);
    writeFileSync(path.join(root, ARCHIVE_MARK), '');
    const result = update(root, () => true);
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('Run the installer again');
    expect(result.lines.join('\n')).toContain('install.sh | sh');
  });
});

describe('building before the first start', () => {
  it('builds only when the web app is missing, installing dependencies first if they are', () => {
    const root = fakeCopy(dir);
    const calls: string[] = [];
    const said: string[] = [];
    const build = (_file: string, args: string[]): boolean => {
      calls.push(args.join(' '));
      if (args[0] === 'build') {
        mkdirSync(path.join(root, 'web', 'dist'), { recursive: true });
        writeFileSync(path.join(root, 'web', 'dist', 'index.html'), '');
      }
      return true;
    };
    expect(ensureBuilt(root, (line) => said.push(line), build)).toBe(true);
    expect(calls).toEqual(['install --frozen-lockfile', 'build']);
    expect(said[0]).toContain('has not been built yet');
    expect(ensureBuilt(root, (line) => said.push(line), build)).toBe(true);
    expect(calls).toHaveLength(2);

    const broken = fakeCopy(path.join(dir, 'broken'));
    mkdirSync(path.join(broken, 'node_modules'));
    expect(ensureBuilt(broken, () => {}, () => false)).toBe(false);
  });
});

describe('formatChecks', () => {
  it('gives one line per check, marked', () => {
    expect(formatChecks([{ ok: true, text: 'tmux 3.4' }, { ok: false, text: 'pnpm is not installed' }, { ok: null, text: 'the server is not running' }])).toBe(
      'ok  tmux 3.4\nx   pnpm is not installed\n-   the server is not running',
    );
  });
});

/** Something that is not Aubergine, answering HTTP on a port. */
async function somethingElse(): Promise<{ port: number; stop: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.once('data', () => socket.end('HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 2\r\nconnection: close\r\n\r\nhi'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * A port nothing is listening on, and that nothing will be given by chance:
 * tests that ask the system for "any port" get one from its own range, above
 * this one, so a port from here cannot be taken between choosing it and using it.
 */
async function freePort(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = 20_000 + Math.floor(Math.random() * 8000);
    const server = net.createServer();
    const free = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (!free) continue;
    await new Promise((resolve) => server.close(resolve));
    return port;
  }
  throw new Error('No free port found');
}

// The real command against a real server, with a data folder, home folder, port and tmux socket of the test's own.
describe('the commands, against a running server', () => {
  const SOCKET = testSocketName('cli-install');
  const runtime = new TmuxRuntime({ socket: SOCKET });
  let home: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let port: number;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await runtime.killServer();
    home = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'aubergine-cli-install-')));
    const data = path.join(home, 'data');
    const token = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    app = await buildServer({ hub, sessions: new Sessions(hub, runtime), runtime, settings: async () => DEFAULT_SETTINGS, token, devOrigin: null, webDist: path.join(home, 'no-web') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
    const { TMUX: _tmux, ...outside } = process.env;
    env = { ...outside, HOME: home, AUBERGINE_PORT: String(port), AUBERGINE_DATA_DIR: data, AUBERGINE_TMUX_SOCKET: SOCKET };
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, SOCKET);
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const aubergine = async (args: string[], extra: NodeJS.ProcessEnv = {}): Promise<{ code: number; out: string; err: string }> => {
    try {
      const result = await run(process.execPath, [COMMAND, ...args], { env: { ...env, ...extra }, cwd: home, timeout: 30_000 });
      return { code: 0, out: result.stdout, err: result.stderr };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      return { code: failed.code ?? -1, out: failed.stdout ?? '', err: failed.stderr ?? '' };
    }
  };

  it('tells this server from nothing and from something else', async () => {
    expect(await whoAnswers(port)).toBe('aubergine');
    expect(await whoAnswers(await freePort())).toBe('none');
    const other = await somethingElse();
    expect(await whoAnswers(other.port)).toBe('other');
    await other.stop();
  });

  it('version says where the code and the data are', async () => {
    const result = await aubergine(['version']);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`Installed in: ${installRoot()}`);
    expect(result.out).toContain(`Data folder:  ${path.join(home, 'data')}`);
    expect(result.out).toMatch(/Aubergine \d+\.\d+\.\d+ \(commit [0-9a-f]+\)/);
  });

  it('open --print gives an address that signs a browser in; without the flag the token is never printed', async () => {
    const printed = await aubergine(['open', '--print']);
    expect(printed.code).toBe(0);
    const address = printed.out.trim();
    expect(address).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/auth\\?token=[0-9a-f]{64}$`));
    const response = await fetch(address, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain(`aubergine_token_${port}=`);

    // With a stand-in for the system's "open", the browser gets the address and the terminal does not.
    const bin = path.join(home, 'bin');
    mkdirSync(bin, { recursive: true });
    const opened = path.join(home, 'opened.txt');
    for (const name of ['open', 'xdg-open']) {
      writeFileSync(path.join(bin, name), `#!/bin/sh\necho "$1" > "${opened}"\n`, { mode: 0o755 });
    }
    const result = await aubergine(['open'], { PATH: `${bin}:${process.env.PATH}` });
    expect(result.code).toBe(0);
    expect(result.out).toContain(`Opened http://127.0.0.1:${port} in your browser, signed in.`);
    expect(result.out + result.err).not.toMatch(/[0-9a-f]{64}/);
    for (let i = 0; i < 50 && !existsSync(opened); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(readFileSync(opened, 'utf8').trim()).toBe(address);
  });

  it('open says to start the server when it is not running', async () => {
    const result = await aubergine(['open'], { AUBERGINE_PORT: String(await freePort()) });
    expect(result.code).toBe(1);
    expect(result.err).toContain('is not answering');
    expect(result.err).toContain('aubergine start');
  });

  it('start says the server is already running instead of failing', async () => {
    const result = await aubergine(['start']);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`Aubergine is already running at http://127.0.0.1:${port}`);
  });

  it('start refuses a port that something else is using', async () => {
    const other = await somethingElse();
    const taken = other.port;
    const result = await aubergine(['start'], { AUBERGINE_PORT: String(taken) });
    await other.stop();
    expect(result.code).toBe(1);
    expect(result.err).toContain(`Something else is using port ${taken}`);
  });

  it('doctor reports one line per check, with the server answering', async () => {
    const bin = path.join(home, 'doctor-bin');
    mkdirSync(bin, { recursive: true });
    symlinkSync(COMMAND, path.join(bin, 'aubergine'));
    const result = await aubergine(['doctor'], { PATH: `${bin}:${process.env.PATH}` });
    const lines = result.out.trim().split('\n');
    expect(lines.find((line) => line.includes('Node.js'))).toMatch(/^ok {2}Node\.js \d+/);
    expect(lines.find((line) => line.includes('tmux'))).toMatch(/^ok {2}tmux \d/);
    expect(result.out).toContain(`ok  the server is answering at http://127.0.0.1:${port}`);
    expect(result.out).toContain(`ok  the "aubergine" command is on your PATH: ${path.join(bin, 'aubergine')}`);
    expect(result.out).toContain(`-   data folder: ${path.join(home, 'data')}`);
    for (const line of lines.filter((l) => l !== '' && !l.startsWith('Everything') && !/thing/.test(l))) expect(line).toMatch(/^(ok |x {2}|- {2}) /);

    // Without the command on PATH, and with no server, it says so and fails.
    const bare = await aubergine(['doctor'], { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, AUBERGINE_PORT: String(await freePort()) });
    expect(bare.out).toContain('x   the "aubergine" command is not on your PATH');
    expect(bare.out).toContain('-   the server is not running');
    expect(bare.code).toBe(1);
  });

  it('doctor lists the outside addresses, and each wrong entry as a thing to fix', async () => {
    expect((await aubergine(['doctor'])).out).toContain('-   outside addresses: none (another device cannot reach this server)');
    const file = path.join(home, 'data', 'config.json');
    writeFileSync(file, JSON.stringify({ access: { addresses: ['https://aubergine.example.test', 'http://plain.example.test'] } }));
    try {
      const result = await aubergine(['doctor']);
      expect(result.out).toContain('-   outside addresses: https://aubergine.example.test');
      expect(result.out).toMatch(/^x {3}access\.addresses: "http:\/\/plain\.example\.test" is not https/m);
      expect(result.code).toBe(1);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('doctor lists the linked pages too', async () => {
    expect((await aubergine(['doctor'])).out).toContain('-   linked pages: none');
    const file = path.join(home, 'data', 'config.json');
    writeFileSync(file, JSON.stringify({ access: { pages: ['http://127.0.0.1:4600', 'http://plain.example.test'] } }));
    try {
      const result = await aubergine(['doctor']);
      expect(result.out).toContain('-   linked pages: http://127.0.0.1:4600');
      expect(result.out).toMatch(/^x {3}access\.pages: "http:\/\/plain\.example\.test" is plain http/m);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('uninstall will not remove anything without being asked, when nobody can answer', async () => {
    const result = await aubergine(['uninstall']);
    expect(result.code).toBe(2);
    expect(result.out).toContain('This will remove:');
    expect(result.out).toContain('the installer did not put it there');
    expect(result.err).toContain('add --yes');
    expect(existsSync(COMMAND)).toBe(true);
  });
});

// The server started by the command itself, on a port, data folder and tmux socket of the test's own.
describe('aubergine start', () => {
  const SOCKET = testSocketName('cli-start');
  const runtime = new TmuxRuntime({ socket: SOCKET });

  it('serves the canvas until it is told to stop', async () => {
    const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'aubergine-start-')));
    const port = await freePort();
    const data = path.join(home, 'data');
    const { TMUX: _tmux, ...outside } = process.env;
    const child = spawn(process.execPath, [COMMAND, 'start'], { cwd: home, env: { ...outside, HOME: home, AUBERGINE_PORT: String(port), AUBERGINE_DATA_DIR: data, AUBERGINE_TMUX_SOCKET: SOCKET }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
    try {
      for (let i = 0; i < 150 && (await whoAnswers(port, 500)) !== 'aubergine'; i++) await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await whoAnswers(port)).toBe('aubergine');
      // The port can answer a moment before the line that announces it has come through the pipe.
      for (let i = 0; i < 100 && !output.includes(`http://127.0.0.1:${port}`); i++) await new Promise((resolve) => setTimeout(resolve, 50));
      expect(output).toContain(`http://127.0.0.1:${port}`);
      // The sign-in address works against the server it started.
      const token = readFileSync(path.join(data, 'token'), 'utf8').trim();
      const signedIn = await fetch(`http://127.0.0.1:${port}/auth?token=${token}`, { redirect: 'manual' });
      expect(signedIn.status).toBe(302);
    } finally {
      child.kill('SIGTERM');
      expect(await exited).toBe(0);
      expect(await whoAnswers(port, 500)).toBe('none');
      await destroyTmuxServer(runtime, SOCKET);
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }, 60_000);
});

/** A stand-in of the npm package: its own package.json, the mark, and the compiled files. */
function fakeNpmCopy(base: string): string {
  const root = path.join(base, 'lib', 'node_modules', '@someone', 'aubergine');
  mkdirSync(path.join(root, 'bin'), { recursive: true });
  mkdirSync(path.join(root, 'dist', 'chunks'), { recursive: true });
  writeFileSync(path.join(root, 'bin', 'aubergine.mjs'), '#!/usr/bin/env node\n');
  writeFileSync(path.join(root, 'dist', 'cli.mjs'), '');
  writeFileSync(path.join(root, 'dist', 'main.mjs'), '');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@someone/aubergine', version: '1.2.3' }));
  writeFileSync(path.join(root, NPM_MARK), '');
  return root;
}

describe('a copy installed with npm', () => {
  it('is found from its compiled files, at another depth than the source', () => {
    const root = fakeNpmCopy(dir);
    expect(packageRoot(path.join(root, 'dist'))).toBe(root);
    expect(packageRoot(path.join(root, 'dist', 'chunks'))).toBe(root);
    // This checkout is found from its source.
    expect(existsSync(path.join(packageRoot(), 'daemon', 'src', 'cli.ts'))).toBe(true);
  });

  it('runs its compiled files, while a checkout runs its source through tsx', () => {
    const root = fakeNpmCopy(dir);
    expect(entryArguments(root, 'main')).toEqual([path.join(root, 'dist', 'main.mjs')]);
    expect(entryArguments(root, 'cli')).toEqual([path.join(root, 'dist', 'cli.mjs')]);
    const here = entryArguments(packageRoot(), 'main');
    expect(here[0]).toMatch(/tsx/);
    expect(here[1]).toBe(path.join(packageRoot(), 'daemon', 'src', 'main.ts'));
  });

  it('says its own version and that npm installed it', () => {
    const root = fakeNpmCopy(dir);
    expect(copyKind(root)).toBe('npm');
    expect(formatVersion(versionInfo(root, { dataDir: '/d' }))).toBe(`Aubergine 1.2.3 (installed with npm)\nInstalled in: ${root}\nData folder:  /d`);
  });

  it('leaves updating and removing the code to npm, by the package\'s own name', () => {
    const root = fakeNpmCopy(dir);
    const updated = update(root, () => {
      throw new Error('nothing is run for an npm copy');
    });
    expect(updated.ok).toBe(false);
    expect(updated.lines.join('\n')).toContain('npm install -g @someone/aubergine@latest');
    // npm made the link to the command: uninstall removes neither it nor the folder.
    const bin = path.join(dir, 'bin');
    mkdirSync(bin);
    symlinkSync(path.join(root, 'bin', 'aubergine.mjs'), path.join(bin, 'aubergine'));
    const service = path.join(dir, 'agent.plist');
    writeFileSync(service, `<string>${path.join(root, 'dist')}/main.mjs</string>`);
    expect(uninstallPlan(root, [bin], service)).toEqual({ links: [], folder: null, service });
  });
});
