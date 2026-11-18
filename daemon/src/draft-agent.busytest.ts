import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { SESSION_ENV, type ChangeEvent } from '@aubergine/shared';
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
 * The example of this stage, the whole way round with nothing stood in for
 * but the agent: "Collect my to-dos", an element that needs a chat tool and
 * produces a checklist. The owner asks for it; a stand-in agent in a real
 * terminal session reads the request with the real command, proposes it, is
 * sent back once, revises it; the owner accepts it and runs it by itself;
 * the agent hands in a checklist; the owner ticks it.
 */
describe('a stand-in agent writes a step and then does it', () => {
  const socket = testSocketName('draft-agent');
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
    dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-draft-agent-'));
    ownerToken = await loadOrCreateToken(dir);
    const store = new JsonStore(dir);
    hub = new StateHub(await store.load(), store);
    hub.subscribe((event) => events.push(event));
    const settings = new SettingsFile(dir);
    const commandFolder = await writeCommandLauncher(dir);
    sessions = new Sessions(hub, runtime, {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  const asOwner = async (method: string, url: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const origin = `http://127.0.0.1:${port}`;
    const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, origin, cookie: `${cookieName(port)}=${ownerToken}` }, ...(body === undefined ? {} : { payload: body as object }) });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
  };

  async function until<T>(what: string, check: () => T | undefined | null | false, sessionId: string): Promise<T> {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const found = check();
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`Waited in vain for ${what}. Events: ${events.map((e) => e.type).join(', ')}. Terminal:\n${await runtime.snapshot(sessionId)}`);
      await sleep(50);
    }
  }

  it('from a request, through a draft sent back once, to a checklist the owner ticks', async () => {
    const { session } = await sessions.create({ name: 'helper' });
    const waiting = Date.now();
    while ((await runtime.snapshot(session.id)).trim() === '') {
      if (Date.now() - waiting > 15_000) throw new Error('The shell never showed a prompt');
      await sleep(25);
    }

    // What the stand-in agent "writes". The first is too long for the owner's taste.
    const element = { name: 'Collect my to-dos', instructions: 'Read the team chat and write down, at great length, everything anyone asked of me.', doneWhen: 'Every request is on the list.', needs: [{ kind: 'mcp', name: 'team chat' }], produces: 'checklist' };
    await writeFile(path.join(dir, 'first.json'), JSON.stringify(element));
    await writeFile(path.join(dir, 'second.json'), JSON.stringify({ ...element, instructions: 'List what people asked me to do in the team chat.' }));
    await writeFile(path.join(dir, 'list.json'), JSON.stringify({ items: [{ text: 'Review the retry change' }, { text: 'Answer about the release date', detail: 'Asked twice.' }, { text: 'Book the room' }] }));
    // The stand-in agent does what the fixed sentences ask of one: read the brief, hand in; read it again when
    // told to, revise; then, on a run, read the status and report done with what the element produces.
    const agent = path.join(dir, 'stand-in-agent.sh');
    await writeFile(
      agent,
      [
        '#!/bin/sh',
        'a="$AUBERGINE_BIN/aubergine"; d="$1"',
        '"$a" workflow brief > "$d/brief-1.txt" 2>&1',
        '"$a" element propose --file "$d/first.json" > "$d/propose-1.txt" 2>&1',
        'until "$a" workflow brief > "$d/brief-2.txt" 2>/dev/null; do sleep 0.2; done',
        '"$a" element propose < "$d/second.json" > "$d/propose-2.txt" 2>&1',
        'until "$a" workflow status > "$d/status.txt" 2>/dev/null; do sleep 0.2; done',
        '"$a" workflow done --note "No list, sorry." > "$d/done-refused.txt" 2>&1; echo "exit=$?" >> "$d/done-refused.txt"',
        '"$a" workflow done --note "Three requests." --output "$d/list.json" > "$d/done.txt" 2>&1',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );

    // The owner asks. The description is hostile on purpose: it must reach the agent as text, through the command.
    const description = 'Give me my to-do list from the team chat.\u001b[2J $(touch pwned) `id`';
    const asked = await asOwner('POST', '/v1/draft-requests', { kind: 'element', description, sessionId: session.id });
    expect(asked.status).toBe(201);
    // A plain shell: nothing was typed for it. The stand-in agent is started by hand, as a person starts theirs.
    expect(asked.body.told).toBe(false);
    const draftId = asked.body.draft.id as string;
    await runtime.typeLine(session.id, `sh ${agent} ${dir}`);

    // First version: handed in, read, sent back.
    await until('the first draft', () => hub.state.drafts.find((d) => d.id === draftId && d.status === 'waiting' && d.revision === 1), session.id);
    const first = await asOwner('GET', `/v1/drafts/${draftId}`);
    expect(first.body.text).toContain('at great length');
    expect(first.body.needs).toEqual([{ kind: 'mcp', name: 'team chat' }]);
    expect((await asOwner('POST', `/v1/drafts/${draftId}/return`, { comment: 'Shorter, please.' })).status).toBe(200);

    // Second version: the agent read the comment and revised. Accepted, it goes on the shelf.
    await until('the revised draft', () => hub.state.drafts.find((d) => d.id === draftId && d.status === 'waiting' && d.revision === 2), session.id);
    const second = await asOwner('GET', `/v1/drafts/${draftId}`);
    expect(second.body.text).toContain('List what people asked me to do in the team chat.');
    expect(second.body.previousText).toContain('at great length');
    const accepted = await asOwner('POST', `/v1/drafts/${draftId}/accept`);
    expect(accepted.status).toBe(200);
    expect(hub.state.shelf.map((e) => e.element.name)).toEqual(['Collect my to-dos']);
    expect(hub.state.workflows).toEqual([]);

    // Run by itself. The agent finds the run, is refused without a checklist, and hands one in.
    const started = await asOwner('POST', `/v1/elements/${accepted.body.elementId}/run`, { sessionId: session.id, inputs: {} });
    expect(started.status).toBe(201);
    const runId = started.body.run.id as string;
    await until('the run to finish', () => events.some((e) => e.type === 'run.finished' && e.run.id === runId), session.id);

    // What the agent was shown, by the commands alone.
    const read = (name: string): Promise<string> => readFile(path.join(dir, name), 'utf8');
    const brief = await read('brief-1.txt');
    expect(brief).toContain('Give me my to-do list from the team chat.␛[2J $(touch pwned) `id`');
    expect(brief).not.toContain('\u001b');
    expect(await read('brief-2.txt')).toContain('sent back with this comment:\n\nShorter, please.');
    expect(await read('propose-2.txt')).toContain('as a draft (version 2)');
    expect(await read('status.txt')).toContain('This step needs: an MCP server: team chat.');
    const refused = await read('done-refused.txt');
    expect(refused).toContain('produces a checklist, and none was handed in');
    expect(refused).toContain('exit=1');
    expect(await read('done.txt')).toContain('This run is finished');
    // Nothing in the description was run by anything.
    await expect(readFile(path.join(os.homedir(), 'pwned'))).rejects.toThrow();
    await expect(readFile(path.join(dir, 'pwned'))).rejects.toThrow();

    // The owner ticks two items of the list; they are kept with the run that is over.
    const ticked = await asOwner('POST', `/v1/runs/${runId}/ticks`, { elementId: 'collect-my-to-dos', item: 0, ticked: true });
    expect(ticked.status).toBe(200);
    await asOwner('POST', `/v1/runs/${runId}/ticks`, { elementId: 'collect-my-to-dos', item: 2, ticked: true });
    const archived = await asOwner('GET', `/v1/runs/${runId}`);
    expect(archived.body.run.status).toBe('finished');
    expect(archived.body.run.elements[0]).toMatchObject({ note: 'Three requests.', by: { kind: 'agent' }, output: { items: [{ text: 'Review the retry change' }, { text: 'Answer about the release date', detail: 'Asked twice.' }, { text: 'Book the room' }] } });
    expect(archived.body.run.elements[0].ticks.map((t: { item: number }) => t.item)).toEqual([0, 2]);
    // The workflow made for the run is gone; the element stays on the shelf.
    expect(hub.state.workflows).toEqual([]);
    expect(hub.state.runs).toEqual([]);
    expect(hub.state.shelf).toHaveLength(1);
  }, 120_000);
});
