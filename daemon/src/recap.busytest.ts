import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { RECAP_WANTED, SESSION_ENV } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { pathWithCommand, writeCommandLauncher } from './command-path';
import { TmuxRuntime, shellEnvironment } from './runtime/tmux-runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { ZshIntegration } from './shell/integration';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p));
const COMMAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'aubergine.mjs');
const run = promisify(execFile);

/**
 * The written recap, the whole way round: the owner asks, the fixed sentence
 * is typed into a real terminal, a stand-in agent does what it says with the
 * real `aubergine` command, and the owner reads the result.
 */
describe.runIf(ZSH)('a recap written by a stand-in agent', () => {
  const socket = testSocketName('recap');
  const runtime = new TmuxRuntime({ socket });
  let dir: string;
  let data: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let sessions: Sessions;
  let port = 0;
  let ownerToken: string;

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-recap-agent-')));
    data = path.join(dir, 'data');
    const userDir = path.join(dir, 'user');
    await mkdir(data);
    await mkdir(userDir);
    await writeFile(path.join(userDir, '.zshrc'), "PROMPT='ready> '\nunset HISTFILE\n");
    ownerToken = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    const settings = new SettingsFile(data);
    await settings.reload();
    const commandFolder = await writeCommandLauncher(data);
    sessions = new Sessions(hub, runtime, {
      integration: new ZshIntegration(path.join(data, 'shell'), userDir),
      shell: () => ZSH as string,
      defaultFolder: () => dir,
      sessionEnv: (sessionId) => ({
        [SESSION_ENV.url]: `http://127.0.0.1:${port}`,
        [SESSION_ENV.sessionId]: sessionId,
        [SESSION_ENV.token]: sessionToken(ownerToken, sessionId),
        [SESSION_ENV.bin]: commandFolder,
        PATH: pathWithCommand(shellEnvironment(process.env).PATH ?? '', commandFolder),
      }),
    });
    app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, socket);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function asOwner(method: string, url: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, ...(body === undefined ? {} : { payload: body as object }) });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
  }
  async function until(what: string, check: () => Promise<boolean> | boolean): Promise<void> {
    const started = Date.now();
    while (!(await check())) {
      if (Date.now() - started > 30_000) throw new Error(`Waited in vain for ${what}. Terminal:\n${await runtime.snapshot(hub.state.sessions[0]?.id ?? '').catch(() => '')}`);
      await sleep(50);
    }
  }

  it('is asked for with the fixed sentence, written with the command, and read by the owner', async () => {
    const { session } = await sessions.create({ name: 'the writer' });
    await until('the prompt', async () => (await runtime.snapshot(session.id)).includes('ready>'));
    // The stand-in agent: it reads what is typed to it, and when told to run the command, does so, then hands in what it wrote.
    const agent = path.join(dir, 'stand-in-agent.sh');
    await writeFile(
      agent,
      [
        '#!/bin/sh',
        'aubergine="$AUBERGINE_BIN/aubergine"',
        'echo listening',
        'while IFS= read -r line; do',
        '  case "$line" in',
        '    *"aubergine recap --write"*)',
        `      "$aubergine" recap --write < /dev/null > ${path.join(dir, 'wanted.txt')} 2>&1`,
        `      printf '%s\\n' 'The goal is to fix the login redirect. The cause is found. The test is left. Decide about the back-port.' | "$aubergine" recap --write > ${path.join(dir, 'handed.txt')} 2>&1`,
        '      echo handed-in',
        '      ;;',
        '  esac',
        'done',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    await runtime.typeLine(session.id, `sh ${agent}`);
    await until('the stand-in to listen', async () => (await runtime.snapshot(session.id)).includes('listening'));
    // It says an agent runs in it, as an agent's hooks do.
    expect((await app.inject({ method: 'PUT', url: `/v1/sessions/${session.id}/agent`, headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${sessionToken(ownerToken, session.id)}` }, payload: { kind: 'claude-code' } })).statusCode).toBe(200);

    expect((await asOwner('POST', `/api/v1/sessions/${session.id}/recap-request`, {})).body).toMatchObject({ asked: true });
    await until('the recap to be handed in', () => hub.state.sessions.find((s) => s.id === session.id)?.recap !== null);

    // With nothing handed to it, the command prints what is wanted, word for word; with something, it stores it.
    expect((await readFile(path.join(dir, 'wanted.txt'), 'utf8')).trim()).toBe(RECAP_WANTED);
    expect((await readFile(path.join(dir, 'handed.txt'), 'utf8')).trim()).toBe('Handed in. Your owner sees it on this terminal.');
    const kept = hub.state.sessions.find((s) => s.id === session.id)?.recap;
    expect(kept?.text).toBe('The goal is to fix the login redirect. The cause is found. The test is left. Decide about the back-port.');

    // The owner reads it on the command line: what is known, then the agent's words, labelled as such.
    const env = { ...process.env, AUBERGINE_PORT: String(port), AUBERGINE_DATA_DIR: data, AUBERGINE_TMUX_SOCKET: socket };
    delete (env as Record<string, string | undefined>)[SESSION_ENV.sessionId];
    const shown = (await run(process.execPath, [COMMAND, 'recap', 'the writer'], { env })).stdout;
    expect(shown).toMatch(/^the writer in .*: started a moment ago\./);
    expect(shown).toContain('What its agent wrote, a moment ago');
    expect(shown).toContain('  The goal is to fix the login redirect. The cause is found. The test is left. Decide about the back-port.');

    // Too long is refused by the command itself, in a sentence, and nothing changes.
    const long = path.join(dir, 'long.txt');
    await writeFile(long, 'x'.repeat(2500));
    const refused = await run(process.execPath, [COMMAND, 'recap', '--write', '--file', long], { env: { ...env, [SESSION_ENV.url]: `http://127.0.0.1:${port}`, [SESSION_ENV.sessionId]: session.id, [SESSION_ENV.token]: sessionToken(ownerToken, session.id) } }).catch((error: { stderr: string }) => error);
    expect((refused as { stderr: string }).stderr).toContain('a recap is at most 2000');
    expect(hub.state.sessions.find((s) => s.id === session.id)?.recap).toEqual(kept);
  });
});
