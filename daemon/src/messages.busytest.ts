import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { INBOX_LINE, SESSION_ENV, paths, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { pathWithCommand, writeCommandLauncher } from './command-path';
import { TmuxRuntime, shellEnvironment } from './runtime/tmux-runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile } from './settings';
import { ZshIntegration } from './shell/integration';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, standInProgram, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p));
const COMMAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'aubergine.mjs');
const run = promisify(execFile);

/**
 * Messages the whole way round, in real terminals: two stand-in agents that
 * answer every message they get, with the real `aubergine` command, set off
 * by the fixed sentence. The thread between them pauses, and the owner is told.
 */
describe.runIf(ZSH)('two stand-in agents that answer every message', () => {
  const socket = testSocketName('messages');
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
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-messages-agents-')));
    data = path.join(dir, 'data');
    const userDir = path.join(dir, 'user');
    await mkdir(data);
    await mkdir(userDir);
    await writeFile(path.join(userDir, '.zshrc'), "PROMPT='ready> '\nunset HISTFILE\n");
    ownerToken = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    await writeFile(path.join(data, SETTINGS_FILE), JSON.stringify({ messages: { pauseAfter: 4, nudgeIntervalSeconds: 1 } }));
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

  const envOf = (session: Session): NodeJS.ProcessEnv => ({ PATH: process.env.PATH ?? '', HOME: path.join(dir, 'no-home'), [SESSION_ENV.url]: `http://127.0.0.1:${port}`, [SESSION_ENV.sessionId]: session.id, [SESSION_ENV.token]: sessionToken(ownerToken, session.id) });
  const asSession = (session: Session, ...args: string[]): Promise<{ stdout: string; code: number }> =>
    run(process.execPath, [COMMAND, ...args], { env: envOf(session) }).then(
      ({ stdout }) => ({ stdout, code: 0 }),
      (error: { stdout?: string; code?: number }) => ({ stdout: error.stdout ?? '', code: error.code ?? 1 }),
    );
  const stateOf = (session: Session): Session => hub.state.sessions.find((s) => s.id === session.id)!;

  /** Starts a stand-in in a new terminal: told that a message waits, it reads its inbox and answers each one, as an agent that cannot help itself would. */
  async function standIn(name: string): Promise<Session> {
    const { session } = await sessions.create({ name });
    await until(`the prompt of ${name}`, async () => (await runtime.snapshot(session.id)).includes('ready>'));
    const script = path.join(dir, `${name}.sh`);
    const seen = path.join(dir, `${name}.inbox`);
    await writeFile(
      script,
      [
        '#!/bin/sh',
        'aubergine="$AUBERGINE_BIN/aubergine"',
        'echo listening',
        'while IFS= read -r line; do',
        '  case "$line" in',
        '    *"aubergine inbox"*)',
        '      "$aubergine" attention working > /dev/null 2>&1',
        `      "$aubergine" inbox > ${seen}.now 2>&1`,
        `      cat ${seen}.now >> ${seen}`,
        // Every message is answered, whatever it says: the loop the limits are there for.
        `      sed -n 's/^Message \\([0-9a-f-]*\\) from .*/\\1/p' ${seen}.now | while IFS= read -r id; do "$aubergine" reply "$id" "answer from ${name}" >> ${seen}.replies 2>&1; done`,
        '      echo answered',
        '      "$aubergine" attention done > /dev/null 2>&1',
        '      ;;',
        '  esac',
        'done',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    await runtime.typeLine(session.id, `${await standInProgram(dir)} ${script}`);
    await until(`${name} to listen`, async () => (await runtime.snapshot(session.id)).includes('listening'));
    // It says an agent runs in it, as an agent's hooks do.
    expect((await app.inject({ method: 'PUT', url: `/v1/sessions/${session.id}/agent`, headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${sessionToken(ownerToken, session.id)}` }, payload: { kind: 'claude-code' } })).statusCode).toBe(200);
    return session;
  }
  const text = (name: string): Promise<string> => readFile(path.join(dir, name), 'utf8').catch(() => '');

  it('are stopped by the limit on their thread, and the owner is told', async () => {
    const ping = await standIn('ping');
    const pong = await standIn('pong');

    // Off, as every canvas starts: the real command is refused, and nothing reaches the other terminal.
    const closed = await asSession(ping, 'tell', 'pong', 'SECRET-OPENING-LINE-4417');
    expect(closed.code).toBe(1);
    expect(closed.stdout).toMatch(/only on a canvas where the owner switched that on/);
    expect(stateOf(pong).messages.unread).toBe(0);

    expect((await asOwner('PUT', paths.canvasMessaging(hub.state.canvases[0]!.id), { sessions: true })).status).toBe(200);
    const opened = await asSession(ping, 'tell', 'pong', 'SECRET-OPENING-LINE-4417');
    expect(opened.code).toBe(0);
    expect(opened.stdout).toContain('Sent to the terminal "pong"');

    // They go back and forth by themselves until the thread pauses: four messages, and no more.
    await until('the thread to pause', () => stateOf(ping).messages.paused === 1 && stateOf(pong).messages.paused === 1);
    const threads = ((await asOwner('GET', paths.messageThreads)).body as { threads: { id: string; state: string; turns: number; total: number; parties: { name?: string }[] }[] }).threads;
    expect(threads.map((t) => [t.state, t.turns, t.total, t.parties.map((p) => p.name).sort()])).toEqual([['paused', 4, 4, ['ping', 'pong']]]);

    // It stays stopped: nothing more passes, and each is told why in a sentence when it tries.
    await sleep(2500);
    expect(((await asOwner('GET', paths.messageThread(threads[0]!.id))).body as { messages: unknown[] }).messages).toHaveLength(4);
    const more = await asSession(ping, 'tell', 'pong', 'one more');
    expect(more.code).toBe(1);
    expect(more.stdout).toMatch(/paused until the owner has looked at it: 4 messages have passed between the two of you/);

    // What each read was the other's text between marks, with who sent it.
    expect(await text('pong.inbox')).toMatch(/Message [0-9a-f-]{36} from the terminal "ping", a moment ago:\n<<<message ([0-9a-f]{12})\nSECRET-OPENING-LINE-4417\nmessage \1>>>/);
    expect(await text('ping.inbox')).toContain('answer from pong');
    // What was typed into each terminal was the fixed sentence and never a word of a message.
    for (const session of [ping, pong]) {
      const screen = await runtime.snapshot(session.id);
      expect(screen).toContain(INBOX_LINE.slice(0, 40));
      expect(screen).not.toContain('SECRET-OPENING-LINE-4417');
      expect(screen).not.toContain('answer from');
    }

    // The owner lets it go on: the one that has an unread message is told, and they go on to the next pause.
    expect((await asOwner('POST', paths.messageThread(threads[0]!.id), { action: 'continue' })).status).toBe(200);
    await until('the thread to pause again', async () => ((await asOwner('GET', paths.messageThread(threads[0]!.id))).body as { thread: { state: string }; messages: unknown[] }).messages.length === 8);
    expect(stateOf(ping).messages.paused).toBe(1);
    // And stops it for good.
    expect((await asOwner('POST', paths.messageThread(threads[0]!.id), { action: 'stop' })).status).toBe(200);
    expect((await asSession(pong, 'tell', 'ping', 'after the stop')).stdout).toMatch(/has stopped this thread/);
  });
});
