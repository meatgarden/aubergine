import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, KICKOFF_LINE, NO_ATTENTION, NO_STATUS, newId, type ChangeEvent, type Scope, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_FILE, FileActivityLog } from './activity';
import { sessionToken } from './auth';
import { FileInputAudit, INPUT_AUDIT_FILE } from './input-audit';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * The rules of terminal access, through the routes. The runtime is a
 * stand-in that keeps everything it is asked to put into a terminal, by any
 * of its ways of typing, and gives out a screen with a marker in it: so the
 * tests can say "nothing was typed" and "nothing was read" about every route.
 */

const SCREEN = 'SCREEN-SECRET-7781';
const COMMAND_LINE = 'deploy --password hunter2-9912';
const PROMPT = 'what I asked the agent: opal-3320';
const SECRETS = [SCREEN, 'hunter2-9912', 'opal-3320'];

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let port: number;
let origin: string;
/** Everything the runtime was asked to put into a terminal: [session, how, what]. */
let typed: [string, string, string][] = [];
let events: ChangeEvent[] = [];
let audit = false;

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  create: async (options: { id: string }) => ({ id: options.id, cwd: null, command: null, activityAt: null }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  typeLine: async (id: string, line: string) => void typed.push([id, 'line', line]),
  type: async (id: string, text: string, options?: { paste?: boolean }) => void typed.push([id, options?.paste ? 'paste' : 'text', text]),
  press: async (id: string, keys: string[]) => void typed.push([id, 'keys', keys.join(' ')]),
  screen: async () => ({ text: `${SCREEN}\nready> `, columns: 80, rows: 24, cursor: { x: 7, y: 1 }, line: 1 }),
  lines: async () => ({ lines: [SCREEN, 'ready> '], more: false, lost: false }),
  search: async (ids: string[]) => ({ hits: ids.map((sessionId) => ({ sessionId, text: SCREEN, before: [], after: [] })), truncated: false }),
  // At a shell prompt a shell is in front; otherwise the program an agent's record names.
  foreground: async (id: string) => (hub.state.sessions.find((s) => s.id === id)?.status.state === 'idle' ? 'zsh' : 'the-agent'),
  snapshot: async () => SCREEN,
} as unknown as SessionRuntime;

async function start(settingsJson: object = {}): Promise<void> {
  await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify(settingsJson));
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  events = [];
  hub.subscribe((event) => events.push(event));
  const settings = new SettingsFile(dir);
  await settings.reload();
  sessions = new Sessions(hub, runtime, { protectByDefault: () => ({ all: settings.value.terminal.protectNewSessions, agents: settings.value.terminal.protectAgentSessions }) });
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: path.join(dir, 'none'),
    activity: new FileActivityLog(dir, 1024 * 1024),
    inputAudit: new FileInputAudit(dir, () => audit),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}
