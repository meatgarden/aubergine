import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_SETTINGS, FIRST_CANVAS_NAME, placeOfSession } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TmuxRuntime } from '../runtime/tmux-runtime';
import { buildServer } from '../server';
import { Sessions } from '../sessions';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { destroyTmuxServer, testSocketName } from '../test-support';
import { loadOrCreateToken } from '../token';
import { Viewers } from '../viewers';

const run = promisify(execFile);
const SOCKET = testSocketName('cli-canvas');
const COMMAND = fileURLToPath(new URL('../../../bin/aubergine.mjs', import.meta.url));

// The real command against a real server and a real tmux, all of them this test's own.
describe('canvases from the command line', () => {
  const runtime = new TmuxRuntime({ socket: SOCKET });
  const viewers = new Viewers();
  let dir: string;
  let work: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-cli-canvas-')));
    work = path.join(dir, 'billing api');
    await mkdir(work);
    const data = path.join(dir, 'data');
    const token = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    const sessions = new Sessions(hub, runtime, { currentCanvas: () => viewers.lastViewedCanvasId });
    app = await buildServer({
      hub,
      sessions,
      runtime,
      viewers,
      settings: async () => DEFAULT_SETTINGS,
      token,
      devOrigin: null,
      webDist: path.join(dir, 'no-web'),
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { TMUX: _tmux, ...outside } = process.env;
    env = {
      ...outside,
      AUBERGINE_PORT: String((app.server.address() as AddressInfo).port),
      AUBERGINE_DATA_DIR: data,
      AUBERGINE_TMUX_SOCKET: SOCKET,
    };
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, SOCKET);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const aubergine = async (...args: string[]): Promise<string> =>
    (await run(process.execPath, [COMMAND, ...args], { env, cwd: work, timeout: 20_000 })).stdout;

  const refused = async (...args: string[]): Promise<string> => {
    try {
      await aubergine(...args);
    } catch (error) {
      return (error as { stderr: string }).stderr;
    }
    throw new Error(`"aubergine ${args.join(' ')}" was expected to fail`);
  };

  /** The name of the canvas the session with this name is on. */
  const canvasOf = (sessionName: string): string | undefined => {
    const session = hub.state.sessions.find((s) => s.name === sessionName);
    return session ? placeOfSession(hub.state, session.id)?.canvas.name : undefined;
  };

  it('adds a canvas and lists them', async () => {
    expect(await aubergine('canvas', 'new', 'Deploys')).toContain('Added the canvas "Deploys"');
    expect(hub.state.canvases.map((c) => c.name)).toEqual([FIRST_CANVAS_NAME, 'Deploys']);

    const list = await aubergine('canvas', 'list');
    expect(list).toMatch(new RegExp(`\\* ${FIRST_CANVAS_NAME} +0 terminals`));
    expect(list).toMatch(/ {2}Deploys +0 terminals/);
  }, 30_000);

  it('puts a new session on the canvas that was named', async () => {
    await aubergine('new', 'logs', '--canvas', 'deploys');
    expect(canvasOf('logs')).toBe('Deploys');

    await aubergine('here', '--no-attach', '--canvas=Dep');
    expect(canvasOf('billing api')).toBe('Deploys');
    expect(await aubergine('canvas', 'list')).toMatch(/Deploys +2 terminals/);
  }, 30_000);

  it('without a name uses the first canvas, or the one most recently looked at', async () => {
    await aubergine('new', 'first');
    expect(canvasOf('first')).toBe(FIRST_CANVAS_NAME);

    const deploys = hub.state.canvases.find((c) => c.name === 'Deploys');
    viewers.viewing(viewers.add(() => {}), deploys!.id);
    await aubergine('new', 'second');
    expect(canvasOf('second')).toBe('Deploys');
    expect(await aubergine('canvas', 'list')).toMatch(/\* Deploys/);
  }, 30_000);

  it('says so when no canvas has that name, and starts nothing', async () => {
    const before = hub.state.sessions.length;
    expect(await refused('new', 'lost', '--canvas', 'Nowhere')).toContain('No canvas named "Nowhere"');
    expect(await refused('here', '--no-attach', '--canvas', 'Nowhere')).toContain('aubergine canvas list');
    expect(hub.state.sessions).toHaveLength(before);
  }, 30_000);
});
