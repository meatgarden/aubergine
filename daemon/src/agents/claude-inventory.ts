import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { InventoryItem, InventoryNote, InventorySource } from '@aubergine/shared';
import type { AgentInventory, InventoryContext, InventoryFound } from './inventory';
import { describeHook, describeMcpServer, describeRule, keyName, matcherName, tidyName } from './names-only';

/**
 * What Claude Code's configuration says is switched on, read from the files
 * that product documents: its settings files and their order, `.mcp.json`,
 * `~/.claude.json`, the folders for skills, commands and subagents, and the
 * records under `~/.claude/plugins`.
 *
 * This is the only module that reads those files. It never writes one,
 * never starts the agent or any command a file names, and contacts no
 * server. Every file has three ways to be absent from the list, and each is
 * said: not there (nothing to say), not readable, and not in a form this
 * code recognises. A file that could not be understood is never shown as
 * "nothing is on".
 *
 * What comes out carries names only: everything about a server, a hook or a
 * rule goes through `names-only.ts`.
 */

/** The largest file read. The agent's own state file can be several megabytes. */
const MAX_BYTES = 16 * 1024 * 1024;
/** No list is longer than this; what is left out is said. */
const MAX_PER_KIND = 300;

type Read = { state: 'missing' } | { state: 'unreadable'; why: string } | { state: 'bad' } | { state: 'ok'; value: Record<string, unknown> };

async function readJson(file: string): Promise<Read> {
  let text: string;
  try {
    const info = await stat(file);
    if (!info.isFile()) return { state: 'unreadable', why: 'it is not a file' };
    if (info.size > MAX_BYTES) return { state: 'unreadable', why: 'it is too large to read' };
    text = await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { state: 'missing' };
    return { state: 'unreadable', why: code === 'EACCES' || code === 'EPERM' ? 'permission was refused' : 'it could not be opened' };
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { state: 'bad' };
    return { state: 'ok', value: value as Record<string, unknown> };
  } catch {
    return { state: 'bad' };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);

/** The names of the folders (or, with `files`, the `.md` files) directly inside a folder. Missing is empty; unreadable is said. */
async function namesIn(folder: string, what: 'folders' | 'md'): Promise<{ names: string[]; problem: string | null }> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    const names = entries
      .filter((entry) => !entry.name.startsWith('.') && (what === 'folders' ? entry.isDirectory() || entry.isSymbolicLink() : entry.isFile() && entry.name.endsWith('.md')))
      .map((entry) => (what === 'md' ? entry.name.slice(0, -3) : entry.name))
      .sort();
    return { names, problem: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { names: [], problem: code === 'ENOENT' || code === 'ENOTDIR' ? null : 'it could not be listed' };
  }
}

const exists = (file: string): Promise<boolean> =>
  stat(file).then(
    (info) => info.isFile(),
    () => false,
  );

export interface ClaudeInventoryOptions {
  /** The home folder the agent's own files are under. For tests: a folder that stands in for it. */
  home?: string;
  /** The folder the organization's files are in. For tests. */
  managedDir?: string;
  /**
   * The agent's own folder, when it is not `.claude` in the home folder. The product documents one variable for
   * moving it, `CLAUDE_CONFIG_DIR`; its state file then lives in that folder too. Left out, that variable is read
   * from the server's environment.
   */
  configDir?: string | null;
}

/** Where an organization's files are, by system, as the product documents it. */
export function managedFolder(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return '/Library/Application Support/ClaudeCode';
  if (platform === 'win32') return 'C:\\Program Files\\ClaudeCode';
  return '/etc/claude-code';
}

interface SettingsFile {
  source: InventorySource;
  file: string;
  /** How it is called in a sentence. */
  label: string;
  read: Read;
}

export class ClaudeInventory implements AgentInventory {
  readonly kind = 'claude-code' as const;
  private readonly claudeDir: string;
  private readonly stateFile: string;
  private readonly managedDir: string;

  constructor(options: ClaudeInventoryOptions = {}) {
    const home = options.home ?? os.homedir();
    const moved = options.configDir === undefined ? (process.env.CLAUDE_CONFIG_DIR?.trim() ?? '') : (options.configDir ?? '');
    this.claudeDir = moved !== '' ? moved : path.join(home, '.claude');
    this.stateFile = moved !== '' ? path.join(moved, '.claude.json') : path.join(home, '.claude.json');
    this.managedDir = options.managedDir ?? managedFolder();
  }

