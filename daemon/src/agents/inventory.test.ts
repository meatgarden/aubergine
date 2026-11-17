import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GRANTABLE_SCOPES, Inventory, inventoryText, matchNeed, searchInventory, type InventoryItem } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileActivityLog } from '../activity';
import { sessionToken } from '../auth';
import type { SessionRuntime } from '../runtime/runtime';
import { buildServer, cookieName } from '../server';
import { Sessions } from '../sessions';
import { SettingsFile } from '../settings';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { loadOrCreateToken } from '../token';
import { Tokens } from '../tokens';
import { AgentTools } from './agent-tools';
import { claudeSettingsFile, writeClaudeSettings } from './claude-code';
import { ClaudeInventory, managedFolder } from './claude-inventory';
import { Inventories } from './inventory';

/**
 * What is switched on, read from folders that stand in for a home folder, a
 * project and an organization's folder. Nothing here looks at the real
 * home. The fixtures are full of made-up secrets, in every place a real
 * configuration can hold one; none may come out.
 */

const SECRETS = ['sk-live-OPAL7781', 'xoxb-made-up-0002', 'ghp_made_up_0001', 'hunter2-topaz', 'p4ssw0rd-garnet', 'Bearer-abc-def-ghi', 'token-in-a-rule-9912', 'managed-secret-5521', 'plugin-secret-6634', 'account-oauth-7745'];

let root: string;
let home: string;
let project: string;
let managed: string;
let data: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let sessions: Sessions;
let agentTools: AgentTools;
let port: number;
let origin: string;

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  create: async (options: { id: string; cwd?: string }) => ({ id: options.id, cwd: options.cwd ?? null, command: null, activityAt: null }),
  list: async () => [],
  has: async () => true,
  kill: async () => {},
  typeLine: async () => {},
  snapshot: async () => '',
} as unknown as SessionRuntime;

const json = (file: string, value: unknown): Promise<void> => mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, JSON.stringify(value, null, 2)));
const text = (file: string, value: string): Promise<void> => mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, value));

