import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AttentionState, NoteEntry } from '@aubergine/shared';
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

/**
 * What to type into a new session to start Claude Code with the hooks.
 * With `continue`, it carries on the most recent conversation in that folder.
 */
export function claudeLaunchLine(settingsFile: string, options: { continue?: boolean } = {}): string {
  return `claude${options.continue ? ' --continue' : ''} --settings ${shellQuote(settingsFile)}`;
}

/** Quotes words for a shell command line, leaving plain words as they are. */
export function shellJoin(words: readonly string[]): string {
  return words.map((word) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : shellQuote(word))).join(' ');
}
