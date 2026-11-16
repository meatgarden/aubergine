import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@aubergine/client';
import { BRIEF_LINE, NO_ATTENTION, NO_STATUS, SESSION_ENV, newId, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from '../auth';
import { FileRunArchive } from '../run-archive';
import type { SessionRuntime } from '../runtime/runtime';
import { buildServer, cookieName } from '../server';
import { Sessions } from '../sessions';
import { SettingsFile } from '../settings';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { loadOrCreateToken } from '../token';
import { UsageError, parseCommand } from './commands';
import { formatWorkflows, parseElementCommand, parseWorkflowCommand, resolveElement, resolveWorkflow, runWorkflowCommand, showControl, type WorkflowCommand, type WorkflowCommandDeps } from './workflow';

describe('parsing workflow commands', () => {
  const parse = (line: string): unknown => parseWorkflowCommand(line.split(' ').filter(Boolean));

  it('hands the words after "workflow" over untouched', () => {
    expect(parseCommand(['workflow', 'run', 'Fix a bug', '--input', 'task=x'])).toEqual({ name: 'workflow', words: ['run', 'Fix a bug', '--input', 'task=x'] });
    expect(parseCommand(['workflows'])).toEqual({ name: 'workflow', words: [] });
  });

  it('reads the commands about workflows', () => {
    expect(parse('')).toEqual({ action: 'list' });
    expect(parse('list')).toEqual({ action: 'list' });
    expect(parse('templates')).toEqual({ action: 'templates' });
    expect(parse('show Fix a bug')).toEqual({ action: 'show', query: 'Fix a bug' });
    expect(parse('new My flow')).toEqual({ action: 'new', workflowName: 'My flow', template: null });
    expect(parse('new My flow --template fix-a-bug')).toEqual({ action: 'new', workflowName: 'My flow', template: 'fix-a-bug' });
    expect(parse('edit My flow --file /tmp/x.json')).toEqual({ action: 'edit', query: 'My flow', file: '/tmp/x.json' });
    expect(parse('remove My flow --yes')).toEqual({ action: 'remove', query: 'My flow', yes: true });
    expect(parse('copy flow Another name')).toEqual({ action: 'copy', query: 'flow', newName: 'Another name' });
    expect(parse('export flow')).toEqual({ action: 'export', query: 'flow', file: null, toRepository: false, overwrite: false });
    expect(parse('export My flow --to-repository --overwrite')).toEqual({ action: 'export', query: 'My flow', file: null, toRepository: true, overwrite: true });
    expect(() => parse('export flow --overwrite')).toThrow(UsageError);
    expect(parse('export flow out.json')).toEqual({ action: 'export', query: 'flow', file: 'out.json', toRepository: false, overwrite: false });
    expect(parse('import in.json --name Mine')).toEqual({ action: 'import', file: 'in.json', newName: 'Mine' });
    expect(parse('import -')).toEqual({ action: 'import', file: '-', newName: null });
  });

  it('reads run, with inputs whose values may hold spaces and equals signs', () => {
    expect(parseWorkflowCommand(['run', 'Fix', 'a', 'bug', '--session', 'api', '--input', 'task=the login bug: a=b', '--input=area=web', '--replace'])).toEqual({
      action: 'run',
      query: 'Fix a bug',
      session: 'api',
      inputs: { task: 'the login bug: a=b', area: 'web' },
      replace: true,
    });
    expect(parse('run flow')).toEqual({ action: 'run', query: 'flow', session: null, inputs: {}, replace: false });
  });

  it('reads what a session says about its run', () => {
    expect(parse('status')).toEqual({ action: 'status' });
    expect(parse('done')).toEqual({ action: 'done', note: null, element: null, output: null });
    expect(parseWorkflowCommand(['done', '--note', 'Wrote the plan, see PLAN.md'])).toEqual({ action: 'done', note: 'Wrote the plan, see PLAN.md', element: null, output: null });
    expect(parse('done it is finished --element build')).toEqual({ action: 'done', note: 'it is finished', element: 'build', output: null });
    expect(parse('blocked I need the password')).toEqual({ action: 'blocked', reason: 'I need the password' });
    expect(parse('goto 2')).toEqual({ action: 'goto', element: '2' });
    expect(parse('pause')).toEqual({ action: 'pause' });
    expect(parse('resume')).toEqual({ action: 'resume' });
    expect(parse('stop')).toEqual({ action: 'stop' });
  });

  it('says what is missing or unknown', () => {
    for (const line of ['show', 'new', 'run', 'blocked', 'goto', 'copy', 'export', 'import', 'import a b', 'status now', 'run flow --input task', 'run flow --input =x', 'run flow --loud', 'frobnicate', 'done --note a b']) {
      expect(() => parse(line), line).toThrow(UsageError);
    }
  });

  it('finds a workflow by name, the start of a name, or an ID, and refuses a name two share', () => {
    const list = [
      { id: '01900000-0000-7000-8000-000000000001', name: 'Fix a bug' },
      { id: '01900000-0000-7000-8000-000000000002', name: 'Fix a bug' },
      { id: '01900000-0000-7000-8000-000000000003', name: 'Review a change' },
    ];
    expect(resolveWorkflow(list, 'review a change').id).toBe(list[2]!.id);
    expect(resolveWorkflow(list, 'rev').id).toBe(list[2]!.id);
    expect(resolveWorkflow(list, list[1]!.id).id).toBe(list[1]!.id);
    expect(() => resolveWorkflow(list, 'Fix a bug')).toThrow(/2 workflows are named/);
    expect(() => resolveWorkflow(list, 'nothing')).toThrow(/No workflow matches/);
  });

  it('finds an element by ID, name, start of a name or number', () => {
    const elements = [
      { id: 'plan', name: 'Plan' },
      { id: 'build', name: 'Build' },
      { id: 'check', name: 'Check it' },
    ];
    expect(resolveElement(elements, 'build')).toBe('build');
    expect(resolveElement(elements, 'Check it')).toBe('check');
    expect(resolveElement(elements, 'che')).toBe('check');
    expect(resolveElement(elements, '1')).toBe('plan');
    expect(() => resolveElement(elements, '4')).toThrow(/1\. Plan, 2\. Build, 3\. Check it/);
  });

  it('lists workflows in columns', () => {
    expect(formatWorkflows([], new Map())).toContain('No workflows yet');
    const text = formatWorkflows(
      [{ id: 'a', name: 'Fix a bug', description: '', labels: {}, origin: { kind: 'local' }, createdAt: '', updatedAt: '', version: 3, elements: ['Reproduce', 'Fix'] }],
      new Map([['a', 2]]),
    );
    expect(text.split('\n')).toEqual(['NAME       ELEMENTS  VERSION  RUNS', 'Fix a bug  2         v3       2     Reproduce → Fix']);
  });
});

describe('workflow commands against a server', () => {
  let dir: string;
  let ownerToken: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let port: number;
  let printed: string[];
  let edits: string[];
  let answers: string[];
  let typed: [string, string][];
  /** What a command reads when its file is `-`. */
  let stdin = '';

  const runtime = {
    check: async () => ({ status: 'ok', version: '3.4' }),
    list: async () => [],
    has: async () => true,
    kill: async () => {},
    typeLine: async (id: string, line: string) => {
      typed.push([id, line]);
    },
  } as unknown as SessionRuntime;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-workflow-cli-'));
    ownerToken = await loadOrCreateToken(dir);
    const store = new JsonStore(dir);
    hub = new StateHub(await store.load(), store);
    const settings = new SettingsFile(dir);
    const sessions = new Sessions(hub, runtime, {});
    app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), runArchive: new FileRunArchive(dir) });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
    printed = [];
    edits = [];
    answers = [];
    typed = [];
  });

  afterEach(async () => {
    await hub.flush();
    await app.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  function fakeSession(name: string, more: Partial<Session> = {}): Session {
    const session: Session = { id: newId(), projectId: hub.state.project.id, name, createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, ...more };
    hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
    return session;
  }

  /** The command as typed, by the owner outside any session, or inside one. */
  const run = (words: string[], inside?: Session): Promise<{ code: number; out: string }> => runParsed(parseWorkflowCommand(words), inside);
  const runElement = (words: string[], inside?: Session): Promise<{ code: number; out: string }> => runParsed(parseElementCommand(words), inside);

  async function runParsed(command: WorkflowCommand, inside?: Session): Promise<{ code: number; out: string }> {
    printed = [];
    const origin = `http://127.0.0.1:${port}`;
    const deps: WorkflowCommandDeps = {
      owner: async (work) => work(createClient({ baseUrl: origin, headers: { origin, cookie: `${cookieName(port)}=${ownerToken}` } })),
      env: inside ? { [SESSION_ENV.url]: origin, [SESSION_ENV.sessionId]: inside.id, [SESSION_ENV.token]: sessionToken(ownerToken, inside.id) } : {},
      sessions: async () => hub.state.sessions,
      print: (text) => printed.push(text),
      readText: (file) => (file === '-' ? Promise.resolve(stdin) : readFile(file, 'utf8')),
      writeText: (file, text) => writeFile(file, text),
      edit: async (text) => {
        edits.push(text);
        return null;
      },
      ask: async () => answers.shift() ?? '',
    };
    const code = await runWorkflowCommand(command, deps);
    return { code, out: printed.join('\n') };
  }

  it('makes, shows, lists, copies and removes workflows', async () => {
    expect((await run(['list'])).out).toContain('No workflows yet');
    expect((await run(['templates'])).out).toContain('fix-a-bug');
    const made = await run(['new', 'Hotfix', '--template', 'fix-a-bug']);
    expect(made.out).toContain('Made the workflow "Hotfix" with 5 elements: Reproduce → Find the cause → Fix → Test → Summarise.');
    expect((await run(['new', 'Scratch'])).out).toContain('with one element');

    const shown = (await run(['show', 'hot'])).out;
    expect(shown).toContain('Hotfix (version 1)');
    expect(shown).toContain('1. Reproduce  [reproduce]');
    expect(shown).toContain('Done when: There is a command or a test that shows the bug every time.');
    expect(shown).toContain('Inputs: task (Task, needed)');

    expect((await run(['copy', 'Hotfix', 'Hotfix', 'for', 'web'])).out).toBe('Made "Hotfix for web", a copy of "Hotfix".');
    expect((await run(['list'])).out.split('\n').map((line) => line.split('  ')[0])).toEqual(['NAME', 'Hotfix', 'Hotfix for web', 'Scratch']);

    // Removing asks first.
    answers = ['n'];
    expect((await run(['remove', 'Scratch'])).out).toBe('Kept.');
    answers = ['y'];
    expect((await run(['remove', 'Scratch'])).out).toBe('Removed "Scratch".');
    expect((await run(['remove', 'Hotfix for web', '--yes'])).out).toBe('Removed "Hotfix for web".');
    expect(hub.state.workflows.map((w) => w.name)).toEqual(['Hotfix']);
    await expect(run(['show', 'nothing'])).rejects.toThrow(/No workflow matches/);
  });

  it('exports a workflow and imports it again, with what it does not know kept', async () => {
    await run(['new', 'Hotfix', '--template', 'fix-a-bug']);
    const file = path.join(dir, 'hotfix.json');
    expect((await run(['export', 'Hotfix', file])).out).toContain('Wrote "Hotfix"');
    const exported = JSON.parse(await readFile(file, 'utf8'));
    expect(exported).toMatchObject({ aubergine: 'workflow', format: 1, workflow: { name: 'Hotfix' } });
    // To standard output without a file.
    expect(JSON.parse((await run(['export', 'Hotfix'])).out)).toEqual(exported);

    // Someone with a newer version added things this one does not know.
    exported.reviewedBy = 'someone';
    exported.workflow.budget = { minutes: 20 };
    exported.workflow.elements[0].expects = ['a failing test'];
    await writeFile(file, JSON.stringify(exported));
    expect((await run(['import', file, '--name', 'Hotfix 2'])).out).toContain('Made the workflow "Hotfix 2"');

    const again = JSON.parse((await run(['export', 'Hotfix 2'])).out);
    expect(again.reviewedBy).toBe('someone');
    expect(again.workflow.budget).toEqual({ minutes: 20 });
    expect(again.workflow.elements[0].expects).toEqual(['a failing test']);
    expect(again.workflow.elements).toEqual(exported.workflow.elements);
    expect(again.workflow.origin).toEqual({ kind: 'import' });

    await writeFile(file, '{ not json');
    await expect(run(['import', file])).rejects.toThrow(/not JSON/);
    await writeFile(file, '{"name":"x"}');
    await expect(run(['import', file])).rejects.toThrow(/not an Aubergine workflow file/);
  });

  it('edits a workflow from a file, as a new version, and from the editor when nothing is changed there', async () => {
    await run(['new', 'Hotfix', '--template', 'plan-build-check']);
    const file = path.join(dir, 'edit.json');
    await run(['export', 'Hotfix', file]);
    const content = JSON.parse(await readFile(file, 'utf8'));
    content.workflow.elements[1].instructions = 'Build it, and write tests first.';
    content.workflow.elements.push({ name: 'Tidy up', instructions: 'Remove what is left over.' });
    await writeFile(file, JSON.stringify(content));
    expect((await run(['edit', 'Hotfix', '--file', file])).out).toContain('Saved "Hotfix" as version 2');
    const saved = hub.state.workflows[0]!.versions.at(-1)!;
    expect(saved.elements.map((e) => e.id)).toEqual(['plan', 'build', 'check', 'tidy-up']);
    expect(saved.elements[1]?.instructions).toBe('Build it, and write tests first.');
    // The same file again changes nothing.
    await run(['export', 'Hotfix', file]);
    expect((await run(['edit', 'Hotfix', '--file', file])).out).toBe('Nothing changed.');
    // The editor is given the file as export writes it.
    expect((await run(['edit', 'Hotfix'])).out).toBe('Nothing changed.');
    expect(JSON.parse(edits[0]!)).toMatchObject({ aubergine: 'workflow', workflow: { name: 'Hotfix' } });
  });

  it('starts a run on a named session, or on the session it is typed in', async () => {
    await run(['new', 'Hotfix', '--template', 'plan-build-check']);
    const api = fakeSession('api');
    const web = fakeSession('web', { agent: { kind: 'claude-code', conversationId: null }, status: { ...NO_STATUS, state: 'busy' } });

    await expect(run(['run', 'Hotfix', '--input', 'task=x'])).rejects.toThrow(/needs a session/);
    const started = await run(['run', 'Hotfix', '--session', 'api', '--input', 'task=the login bug']);
    expect(started.out).toContain('Started "Hotfix" on "api": Plan · 1 of 3.');
    // A plain shell: nothing is typed, and the line to give an agent is shown.
    expect(started.out).toContain('Nothing was typed into the terminal');
    expect(started.out).toContain('aubergine workflow status');
    expect(typed).toEqual([]);

    // Inside a session with an agent: that session, and the agent is told.
    const inside = await run(['run', 'Hotfix', '--input', 'task=another'], web);
    expect(inside.out).toContain('Started "Hotfix" on "web"');
    expect(inside.out).toContain('The agent in it has been told.');
    expect(typed.map(([id]) => id)).toEqual([web.id]);
    expect(hub.state.runs.map((r) => r.sessionId).sort()).toEqual([api.id, web.id].sort());
    expect(hub.state.runs.find((r) => r.sessionId === api.id)?.startedBy).toEqual({ kind: 'person' });

    // A second run on the same session is refused, in the server's words, unless asked to replace.
    await expect(run(['run', 'Hotfix', '--session', 'api', '--input', 'task=x'])).rejects.toThrow(/already on "Hotfix"/);
    expect((await run(['run', 'Hotfix', '--session', 'api', '--input', 'task=x', '--replace'])).code).toBe(0);
    await expect(run(['run', 'Hotfix', '--session', 'web', '--replace'])).rejects.toThrow(/"Task" is needed/);
    expect((await run(['list'])).out).toMatch(/Hotfix\s+3\s+v1\s+2/);
  });

  it('lets a session read its run and move it: status, done, blocked, goto, pause, resume, stop', async () => {
    await run(['new', 'Hotfix', '--template', 'plan-build-check']);
    const session = fakeSession('api');
    expect(await run(['status'], session)).toEqual({ code: 1, out: 'This session is on no workflow' });
    await run(['run', 'Hotfix', '--session', 'api', '--input', 'task=the login bug']);

    const status = await run(['status'], session);
    expect(status.code).toBe(0);
    expect(status.out).toContain('Element 1 of 3: Plan');
    expect(status.out).toContain('The task: the login bug');

    const done = await run(['done', '--note', 'Planned: change net.ts only.'], session);
    expect(done.code).toBe(0);
    expect(done.out).toContain('Recorded: "Plan" is done.');
    expect(done.out).toContain('Element 2 of 3: Build');
    expect(done.out).toContain('Planned: change net.ts only.');
    expect(hub.state.runs[0]?.elements[0]).toMatchObject({ state: 'done', note: 'Planned: change net.ts only.', by: { kind: 'agent' } });

    expect((await run(['blocked', 'I', 'need', 'the', 'password'], session)).out).toContain('Recorded: blocked on Build · 2 of 3.');
    expect(hub.state.runs[0]).toMatchObject({ status: 'blocked', blockedReason: 'I need the password' });
    expect((await run(['goto', 'plan'], session)).out).toContain('Element 1 of 3: Plan');
    expect((await run(['goto', '3'], session)).out).toContain('Element 3 of 3: Check');
    await expect(run(['goto', 'nowhere'], session)).rejects.toThrow(/No element matches/);

    expect((await run(['pause'], session)).out).toBe('The run is paused at Check · 3 of 3.');
    // Refused while paused, in words an agent can act on, with a failing exit code.
    const refused = await run(['done'], session);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('paused');
    expect((await run(['resume'], session)).out).toBe('The run goes on: Check · 3 of 3.');

    const last = await run(['done', 'all', 'checks', 'pass'], session);
    expect(last.out).toContain('Recorded: "Check" is done.');
    expect(last.out).toContain('This run is finished');
    expect(hub.state.runs).toEqual([]);
    expect((await run(['done'], session)).code).toBe(1);

    await run(['run', 'Hotfix', '--session', 'api', '--input', 'task=again']);
    expect((await run(['stop'], session)).out).toBe('The run is stopped.');
  });

  it('says so when a session command is typed outside a session, or the server is gone', async () => {
    await expect(run(['status'])).rejects.toThrow(/only works inside an Aubergine session/);
    const session = fakeSession('api');
    printed = [];
    const code = await runWorkflowCommand(
      { action: 'status' },
      { env: { [SESSION_ENV.url]: 'http://127.0.0.1:9', [SESSION_ENV.sessionId]: session.id, [SESSION_ENV.token]: 'x' }, print: (text: string) => printed.push(text) } as unknown as WorkflowCommandDeps,
    );
    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('not answering');
  });

  it('lets an agent read what it was asked to write, hand it in from a file or standard input, and read the comment', async () => {
    const agent = fakeSession('helper', { agent: { kind: 'claude-code', conversationId: null }, status: { ...NO_STATUS, state: 'busy' } });
    expect(await run(['brief'], agent)).toEqual({ code: 1, out: 'Nothing is asked of this session' });

    // What the owner typed may hold anything. It is printed with control characters shown, never acted on.
    const origin = `http://127.0.0.1:${port}`;
    const owner = createClient({ baseUrl: origin, headers: { origin, cookie: `${cookieName(port)}=${ownerToken}` } });
    await owner.requestDraft({ body: { kind: 'element', description: 'My to-do list from the chat.\u001b[2J\u0007 Thanks‮', sessionId: agent.id } });
    expect(typed.map(([, line]) => line)).toEqual([BRIEF_LINE]);
    const brief = await run(['brief'], agent);
    expect(brief.code).toBe(0);
    expect(brief.out).toContain('My to-do list from the chat.␛[2J␇ Thanks<U+202E>');
    expect([...brief.out].filter((c) => c !== '\n' && c !== '\t' && ((c.codePointAt(0) as number) < 0x20 || c === '\u007f' || c === '\u202e'))).toEqual([]);
    expect(brief.out).toContain('aubergine element propose --file <file>');

    const file = path.join(dir, 'element.json');
    const element = { name: 'Collect my to-dos', instructions: 'List what people asked me to do in the team chat.', needs: [{ kind: 'mcp', name: 'team chat' }], produces: 'checklist' };
    await writeFile(file, JSON.stringify(element));
    const handed = await runElement(['propose', '--file', file], agent);
    expect(handed).toMatchObject({ code: 0 });
    expect(handed.out).toContain('Handed in the element as a draft.');
    expect(hub.state.drafts[0]).toMatchObject({ status: 'waiting', element: { name: 'Collect my to-dos', produces: 'checklist' } });

    // Sent back: only the fixed line is typed again; the comment is what `brief` prints.
    await owner.returnDraft({ draftId: hub.state.drafts[0]!.id, body: { comment: 'Also include email.' } });
    expect(typed.map(([, line]) => line)).toEqual([BRIEF_LINE, BRIEF_LINE]);
    expect((await run(['brief'], agent)).out).toContain('sent back with this comment:\n\nAlso include email.');
    // Revised, this time on standard input.
    stdin = JSON.stringify({ ...element, instructions: 'List what people asked me to do in the team chat and by email.' });
    expect((await runElement(['propose'], agent)).out).toContain('as a draft (version 2)');
    expect(hub.state.drafts[0]).toMatchObject({ status: 'waiting', revision: 2 });

    // What is not an element is refused in words, and nothing is kept of it.
    await writeFile(file, '{ nope');
    await expect(runElement(['propose', '--file', file], agent)).rejects.toThrow(/not JSON/);
    await writeFile(file, JSON.stringify({ name: 'Bad\u001bname', instructions: 'x' }));
    expect(await runElement(['propose', '--file', file], agent)).toMatchObject({ code: 1 });
    await expect(runElement(['propose', '--file', file])).rejects.toThrow(/only works inside an Aubergine session/);
    expect(hub.state.drafts).toHaveLength(1);
  });

  it('hands a workflow in as a draft, also from a file that workflow export wrote', async () => {
    const agent = fakeSession('helper');
    await run(['new', 'Hotfix', '--template', 'fix-a-bug']);
    const file = path.join(dir, 'flow.json');
    await run(['export', 'Hotfix', file]);
    expect((await run(['propose', '--file', file], agent)).out).toContain('Handed in the workflow as a draft.');
    await writeFile(file, JSON.stringify({ name: 'Two steps', elements: [{ name: 'One', instructions: 'Do one.' }, { name: 'Two', instructions: 'Do two.' }] }));
    expect((await run(['propose', '--file', file], agent)).code).toBe(0);
    expect(hub.state.drafts.map((d) => [d.kind, d.workflow?.name, d.workflow?.elements.length])).toEqual([
      ['workflow', 'Hotfix', 5],
      ['workflow', 'Two steps', 2],
    ]);
    // Drafts are not workflows: the list still has the one the owner made.
    expect(hub.state.workflows.map((w) => w.name)).toEqual(['Hotfix']);
  });

  it('runs one element by itself and takes a checklist with done --output', async () => {
    const origin = `http://127.0.0.1:${port}`;
    const owner = createClient({ baseUrl: origin, headers: { origin, cookie: `${cookieName(port)}=${ownerToken}` } });
    expect((await runElement(['list'])).out).toContain('No elements on the shelf yet');
    await owner.createElement({ body: { name: 'Collect my to-dos', instructions: 'List what people asked me to do.', needs: [{ kind: 'mcp', name: 'team chat' }], produces: 'checklist' } });
    expect((await runElement(['list'])).out).toBe('Collect my to-dos  produces a checklist; needs an MCP server: team chat');
    expect((await runElement(['show', 'collect'])).out).toContain('Produces: checklist');

    const session = fakeSession('api');
    await expect(runElement(['run', 'collect'])).rejects.toThrow(/needs a session/);
    const started = await runElement(['run', 'collect', '--session', 'api']);
    expect(started.out).toContain('Started "Collect my to-dos" by itself on "api".');
    expect((await run(['list'])).out).toContain('No workflows yet');

    const status = await run(['status'], session);
    expect(status.out).toContain('This element needs: an MCP server: team chat.');
    expect(status.out).toContain('This element produces a checklist.');
    // Without the checklist: refused, with the format, and a failing exit code.
    const refused = await run(['done', '--note', 'all done'], session);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('produces a checklist, and none was handed in');
    expect(refused.out).toContain('{"items": [{"text": "one line"');
    const file = path.join(dir, 'list.json');
    await writeFile(file, 'not json');
    await expect(run(['done', '--output', file], session)).rejects.toThrow(/The output is not JSON/);
    await writeFile(file, JSON.stringify({ items: [{ text: '' }] }));
    expect((await run(['done', '--output', file], session)).out).toContain('Item 1 (text)');

    await writeFile(file, JSON.stringify({ items: [{ text: 'Review the retry change' }, { text: 'Book the room' }] }));
    const done = await run(['done', '--note', 'Two requests.', '--output', file], session);
    expect(done.code).toBe(0);
    expect(done.out).toContain('This run is finished');
    expect(hub.state.runs).toEqual([]);
    expect(hub.state.workflows).toEqual([]);

    answers = ['y'];
    expect((await runElement(['remove', 'collect'])).out).toBe('Took "Collect my to-dos" off the shelf.');
  });
});

