import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { RunDetail, SESSION_ENV, WorkflowDetail, type ChangeEvent } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { pathWithCommand, writeCommandLauncher } from './command-path';
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
 * The whole way round, with nothing stood in for but the agent: a real
 * server, a real terminal session, the real `aubergine` command found through
 * the session's environment. The "agent" is a script that does what the
 * kickoff line asks of one: read the status, report done, follow what comes
 * back, until there is nothing left.
 */
describe('a stand-in agent in a session', () => {
  const socket = testSocketName('workflow-agent');
  const runtime = new TmuxRuntime({ socket });
  let dir: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let sessions: Sessions;
  let port = 0;
  let ownerToken: string;
  const events: ChangeEvent[] = [];

  beforeAll(async () => {
    await runtime.killServer();
    dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-workflow-agent-'));
    ownerToken = await loadOrCreateToken(dir);
    const store = new JsonStore(dir);
    hub = new StateHub(await store.load(), store);
    hub.subscribe((event) => events.push(event));
    const settings = new SettingsFile(dir);
    const commandFolder = await writeCommandLauncher(dir);
    sessions = new Sessions(hub, runtime, {
      // What the server gives every session, as in `main.ts`.
      sessionEnv: (sessionId) => ({
        [SESSION_ENV.url]: `http://127.0.0.1:${port}`,
        [SESSION_ENV.sessionId]: sessionId,
        [SESSION_ENV.token]: sessionToken(ownerToken, sessionId),
        [SESSION_ENV.bin]: commandFolder,
        PATH: pathWithCommand(shellEnvironment(process.env).PATH ?? '', commandFolder),
      }),
    });
    app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir) });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, socket);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const asOwner = async (method: string, url: string, body?: unknown): Promise<{ status: number; body: unknown }> => {
    const origin = `http://127.0.0.1:${port}`;
    const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin, cookie: `${cookieName(port)}=${ownerToken}` }, ...(body === undefined ? {} : { payload: body as object }) });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
  };

  it('walks a three-element workflow to finished by running aubergine workflow done, while the events are watched', async () => {
    const workflow = WorkflowDetail.parse(
      (
        await asOwner('POST', '/v1/workflows', {
          name: 'Three steps',
          elements: [
            { name: 'Plan', instructions: 'Plan {{task}}.', doneWhen: 'There is a plan.' },
            { name: 'Build', instructions: 'Build it.', doneWhen: 'It builds.' },
            { name: 'Check', instructions: 'Check it.', doneWhen: 'Checks pass.' },
          ],
        })
      ).body,
    );

    const { session } = await sessions.create({ name: 'worker' });
    // A shell discards what is typed while it is starting: wait for its prompt.
    const waiting = Date.now();
    while ((await runtime.snapshot(session.id)).trim() === '') {
      if (Date.now() - waiting > 15_000) throw new Error('The shell never showed a prompt');
      await sleep(25);
    }

    events.length = 0;
    const started = RunDetail.parse((await asOwner('POST', `/v1/sessions/${session.id}/runs`, { workflowId: workflow.id, inputs: { task: 'the login bug' } })).body);
    expect(started.position).toBe('Plan · 1 of 3');
    // A plain shell: nothing was typed for it. The stand-in agent is started by hand, as a person would start theirs.
    expect(started.kickoffTyped).toBe(false);

    // The stand-in agent. It uses the command by the folder the session was given, so that
    // the test does not depend on what else the developer's own shell has on its PATH.
    const agent = path.join(dir, 'stand-in-agent.sh');
    await writeFile(
      agent,
      [
        '#!/bin/sh',
        'aubergine="$AUBERGINE_BIN/aubergine"',
        '"$aubergine" workflow status > "$1/first-status.txt" 2>&1',
        'n=0',
        'while "$aubergine" workflow done --note "stand-in agent, step $((n + 1))" > "$1/done-$n.txt" 2>&1; do n=$((n + 1)); done',
        'echo "$n" > "$1/steps.txt"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    await runtime.typeLine(session.id, `sh ${agent} ${dir}`);

    // Watch the run move, by the events alone.
    const deadline = Date.now() + 60_000;
    while (!events.some((e) => e.type === 'run.finished')) {
      if (Date.now() > deadline) throw new Error(`The run did not finish. Events: ${events.map((e) => e.type).join(', ')}. Terminal:\n${await runtime.snapshot(session.id)}`);
      await sleep(50);
    }

    const ofRun = events.filter((e): e is Extract<ChangeEvent, { type: 'run.started' | 'run.moved' | 'run.finished' }> => e.type.startsWith('run.'));
    expect(ofRun.map((e) => [e.type, e.run.status, e.run.currentElementId])).toEqual([
      ['run.started', 'running', 'plan'],
      ['run.moved', 'running', 'build'],
      ['run.moved', 'running', 'check'],
      ['run.finished', 'finished', null],
    ]);
    const finished = ofRun.at(-1)!.run;
    expect(finished.elements.map((e) => [e.state, e.note, e.by])).toEqual([
      ['done', 'stand-in agent, step 1', { kind: 'agent' }],
      ['done', 'stand-in agent, step 2', { kind: 'agent' }],
      ['done', 'stand-in agent, step 3', { kind: 'agent' }],
    ]);
    // Nobody but the session's own token moved it.
    expect(hub.state.runs).toEqual([]);

    // The summary is in the session's notes, and the session asks for its owner.
    const after = hub.state.sessions.find((s) => s.id === session.id)!;
    expect(after.noteLog.at(-1)?.text).toBe('Workflow "Three steps" finished.\n- Plan: stand-in agent, step 1\n- Build: stand-in agent, step 2\n- Check: stand-in agent, step 3');
    expect(after.attention).toMatchObject({ state: 'done' });
    expect(((await asOwner('GET', `/v1/runs/${started.run.id}`)).body as RunDetail).run.status).toBe('finished');
    expect(((await asOwner('GET', '/v1/runs?status=ended')).body as { items: unknown[] }).items).toHaveLength(1);
  }, 90_000);
});