/** A home folder and a project as a developer's might be, with a secret wherever one can sit. */
async function fixtures(): Promise<void> {
  const pluginRoot = path.join(home, '.claude', 'plugins', 'cache', 'team-tools', 'deploy', '1.2.0');
  await json(path.join(home, '.claude', 'settings.json'), {
    model: 'some-model',
    env: { GITHUB_TOKEN: 'ghp_made_up_0001' },
    permissions: { allow: ['Bash(npm run test *)', 'Bash(npm run lint)', 'Bash(curl -H "Authorization: token-in-a-rule-9912" *)', 'mcp__slack__post_message'], deny: ['Read(./secrets/hunter2-topaz.env)'] },
    hooks: {
      PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'API_KEY=sk-live-OPAL7781 /opt/tools/format.sh --token hunter2-topaz' }] }],
      Stop: [{ hooks: [{ type: 'http', url: 'https://hooks.example.com/t/xoxb-made-up-0002' }] }],
    },
    enabledPlugins: { 'deploy@team-tools': true, 'old-thing@team-tools': false, 'not-installed@elsewhere': true },
  });
  await json(path.join(home, '.claude.json'), {
    oauthAccount: { accessToken: 'account-oauth-7745' },
    mcpServers: {
      github: { command: 'npx', args: ['-y', 'github-server', '--token', 'ghp_made_up_0001'], env: { GITHUB_TOKEN: 'ghp_made_up_0001' } },
      shadowed: { type: 'http', url: 'https://user.example.com/mcp' },
    },
    projects: {
      [project]: {
        mcpServers: {
          slack: { command: '/usr/local/bin/slack-mcp', args: ['--bot', 'xoxb-made-up-0002'], env: { SLACK_BOT_TOKEN: 'xoxb-made-up-0002', SLACK_TEAM: 'T0001' } },
          shadowed: { type: 'http', url: 'https://user:p4ssw0rd-garnet@local.example.com/mcp?key=sk-live-OPAL7781', headers: { Authorization: 'Bearer-abc-def-ghi' } },
        },
        disabledMcpServers: ['claude.ai Linear', 'github'],
        enabledMcpjsonServers: ['approved-one'],
      },
      '/some/other/project': { mcpServers: { elsewhere: { command: 'elsewhere-server', env: { K: 'hunter2-topaz' } } } },
    },
  });
  await json(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), { version: 2, plugins: { 'deploy@team-tools': [{ scope: 'user', installPath: pluginRoot, version: '1.2.0' }], 'old-thing@team-tools': [{ scope: 'user', installPath: path.join(home, 'nowhere'), version: '0.9.0' }] } });
  await json(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), { name: 'deploy', mcpServers: { 'deploy-api': { command: 'node', args: ['server.js', 'plugin-secret-6634'], env: { DEPLOY_KEY: 'plugin-secret-6634' } } } });
  await json(path.join(pluginRoot, 'hooks', 'hooks.json'), { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/check.sh plugin-secret-6634' }] }] } });
  await text(path.join(pluginRoot, 'skills', 'ship', 'SKILL.md'), '---\nname: ship\n---\nUse the key plugin-secret-6634.');
  await text(path.join(home, '.claude', 'skills', 'review', 'SKILL.md'), '---\nname: review\n---\nSecret: hunter2-topaz');
  await text(path.join(home, '.claude', 'commands', 'standup.md'), 'Say hello. hunter2-topaz');
  await text(path.join(home, '.claude', 'agents', 'tester.md'), '---\nname: tester\n---\n');
  await text(path.join(home, '.claude', 'CLAUDE.md'), 'My password is hunter2-topaz.');
  await mkdir(path.join(home, '.claude', 'plugins', 'synced', 'from-account'), { recursive: true });

  await json(path.join(project, '.claude', 'settings.json'), { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'make setup' }] }] }, permissions: { ask: ['Bash(git push *)'] }, enabledPlugins: { 'old-thing@team-tools': true } });
  await json(path.join(project, '.claude', 'settings.local.json'), { enabledPlugins: { 'old-thing@team-tools': false }, disabledMcpjsonServers: ['refused-one'] });
  await json(path.join(project, '.mcp.json'), {
    mcpServers: {
      'approved-one': { type: 'http', url: 'https://mcp.example.org/v1' },
      'refused-one': { command: 'refused-server' },
      'not-yet-approved': { command: 'docker', args: ['run', '-e', 'KEY=sk-live-OPAL7781', 'image'] },
    },
  });
  await text(path.join(project, '.claude', 'skills', 'release', 'SKILL.md'), '---\nname: release\n---\n');
  await text(path.join(project, 'CLAUDE.md'), 'Project rules.');

  await json(path.join(managed, 'managed-settings.json'), { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: '/opt/corp/audit --key managed-secret-5521' }] }] }, managedMcpServers: { 'corp-search': { type: 'http', url: 'https://search.corp.example/mcp', headers: { 'X-Api-Key': 'managed-secret-5521' } } } });
}