  async read(context: InventoryContext): Promise<InventoryFound> {
    const items: InventoryItem[] = [];
    const notes: InventoryNote[] = [];
    const add = (item: InventoryItem): void => void items.push({ ...item, name: tidyName(item.name, 300), detail: tidyName(item.detail, 500) });
    const claudeDir = this.claudeDir;
    const folder = context.folder;

    /* ---------- Settings files, lowest first, as the product orders them ---------- */

    const managedDropIns = (await readdir(path.join(this.managedDir, 'managed-settings.d')).catch(() => [] as string[])).filter((name) => name.endsWith('.json')).sort();
    const candidates: Omit<SettingsFile, 'read'>[] = [
      { source: { kind: 'user' }, file: path.join(claudeDir, 'settings.json'), label: 'your settings' },
      ...(folder
        ? [
            { source: { kind: 'project' as const }, file: path.join(folder, '.claude', 'settings.json'), label: "this project's settings" },
            { source: { kind: 'local' as const }, file: path.join(folder, '.claude', 'settings.local.json'), label: 'your settings for this project' },
          ]
        : []),
      ...(context.aubergineSettingsFile ? [{ source: { kind: 'aubergine' as const }, file: context.aubergineSettingsFile, label: "Aubergine's settings for its agents" }] : []),
      ...managedDropIns.map((name) => ({ source: { kind: 'managed' as const }, file: path.join(this.managedDir, 'managed-settings.d', name), label: "your organization's settings" })),
      { source: { kind: 'managed' }, file: path.join(this.managedDir, 'managed-settings.json'), label: "your organization's settings" },
    ];
    const settings: SettingsFile[] = [];
    for (const candidate of candidates) settings.push({ ...candidate, read: await readJson(candidate.file) });

    /** Notes a file that is there but could not be used. Returns its content when it could. */
    const usable = (file: string, read: Read, label: string): Record<string, unknown> | null => {
      if (read.state === 'ok') return read.value;
      if (read.state === 'unreadable') notes.push({ level: 'unreadable', where: file, text: `${label} could not be read (${read.why}). What it switches on is not in this list.` });
      if (read.state === 'bad') notes.push({ level: 'unrecognised', where: file, text: `${label} is not in a form this was written to read (it is not a JSON object). What it switches on is not in this list.` });
      return null;
    };

    for (const file of settings) {
      const content = usable(file.file, file.read, file.label.charAt(0).toUpperCase() + file.label.slice(1));
      if (file.read.state === 'missing') continue;
      add({ kind: 'settings-file', name: file.file, source: file.source, state: content ? 'on' : 'unknown', detail: content ? `${Object.keys(content).length} setting${Object.keys(content).length === 1 ? '' : 's'}: ${Object.keys(content).map(keyName).slice(0, 12).join(', ')}` : 'there, but not read' });
    }
    const read = settings.flatMap((file) => (file.read.state === 'ok' ? [{ ...file, content: file.read.value }] : []));
    /** The value of a key from the file that wins: the last in the order above that sets it. */
    const winning = (key: string): { value: unknown; from: SettingsFile } | null => {
      for (let index = read.length - 1; index >= 0; index -= 1) {
        const file = read[index] as (typeof read)[number];
        if (key in file.content) return { value: file.content[key], from: file };
      }
      return null;
    };

    /* ---------- Hooks ---------- */

    const hooksOff = winning('disableAllHooks');
    const allOff = hooksOff?.value === true;
    const hooksFrom = (map: unknown, source: InventorySource, where: string, on: boolean, why: string): void => {
      if (map === undefined) return;
      if (!isRecord(map)) {
        notes.push({ level: 'unrecognised', where, text: 'Its hooks are not in a form this was written to read. They are not in this list.' });
        return;
      }
      for (const [event, groups] of Object.entries(map)) {
        if (!Array.isArray(groups)) {
          notes.push({ level: 'unrecognised', where, text: `Its hooks for "${keyName(event)}" are not in a form this was written to read.` });
          continue;
        }
        for (const group of groups) {
          const handlers = isRecord(group) && Array.isArray(group.hooks) ? group.hooks : [];
          const matcher = isRecord(group) ? matcherName(group.matcher) : '';
          for (const handler of handlers) add({ kind: 'hook', name: `${keyName(event)}${matcher ? ` (${matcher})` : ''}`, source, state: on ? 'on' : 'off', detail: `${describeHook(handler)}${on ? '' : ` · ${why}`}` });
        }
      }
    };
    for (const file of read) {
      // "Switch all hooks off" does not reach an organization's own hooks.
      const on = !allOff || file.source.kind === 'managed';
      hooksFrom(file.content.hooks, file.source, file.file, on, `all hooks are switched off in ${hooksOff?.from.label ?? 'settings'}`);
    }

    /* ---------- Permission rules ---------- */

    for (const file of read) {
      const permissions = file.content.permissions;
      if (permissions === undefined) continue;
      if (!isRecord(permissions)) {
        notes.push({ level: 'unrecognised', where: file.file, text: 'Its permission rules are not in a form this was written to read.' });
        continue;
      }
      for (const list of ['allow', 'ask', 'deny'] as const) {
        // The same tool and program many times over is one line with a count: the rules themselves are not shown.
        const counted = new Map<string, number>();
        for (const rule of strings(permissions[list])) counted.set(describeRule(rule), (counted.get(describeRule(rule)) ?? 0) + 1);
        for (const [name, count] of counted) add({ kind: 'permission-rule', name: `${list}: ${name}`, source: file.source, state: 'on', detail: count > 1 ? `${count} rules` : '1 rule' });
      }
    }

    /* ---------- Plugins ---------- */

    const decided = new Map<string, { on: boolean; from: SettingsFile }>();
    for (const file of read) {
      const enabled = file.content.enabledPlugins;
      if (enabled === undefined) continue;
      if (!isRecord(enabled)) {
        notes.push({ level: 'unrecognised', where: file.file, text: 'Its list of plugins is not in a form this was written to read.' });
        continue;
      }
      for (const [id, value] of Object.entries(enabled)) if (typeof value === 'boolean') decided.set(id, { on: value, from: file });
    }
    const pluginsDir = path.join(claudeDir, 'plugins');
    const installedFile = path.join(pluginsDir, 'installed_plugins.json');
    const installed = new Map<string, { version: string; installPath: string | null }>();
    const record = usable(installedFile, await readJson(installedFile), "The agent's record of installed plugins");
    if (record) {
      // The shape of this record is the agent's own business and is not documented field by field: read it loosely, and say so when it does not fit.
      const plugins = record.plugins;
      if (!isRecord(plugins)) notes.push({ level: 'unrecognised', where: installedFile, text: "The agent's record of installed plugins is not in the form this was written to read. Plugins are listed from settings only, without versions." });
      else {
        for (const [id, entries] of Object.entries(plugins)) {
          const entry = (Array.isArray(entries) ? entries : [entries]).find(isRecord);
          if (!entry) continue;
          installed.set(id, { version: typeof entry.version === 'string' ? tidyName(entry.version, 40) : 'unknown', installPath: typeof entry.installPath === 'string' ? entry.installPath : null });
        }
      }
    }
    const pluginRoots: { id: string; root: string }[] = [];
    for (const id of new Set([...decided.keys(), ...installed.keys()])) {
      const decision = decided.get(id);
      const install = installed.get(id);
      const on = decision ? decision.on : true;
      add({
        kind: 'plugin',
        name: keyName(id),
        source: decision ? decision.from.source : { kind: 'user' },
        state: !install && on ? 'unknown' : on ? 'on' : 'off',
        detail: [install ? `installed, version ${install.version}` : 'named in settings, but not in the record of what is installed on this computer', decision ? `${on ? 'switched on' : 'switched off'} in ${decision.from.label}` : 'on by default: no settings file mentions it'].join(' · '),
      });
      if (on && install?.installPath) pluginRoots.push({ id: keyName(id), root: install.installPath });
    }
    // Plugins that come with the owner's account are kept in a folder of their own, with no install record.
    const synced = await namesIn(path.join(pluginsDir, 'synced'), 'folders');
    for (const name of synced.names) {
      const id = `${name}@synced`;
      const decision = decided.get(id);
      if (!decided.has(id)) add({ kind: 'plugin', name: keyName(id), source: { kind: 'account' }, state: 'on', detail: 'came with your account' });
      if (decision?.on !== false) pluginRoots.push({ id: keyName(id), root: path.join(pluginsDir, 'synced', name) });
    }

    /* ---------- MCP servers ---------- */

    const stateFile = this.stateFile;
    const state = usable(stateFile, await readJson(stateFile), "The agent's own state file, which holds the MCP servers you added yourself,");
    const project = folder && state && isRecord(state.projects) && isRecord(state.projects[folder]) ? (state.projects[folder] as Record<string, unknown>) : null;
    const switchedOffHere = new Set(strings(project?.disabledMcpServers));
    const seen = new Set<string>();
    const servers = (map: unknown, source: InventorySource, where: string, stateOf: (name: string) => { state: InventoryItem['state']; why: string }): void => {
      if (map === undefined || map === null) return;
      if (!isRecord(map)) {
        notes.push({ level: 'unrecognised', where, text: 'Its list of MCP servers is not in a form this was written to read. They are not in this list.' });
        return;
      }
      for (const [name, entry] of Object.entries(map)) {
        const shown = keyName(name);
        let { state: serverState, why } = stateOf(name);
        if (switchedOffHere.has(name)) [serverState, why] = ['off', 'switched off for this project in the agent'];
        // The same name set closer to the session wins whole; the one further away is not used.
        else if (seen.has(name)) [serverState, why] = ['off', 'not used: a server of the same name is set closer to this session'];
        seen.add(name);
        add({ kind: 'mcp-server', name: shown, source, state: serverState, detail: [describeMcpServer(entry), why].filter(Boolean).join(' · ') });
      }
    };
    const configured = { state: 'unknown' as const, why: 'configured; whether it answers was not checked' };
    // An organization's servers rank above everything else.
    const managedMcp = usable(path.join(this.managedDir, 'managed-mcp.json'), await readJson(path.join(this.managedDir, 'managed-mcp.json')), "Your organization's list of MCP servers");
    servers(managedMcp?.mcpServers, { kind: 'managed' }, path.join(this.managedDir, 'managed-mcp.json'), () => configured);
    for (const file of read.filter((f) => f.source.kind === 'managed')) servers(file.content.managedMcpServers, { kind: 'managed' }, file.file, () => configured);
    // What Aubergine gave this session.
    if (context.aubergineToolsFile) {
      const tools = usable(context.aubergineToolsFile, await readJson(context.aubergineToolsFile), "Aubergine's file of tools for this agent");
      servers(tools?.mcpServers, { kind: 'aubergine' }, context.aubergineToolsFile, () => ({ state: 'unknown', why: 'passed to the agent when Aubergine started it' }));
    }
    // Yours for this project, then the project's own, then yours everywhere: closest first.
    servers(project?.mcpServers, { kind: 'local' }, stateFile, () => configured);
    if (folder) {
      const projectFile = path.join(folder, '.mcp.json');
      const shared = usable(projectFile, await readJson(projectFile), "This project's list of MCP servers");
      const approveAll = winning('enableAllProjectMcpServers')?.value === true || project?.enableAllProjectMcpServers === true;
      const approved = new Set([...read.flatMap((f) => strings(f.content.enabledMcpjsonServers)), ...strings(project?.enabledMcpjsonServers)]);
      const refused = new Set([...read.flatMap((f) => strings(f.content.disabledMcpjsonServers)), ...strings(project?.disabledMcpjsonServers)]);
      servers(shared?.mcpServers, { kind: 'project' }, projectFile, (name) =>
        refused.has(name) ? { state: 'off', why: 'refused in settings' } : approveAll || approved.has(name) ? configured : { state: 'pending', why: 'a project server is used only after you approve it in the agent; no approval is recorded' },
      );
    }
    servers(state?.mcpServers, { kind: 'user' }, stateFile, () => configured);
    for (const plugin of pluginRoots) {
      const pluginFile = path.join(plugin.root, '.mcp.json');
      const own = usable(pluginFile, await readJson(pluginFile), `The MCP servers of the plugin ${plugin.id}`);
      servers(own?.mcpServers ?? own ?? undefined, { kind: 'plugin', name: plugin.id }, pluginFile, () => configured);
      const manifest = await readJson(path.join(plugin.root, '.claude-plugin', 'plugin.json'));
      if (manifest.state === 'ok' && isRecord(manifest.value.mcpServers)) servers(manifest.value.mcpServers, { kind: 'plugin', name: plugin.id }, path.join(plugin.root, '.claude-plugin', 'plugin.json'), () => configured);
      if (manifest.state === 'ok') hooksFrom(manifest.value.hooks && isRecord(manifest.value.hooks) ? manifest.value.hooks : undefined, { kind: 'plugin', name: plugin.id }, plugin.root, !allOff, 'all hooks are switched off');
      const pluginHooks = await readJson(path.join(plugin.root, 'hooks', 'hooks.json'));
      if (pluginHooks.state === 'ok') hooksFrom(pluginHooks.value.hooks, { kind: 'plugin', name: plugin.id }, path.join(plugin.root, 'hooks', 'hooks.json'), !allOff, 'all hooks are switched off');
      else usable(path.join(plugin.root, 'hooks', 'hooks.json'), pluginHooks, `The hooks of the plugin ${plugin.id}`);
      const skills = await namesIn(path.join(plugin.root, 'skills'), 'folders');
      for (const name of skills.names) add({ kind: 'skill', name: `${plugin.id.split('@')[0]}:${name}`, source: { kind: 'plugin', name: plugin.id }, state: 'on', detail: 'a skill' });
    }
    // Connectors that come with the owner's account are in no file: only those switched off for this project leave a trace.
    for (const name of switchedOffHere) {
      if (!seen.has(name)) add({ kind: 'mcp-server', name: keyName(name), source: name.startsWith('claude.ai ') ? { kind: 'account' } : { kind: 'local' }, state: 'off', detail: 'switched off for this project in the agent' });
    }
    if (winning('disableClaudeAiConnectors')?.value !== true) {
      notes.push({
        level: 'gap',
        where: 'Connectors from your account',
        text: 'Connectors you switched on in your account with the maker of the agent (for example Slack) are fetched by the agent itself and are in no file on this computer. They are not in this list, whether or not the agent has them. Inside the agent, /mcp shows them.',
      });
    }

    /* ---------- Skills, commands, subagents, instructions ---------- */

    const places: { root: string; source: InventorySource }[] = [{ root: claudeDir, source: { kind: 'user' } }, ...(folder ? [{ root: path.join(folder, '.claude'), source: { kind: 'project' as const } }] : [])];
    for (const place of places) {
      for (const [sub, what, detail, kind] of [
        ['skills', 'folders', 'a skill', 'skill'],
        ['commands', 'md', 'a command', 'skill'],
        ['agents', 'md', 'a subagent', 'other'],
      ] as const) {
        const found = await namesIn(path.join(place.root, sub), what);
        if (found.problem) notes.push({ level: 'unreadable', where: path.join(place.root, sub), text: `This folder ${found.problem}. What is in it is not in this list.` });
        for (const name of found.names) add({ kind, name, source: place.source, state: 'on', detail });
      }
    }
    for (const [file, source] of [
      [path.join(claudeDir, 'CLAUDE.md'), { kind: 'user' }],
      ...(folder
        ? ([
            [path.join(folder, 'CLAUDE.md'), { kind: 'project' }],
            [path.join(folder, '.claude', 'CLAUDE.md'), { kind: 'project' }],
            [path.join(folder, 'CLAUDE.local.md'), { kind: 'local' }],
          ] as const)
        : []),
    ] as const) {
      if (await exists(file)) add({ kind: 'other', name: file, source: source as InventorySource, state: 'on', detail: 'instructions the agent reads at the start of every conversation' });
    }

    /* ---------- What files cannot say ---------- */

    notes.push(
      { level: 'gap', where: 'Whether a server answers', text: 'This says what is configured. No MCP server was started or contacted, so "configured" does not mean "working". Inside the agent, /mcp shows which are connected.' },
      { level: 'gap', where: 'What the running agent has loaded', text: `An agent reads most of this when it starts. What was changed since, what was given on its command line by anyone but Aubergine, and a configuration folder other than ${this.claudeDir} set in its own terminal, are not known here.` },
      { level: 'gap', where: 'Settings from your organization', text: `Only files in ${this.managedDir} are read. Settings an organization delivers another way (from its console, or by device management) are not seen.` },
    );
    if (folder === null) notes.push({ level: 'gap', where: 'The project', text: "This terminal's folder is not known, so nothing that belongs to a project was read." });

    return { items: capped(items, notes), notes };
  }
}

/** Keeps each kind to a sensible length, and says what was left out. */
function capped(items: InventoryItem[], notes: InventoryNote[]): InventoryItem[] {
  const counts = new Map<string, number>();
  const kept: InventoryItem[] = [];
  for (const item of items) {
    const count = (counts.get(item.kind) ?? 0) + 1;
    counts.set(item.kind, count);
    if (count <= MAX_PER_KIND) kept.push(item);
  }
  for (const [kind, count] of counts) {
    if (count > MAX_PER_KIND) notes.push({ level: 'gap', where: `More than ${MAX_PER_KIND} of one kind`, text: `${count - MAX_PER_KIND} more of the kind "${kind}" are configured and not listed.` });
  }
  return kept;
}
