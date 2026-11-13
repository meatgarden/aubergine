import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConversationId, type AttentionState, type NoteEntry } from '@aubergine/shared';
import { stableNodePath } from '../node-path';

/**
 * Claude Code support: hooks that tell the canvas when an agent starts
 * working, needs the user, or has finished, and that log each prompt.
 *
 * The hooks are delivered in a settings file of our own, passed to `claude`
 * with `--settings`. The user's own Claude Code configuration is never
 * edited.
 */

export type HookEvent = 'prompt' | 'notification' | 'stop';

export const HOOK_EVENTS: readonly HookEvent[] = ['prompt', 'notification', 'stop'];

/** Which Claude Code hook each of our events is attached to. */
const CLAUDE_EVENT: Record<HookEvent, string> = {
  prompt: 'UserPromptSubmit',
  notification: 'Notification',
  stop: 'Stop',
};

/** Notifications that mean the agent is blocked on a person. Others (sign-in results and so on) are ignored. */
const NEEDS_USER = new Set(['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);

export type HookAction =
  /** Which conversation the agent is in; sent first, so it is known even if the rest fails. */
  | { do: 'agent'; conversationId: string }
  | { do: 'attention'; state: AttentionState; message?: string }
  | { do: 'note'; kind: NoteEntry['kind']; text: string };

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/**
 * Turns the JSON a hook receives on stdin into what to tell the canvas.
 * Pure, and forgiving: missing or odd input produces fewer actions, never an
 * error, because a hook must not get in the agent's way.
 */
export function hookActions(event: HookEvent, input: unknown): HookAction[] {
  const data = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  // Every hook's input names the conversation. Anything that is not a plain ID is ignored.
  const conversation = ConversationId.safeParse(data.session_id);
  const agent: HookAction[] = conversation.success ? [{ do: 'agent', conversationId: conversation.data }] : [];
  return [...agent, ...eventActions(event, data)];
}

function eventActions(event: HookEvent, data: Record<string, unknown>): HookAction[] {
  switch (event) {
    case 'prompt': {
      const prompt = text(data.prompt, 20_000);
      return [{ do: 'attention', state: 'working' }, ...(prompt ? [{ do: 'note' as const, kind: 'prompt' as const, text: prompt }] : [])];
    }
    case 'notification': {
      const type = text(data.notification_type, 100);
      if (type && !NEEDS_USER.has(type)) return [];
      const message = text(data.message, 500);
      return [{ do: 'attention', state: 'waiting', ...(message ? { message } : {}) }];
    }
    case 'stop': {
      const last = text(data.last_assistant_message, 2000).split('\n')[0]?.slice(0, 300) ?? '';
      return [
        { do: 'attention', state: 'done' },
        { do: 'note', kind: 'event', text: last ? `Finished: ${last}` : 'Finished.' },
      ];
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The command line that runs the `aubergine` command from this checkout. */
export function aubergineCommand(): string {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  return `${shellQuote(stableNodePath())} ${shellQuote(path.join(root, 'bin', 'aubergine.mjs'))}`;
}

/**
 * The `hooks` section of a Claude Code settings file. `command` is how to
 * run `aubergine`. The hooks do nothing outside an Aubergine session.
 */
export function claudeHooksSettings(command: string = aubergineCommand()): { hooks: Record<string, unknown> } {
  const hooks: Record<string, unknown> = {};
  for (const event of HOOK_EVENTS) {
    hooks[CLAUDE_EVENT[event]] = [{ hooks: [{ type: 'command', command: `${command} hook ${event}`, timeout: 10 }] }];
  }
  return { hooks };
}

/** Writes the settings file into the data folder and returns its path. */
export async function writeClaudeSettings(dataDir: string): Promise<string> {
  const dir = path.join(dataDir, 'agents');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'claude-code-settings.json');
  await writeFile(file, `${JSON.stringify(claudeHooksSettings(), null, 2)}\n`, { mode: 0o600 });
  return file;
}

export const FLAGS_PLACEHOLDER = '{flags}';

export interface LaunchOptions {
  /**
   * The user's launch command, from settings. A whole command line that is
   * typed into their shell as it is: trusted configuration, never built from
   * anything a session could send.
   */
  command?: string;
  /** Arguments for the agent itself, such as `--continue` or `--resume <id>`. Each is quoted. */
  args?: readonly string[];
}

/**
 * What to type into a session to start Claude Code with the hooks:
 * the launch command, then the agent's arguments and `--settings <file>`.
 * A launcher that needs those somewhere other than the end marks the place
 * with `{flags}`.
 */
export function claudeLaunchLine(settingsFile: string, options: LaunchOptions = {}): string {
  const command = (options.command ?? 'claude').trim() || 'claude';
  const flags = [shellJoin(options.args ?? []), `--settings ${shellQuote(settingsFile)}`].filter(Boolean).join(' ');
  return command.includes(FLAGS_PLACEHOLDER) ? command.replaceAll(FLAGS_PLACEHOLDER, flags) : `${command} ${flags}`;
}

/** Quotes words for a shell command line, leaving plain words as they are. */
export function shellJoin(words: readonly string[]): string {
  return words.map((word) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : shellQuote(word))).join(' ');
}
