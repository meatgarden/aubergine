import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, NO_ATTENTION, NO_STATUS, RULE_RATE_PER_MINUTE, RuleEvent, WEBHOOK_HEADERS, WebhookBody, newId, readProjectFile, type ChangeEvent, type ForYou, type Rule, type Scope, type Session, type Task } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_FILE, FileActivityLog } from './activity';
import { sessionToken } from './auth';
import { parseRuleCommand } from './cli/queue';
import { FileRunArchive } from './run-archive';
import type { SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName, publicRoutesOf } from './server';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile, webhookReport } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { FileTaskArchive } from './task-archive';
import { loadOrCreateToken } from './token';
import { Viewers } from './viewers';
import type { WebhookDelivery, WebhookResult, WebhookSender } from './webhooks/send';

/**
 * A rule that sends a webhook, through the routes against a real server, a
 * real state file and a real activity file. Nothing here reaches a network:
 * the sender is a stand-in that keeps what it was asked to send and answers
 * what the test tells it to.
 */

/** Made-up values. The path and the query of the address stand for a key a chat tool puts there. */
const SECRET = 'made-up-secret-0123456789-abcdefghij-KLMNOP';
const PATH_KEY = 'PATHKEY-5c1e9d';
const QUERY_KEY = 'QUERYKEY-77aa01';
const ADDRESS = `https://hooks.example.test/services/${PATH_KEY}/in?key=${QUERY_KEY}`;
const OTHER_SECRET = 'another-made-up-secret-9876543210-zyxwvut';
const MARKER = 'MARKER-41d7c2';

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
let notified: string[] = [];
let events: ChangeEvent[] = [];
let answers: string[] = [];
let sent: WebhookDelivery[] = [];
/** What the stand-in answers the next deliveries with. */
let answer: (delivery: WebhookDelivery) => Promise<WebhookResult> = async () => ({ kind: 'answered', status: 204 });
const sender: WebhookSender = {
  send: (delivery) => {
    sent.push(delivery);
    return answer(delivery);
  },
};

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  foreground: async () => 'the-agent',
  typeLine: async () => {},
  create: async (options: { id: string }) => ({ id: options.id, cwd: null, command: null, activityAt: null }),
  type: async () => {},
  press: async () => {},
  screen: async () => ({ text: 'ready> ', columns: 80, rows: 24, cursor: { x: 7, y: 0 }, line: 0 }),
  lines: async () => ({ lines: ['ready> '], more: false, lost: false }),
  search: async () => ({ hits: [], truncated: false }),
  snapshot: async () => 'ready> ',
} as unknown as SessionRuntime;

const CONFIG = { api: { rateLimitPerMinute: 100_000 }, webhooks: [{ name: 'ops', address: ADDRESS, secret: SECRET }, { name: 'second', address: 'http://127.0.0.1:9/in', secret: OTHER_SECRET }, { name: 'plain', address: 'http://hooks.example.test/in', secret: OTHER_SECRET }] };

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(dir);
  const sessions = new Sessions(hub, runtime, {});
  const viewers = new Viewers();
  viewers.add((message) => void (message.type === 'notify' && notified.push(message.body)));
  app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir), taskArchive: new FileTaskArchive(dir), activity: new FileActivityLog(dir, 1024 * 1024), viewers, webhookSender: sender });
  events = [];
  hub.subscribe((event) => events.push(event));
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}
async function stop(): Promise<void> {
  await hub.flush();
  await app.close();
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-webhooks-'));
  ownerToken = await loadOrCreateToken(dir);
  await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify(CONFIG));
  notified = [];
  answers = [];
  sent = [];
  answer = async () => ({ kind: 'answered', status: 204 });
  await start();
});
afterEach(async () => {
  await stop();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
}
async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
  // Every answer of the server, with its headers, is kept: none may hold the secret or the rest of the address.
  answers.push(`${JSON.stringify(response.headers)}\n${response.body}`);
  let parsed: unknown;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch {
    parsed = response.body;
  }
  return { status: response.statusCode, body: parsed };
}
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
const asSession = (session: Session, method: string, url: string, body?: unknown): Promise<Answer> => call(sessionToken(ownerToken, session.id), method, url, body);
async function makeToken(name: string, scopes: Scope[], more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/v1/tokens', { name, scopes, ...more });
  expect(made.status).toBe(201);
  return made.body.secret as string;
}