describe('what the commands print of text someone else wrote', () => {
  it('shows control characters instead of sending them to the terminal, and keeps lines and tabs', () => {
    expect(showControl('plain text\n\twith a tab')).toBe('plain text\n\twith a tab');
    expect(showControl('clear\u001b[2J bell\u0007 back\u0008 nul\u0000 del\u007f')).toBe('clear␛[2J bell␇ back␈ nul␀ del␡');
    expect(showControl('a\r\nb\rc')).toBe('a\nb␍c');
    expect(showControl('flip‮ped ⁦x⁩ \u009b31m')).toBe('flip<U+202E>ped <U+2066>x<U+2069> <U+009B>31m');
    expect(showControl('修复 — étape 🚀')).toBe('修复 — étape 🚀');
  });

  it('reads the new commands, and refuses what they do not know', () => {
    expect(parseWorkflowCommand(['brief'])).toEqual({ action: 'brief' });
    expect(parseWorkflowCommand(['propose', '--file', 'w.json'])).toEqual({ action: 'propose', kind: 'workflow', file: 'w.json' });
    expect(parseWorkflowCommand(['propose'])).toEqual({ action: 'propose', kind: 'workflow', file: '-' });
    expect(parseElementCommand(['propose', '--file=-'])).toEqual({ action: 'propose', kind: 'element', file: '-' });
    expect(parseElementCommand([])).toEqual({ action: 'element-list' });
    expect(parseElementCommand(['show', 'Collect', 'my', 'to-dos'])).toEqual({ action: 'element-show', query: 'Collect my to-dos' });
    expect(parseElementCommand(['run', 'collect', '--session', 'api', '--input', 'task=x', '--replace'])).toEqual({ action: 'element-run', query: 'collect', session: 'api', inputs: { task: 'x' }, replace: true });
    expect(parseElementCommand(['remove', 'collect', '--yes'])).toEqual({ action: 'element-remove', query: 'collect', yes: true });
    expect(parseWorkflowCommand(['done', '--output', 'list.json', '--note', 'n'])).toEqual({ action: 'done', note: 'n', element: null, output: 'list.json' });
    expect(parseWorkflowCommand(['done', '--output', '-'])).toEqual({ action: 'done', note: null, element: null, output: '-' });
    expect(parseCommand(['element', 'run', 'x'])).toEqual({ name: 'element', words: ['run', 'x'] });
    for (const words of [['propose', 'w.json'], ['propose', '--file'], ['propose', '--file', 'a', '--loud'], ['brief', 'now'], ['done', '--output']]) expect(() => parseWorkflowCommand(words), words.join(' ')).toThrow(UsageError);
    for (const words of [['frobnicate'], ['show'], ['run'], ['list', 'all'], ['remove', 'x', '--force'], ['propose', '--made-up']]) expect(() => parseElementCommand(words), words.join(' ')).toThrow(UsageError);
  });
});