async function start(): Promise<void> {
  const store = new JsonStore(data);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(data);
  await settings.reload();
  agentTools = new AgentTools(hub, new Tokens(hub), data);
  sessions = new Sessions(hub, runtime, { agentLaunchLine: async () => 'true', prepareAgentTools: (session, choice) => agentTools.prepare(session, choice), defaultFolder: () => project });
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: path.join(root, 'none'),
    activity: new FileActivityLog(data, 1024 * 1024),
    inventories: new Inventories([new ClaudeInventory({ home, managedDir: managed, configDir: null })], {
      settingsFile: async () => claudeSettingsFile(data),
      toolsFile: (id) => agentTools.fileFor(id),
      toolsChoice: (id) => agentTools.choiceFor(id),
    }),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'aubergine-inventory-'));
  home = path.join(root, 'home');
  project = path.join(root, 'project');
  managed = path.join(root, 'managed');
  data = path.join(root, 'data');
  for (const folder of [home, project, managed, data]) await mkdir(folder, { recursive: true });
  ownerToken = await loadOrCreateToken(data);
  await writeClaudeSettings(data);
  await fixtures();
  await start();
});
afterEach(async () => {
  await hub.flush();
  await app.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  text: string;
}
async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
  let parsed: unknown = null;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch {
    // Not JSON.
  }
  return { status: response.statusCode, body: parsed, text: response.body };
}
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
async function agent(more: object = {}): Promise<string> {
  const made = await asOwner('POST', '/api/v1/sessions', { agent: 'claude-code', cwd: project, ...more });
  expect(made.status).toBe(201);
  return made.body.session.id as string;
}
async function inventoryOf(sessionId: string): Promise<{ inventory: Inventory; text: string }> {
  const answer = await asOwner('GET', `/api/v1/sessions/${sessionId}/inventory`);
  expect(answer.status).toBe(200);
  return { inventory: Inventory.parse(answer.body), text: answer.text };
}
const named = (items: readonly InventoryItem[], kind: string, name: string): InventoryItem[] => items.filter((item) => item.kind === kind && item.name === name);
const one = (items: readonly InventoryItem[], kind: string, name: string): InventoryItem => {
  const found = named(items, kind, name);
  expect(found, `${kind} ${name}`).toHaveLength(1);
  return found[0] as InventoryItem;
};