function fakeSession(name: string, more: Partial<Session> = {}): Session {
  const session: Session = { id: newId(), projectId: hub.state.projects[0]!.id, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], fields: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null, ...more };
  hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return session;
}
/** A terminal with an agent in front that is free, in a folder, with a note and a command line: all of them what a body must not hold. */
const agent = (name: string, more: Partial<Session> = {}): Session => fakeSession(name, { agent: { kind: 'claude-code', conversationId: null, program: 'the-agent' }, command: 'the-agent', cwd: `/made-up/${MARKER}/folder`, note: `A note with ${MARKER}`, status: { ...NO_STATUS, state: 'busy', commandLine: `run ${MARKER}` }, ...more });
const says = async (session: Session, state: string, message?: string): Promise<void> => {
  expect((await asSession(session, 'PUT', `/v1/sessions/${session.id}/attention`, { state, ...(message ? { message } : {}) })).status).toBe(200);
};
let minute = 0;
const commandEnded = (session: Session, exit: number): void => {
  minute += 1;
  hub.emit({ type: 'session.status', sessionId: session.id, status: { ...NO_STATUS, state: 'idle', commandLine: `curl ${MARKER}`, lastExit: exit, lastFinishedAt: `2026-03-10T10:${String(minute).padStart(2, '0')}:00.000Z` } });
};
async function until(done: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await done())) {
    if (Date.now() > end) throw new Error('Waited too long');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const quiet = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 150));
const rule = async (event: string, webhook = 'ops', more: object = {}): Promise<Rule> => {
  const made = await asOwner('POST', '/v1/rules', { event, action: { kind: 'webhook', webhook }, ...more });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body.rules as Rule[]).at(-1) as Rule;
};
const ruleNow = (id: string): Rule => hub.state.queue.rules.find((r) => r.id === id) as Rule;
const forYouNow = async (): Promise<ForYou> => (await asOwner('GET', '/v1/for-you')).body as ForYou;
/** The lines of the activity file about rules, as they were written. */
const recorded = async (): Promise<{ action: string; route: string; status: number; outcome: string; webhook?: string | null; tokenName: string }[]> =>
  (await readFile(path.join(dir, ACTIVITY_FILE), 'utf8').catch(() => ''))
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { caller: string; action: string; route: string; status: number; outcome: string; webhook?: string | null; tokenName: string })
    .filter((entry) => entry.caller === 'rule');
const bodyOf = (delivery: WebhookDelivery): WebhookBody => WebhookBody.parse(JSON.parse(delivery.body));
/** The signature as a receiver works it out, with Node's own HMAC rather than the code that signs. */
const verifies = (delivery: WebhookDelivery, secret: string): boolean => {
  const header = delivery.headers[WEBHOOK_HEADERS.signature] ?? '';
  const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header) ?? [];
  return v1 !== undefined && createHmac('sha256', secret).update(`${t}.${delivery.body}`).digest('hex') === v1;
};
async function everyFile(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) found.push(...(await everyFile(full)));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

