import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { SESSION_ENV } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { pathWithCommand, writeCommandLauncher } from './command-path';
import { FileActivityLog } from './activity';
import { FileRunArchive } from './run-archive';
import { TmuxRuntime, shellEnvironment } from './runtime/tmux-runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

/**
 * A stand-in agent in a real terminal session whose folder is inside a
 * repository that keeps a workflow. With the real command it lists what is
 * offered, is refused a run of what nobody reviewed, and is allowed it once
 * the owner has accepted that content. Then the owner's own command, typed
 * in that session, writes a workflow into the repository, and that is seen.
 */
describe('a stand-in agent and the workflows of the repository it works in', () => {
  const socket = testSocketName('repository-agent');
  const runtime = new TmuxRuntime({ socket });
  let dir: string;
  let data: string;
  let project: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let sessions: Sessions;
  let port = 0;
  let ownerToken: string;

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-repository-agent-')));
    data = path.join(dir, 'data');
    project = path.join(dir, 'home', 'project');
    await mkdir(data, { recursive: true });
    await mkdir(path.join(project, '.git'), { recursive: true });
    await mkdir(path.join(project, '.aubergine', 'workflows'), { recursive: true });
    await writeFile(
      path.join(project, '.aubergine', 'workflows', 'release.json'),
      JSON.stringify({ aubergine: 'workflow', format: 1, workflow: { name: 'Release', elements: [{ name: 'Tag it', instructions: 'Tag the release of {{task}}.' }] } }),
    );
    ownerToken = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    const settings = new SettingsFile(data);
    const commandFolder = await writeCommandLauncher(data);
    sessions = new Sessions(hub, runtime, {
      // What the server gives every session, as in `main.ts`: with it, `aubergine` in the session talks to this server and no other.
      sessionEnv: (sessionId) => ({
        [SESSION_ENV.url]: `http://127.0.0.1:${port}`,
        [SESSION_ENV.sessionId]: sessionId,
        [SESSION_ENV.token]: sessionToken(ownerToken, sessionId),
        [SESSION_ENV.bin]: commandFolder,
        PATH: pathWithCommand(shellEnvironment(process.env).PATH ?? '', commandFolder),
        AUBERGINE_PORT: String(port),
        AUBERGINE_DATA_DIR: data,
      }),
    });
    app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(data), activity: new FileActivityLog(data, 1024 * 1024), homeFolder: path.join(dir, 'home') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, socket);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  const asOwner = async (method: string, url: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const origin = `http://127.0.0.1:${port}`;
    const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, ...(body === undefined ? {} : { payload: body as object }) });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
  };

  /** Types a line into the session and waits for the file it ends by writing. */
  async function typed(sessionId: string, line: string, marker: string): Promise<string> {
    const file = path.join(dir, marker);
    await runtime.typeLine(sessionId, `${line}; echo "exit=$?" >> ${file}`);
    const deadline = Date.now() + 60_000;
    for (;;) {
      const text = await readFile(file, 'utf8').catch(() => '');
      if (text.includes('exit=')) return text;
      if (Date.now() > deadline) throw new Error(`"${line}" never finished. Terminal:\n${await runtime.snapshot(sessionId)}`);
      await sleep(50);
    }
  }

  it('lists what is offered, is refused what nobody reviewed, and runs it once the owner accepted it', async () => {
    const { session } = await sessions.create({ name: 'helper', cwd: project });
    const started = Date.now();
    while ((await runtime.snapshot(session.id)).trim() === '') {
      if (Date.now() - started > 15_000) throw new Error('The shell never showed a prompt');
      await sleep(25);
    }
    const aubergine = '"$AUBERGINE_BIN/aubergine"';

    // What the agent sees when it lists: the repository's workflow, and that it cannot be run yet.
    const list = await typed(session.id, `${aubergine} workflow list > ${dir}/list-1.txt 2>&1`, 'list-1.txt');
    expect(list).toContain('From the repository project (.aubergine/workflows):');
    expect(list).toContain('Release  (release.json)  a person has to review it first');
    expect(list).toContain('exit=0');

    // It tries to run it anyway: refused, with a failing exit code and words it can pass on.
    const refused = await typed(session.id, `${aubergine} workflow run Release --input task=v2 > ${dir}/run-1.txt 2>&1`, 'run-1.txt');
    expect(refused).toContain('"Release" (release.json) cannot be run yet. A person has to review it first');
    expect(refused).toContain('exit=1');
    expect(hub.state.runs).toEqual([]);
    // With its own token it can see what is offered, and cannot accept it.
    const own = await app.inject({ method: 'GET', url: `/v1/sessions/${session.id}/repository-workflows`, headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${sessionToken(ownerToken, session.id)}` } });
    expect(own.json().workflows.map((w: { file: string; state: string }) => [w.file, w.state])).toEqual([['release.json', 'review']]);
    const hash = own.json().workflows[0].hash as string;
    const tried = await app.inject({ method: 'POST', url: '/v1/repository-workflows/accept', headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${sessionToken(ownerToken, session.id)}` }, payload: { root: project, file: 'release.json', hash } });
    expect(tried.statusCode).toBe(403);

    // The owner reads it in the browser and accepts.
    expect((await asOwner('POST', '/v1/repository-workflows/accept', { root: project, file: 'release.json', hash })).status).toBe(200);

    // Now the same commands: listed as runnable, and run.
    expect(await typed(session.id, `${aubergine} workflow list > ${dir}/list-2.txt 2>&1`, 'list-2.txt')).toContain('Release  (release.json)  can be run');
    const ran = await typed(session.id, `${aubergine} workflow run release.json --input task=v2 > ${dir}/run-2.txt 2>&1`, 'run-2.txt');
    expect(ran).toContain('Started "Release" from the repository on "helper": Tag it · 1 of 1.');
    expect(ran).toContain('exit=0');
    expect(hub.state.runs).toHaveLength(1);
    const status = await typed(session.id, `${aubergine} workflow status > ${dir}/status.txt 2>&1`, 'status.txt');
    expect(status).toContain('Tag the release of v2.');
    await typed(session.id, `${aubergine} workflow done --note tagged > ${dir}/done.txt 2>&1`, 'done.txt');
    expect(hub.state.runs).toEqual([]);

    // The owner's command, typed in the session, writes one of their workflows into the repository.
    await asOwner('POST', '/v1/workflows', { name: 'Hotfix: the quick way', elements: [{ name: 'Fix', instructions: 'Fix {{task}}.' }] });
    const saved = await typed(session.id, `${aubergine} workflow export Hotfix --to-repository > ${dir}/save.txt 2>&1`, 'save.txt');
    expect(saved).toContain(`Wrote ${path.join(project, '.aubergine', 'workflows', 'hotfix-the-quick-way.json')}`);
    expect((await readdir(path.join(project, '.aubergine', 'workflows'))).sort()).toEqual(['hotfix-the-quick-way.json', 'release.json']);
    // A second time it is refused rather than replaced.
    expect(await typed(session.id, `${aubergine} workflow export Hotfix --to-repository > ${dir}/save-2.txt 2>&1`, 'save-2.txt')).toContain('There is already a file named hotfix-the-quick-way.json');

    // That was the owner's doing from a command line, inside a session, and it is on record as that.
    const activity = (await asOwner('GET', '/v1/activity?limit=50')).body.items.filter((e: { caller: string }) => e.caller === 'owner-cli');
    expect(activity.map((e: { action: string; status: number; fromSessionId: string | null }) => [e.action, e.status, e.fromSessionId])).toEqual([
      ['repository.write', 409, session.id],
      ['repository.write', 201, session.id],
    ]);
  }, 180_000);
});