describe('what is switched on', () => {
  it('lists MCP servers with where each comes from, which wins, and which wait or are off', async () => {
    const { inventory } = await inventoryOf(await agent());
    const items = inventory.items;
    expect(one(items, 'mcp-server', 'slack')).toEqual({ kind: 'mcp-server', name: 'slack', source: { kind: 'local' }, state: 'unknown', detail: 'runs slack-mcp with 2 arguments · environment: SLACK_BOT_TOKEN, SLACK_TEAM · configured; whether it answers was not checked' });
    // The same name in two places: the one closer to the session is used, the other is said not to be.
    const shadowed = named(items, 'mcp-server', 'shadowed');
    expect(shadowed.map((item) => [item.source.kind, item.state])).toEqual([
      ['local', 'unknown'],
      ['user', 'off'],
    ]);
    expect(shadowed[0]?.detail).toBe('http, at local.example.com · headers: Authorization · configured; whether it answers was not checked');
    expect(shadowed[1]?.detail).toContain('not used: a server of the same name is set closer to this session');
    // Switched off for this project inside the agent.
    expect(one(items, 'mcp-server', 'github')).toMatchObject({ source: { kind: 'user' }, state: 'off', detail: expect.stringContaining('switched off for this project in the agent') });
    // The project's own: approved, refused, and waiting.
    expect(one(items, 'mcp-server', 'approved-one')).toMatchObject({ source: { kind: 'project' }, state: 'unknown', detail: expect.stringContaining('http, at mcp.example.org') });
    expect(one(items, 'mcp-server', 'refused-one')).toMatchObject({ state: 'off', detail: expect.stringContaining('refused in settings') });
    expect(one(items, 'mcp-server', 'not-yet-approved')).toMatchObject({ state: 'pending', detail: expect.stringContaining('runs docker with 4 arguments') });
    // An organization's, a plugin's, and the trace of a connector from the account.
    expect(one(items, 'mcp-server', 'corp-search')).toMatchObject({ source: { kind: 'managed' }, detail: expect.stringContaining('headers: X-Api-Key') });
    expect(one(items, 'mcp-server', 'deploy-api')).toMatchObject({ source: { kind: 'plugin', name: 'deploy@team-tools' }, detail: expect.stringContaining('environment: DEPLOY_KEY') });
    expect(one(items, 'mcp-server', 'claude.ai Linear')).toMatchObject({ source: { kind: 'account' }, state: 'off' });
    // Another project's servers are not this session's.
    expect(named(items, 'mcp-server', 'elsewhere')).toEqual([]);
  });

  it('lists plugins by the settings file that decides, hooks, skills, rules and the files themselves', async () => {
    const { inventory } = await inventoryOf(await agent());
    const items = inventory.items;
    expect(one(items, 'plugin', 'deploy@team-tools')).toMatchObject({ source: { kind: 'user' }, state: 'on', detail: 'installed, version 1.2.0 · switched on in your settings' });
    // On for you, on in the project, off again in your settings for this project: the last one decides.
    expect(one(items, 'plugin', 'old-thing@team-tools')).toMatchObject({ source: { kind: 'local' }, state: 'off', detail: expect.stringContaining('switched off in your settings for this project') });
    expect(one(items, 'plugin', 'not-installed@elsewhere')).toMatchObject({ state: 'unknown', detail: expect.stringContaining('not in the record of what is installed') });
    expect(one(items, 'plugin', 'from-account@synced')).toMatchObject({ source: { kind: 'account' }, state: 'on' });

    const hooks = items.filter((item) => item.kind === 'hook');
    expect(hooks.map((hook) => [hook.name, hook.source.kind, hook.detail])).toEqual(
      expect.arrayContaining([
        ['PostToolUse (Write|Edit)', 'user', 'runs format.sh'],
        ['Stop', 'user', 'http, to hooks.example.com'],
        ['SessionStart', 'project', 'runs make'],
        ['PreToolUse', 'managed', 'runs audit'],
        ['PreToolUse (Bash)', 'plugin', 'runs check.sh'],
        // Aubergine's own three.
        ['UserPromptSubmit', 'aubergine', 'runs node'],
        ['Notification', 'aubergine', 'runs node'],
        ['Stop', 'aubergine', 'runs node'],
      ]),
    );
    expect(items.filter((item) => item.kind === 'skill').map((item) => [item.name, item.source.kind, item.detail])).toEqual(
      expect.arrayContaining([
        ['review', 'user', 'a skill'],
        ['standup', 'user', 'a command'],
        ['release', 'project', 'a skill'],
        ['deploy:ship', 'plugin', 'a skill'],
      ]),
    );
    expect(one(items, 'other', 'tester')).toMatchObject({ detail: 'a subagent' });
    expect(items.filter((item) => item.kind === 'permission-rule').map((item) => [item.name, item.source.kind, item.detail])).toEqual(
      expect.arrayContaining([
        ['allow: Bash: npm', 'user', '2 rules'],
        ['allow: Bash: curl', 'user', '1 rule'],
        ['allow: mcp__slack__post_message', 'user', '1 rule'],
        ['deny: Read: a pattern', 'user', '1 rule'],
        ['ask: Bash: git', 'project', '1 rule'],
      ]),
    );
    expect(items.filter((item) => item.kind === 'settings-file').map((item) => [path.relative(root, item.name), item.source.kind, item.state])).toEqual([
      ['home/.claude/settings.json', 'user', 'on'],
      ['project/.claude/settings.json', 'project', 'on'],
      ['project/.claude/settings.local.json', 'local', 'on'],
      ['data/agents/claude-code-settings.json', 'aubergine', 'on'],
      ['managed/managed-settings.json', 'managed', 'on'],
    ]);
    expect(items.filter((item) => item.kind === 'other' && item.detail.startsWith('instructions')).map((item) => path.relative(root, item.name))).toEqual(['home/.claude/CLAUDE.md', 'project/CLAUDE.md']);
  });

  it('never gives a value: not in the answer, the copied text, a search, or any file of the data folder', async () => {
    const sessionId = await agent({ agentTools: { kind: 'token', scopes: ['read'] } });
    const { inventory, text: answer } = await inventoryOf(sessionId);
    const copied = inventoryText(inventory, 'An agent');
    const toolsSecret = JSON.parse(await readFile(path.join(data, 'agents', 'mcp', `${sessionId}.json`), 'utf8')).mcpServers.aubergine.env.AUBERGINE_API_TOKEN as string;
    expect(toolsSecret.length).toBeGreaterThan(20);
    for (const secret of [...SECRETS, toolsSecret, ownerToken, sessionToken(ownerToken, sessionId)]) {
      expect(answer.includes(secret), secret).toBe(false);
      expect(copied.includes(secret), secret).toBe(false);
    }
    // Not a part of one either: the distinctive middles of the made-up secrets. (Four digits alone are not
    // distinctive: the answer holds made-up folder names and IDs, which now and then hold the same four.)
    for (const part of ['OPAL7781', 'made-up-0002', 'made_up_0001', 'topaz', 'garnet', 'abc-def', 'rule-9912', 'secret-5521', 'secret-6634', 'oauth-7745']) expect(`${answer}${copied}`.includes(part), part).toBe(false);
    // The names are there, so that the list is of use.
    for (const name of ['SLACK_BOT_TOKEN', 'GITHUB_TOKEN', 'Authorization', 'DEPLOY_KEY', 'X-Api-Key']) expect(copied).toContain(name);
    expect(copied).toContain('[configured] slack — yours, for this project — runs slack-mcp with 2 arguments');
    expect(copied).toContain('no server was contacted');

    // Nothing that was read is kept: no file of the data folder holds any of it, the state and the activity log included.
    await hub.flush();
    const files: string[] = [];
    const walk = async (folder: string): Promise<void> => {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (entry.isDirectory()) await walk(path.join(folder, entry.name));
        else files.push(await readFile(path.join(folder, entry.name), 'utf8'));
      }
    };
    await walk(data);
    for (const file of files) {
      for (const secret of SECRETS) expect(file.includes(secret), secret).toBe(false);
      for (const name of ['slack-mcp', 'SLACK_BOT_TOKEN', 'corp-search', 'deploy@team-tools']) expect(file.includes(name), name).toBe(false);
    }
  });

  it('says what Aubergine added, by the choice that was made', async () => {
    const none = (await inventoryOf(await agent())).inventory;
    expect(none.aubergine.join(' ')).toContain('Aubergine tools: none were given to this session.');
    expect(named(none.items, 'mcp-server', 'aubergine')).toEqual([]);
    const own = (await inventoryOf(await agent({ agentTools: { kind: 'own' } }))).inventory;
    expect(own.aubergine.join(' ')).toContain('you chose "its own work only"');
    expect(one(own.items, 'mcp-server', 'aubergine')).toMatchObject({ source: { kind: 'aubergine' }, detail: expect.stringMatching(/^runs node with 2 arguments · passed to the agent/) });
    const more = (await inventoryOf(await agent({ agentTools: { kind: 'token', scopes: ['read'] } }))).inventory;
    expect(more.aubergine.join(' ')).toContain('you chose "More…"');
    expect(one(more.items, 'mcp-server', 'aubergine').detail).toBe('runs node with 2 arguments · environment: AUBERGINE_API_TOKEN · passed to the agent when Aubergine started it');
    expect(more.aubergine.join(' ')).toContain('If you started this agent yourself');
  });

  it('says so when a file cannot be read or is not in a form it knows, and never shows that as "nothing is on"', async () => {
    await writeFile(path.join(home, '.claude', 'settings.json'), '{ "hooks": { not json');
    await writeFile(path.join(project, '.mcp.json'), JSON.stringify(['a', 'list', 'sk-live-OPAL7781']));
    await writeFile(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: 'sk-live-OPAL7781' }));
    await json(path.join(project, '.claude', 'settings.json'), { hooks: 'sk-live-OPAL7781', permissions: ['hunter2-topaz'], enabledPlugins: 5 });
    await chmod(path.join(home, '.claude.json'), 0o000);
    try {
      const { inventory, text: answer } = await inventoryOf(await agent());
      const notes = inventory.notes.filter((note) => note.level !== 'gap').map((note) => [note.level, path.relative(root, note.where)]);
      expect(notes).toEqual(
        expect.arrayContaining([
          ['unrecognised', 'home/.claude/settings.json'],
          ['unrecognised', 'project/.mcp.json'],
          ['unrecognised', 'home/.claude/plugins/installed_plugins.json'],
          ['unrecognised', 'project/.claude/settings.json'],
          ...(process.getuid?.() === 0 ? [] : [['unreadable', 'home/.claude.json']]),
        ]),
      );
      // The file is still listed as there, and as not read.
      expect(one(inventory.items, 'settings-file', path.join(home, '.claude', 'settings.json'))).toMatchObject({ state: 'unknown', detail: 'there, but not read' });
      for (const secret of SECRETS) expect(answer.includes(secret)).toBe(false);
      // A need is not called "not found" when part of the configuration could not be read.
      expect(matchNeed({ kind: 'mcp', name: 'jira' }, inventory).state).toBe('cannot-tell');
    } finally {
      await chmod(path.join(home, '.claude.json'), 0o600);
    }
  });

  it('always says what files cannot say: whether a server answers, what the agent has loaded, connectors from the account', async () => {
    const { inventory } = await inventoryOf(await agent());
    const gaps = inventory.notes.filter((note) => note.level === 'gap').map((note) => note.where);
    expect(gaps).toEqual(expect.arrayContaining(['Connectors from your account', 'Whether a server answers', 'What the running agent has loaded', 'Settings from your organization']));
    expect(inventory.notes.find((note) => note.where === 'Connectors from your account')?.text).toContain('are in no file on this computer');
    // Nothing is ever called "on" that was only found configured.
    expect(inventory.items.filter((item) => item.kind === 'mcp-server' && item.state === 'on')).toEqual([]);
  });

  it('reads nothing with an empty home and an empty project, and still says what it cannot see', async () => {
    await rm(home, { recursive: true, force: true });
    await mkdir(home);
    const empty = path.join(root, 'empty-project');
    await mkdir(empty);
    await rm(managed, { recursive: true, force: true });
    const { inventory } = await inventoryOf(await agent({ cwd: empty }));
    expect(inventory.items.map((item) => [item.kind, item.source.kind])).toEqual([
      ['settings-file', 'aubergine'],
      ['hook', 'aubergine'],
      ['hook', 'aubergine'],
      ['hook', 'aubergine'],
      ['hook', 'aubergine'],
    ]);
    expect(inventory.notes.every((note) => note.level === 'gap')).toBe(true);
  });

  it('switches every hook off when settings say so, but not an organization\'s', async () => {
    await json(path.join(project, '.claude', 'settings.local.json'), { disableAllHooks: true });
    const { inventory } = await inventoryOf(await agent());
    const hooks = inventory.items.filter((item) => item.kind === 'hook');
    expect(hooks.filter((hook) => hook.source.kind !== 'managed').every((hook) => hook.state === 'off' && hook.detail.includes('all hooks are switched off'))).toBe(true);
    expect(hooks.filter((hook) => hook.source.kind === 'managed').every((hook) => hook.state === 'on')).toBe(true);
  });
});