describe('a rule that sends a webhook', () => {
  it('sends exactly one message for each kind of event, with exactly the declared body: IDs, names and fixed words, and nothing a terminal showed or a task said', async () => {
    const login = agent('Fix login');
    const tests = fakeSession('Tests', { cwd: `/made-up/${MARKER}` });
    for (const event of RuleEvent.options) await rule(event);
    expect((await asOwner('GET', '/v1/rules')).body.rules[0].says).toBe('When a task is done, send the webhook “ops”.');
    const project = hub.state.projects[0]!;
    const of = (event: string): WebhookBody[] => sent.map(bodyOf).filter((body) => body.event === event);
    const ruleFor = (event: string): string => hub.state.queue.rules.find((r) => r.event === event)!.id;

    // What happens to a terminal.
    await says(login, 'waiting', `Which branch? ${MARKER}`);
    await until(() => of('terminal.waiting').length === 1);
    await says(login, 'waiting', `Well? ${MARKER}`);
    await says(login, 'done', `All green. ${MARKER}`);
    await until(() => of('terminal.finished').length === 1);
    commandEnded(tests, 3);
    await until(() => of('command.failed').length === 1);
    expect(of('terminal.waiting')).toEqual([{ id: expect.any(String), event: 'terminal.waiting', at: expect.any(String), text: 'The terminal “Fix login” is waiting for you', project: { id: project.id, name: project.name }, terminal: { id: login.id, name: 'Fix login' }, rule: { id: ruleFor('terminal.waiting') } }]);
    expect(of('terminal.finished')[0]).toMatchObject({ text: 'The terminal “Fix login” finished', terminal: { id: login.id, name: 'Fix login' } });
    expect(of('command.failed')[0]).toMatchObject({ text: 'A command failed in the terminal “Tests”', terminal: { id: tests.id, name: 'Tests' } });

    // What happens to a task: it needs the owner, it failed, another is done. The title, the details and the reason are other people's text.
    await says(login, 'working');
    const worker = agent('worker');
    const made = await asOwner('POST', '/v1/tasks', { title: `Deploy ${MARKER}`, details: `Details ${MARKER}`, taker: { kind: 'session', sessionId: worker.id } });
    const task = made.body as Task;
    expect((await asOwner('POST', '/v1/tasks/start', { taskId: task.id })).status).toBe(200);
    await asSession(worker, 'POST', `/v1/sessions/${worker.id}/run/report`, { type: 'blocked', reason: `I need ${MARKER}` });
    await until(() => of('task.needs-owner').length === 1);
    await asOwner('POST', `/v1/runs/${hub.state.queue.tasks.find((t) => t.id === task.id)!.runId}/report`, { type: 'stop' });
    await until(() => of('task.failed').length === 1);
    const again = (await asOwner('POST', '/v1/tasks', { title: `Again ${MARKER}`, taker: { kind: 'session', sessionId: worker.id } })).body as Task;
    expect((await asOwner('POST', '/v1/tasks/start', { taskId: again.id })).status).toBe(200);
    await asSession(worker, 'POST', `/v1/sessions/${worker.id}/run/report`, { type: 'done', note: `Did ${MARKER}` });
    await until(() => of('task.done').length === 1);
    expect(of('task.needs-owner')).toEqual([{ id: expect.any(String), event: 'task.needs-owner', at: expect.any(String), text: 'A task needs you', project: { id: project.id, name: project.name }, task: { id: task.id }, rule: { id: ruleFor('task.needs-owner') } }]);
    expect(of('task.failed')[0]).toMatchObject({ text: 'A task failed', task: { id: task.id } });
    expect(of('task.done')[0]).toMatchObject({ text: 'A task is done', task: { id: again.id } });

    // Something is asked of the owner: that it was, and never what.
    expect((await asSession(worker, 'POST', `/v1/sessions/${worker.id}/asks`, { text: `Rotate ${MARKER}` })).status).toBe(201);
    await until(() => of('ask.added').length === 1);
    expect(of('ask.added')).toEqual([{ id: expect.any(String), event: 'ask.added', at: expect.any(String), text: 'Something is asked of you', project: { id: project.id, name: project.name }, rule: { id: ruleFor('ask.added') } }]);

    // A schedule fires, run by hand; and one whose terminal is gone cannot run.
    const element = await asOwner('POST', '/v1/elements', { name: 'Morning list', instructions: `Gather ${MARKER}: {{task}}` });
    const free = agent('free');
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const morning = await asOwner('POST', '/v1/schedules', { name: 'My morning list', time: '08:30', days, what: { kind: 'element', elementId: element.body.id }, where: { kind: 'session', sessionId: free.id }, task: `the words ${MARKER}`, on: false });
    expect(morning.status, JSON.stringify(morning.body)).toBe(201);
    expect((await asOwner('POST', `/v1/schedules/${morning.body.id}/run`)).status).toBe(200);
    await until(() => of('schedule.fired').length === 1);
    expect(of('schedule.fired')).toEqual([{ id: expect.any(String), event: 'schedule.fired', at: expect.any(String), text: 'The schedule “My morning list” fired', project: { id: project.id, name: project.name }, task: { id: expect.any(String) }, schedule: { id: morning.body.id, name: 'My morning list' }, rule: { id: ruleFor('schedule.fired') } }]);
    const gone = fakeSession('gone');
    const broken = await asOwner('POST', '/v1/schedules', { name: 'Broken', time: '08:30', days, what: { kind: 'element', elementId: element.body.id }, where: { kind: 'session', sessionId: gone.id }, on: false });
    hub.emit({ type: 'session.closed', sessionId: gone.id });
    await asOwner('POST', `/v1/schedules/${broken.body.id}/run`);
    await until(() => of('schedule.failed').length === 1);
    expect(of('schedule.failed')[0]).toMatchObject({ text: 'The schedule “Broken” could not run or was missed', schedule: { id: broken.body.id, name: 'Broken' } });

    // One for each kind of event that was caused here, each to the address of the settings file and no other, each with a new ID.
    await quiet();
    for (const event of RuleEvent.options) expect(of(event).length, event).toBeGreaterThanOrEqual(1);
    for (const event of ['command.failed', 'task.needs-owner', 'task.failed', 'ask.added', 'schedule.failed']) expect(of(event), event).toHaveLength(1);
    // It kept waiting in other words: that was one happening, and one message.
    for (const event of ['terminal.waiting', 'terminal.finished']) expect(of(event).filter((body) => body.terminal?.id === login.id), event).toHaveLength(1);
    expect(new Set(sent.map((delivery) => delivery.address))).toEqual(new Set([ADDRESS]));
    expect(new Set(sent.map((delivery) => bodyOf(delivery).id)).size).toBe(sent.length);
    // The headers say the same as the body, and no more.
    for (const delivery of sent) {
      const body = bodyOf(delivery);
      expect(Object.keys(delivery.headers).sort()).toEqual([WEBHOOK_HEADERS.delivery, WEBHOOK_HEADERS.event, WEBHOOK_HEADERS.signature].sort());
      expect(delivery.headers[WEBHOOK_HEADERS.event]).toBe(body.event);
      expect(delivery.headers[WEBHOOK_HEADERS.delivery]).toBe(body.id);
      // Signed with the secret of the settings file: it verifies with that one and with no other.
      expect(verifies(delivery, SECRET)).toBe(true);
      expect(verifies(delivery, OTHER_SECRET)).toBe(false);
      expect(verifies({ ...delivery, body: delivery.body.replace('"event"', '"Event"') }, SECRET)).toBe(false);
      expect(Buffer.byteLength(delivery.body)).toBeLessThan(1024);
    }
    // Nothing a terminal showed, an agent said, a task or a schedule said, and no folder: nowhere in what was sent.
    const everything = JSON.stringify(sent);
    expect(everything).not.toContain(MARKER);
    expect(everything).not.toMatch(/curl|made-up\/|Deploy|Which branch|All green|Rotate|exit/);
    expect(everything).not.toContain(SECRET);

    // Each attempt is one line of the record: the rule, the event, the webhook's name, how it ended. Never where it went or what it said.
    await until(async () => (await recorded()).length === sent.length);
    for (const line of await recorded()) expect(line).toMatchObject({ action: 'rule.webhook', status: 200, outcome: 'ok', webhook: 'ops' });
    const file = await readFile(path.join(dir, ACTIVITY_FILE), 'utf8');
    for (const never of [MARKER, 'hooks.example.test', PATH_KEY, QUERY_KEY, SECRET, 'Fix login', 'is waiting for you']) expect(file, never).not.toContain(never);
  });

  it('names a webhook of the settings file and nothing else: an unknown name, a refused entry and an address of its own are not taken', async () => {
    // The page is told the names and the hosts of the entries that can be used, as they were read at start; the settings it is sent hold none.
    const state = (await asOwner('GET', '/api/v1/state')).body;
    expect(state.webhooks).toEqual([{ name: 'ops', host: 'hooks.example.test' }, { name: 'second', host: '127.0.0.1:9' }]);
    expect(state.settings.webhooks).toEqual([]);
    // Not in the file, or refused when the file was read (plain http to a host that is not this computer's own): no rule can name it.
    for (const name of ['nowhere', 'plain', 'OPS']) {
      const refused = await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'webhook', webhook: name } });
      expect(refused.status, name).toBe(400);
      expect(refused.body.error.message).toBe(`There is no webhook named “${name}” in the settings file, so the rule that names it sends nothing. Webhooks are written by hand under "webhooks" in config.json and read when the server starts.`);
    }
    // A rule cannot say where a message goes: a name that is an address, or no name, is not a webhook.
    for (const action of [{ kind: 'webhook' }, { kind: 'webhook', webhook: 'https://evil.example.test/' }, { kind: 'webhook', webhook: '../ops' }, { kind: 'webhook', webhook: ['ops'] }, { kind: 'webhook', address: 'https://evil.example.test/' }]) {
      const refused = await asOwner('POST', '/v1/rules', { event: 'task.done', action });
      expect(refused.status, JSON.stringify(action)).toBe(400);
      expect(refused.body.error.message).toBe('Say which webhook to send, by the name it has in the settings file.');
    }
    // What a rule carries beside the name changes nothing about where its message goes.
    const made = await asOwner('POST', '/v1/rules', { event: 'terminal.waiting', action: { kind: 'webhook', webhook: 'ops', address: 'https://evil.example.test/', secret: 'x', url: 'https://evil.example.test/', headers: { Host: 'evil.example.test' } } });
    expect(made.status).toBe(201);
    const login = agent('Fix login');
    await says(login, 'waiting');
    await until(() => sent.length === 1);
    expect(sent[0]!.address).toBe(ADDRESS);
    expect(JSON.stringify(sent[0])).not.toContain('evil');
    // The settings file changed while the server runs: it was read at start, and that is what counts.
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ ...CONFIG, webhooks: [{ name: 'ops', address: 'https://evil.example.test/in', secret: SECRET }] }));
    await asOwner('GET', '/api/v1/state');
    await says(login, 'working');
    await says(login, 'waiting');
    await until(() => sent.length === 2);
    expect(sent[1]!.address).toBe(ADDRESS);
    // The command line sends the name and nothing else.
    expect(parseRuleCommand(['add', '--when', 'terminal.waiting', '--webhook', 'ops'])).toMatchObject({ action: 'rule-add', event: 'terminal.waiting', webhook: 'ops', notify: false, run: null });
    expect(() => parseRuleCommand(['add', '--when', 'task.done', '--webhook', 'ops', '--notify'])).toThrow(/needs what to do/);
    expect(() => parseRuleCommand(['add', '--when', 'task.done', '--webhook', 'ops', '--on', 'x'])).toThrow(/takes no --on/);
  });

  it('that cannot be sent says so once on the owner\'s list for as long as that lasts, and no longer once a message is sent or the rule is changed or removed', async () => {
    const login = agent('Fix login');
    const made = await rule('terminal.waiting');
    const waitsAgain = async (): Promise<void> => {
      await says(login, 'working');
      await says(login, 'waiting');
    };
    const items = async (): Promise<ForYou['items']> => (await forYouNow()).items.filter((item) => item.kind === 'rule');
    // The receiver answers with an error, then does not answer in time, then cannot be reached: three attempts, one item.
    answer = async () => ({ kind: 'answered', status: 503 });
    await waitsAgain();
    await until(() => ruleNow(made.id).problem !== null);
    expect(ruleNow(made.id).problem).toBe('The webhook “ops” was not sent: the receiver answered with an error (5xx). Nothing is tried a second time; the next time its rule fires, it is sent again.');
    answer = async () => ({ kind: 'timed-out' });
    await waitsAgain();
    await until(() => (ruleNow(made.id).problem ?? '').includes('did not answer in time'));
    answer = async () => {
      throw new Error(`connect ECONNREFUSED ${ADDRESS}`);
    };
    await waitsAgain();
    await until(() => (ruleNow(made.id).problem ?? '').includes('could not be reached'));
    // One attempt for one happening: nothing was tried a second time.
    expect(sent).toHaveLength(3);
    expect(await items()).toMatchObject([{ id: `rule:${made.id}`, title: 'A webhook was not sent', act: `rule:${made.id}`, projectId: hub.state.projects[0]!.id, what: 'The webhook “ops” was not sent: the receiver could not be reached. Nothing is tried a second time; the next time its rule fires, it is sent again.' }]);
    expect((await asOwner('GET', '/v1/rules')).body.rules[0].problem).toContain('could not be reached');
    await until(async () => (await recorded()).length === 3);
    expect((await recorded()).map((line) => [line.action, line.route, line.status, line.outcome, line.webhook])).toEqual([['rule.webhook', 'terminal.waiting', 500, 'error', 'ops'], ['rule.webhook', 'terminal.waiting', 504, 'error', 'ops'], ['rule.webhook', 'terminal.waiting', 502, 'error', 'ops']]);
    // A redirect is an answer that is not followed, and an error of the receiver's.
    answer = async () => ({ kind: 'answered', status: 302 });
    await waitsAgain();
    await until(() => (ruleNow(made.id).problem ?? '').includes('a redirect, which is not followed'));
    // A message is sent: nothing is said any more.
    answer = async () => ({ kind: 'answered', status: 200 });
    await waitsAgain();
    await until(() => ruleNow(made.id).problem === null);
    expect(await items()).toEqual([]);
    // It fails again, and the rule is switched off and on: changed, it begins again. Removed, it is gone.
    answer = async () => ({ kind: 'failed' });
    await waitsAgain();
    await until(() => ruleNow(made.id).problem !== null);
    expect(await items()).toHaveLength(1);
    await asOwner('PATCH', `/v1/rules/${made.id}`, { on: false });
    expect(await items()).toEqual([]);
    await asOwner('PATCH', `/v1/rules/${made.id}`, { on: true });
    expect(ruleNow(made.id)).toMatchObject({ on: true, problem: null });
    answer = async () => ({ kind: 'failed' });
    hub.emit({ type: 'rule.changed', rule: { ...ruleNow(made.id), problem: 'The webhook “ops” was not sent: the receiver could not be reached.' } });
    expect(await items()).toHaveLength(1);
    expect((await asOwner('DELETE', `/v1/rules/${made.id}`)).status).toBeLessThan(300);
    expect(await items()).toEqual([]);
    // No word of an error of the network reached the state, an event or the record.
    await hub.flush();
    expect(JSON.stringify([hub.state, events])).not.toContain('ECONNREFUSED');
    expect(await readFile(path.join(dir, ACTIVITY_FILE), 'utf8')).not.toContain('ECONNREFUSED');
  });

  it('whose webhook is not in the settings file sends nothing and says so once, from the start of the server on, until it is there again', async () => {
    const login = agent('Fix login');
    const made = await rule('terminal.waiting');
    // The owner takes the entry out of the file and starts the server again.
    await stop();
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ ...CONFIG, webhooks: [] }));
    await start();
    const missing = 'There is no webhook named “ops” in the settings file, so the rule that names it sends nothing. Webhooks are written by hand under "webhooks" in config.json and read when the server starts.';
    expect(ruleNow(made.id).problem).toBe(missing);
    expect((await asOwner('GET', '/api/v1/state')).body.webhooks).toEqual([]);
    for (let n = 0; n < 3; n += 1) {
      await says(login, 'working');
      await says(login, 'waiting');
    }
    await until(async () => (await recorded()).length === 3);
    expect(sent).toEqual([]);
    expect((await recorded()).map((line) => [line.status, line.outcome, line.webhook])).toEqual([[404, 'error', 'ops'], [404, 'error', 'ops'], [404, 'error', 'ops']]);
    expect((await forYouNow()).items.filter((item) => item.kind === 'rule')).toMatchObject([{ id: `rule:${made.id}`, sentence: missing }]);
    // Written again, and the server started again: nothing is said, and the next happening is sent.
    await stop();
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify(CONFIG));
    await start();
    expect(ruleNow(made.id).problem).toBeNull();
    expect((await forYouNow()).items.filter((item) => item.kind === 'rule')).toEqual([]);
    await says(login, 'working');
    await says(login, 'waiting');
    await until(() => sent.length === 1);
  });

  it('is bounded in rate like every rule, hears only its own project, and holds up nothing while a receiver is slow', async () => {
    const mine = agent('mine');
    const made = await asOwner('POST', '/v1/projects', { name: 'Second' });
    const second = made.body.id as string;
    const canvasId = hub.state.canvases.find((c) => c.projectId === second)!.id;
    const theirs: Session = { ...mine, id: newId(), name: 'theirs', projectId: second };
    hub.emit({ type: 'session.created', session: theirs, canvasId, node: { id: newId(), sessionId: theirs.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
    await rule('terminal.waiting');
    // Another project's terminal: the first project's rule sends nothing.
    await says(theirs, 'waiting');
    await quiet();
    expect(sent).toEqual([]);

    // A receiver that does not answer: the change that caused the message is told, the other rule of the same event acts, and the next message is sent.
    let release: (result: WebhookResult) => void = () => {};
    answer = () => new Promise<WebhookResult>((resolve) => (release = resolve));
    expect((await asOwner('POST', '/v1/rules', { event: 'terminal.waiting', action: { kind: 'notify' } })).status).toBe(201);
    await says(mine, 'waiting');
    await until(() => sent.length === 1);
    expect(hub.state.sessions.find((s) => s.id === mine.id)!.attention.state).toBe('waiting');
    await until(() => notified.length === 1);
    const hanging = release;
    await says(mine, 'working');
    await says(mine, 'waiting');
    await until(() => sent.length === 2 && notified.length === 2);
    hanging({ kind: 'timed-out' });
    release({ kind: 'answered', status: 200 });

    // What comes too fast is dropped, and that is written down: an agent that flips its state cannot send more than the limit.
    answer = async () => ({ kind: 'answered', status: 200 });
    for (let n = 0; n < RULE_RATE_PER_MINUTE + 4; n += 1) {
      await says(mine, 'working');
      await says(mine, 'waiting');
    }
    await quiet();
    expect(sent).toHaveLength(RULE_RATE_PER_MINUTE);
    await until(async () => (await recorded()).filter((line) => line.action === 'rule.webhook').length === RULE_RATE_PER_MINUTE + 6);
    expect((await recorded()).filter((line) => line.action === 'rule.webhook' && line.status === 429).map((line) => line.outcome)).toEqual(['limited', 'limited', 'limited', 'limited', 'limited', 'limited']);
  });

  it('is made by the owner alone: no token of any scope and no session makes one, changes one or sends anything through any route', async () => {
    const worker = agent('worker');
    const everything = await makeToken('everything', [...GRANTABLE_SCOPES], { reviewWorkflowChanges: false, reach: { kind: 'all' } });
    // No rule is written. Whatever the walk causes (a terminal that waits, a task, a question), nothing may be sent.
    const bodies: (object | undefined)[] = [undefined, {}, { event: 'terminal.waiting', action: { kind: 'webhook', webhook: 'ops' } }, { state: 'waiting' }, { on: true }, { webhook: 'ops', address: 'https://evil.example.test/' }, { title: 'A task', text: 'A question' }];
    let tried = 0;
    for (const route of publicRoutesOf(app)) {
      if (route.url === '/v1/events') continue;
      const url = route.url.replace(/:([A-Za-z]+)/g, (_all, name: string) => (name === 'sessionId' ? worker.id : newId()));
      for (const body of bodies) {
        if ((route.method === 'GET' || route.method === 'DELETE') && body !== undefined) continue;
        for (const secret of [everything, sessionToken(ownerToken, worker.id)]) {
          const answered = await call(secret, route.method, url, body);
          expect(answered.status, `${route.method} ${route.url}`).not.toBe(500);
          tried += 1;
        }
      }
    }
    expect(tried).toBeGreaterThan(400);
    await quiet();
    expect(sent).toEqual([]);
    expect(hub.state.queue.rules).toEqual([]);
    // With the owner's rule written: neither can change it, switch it or remove it, and what is sent is the owner's rule's, to the owner's address.
    const made = await rule('terminal.waiting');
    const other = agent('other');
    for (const secret of [everything, sessionToken(ownerToken, other.id)]) {
      for (const [method, url, body] of [
        ['POST', '/v1/rules', { event: 'terminal.waiting', action: { kind: 'webhook', webhook: 'ops' } }],
        ['PATCH', `/v1/rules/${made.id}`, { on: false }],
        ['DELETE', `/v1/rules/${made.id}`, undefined],
        ['GET', '/v1/rules', undefined],
      ] as const) expect((await call(secret, method, url, body)).status, `${method} ${url}`).toBe(403);
    }
    expect(hub.state.queue.rules.map((r) => [r.id, r.on, r.action])).toEqual([[made.id, true, { kind: 'webhook', webhook: 'ops' }]]);
    // A session causes the event itself, and that is all it can do: one message, the owner's rule, the owner's address.
    await says(other, 'waiting', 'https://evil.example.test/');
    await until(() => sent.length === 1);
    expect(sent[0]!.address).toBe(ADDRESS);
    expect(bodyOf(sent[0]!)).toMatchObject({ rule: { id: made.id }, terminal: { id: other.id } });
    expect(sent[0]!.body).not.toContain('evil');
  });

  it('keeps the secret and the rest of the address in the settings file: in no answer, no event, nothing printed and no other file of the data folder', async () => {
    const printed: string[] = [];
    const original = { log: console.log, warn: console.warn, error: console.error };
    for (const level of ['log', 'warn', 'error'] as const) console[level] = (...args: unknown[]) => void printed.push(args.map(String).join(' '));
    try {
      const login = agent('Fix login');
      const made = await rule('terminal.waiting');
      await rule('terminal.finished', 'second');
      // Sent, refused by the receiver, cut off with an error that names the address, and thrown by the sender itself.
      for (const next of [async (): Promise<WebhookResult> => ({ kind: 'answered', status: 200 }), async (): Promise<WebhookResult> => ({ kind: 'answered', status: 401 }), async (): Promise<WebhookResult> => ({ kind: 'failed' })]) {
        answer = next;
        await says(login, 'working');
        await says(login, 'waiting');
      }
      answer = async () => {
        throw new TypeError(`fetch failed: ${ADDRESS} with ${SECRET}`);
      };
      await says(login, 'done');
      await until(() => sent.length === 4);
      await until(async () => (await recorded()).length === 4);
      // Everything the owner, a token and a session can ask that is about rules, settings or what happened.
      const reader = await makeToken('reader', [...GRANTABLE_SCOPES], { reach: { kind: 'all' } });
      for (const url of ['/api/v1/state', '/v1/rules', '/v1/for-you', '/v1/activity', '/v1', '/v1/openapi.json', '/v1/settings/appearance', `/v1/projects/${hub.state.projects[0]!.id}/file`, '/v1/sessions', '/v1/tasks', '/v1/board']) {
        await asOwner('GET', url);
        await call(reader, 'GET', url);
        await asSession(login, 'GET', url);
      }
      await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'webhook', webhook: 'nowhere' } });
      await asOwner('DELETE', `/v1/rules/${made.id}`);
      await hub.flush();
      // `doctor` says the names and the hosts, and what is wrong with an entry in words that do not repeat it.
      const report = await webhookReport(dir);
      expect(report).toEqual({ webhooks: [{ name: 'ops', host: 'hooks.example.test' }, { name: 'second', host: '127.0.0.1:9' }], problems: ['webhooks: “plain”: its address is plain http on a host that is not this computer’s own; a webhook elsewhere is https.'] });
      printed.push(JSON.stringify(report));
    } finally {
      Object.assign(console, original);
    }
    const never = [SECRET, OTHER_SECRET, PATH_KEY, QUERY_KEY, '/services/', '?key='];
    const files = await everyFile(dir);
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      // The settings file is where they are written, and the only place.
      if (path.basename(file) === SETTINGS_FILE) expect(text).toContain(SECRET);
      else for (const word of never) expect(text, `${word} in ${path.basename(file)}`).not.toContain(word);
    }
    expect(answers.length).toBeGreaterThan(30);
    for (const [where, text] of [['an answer', answers.join('\n')], ['an event', JSON.stringify(events)], ['the state', JSON.stringify(hub.state)], ['what was printed', printed.join('\n')]] as const) for (const word of never) expect(text, `${word} in ${where}`).not.toContain(word);
    // The host is said to the owner's page and nobody else.
    expect(answers.filter((text) => text.includes('hooks.example.test'))).toHaveLength(1);
  });

  it('is not written into a project file, and a file that holds one is refused whole', async () => {
    await rule('terminal.waiting');
    await asOwner('POST', '/v1/rules', { event: 'task.done', action: { kind: 'notify' } });
    const exported = (await asOwner('GET', `/v1/projects/${hub.state.projects[0]!.id}/file`)).body as { text: string; leftOut: string[] };
    expect(exported.leftOut).toContain('A rule that sends a webhook is not in the file: a webhook is written in the settings file of one computer.');
    expect((JSON.parse(exported.text) as { rules: unknown[] }).rules).toEqual([{ event: 'task.done', action: { kind: 'notify' } }]);
    const withOne = JSON.stringify({ ...(JSON.parse(exported.text) as object), rules: [{ event: 'task.done', action: { kind: 'webhook', webhook: 'ops' } }] });
    expect(readProjectFile(withOne)).toEqual({ ok: false, problem: 'A rule in this file sends a webhook. A project file cannot hold such a rule: a webhook is written in the settings file of one computer, and a rule that sends one is written there by its owner.' });
  });
});
