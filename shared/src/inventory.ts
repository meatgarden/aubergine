import { z } from 'zod';
import { Id } from './ids';

/**
 * What is switched on for an agent: the MCP servers, plugins, hooks, skills
 * and settings files its configuration names, with where each comes from.
 *
 * It is what the configuration says, read when asked for. It is not what
 * the running agent has loaded, and it says so. Nothing here ever carries a
 * value from those files: names only (see the names-only rule in the
 * daemon), so that it can be shown, copied and pasted into a bug report.
 */

export const InventoryKind = z.enum(['mcp-server', 'plugin', 'hook', 'skill', 'settings-file', 'permission-rule', 'other']);
export type InventoryKind = z.infer<typeof InventoryKind>;

/** Where an item comes from. `local`: the owner's own settings for this one project. `account`: the owner's account with the agent's maker, not a file. */
export const InventorySource = z.object({
  kind: z.enum(['user', 'project', 'local', 'aubergine', 'plugin', 'managed', 'account']),
  /** For a plugin: its name. */
  name: z.string().max(200).optional(),
});
export type InventorySource = z.infer<typeof InventorySource>;

export const InventoryItem = z.object({
  kind: InventoryKind,
  name: z.string().max(300),
  source: InventorySource,
  /** `on`, `off`, `pending` (configured, waiting for the owner's approval in the agent), or `unknown` (configured, but whether it is used cannot be told from files). */
  state: z.enum(['on', 'off', 'pending', 'unknown']),
  /** One line about it, made of names only. */
  detail: z.string().max(500),
});
export type InventoryItem = z.infer<typeof InventoryItem>;

/** Something the reader must know to trust the list: a file that could not be read, a format that was not recognised, or a thing that cannot be seen at all. */
export const InventoryNote = z.object({
  level: z.enum(['unreadable', 'unrecognised', 'gap']),
  /** Which file or which matter. A path, or a few words. */
  where: z.string().max(500),
  text: z.string().max(600),
});
export type InventoryNote = z.infer<typeof InventoryNote>;

export const Inventory = z.object({
  sessionId: Id,
  agent: z.string(),
  /** The folder the configuration was read for: the session's. Null when it is not known. */
  folder: z.string().nullable(),
  readAt: z.iso.datetime(),
  /** What Aubergine itself added for this session, in sentences. */
  aubergine: z.array(z.string().max(600)),
  items: z.array(InventoryItem),
  notes: z.array(InventoryNote),
});
export type Inventory = z.infer<typeof Inventory>;

/** Each kind as a heading, in the order the panel shows them. */
export const INVENTORY_KINDS: readonly { kind: InventoryKind; title: string }[] = [
  { kind: 'mcp-server', title: 'MCP servers (connectors)' },
  { kind: 'plugin', title: 'Plugins' },
  { kind: 'hook', title: 'Hooks' },
  { kind: 'skill', title: 'Skills and commands' },
  { kind: 'permission-rule', title: 'Permission rules' },
  { kind: 'settings-file', title: 'Settings files' },
  { kind: 'other', title: 'Other' },
];

/** A source as a plain word. */
export function sourceWord(source: InventorySource): string {
  switch (source.kind) {
    case 'user':
      return 'yours';
    case 'project':
      return 'this project';
    case 'local':
      return 'yours, for this project';
    case 'aubergine':
      return 'Aubergine';
    case 'plugin':
      return `a plugin: ${source.name ?? 'unnamed'}`;
    case 'managed':
      return 'your organization';
    case 'account':
      return 'your account';
  }
}

export const STATE_WORD: Record<InventoryItem['state'], string> = { on: 'on', off: 'off', pending: 'waiting for your approval', unknown: 'configured' };