describe('who may read it', () => {
  it('is the owner in the browser alone: no token, no session, not for a terminal that is not an agent', async () => {
    const sessionId = await agent();
    const strongest = (await asOwner('POST', '/v1/tokens', { name: 'every scope', scopes: [...GRANTABLE_SCOPES], reach: { kind: 'all' } })).body.secret as string;
    for (const credential of [strongest, sessionToken(ownerToken, sessionId)]) {
      const refused = await send({ authorization: `Bearer ${credential}` }, 'GET', `/api/v1/sessions/${sessionId}/inventory`);
      expect([401, 403]).toContain(refused.status);
      expect(refused.text).not.toContain('slack');
    }
    expect((await send({}, 'GET', `/api/v1/sessions/${sessionId}/inventory`)).status).toBe(401);
    // No public route gives it.
    expect((await send({ authorization: `Bearer ${strongest}` }, 'GET', `/v1/sessions/${sessionId}/inventory`)).status).toBe(404);
    const plain = (await asOwner('POST', '/api/v1/sessions', { name: 'a plain shell' })).body.session.id as string;
    const notAgent = await asOwner('GET', `/api/v1/sessions/${plain}/inventory`);
    expect([notAgent.status, notAgent.body.error.message]).toEqual([409, 'No agent is known to run in this terminal.']);
    expect((await asOwner('GET', '/api/v1/sessions/01900000-0000-7000-8000-0000000000a1/inventory')).status).toBe(404);
  });
});