async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-terminal-rules-'));
  ownerToken = await loadOrCreateToken(dir);
  typed = [];
  audit = false;
  await start();
});
afterEach(async () => {
  await stop();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  text: string;
  headers: Record<string, unknown>;
}
async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
  let parsed: unknown = null;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch {
    // Not JSON: the text is kept as it is.
  }
  return { status: response.statusCode, body: parsed, text: response.body, headers: response.headers };
}
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const asCommand = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}` }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);

async function makeToken(name: string, scopes: Scope[], reach: object | null = { kind: 'all' }): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, reviewWorkflowChanges: false, ...(reach ? { reach } : {}) });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.secret as string;
}
const except = (...without: Scope[]): Scope[] => GRANTABLE_SCOPES.filter((scope) => !without.includes(scope));

/** A session as a record: with a command line and a prompt in its notes, the two fields that are terminal content. */
function fakeSession(name: string, more: Partial<Session> = {}, canvasId = hub.state.canvases[0]!.id): Session {
  const session: Session = {
    id: newId(),
    projectId: hub.state.projects[0]!.id,
    name,
    createdAt: new Date().toISOString(),
    state: 'open',
    cwd: null,
    command: 'node',
    note: '',
    status: { ...NO_STATUS, state: 'busy', commandLine: COMMAND_LINE },
    attention: NO_ATTENTION,
    noteLog: [
      { id: newId(), at: new Date().toISOString(), author: 'user', kind: 'prompt', text: PROMPT },
      { id: newId(), at: new Date().toISOString(), author: 'user', kind: 'note', text: 'an ordinary note' },
    ],
    agent: { kind: 'claude-code', conversationId: null, program: 'the-agent' },
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
    parkedFrom: null,
    peopleOnly: false,
    typedBy: null,
    recap: null, takesMessages: false, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null,
    ...more,
  };
  hub.emit({ type: 'session.created', session, canvasId, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}
const terminalCalls = (id: string): [string, string, object | undefined][] => [
  ['GET', `/v1/sessions/${id}/screen`, undefined],
  ['GET', `/v1/sessions/${id}/output`, undefined],
  ['POST', `/v1/sessions/${id}/input`, { text: 'echo typed', enter: true }],
  ['POST', `/v1/sessions/${id}/input`, { keys: ['Enter'] }],
  ['POST', `/v1/sessions/${id}/run`, { command: 'echo run' }],
];

describe('a token without terminal:input', () => {
  it('cannot make one key reach any terminal, by any route, old or new', async () => {
    const session = fakeSession('agent');
    const secret = await makeToken('all but input', except('terminal:input'));
    const workflow = await asOwner('POST', '/v1/workflows', { name: 'Flow', elements: [{ name: 'One', instructions: 'Do {{task}}.' }] });
    const element = await asOwner('POST', '/v1/elements', { name: 'Alone', instructions: 'Do it.' });
    typed = [];

    // What each route would need to be sent to type something, where it could; `{}` for the rest.
    const bodies: Record<string, object> = {
      'POST /v1/sessions/:sessionId/input': { text: 'echo owned', enter: true },
      'POST /v1/canvases/:canvasId/sessions': { command: 'echo owned', tags: ['any'] },
      'POST /v1/sessions/:sessionId/run': { command: 'echo owned' },
      'POST /v1/sessions/:sessionId/runs': { workflowId: workflow.body.id, inputs: { task: 'x' }, kickoff: true, replace: true },
      'POST /v1/runs': { workflowId: workflow.body.id, sessionId: session.id, inputs: { task: 'x' }, kickoff: true, replace: true },
      'POST /v1/elements/:elementId/run': { sessionId: session.id, inputs: {}, kickoff: true, replace: true },
      'POST /v1/sessions/:sessionId/repository-runs': { file: 'x.json', inputs: {}, kickoff: true },
      'POST /v1/draft-requests': { kind: 'element', description: 'x', sessionId: session.id },
      'POST /v1/sessions/:sessionId/notes': { text: 'a note' },
      'PUT /v1/sessions/:sessionId/attention': { state: 'waiting' },
    };
    let walked = 0;
    // The routes that could type go first, while the session is still there: later ones in the walk park it and end it.
    const routes = [...publicRoutesOf(app)].sort((a, b) => Number(`${b.method} ${b.url}` in bodies) - Number(`${a.method} ${a.url}` in bodies));
    for (const route of routes) {
      if (route.url === '/v1/events') continue;
      const url = route.url.replace(':sessionId', session.id).replace(':elementId', element.body.id).replace(':canvasId', hub.state.canvases[0]!.id).replace(/:[A-Za-z]+/g, () => newId());
      const answer = await call(secret, route.method, url, route.method === 'GET' || route.method === 'DELETE' ? undefined : (bodies[`${route.method} ${route.url}`] ?? {}));
      expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
      walked += 1;
    }
    expect(walked).toBeGreaterThan(70);
    // A run was started on the agent's session with `kickoff: true`, by a token that may not type: nothing was typed for it.
    expect(events.filter((e) => e.type === 'run.started').length).toBeGreaterThan(0);
    expect(typed).toEqual([]);
  });

  it('cannot start a session with a command: that needs terminal:input whose reach covers the session being made', async () => {
    const canvas = hub.state.canvases[0]!.id;
    const second = await asOwner('POST', '/v1/canvases', { name: 'Second' });
    const start = (secret: string, body: object, on = canvas): Promise<Answer> => call(secret, 'POST', `/v1/canvases/${on}/sessions`, body);
    const starter = await makeToken('starter', ['sessions:write']);
    const everywhere = await makeToken('everywhere', ['sessions:write', 'terminal:input']);
    const tagged = await makeToken('tagged', ['sessions:write', 'terminal:input'], { kind: 'tag', tag: 'ci' });
    const onSecond = await makeToken('second canvas', ['sessions:write', 'terminal:input'], { kind: 'canvases', canvasIds: [second.body.id] });
    const typerOnly = await makeToken('typer only', ['terminal:input']);
    typed = [];

    // Without the scope: a plain shell is fine; with a command, refused in a sentence, and no session is made.
    const before = hub.state.sessions.length;
    const refused = await start(starter, { command: 'echo owned' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toContain('needs the scope `terminal:input` with a reach that covers the session being made');
    expect((await start(tagged, { command: 'echo owned' })).status).toBe(403);
    expect((await start(tagged, { command: 'echo owned', tags: ['other'] })).status).toBe(403);
    expect((await start(onSecond, { command: 'echo owned' })).status).toBe(403);
    // Typing alone does not start sessions.
    expect((await start(typerOnly, { command: 'echo owned' })).status).toBe(403);
    expect(hub.state.sessions.length).toBe(before);
    expect(typed).toEqual([]);
    expect((await start(starter, { name: 'plain' })).status).toBe(201);
    expect(typed).toEqual([]);

    // With it, within reach: the command is typed into the session that was made.
    const all = await start(everywhere, { command: 'echo everywhere' });
    const byTag = await start(tagged, { command: 'echo tagged', tags: ['CI'] });
    const byCanvas = await start(onSecond, { command: 'echo second' }, second.body.id);
    expect([all.status, byTag.status, byCanvas.status]).toEqual([201, 201, 201]);
    await expect.poll(() => typed.map(([id, , line]) => [id, line]).sort()).toEqual(
      [
        [all.body.session.id, 'echo everywhere'],
        [byTag.body.session.id, 'echo tagged'],
        [byCanvas.body.session.id, 'echo second'],
      ].sort(),
    );
    // The owner is unaffected.
    expect((await asOwner('POST', `/v1/canvases/${canvas}/sessions`, { command: 'echo mine' })).status).toBe(201);
  });

  it('cannot start one with a command where new sessions start people only', async () => {
    await stop();
    await start({ terminal: { protectNewSessions: true } });
    const everywhere = await makeToken('everywhere', ['sessions:write', 'terminal:input']);
    typed = [];
    expect((await call(everywhere, 'POST', `/v1/canvases/${hub.state.canvases[0]!.id}/sessions`, { command: 'echo owned' })).status).toBe(403);
    expect((await call(everywhere, 'POST', `/v1/canvases/${hub.state.canvases[0]!.id}/sessions`, {})).status).toBe(201);
    expect(typed).toEqual([]);
  });

  it('with terminal:input and reach on that session, starting a run types the fixed kickoff sentence and nothing else', async () => {
    const agent = fakeSession('agent');
    const elsewhere = fakeSession('elsewhere', { tags: ['other'] });
    const workflow = await asOwner('POST', '/v1/workflows', { name: "Run `id`; $(id) 'x'", elements: [{ name: 'One; rm -rf ~', instructions: 'Do it.\u001b[2J' }] });
    const allowed = await makeToken('runner', ['runs:write', 'terminal:input']);
    const tagged = await makeToken('tagged runner', ['runs:write', 'terminal:input'], { kind: 'tag', tag: 'other' });
    const noInput = await makeToken('plain runner', ['runs:write']);
    const body = { workflowId: workflow.body.id, inputs: { task: 'x' }, replace: true };
    typed = [];

    expect((await call(noInput, 'POST', `/v1/sessions/${agent.id}/runs`, body)).body.kickoffTyped).toBe(false);
    // Input, but this session is outside its reach: the run starts (that is `runs:write`), and nothing is typed.
    expect((await call(tagged, 'POST', `/v1/sessions/${agent.id}/runs`, body)).body.kickoffTyped).toBe(false);
    expect(typed).toEqual([]);
    expect((await call(allowed, 'POST', `/v1/sessions/${agent.id}/runs`, body)).body.kickoffTyped).toBe(true);
    expect((await call(tagged, 'POST', `/v1/sessions/${elsewhere.id}/runs`, body)).body.kickoffTyped).toBe(true);
    expect((await call(allowed, 'POST', `/v1/sessions/${agent.id}/runs`, { ...body, kickoff: false })).body.kickoffTyped).toBe(false);
    expect(typed).toEqual([
      [agent.id, 'line', KICKOFF_LINE],
      [elsewhere.id, 'line', KICKOFF_LINE],
    ]);
    // And not into a session that is "people only", whatever the token.
    await asOwner('PUT', `/v1/sessions/${agent.id}/protection`, { peopleOnly: true });
    expect((await call(allowed, 'POST', `/v1/sessions/${agent.id}/runs`, body)).body.kickoffTyped).toBe(false);
    expect(typed).toHaveLength(2);
  });
});

describe('a token without terminal:read', () => {
  it('gets no terminal text by any route: not the screen, the output, a search, a run, nor a field of a session or an event', async () => {
    const session = fakeSession('agent');
    const blind = await makeToken('all but read', except('terminal:read'));
    const seeing = await makeToken('everything', [...GRANTABLE_SCOPES]);
    const other = await asOwner('POST', '/v1/canvases', { name: 'Other' });

    const everything: string[] = [];
    const gather = async (secret: string): Promise<string> => {
      const out: string[] = [];
      for (const route of publicRoutesOf(app)) {
        if (route.method !== 'GET' || route.url === '/v1/events') continue;
        const url = route.url.replace(':sessionId', session.id).replace(':canvasId', hub.state.canvases[0]!.id).replace(/:[A-Za-z]+/g, () => newId());
        out.push((await call(secret, 'GET', url + (route.url === '/v1/search' ? '?q=secret' : ''))).text);
      }
      // The answers of routes that change a session carry the session too.
      for (const [method, url, body] of [
        ['PATCH', `/v1/sessions/${session.id}`, { tags: ['seen'] }],
        ['POST', `/v1/sessions/${session.id}/move`, { canvasId: other.body.id }],
        ['POST', `/v1/sessions/${session.id}/park`, {}],
        ['POST', `/v1/sessions/${session.id}/restore`, {}],
        ['POST', `/v1/sessions/${session.id}/run`, { command: 'echo x' }],
        ['POST', `/v1/sessions/${session.id}/input`, { text: 'x' }],
      ] as const) {
        out.push((await call(secret, method, url, body)).text);
      }
      return out.join('\n');
    };
    everything.push(await gather(blind));
    for (const secret of SECRETS) expect(everything[0], secret).not.toContain(secret);
    // The same walk with a token that may read finds all three: the test would notice if they were simply not there.
    const seen = await gather(seeing);
    for (const secret of SECRETS) expect(seen, secret).toContain(secret);
    // What is not terminal content is still there for the first token: the ordinary note, the session's name.
    expect(everything[0]).toContain('an ordinary note');
    expect((await call(blind, 'GET', `/v1/sessions/${session.id}`)).body).toMatchObject({ name: 'agent', command: 'node', status: { state: 'busy', commandLine: null } });
    for (const [method, url] of terminalCalls(session.id).filter(([m]) => m === 'GET')) expect((await call(blind, method, url)).status, url).toBe(403);
    expect((await call(blind, 'GET', '/v1/search?q=secret')).status).toBe(403);
  });

  it('is not sent terminal content on the stream of changes either', async () => {
    const session = fakeSession('agent');
    const blind = await makeToken('all but read', except('terminal:read'));
    const seeing = await makeToken('everything', [...GRANTABLE_SCOPES]);

    const listen = async (secret: string): Promise<string> => {
      const controller = new AbortController();
      const response = await fetch(`${origin}/v1/events`, { headers: { authorization: `Bearer ${secret}` }, signal: controller.signal });
      const reader = response.body!.getReader();
      let text = '';
      const pump = (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            text += Buffer.from(value).toString('utf8');
          }
        } catch {
          // Stopped by the test.
        }
      })();
      await expect.poll(() => text).toContain('connected');
      hub.emit({ type: 'session.status', sessionId: session.id, status: { ...NO_STATUS, state: 'busy', commandLine: COMMAND_LINE } });
      hub.emit({ type: 'session.note.appended', sessionId: session.id, entry: { id: newId(), at: new Date().toISOString(), author: 'user', kind: 'prompt', text: PROMPT } });
      hub.emit({ type: 'session.note.appended', sessionId: session.id, entry: { id: newId(), at: new Date().toISOString(), author: 'user', kind: 'note', text: 'a later ordinary note' } });
      hub.emit({ type: 'session.created', session: { ...session, id: newId(), name: 'another' }, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
      await expect.poll(() => text).toContain('another');
      controller.abort();
      await pump;
      return text;
    };
    const blindSaw = await listen(blind);
    for (const secret of SECRETS) expect(blindSaw, secret).not.toContain(secret);
    expect(blindSaw).toContain('session.status');
    expect(blindSaw).toContain('a later ordinary note');
    const seeingSaw = await listen(seeing);
    expect(seeingSaw).toContain('hunter2-9912');
    expect(seeingSaw).toContain('opal-3320');
  });
});

describe('"people only"', () => {
  it('closes a session to every token, for reading and for input, with one clear code; the owner is not affected', async () => {
    const open = fakeSession('open');
    const closed = fakeSession('closed');
    const all = await makeToken('everything', [...GRANTABLE_SCOPES]);
    const switched = await asOwner('PUT', `/v1/sessions/${closed.id}/protection`, { peopleOnly: true });
    expect(switched.body.peopleOnly).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'session.protected', sessionId: closed.id, peopleOnly: true });
    typed = [];

    for (const [method, url, body] of terminalCalls(closed.id)) {
      const answer = await call(all, method, url, body);
      expect(answer.status, `${method} ${url}`).toBe(403);
      expect(answer.body.error.code, `${method} ${url}`).toBe('people_only');
      expect(answer.text).not.toContain(SCREEN);
    }
    expect(typed).toEqual([]);
    // Its command line and prompts are not given out either, though the token holds terminal:read.
    const listed = await call(all, 'GET', '/v1/sessions');
    expect(listed.text).toContain('hunter2-9912');
    expect(listed.body.items.find((s: Session) => s.id === closed.id).status.commandLine).toBeNull();
    expect(listed.body.items.find((s: Session) => s.id === open.id).status.commandLine).toBe(COMMAND_LINE);

    // Search: its matches are left out, and the answer says some sessions were, without saying which.
    const found = await call(all, 'GET', '/v1/search?q=secret');
    expect(found.body.hits.map((h: { sessionId: string }) => h.sessionId)).toEqual([open.id]);
    expect(found.body).toMatchObject({ searched: 1, someLeftOut: true });
    expect(found.text).not.toContain(closed.id);

    // The owner reads and types as before, also from the command line.
    expect((await asOwner('GET', `/v1/sessions/${closed.id}/screen`)).body.text).toContain(SCREEN);
    expect((await asCommand('POST', `/v1/sessions/${closed.id}/input`, { text: 'mine', enter: true })).status).toBe(200);
    expect((await asOwner('GET', '/v1/search?q=secret')).body).toMatchObject({ searched: 2, someLeftOut: false });
    // Opened again, the token is back in.
    await asOwner('PUT', `/v1/sessions/${closed.id}/protection`, { peopleOnly: false });
    expect((await call(all, 'GET', `/v1/sessions/${closed.id}/screen`)).status).toBe(200);
  });

  it('is switched by the owner alone: no token, and not the session itself', async () => {
    const session = fakeSession('mine');
    const all = await makeToken('everything', [...GRANTABLE_SCOPES]);
    for (const peopleOnly of [true, false]) {
      expect((await call(all, 'PUT', `/v1/sessions/${session.id}/protection`, { peopleOnly })).status).toBe(403);
      expect((await call(sessionToken(ownerToken, session.id), 'PUT', `/v1/sessions/${session.id}/protection`, { peopleOnly })).status).toBe(403);
    }
    expect(hub.state.sessions.find((s) => s.id === session.id)?.peopleOnly).toBe(false);
    // It cannot be slipped in through a change of the session either.
    await call(all, 'PATCH', `/v1/sessions/${session.id}`, { peopleOnly: true, name: 'renamed' });
    expect(hub.state.sessions.find((s) => s.id === session.id)).toMatchObject({ name: 'renamed', peopleOnly: false });
  });

  it('is on from the start for agent sessions by default, and for every new session when the settings say so', async () => {
    const plain = await sessions.create({ name: 'plain' });
    expect(plain.session.peopleOnly).toBe(false);
    const withAgent = await sessions.create({ name: 'agent', agent: 'claude-code' });
    expect(withAgent.session.peopleOnly).toBe(true);
    expect(hub.state.sessions.find((s) => s.id === withAgent.session.id)?.peopleOnly).toBe(true);

    await stop();
    await start({ terminal: { protectNewSessions: true, protectAgentSessions: false } });
    expect((await sessions.create({ name: 'plain' })).session.peopleOnly).toBe(true);
    await stop();
    await start({ terminal: { protectAgentSessions: false } });
    expect((await sessions.create({ name: 'agent', agent: 'claude-code' })).session.peopleOnly).toBe(false);
  });
});

describe('which sessions a token may reach', () => {
  it('must be said when the token is made: there is no silent "all"', async () => {
    for (const scopes of [['terminal:read'], ['terminal:input'], ['read', 'terminal:read', 'terminal:input']]) {
      const refused = await asOwner('POST', '/v1/tokens', { name: 'x', scopes });
      expect(refused.status, scopes.join()).toBe(400);
      expect(refused.body.error.message).toContain('must say which sessions it may reach');
    }
    for (const reach of [{ kind: 'everything' }, { kind: 'canvases', canvasIds: [] }, { kind: 'tag', tag: ' ' }, 'all']) {
      expect((await asOwner('POST', '/v1/tokens', { name: 'x', scopes: ['terminal:read'], reach })).status, JSON.stringify(reach)).toBe(400);
    }
    // A token without a terminal scope has no reach, whatever was sent.
    const plain = await asOwner('POST', '/v1/tokens', { name: 'plain', scopes: ['read'], reach: { kind: 'all' } });
    expect(plain.body.token.reach).toBeNull();
    expect((await asOwner('POST', '/v1/tokens', { name: 'reader', scopes: ['terminal:read'], reach: { kind: 'tag', tag: 'ci' } })).body.token.reach).toEqual({ kind: 'tag', tag: 'ci' });
  });

  it('holds for every terminal route, search included: by canvas, and by tag', async () => {
    const second = await asOwner('POST', '/v1/canvases', { name: 'Second' });
    const onFirst = fakeSession('on the first canvas', { tags: ['ci'] });
    const onSecond = fakeSession('on the second canvas', {}, second.body.id);
    const parked = fakeSession('to be parked', { tags: ['CI'] });
    await asOwner('POST', `/v1/sessions/${parked.id}/park`, {});
    const scopes: Scope[] = ['terminal:read', 'terminal:input'];
    const byCanvas = await makeToken('second canvas only', scopes, { kind: 'canvases', canvasIds: [second.body.id] });
    const byTag = await makeToken('tagged ci', scopes, { kind: 'tag', tag: 'ci' });
    typed = [];

    const reached = async (secret: string, session: Session): Promise<number[]> => Promise.all(terminalCalls(session.id).map(async ([method, url, body]) => (await call(secret, method, url, body)).status));
    const yes = [200, 200, 200, 200, 409];
    const no = [403, 403, 403, 403, 403];
    expect(await reached(byCanvas, onSecond)).toEqual(yes);
    expect(await reached(byCanvas, onFirst)).toEqual(no);
    // A parked session is on no canvas: a token limited to canvases does not reach it.
    expect(await reached(byCanvas, parked)).toEqual(no);
    expect(await reached(byTag, onFirst)).toEqual(yes);
    expect(await reached(byTag, parked)).toEqual(yes);
    expect(await reached(byTag, onSecond)).toEqual(no);
    // A session that is not there: refused like one out of reach, not "not found".
    const absent = await call(byTag, 'GET', `/v1/sessions/${newId()}/screen`);
    expect(absent.status).toBe(403);
    // Out of reach says so, and never "people only". One that is there and one that is not get the same answer, word for word:
    // nothing is learned about which sessions there are outside the reach.
    const beyond = await call(byCanvas, 'GET', `/v1/sessions/${onFirst.id}/screen`);
    expect(beyond.body).toEqual({ error: { code: 'out_of_reach', message: "This token's reach does not cover that session." } });
    expect(absent.body).toEqual(beyond.body);
    // A token without the scope at all is told nothing about reach.
    expect((await call(await makeToken('no terminal scope', ['read']), 'GET', `/v1/sessions/${onFirst.id}/screen`)).body.error.code).toBe('forbidden');
    // Everything typed went into sessions within reach.
    expect([...new Set(typed.map(([id]) => id))].sort()).toEqual([onSecond.id, onFirst.id, parked.id].sort());

    const hitsOf = async (secret: string): Promise<string[]> => (await call(secret, 'GET', '/v1/search?q=secret')).body.hits.map((h: { sessionId: string }) => h.sessionId).sort();
    expect(await hitsOf(byCanvas)).toEqual([onSecond.id]);
    expect(await hitsOf(byTag)).toEqual([onFirst.id, parked.id].sort());
    expect((await call(byCanvas, 'GET', '/v1/search?q=secret')).body).toMatchObject({ searched: 1, someLeftOut: true });
    // Moved onto the canvas it may reach, a session comes within reach; the tag taken off, it leaves.
    await asOwner('POST', `/v1/sessions/${onFirst.id}/move`, { canvasId: second.body.id });
    expect((await call(byCanvas, 'GET', `/v1/sessions/${onFirst.id}/screen`)).status).toBe(200);
    await asOwner('PATCH', `/v1/sessions/${onFirst.id}`, { tags: [] });
    expect((await call(byTag, 'GET', `/v1/sessions/${onFirst.id}/screen`)).status).toBe(403);
  });

  it("a session's own token gains nothing: it reads and types in no terminal through the API, its own included", async () => {
    const session = fakeSession('mine');
    const secret = sessionToken(ownerToken, session.id);
    typed = [];
    for (const [method, url, body] of terminalCalls(session.id)) expect((await call(secret, method, url, body)).status, `${method} ${url}`).toBe(403);
    expect((await call(secret, 'GET', '/v1/search?q=secret')).status).toBe(403);
    expect(typed).toEqual([]);
  });
});

describe('everything is recorded, and nothing typed is kept unless asked', () => {
  it('records each read and each input with the session, how much text and a fingerprint; never the text', async () => {
    const session = fakeSession('agent');
    const secret = await makeToken('both', ['terminal:read', 'terminal:input']);
    const text = 'echo the-typed-text-4471';
    await call(secret, 'GET', `/v1/sessions/${session.id}/screen`);
    await call(secret, 'GET', `/v1/sessions/${session.id}/output?lines=10`);
    await call(secret, 'GET', '/v1/search?q=secret');
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { text, enter: true });
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { text });
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { keys: ['Ctrl+C', 'Enter'] });
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { text: 'bad\u0003' });
    // The owner's own, from the command line: watched too. From the browser: not.
    await asCommand('POST', `/v1/sessions/${session.id}/input`, { text: 'owner-typed-9001' });
    await asCommand('GET', `/v1/sessions/${session.id}/screen`);
    await asOwner('POST', `/v1/sessions/${session.id}/input`, { text: 'in-the-browser' });
    await asCommand('PUT', `/v1/sessions/${session.id}/protection`, { peopleOnly: false });

    const log = (await asOwner('GET', `/v1/activity?sessionId=${session.id}&limit=50`)).body.items.reverse();
    expect(log.map((e: { caller: string; route: string; action: string; status: number; chars: number | null }) => [e.caller, e.action, e.route.replace('/v1/sessions/:sessionId', ''), e.status, e.chars])).toEqual([
      ['token', 'terminal.read', '/screen', 200, SCREEN.length + 8],
      ['token', 'terminal.read', '/output', 200, SCREEN.length + 8],
      ['token', 'terminal.input', '/input', 200, text.length],
      ['token', 'terminal.input', '/input', 200, text.length],
      ['token', 'terminal.input', '/input', 200, 2],
      ['token', 'terminal.input', '/input', 400, null],
      ['owner-cli', 'terminal.input', '/input', 200, 16],
      ['owner-cli', 'terminal.read', '/screen', 200, SCREEN.length + 8],
      ['owner-cli', 'sessions.protect', '/protection', 200, null],
    ]);
    // The same text has the same fingerprint; other text another. A read has none.
    expect(log[2].fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(log[3].fingerprint).toBe(log[2].fingerprint);
    expect(log[4].fingerprint).not.toBe(log[2].fingerprint);
    expect(log[0].fingerprint).toBeNull();
    // The search is on record too, though it is about no one session.
    expect((await asOwner('GET', '/v1/activity?limit=50')).body.items.some((e: { route: string }) => e.route === '/v1/search')).toBe(true);

    // Nothing that was typed, and nothing that was read, is in any file of the data folder.
    const activity = await readFile(path.join(dir, ACTIVITY_FILE), 'utf8');
    for (const kept of ['the-typed-text-4471', 'owner-typed-9001', SCREEN, 'Ctrl+C']) expect(activity, kept).not.toContain(kept);
    await hub.flush();
    expect(await readFile(path.join(dir, 'state.json'), 'utf8')).not.toContain('the-typed-text-4471');
    await expect(readFile(path.join(dir, INPUT_AUDIT_FILE), 'utf8')).rejects.toThrow();
  });

  it('keeps the typed text itself in a file of its own only when the audit is switched on', async () => {
    const session = fakeSession('agent');
    const secret = await makeToken('typer', ['terminal:input']);
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { text: 'before-the-audit' });
    audit = true;
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { text: 'echo audited', enter: true });
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { keys: ['Ctrl+C'] });
    await asCommand('POST', `/v1/sessions/${session.id}/input`, { text: 'two\nlines', paste: true });
    await expect.poll(async () => (await readFile(path.join(dir, INPUT_AUDIT_FILE), 'utf8').catch(() => '')).trim().split('\n').length).toBe(3);
    const lines = (await readFile(path.join(dir, INPUT_AUDIT_FILE), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines.map((l: { by: string; kind: string; text: string; sessionId: string }) => [l.by, l.kind, l.text, l.sessionId === session.id])).toEqual([
      ['typer', 'text', 'echo audited\n', true],
      ['typer', 'keys', 'Ctrl+C', true],
      ['owner-cli', 'paste', 'two\nlines', true],
    ]);
    expect(JSON.stringify(lines)).not.toContain('before-the-audit');
    // The activity log still holds none of it.
    expect(await readFile(path.join(dir, ACTIVITY_FILE), 'utf8')).not.toContain('audited');
  });

  it('shows the owner that a token typed, and which, without saying what', async () => {
    const session = fakeSession('agent');
    const secret = await makeToken('deploy bot', ['terminal:input']);
    events = [];
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { text: 'echo one', enter: true });
    await call(secret, 'POST', `/v1/sessions/${session.id}/input`, { text: 'echo two', enter: true });
    await asOwner('POST', `/v1/sessions/${session.id}/input`, { text: 'mine' });
    // One mark for the two calls close together; none for the owner's own typing.
    expect(events.filter((e) => e.type === 'session.typed')).toEqual([{ type: 'session.typed', sessionId: session.id, by: { name: 'deploy bot', at: expect.any(String) } }]);
    expect(hub.state.sessions.find((s) => s.id === session.id)?.typedBy?.name).toBe('deploy bot');
    expect(JSON.stringify(events)).not.toContain('echo one');
  });
});

describe('limits of their own', () => {
  it('holds a token to so many input calls and so much text a minute into one session, and so much a call', async () => {
    await stop();
    await start({ terminal: { inputCallsPerMinute: 3, inputCharsPerCall: 20, inputCharsPerMinute: 30 } });
    const one = fakeSession('one');
    const two = fakeSession('two');
    const secret = await makeToken('typer', ['terminal:input']);
    const other = await makeToken('other typer', ['terminal:input']);
    const type = (token: string, session: Session, text: string): Promise<Answer> => call(token, 'POST', `/v1/sessions/${session.id}/input`, { text });

    expect((await type(secret, one, 'x'.repeat(21))).status).toBe(413);
    expect((await type(secret, one, 'x'.repeat(21))).body.error.code).toBe('too_large');
    for (let n = 0; n < 3; n += 1) expect((await type(secret, one, 'ab')).status).toBe(200);
    const limited = await type(secret, one, 'ab');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // Another session, and another token, are not affected.
    expect((await type(secret, two, 'x'.repeat(20))).status).toBe(200);
    expect((await type(other, one, 'ab')).status).toBe(200);
    // So much text a minute: twenty are in; eleven more are too many, ten are not.
    expect((await type(secret, two, 'x'.repeat(11))).status).toBe(429);
    expect((await type(secret, two, 'x'.repeat(10))).status).toBe(200);
    // The owner is not limited by these; the size of one call applies to everyone.
    for (let n = 0; n < 6; n += 1) expect((await asOwner('POST', `/v1/sessions/${one.id}/input`, { text: 'ab' })).status).toBe(200);
    expect((await asOwner('POST', `/v1/sessions/${one.id}/input`, { text: 'x'.repeat(21) })).status).toBe(413);
    // What was refused was not typed.
    expect(typed.filter(([, , text]) => text.length > 20)).toEqual([]);
  });
});