/** The items a search leaves: every word must be in the name, the detail, the source or the kind. */
export function searchInventory(items: readonly InventoryItem[], query: string): InventoryItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const text = `${item.name} ${item.detail} ${sourceWord(item.source)} ${item.kind} ${STATE_WORD[item.state]}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** The whole inventory as plain text, for pasting into a bug report. Made only of what is shown, so it holds no value either. */
export function inventoryText(inventory: Inventory, sessionName: string): string {
  const lines: string[] = [`What is switched on for "${sessionName}" (${inventory.agent}), read ${inventory.readAt}`, `Folder: ${inventory.folder ?? 'not known'}`, ''];
  lines.push('What Aubergine added:', ...(inventory.aubergine.length > 0 ? inventory.aubergine.map((line) => `  ${line}`) : ['  nothing']), '');
  for (const { kind, title } of INVENTORY_KINDS) {
    const items = inventory.items.filter((item) => item.kind === kind);
    if (items.length === 0) continue;
    lines.push(`${title} (${items.length}):`);
    for (const item of items) lines.push(`  [${STATE_WORD[item.state]}] ${item.name} — ${sourceWord(item.source)}${item.detail ? ` — ${item.detail}` : ''}`);
    lines.push('');
  }
  if (inventory.notes.length > 0) {
    lines.push('What this list cannot say:');
    for (const note of inventory.notes) lines.push(`  ${note.where}: ${note.text}`);
    lines.push('');
  }
  lines.push('This is what the configuration files say. It is not a list of what the running agent has loaded, and no server was contacted.');
  return lines.join('\n');
}

/* ---------- Needs: is there something of that name? ---------- */

/** A name with everything but letters and digits taken out, in lower case: `GitHub-MCP` and `github mcp` are the same. */
const plain = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface NeedMatch {
  /** `found`: a configured item whose name matches. `not-found`: none does. `cannot-tell`: the list could not be read, or this kind of need is not something files show. */
  state: 'found' | 'not-found' | 'cannot-tell';
  /** In words, for a tooltip. It claims no more than a match of names. */
  words: string;
}

/**
 * Whether something an element needs appears in what is configured. Advice
 * only: a name that matches is not a server that works, and a name that does
 * not match may still be there under another name.
 */
export function matchNeed(need: { kind: string; name: string }, inventory: Inventory | null): NeedMatch {
  if (need.kind !== 'mcp' && need.kind !== 'command') return { state: 'cannot-tell', words: 'Not something Aubergine can look for.' };
  if (!inventory) return { state: 'cannot-tell', words: 'What is switched on for this terminal could not be read.' };
  const wanted = plain(need.name);
  if (wanted.length < 2) return { state: 'cannot-tell', words: 'The name is too short to look for.' };
  const kinds: InventoryKind[] = need.kind === 'mcp' ? ['mcp-server', 'plugin'] : ['skill', 'plugin'];
  const candidates = inventory.items.filter((item) => kinds.includes(item.kind));
  // The whole name, or the name as a part of a longer one (`slack` in `claude.ai Slack`), or the other way round.
  const hit = candidates.find((item) => plain(item.name) === wanted) ?? candidates.find((item) => plain(item.name).includes(wanted) || (plain(item.name).length >= 3 && wanted.includes(plain(item.name))));
  if (hit) {
    const state = hit.state === 'off' ? ', but it is switched off' : hit.state === 'pending' ? ', but it waits for your approval in the agent' : '';
    return { state: 'found', words: `A configured ${hit.kind === 'mcp-server' ? 'MCP server' : hit.kind} is named "${hit.name}" (${sourceWord(hit.source)})${state}. A match of names only: whether it works was not checked.` };
  }
  if (need.kind === 'command') return { state: 'cannot-tell', words: 'No skill or command of that name is configured. Whether a program of that name is installed on this computer is not looked at.' };
  const blind = inventory.notes.some((note) => note.level !== 'gap');
  return blind
    ? { state: 'cannot-tell', words: 'Nothing of that name was found, but some configuration could not be read.' }
    : { state: 'not-found', words: 'No configured MCP server or plugin has a name like that. It may still be there under another name, or come from your account.' };
}