describe('finding, and matching what an element needs', () => {
  it('searches by every word, and matches a need by name, loosely, claiming no more than that', async () => {
    const { inventory } = await inventoryOf(await agent());
    expect(searchInventory(inventory.items, 'slack').map((item) => item.name)).toEqual(expect.arrayContaining(['slack', 'allow: mcp__slack__post_message']));
    expect(searchInventory(inventory.items, 'audit organization').map((item) => item.name)).toEqual(['PreToolUse']);
    expect(searchInventory(inventory.items, '   ')).toHaveLength(inventory.items.length);

    expect(matchNeed({ kind: 'mcp', name: 'Slack' }, inventory)).toMatchObject({ state: 'found', words: expect.stringContaining('A match of names only: whether it works was not checked.') });
    expect(matchNeed({ kind: 'mcp', name: 'the GitHub MCP' }, inventory)).toMatchObject({ state: 'found', words: expect.stringContaining('but it is switched off') });
    expect(matchNeed({ kind: 'mcp', name: 'not-yet-approved' }, inventory).words).toContain('waits for your approval');
    expect(matchNeed({ kind: 'mcp', name: 'jira' }, inventory)).toMatchObject({ state: 'not-found', words: expect.stringContaining('may still be there under another name, or come from your account') });
    expect(matchNeed({ kind: 'command', name: 'review' }, inventory).state).toBe('found');
    expect(matchNeed({ kind: 'command', name: 'gh' }, inventory)).toMatchObject({ state: 'cannot-tell', words: expect.stringContaining('is not looked at') });
    expect(matchNeed({ kind: 'access', name: 'the staging database' }, inventory).state).toBe('cannot-tell');
    expect(matchNeed({ kind: 'mcp', name: 'slack' }, null).state).toBe('cannot-tell');
  });
});

describe('the agent\'s folder, moved', () => {
  it('is read from where the product\'s own variable says, state file and all', async () => {
    const moved = path.join(root, 'moved');
    await json(path.join(moved, 'settings.json'), { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'moved-hook --key sk-live-OPAL7781' }] }] } });
    await json(path.join(moved, '.claude.json'), { mcpServers: { 'moved-server': { command: 'moved-mcp', env: { K: 'hunter2-topaz' } } } });
    const found = await new ClaudeInventory({ home, managedDir: managed, configDir: moved }).read({ sessionId: 's', folder: null, aubergineSettingsFile: null, aubergineToolsFile: null });
    expect(found.items.filter((item) => item.kind === 'mcp-server').map((item) => item.name)).toEqual(['corp-search', 'moved-server']);
    expect(found.items.filter((item) => item.kind === 'hook' && item.source.kind === 'user').map((item) => item.detail)).toEqual(['runs moved-hook']);
    // Nothing from the usual place.
    expect(found.items.some((item) => item.name === 'github')).toBe(false);
    expect(found.notes.find((note) => note.where === 'The project')?.level).toBe('gap');
    expect(JSON.stringify(found)).not.toContain('OPAL7781');
  });
});

describe('where an organization\'s files are', () => {
  it('is the folder the product documents for each system', () => {
    expect(managedFolder('darwin')).toBe('/Library/Application Support/ClaudeCode');
    expect(managedFolder('linux')).toBe('/etc/claude-code');
    expect(managedFolder('win32')).toBe('C:\\Program Files\\ClaudeCode');
  });
});
