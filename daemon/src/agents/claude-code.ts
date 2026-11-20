import { packageRoot } from '../package-root';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ConversationId, type AttentionState, type NoteEntry } from '@aubergine/shared';
import { stableNodePath } from '../node-path';

/**
 * Claude Code support: hooks that tell the canvas when an agent starts
 * working, needs the user, or has finished, and that log each prompt. Two of
 * them also speak to the agent: at the start, three lines on describing its
 * terminal; at a stop with the terminal not described, a request to go on once.
 *
 * The hooks are delivered in a settings file of our own, passed to `claude`
 * with `--settings`. The user's own Claude Code configuration is never
 * edited.
 */

export type HookEvent = 'start' | 'prompt' | 'notification' | 'stop' | 'tool';

export const HOOK_EVENTS: readonly HookEvent[] = ['start', 'prompt', 'notification', 'stop', 'tool'];

/** Which Claude Code hook each of our events is attached to. */
const CLAUDE_EVENT: Record<HookEvent, string> = {
  // When a conversation begins or is resumed: so that the agent is on record before anything is typed for it.
  start: 'SessionStart',
  prompt: 'UserPromptSubmit',
  notification: 'Notification',
  stop: 'Stop',
  // After the agent ran a command: one that makes or changes a branch or a pull request is a moment to look at the folder again.
  tool: 'PostToolUse',
};

/** Which of the agent's tools a hook is for, where it is not for all of them. */
const CLAUDE_MATCHER: Partial<Record<HookEvent, string>> = { tool: 'Bash' };

/** A command that makes or changes a branch or a pull request. Only this is told from the command: nothing of it is sent or kept. */
const CHANGES_BRANCH = /(^|[\s;&|(])(git\s+(checkout|switch|branch|push|worktree|merge|rebase|pull)\b|gh\s+pr\b|glab\s+mr\b)/;

/** Notifications that mean the agent is blocked on a person. Others (sign-in results and so on) are ignored. */
const NEEDS_USER = new Set(['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);

export type HookAction =
  /** Which conversation the agent is in; sent first, so it is known even if the rest fails. */
  | { do: 'agent'; conversationId: string }
  | { do: 'attention'; state: AttentionState; message?: string }
  | { do: 'note'; kind: NoteEntry['kind']; text: string }
  /** A moment the server is told of, which answers with what the agent is to be told, if anything. */
  | { do: 'check'; event: 'start' | 'stop' | 'tool'; again?: boolean };

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
    case 'start':
      // Which conversation it is, which every event reports; and the server is asked what an agent is told when it begins.
      return [{ do: 'check', event: 'start' }];
    case 'tool': {
      const input = (typeof data.tool_input === 'object' && data.tool_input !== null ? data.tool_input : {}) as Record<string, unknown>;
      return CHANGES_BRANCH.test(text(input.command, 20_000)) ? [{ do: 'check', event: 'tool' }] : [];
    }
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
        // First: is the terminal described? Where it is not, the agent is asked to go on once, and the rest waits for the next stop.
        { do: 'check', event: 'stop', ...(data.stop_hook_active === true ? { again: true } : {}) },
        { do: 'attention', state: 'done' },
        { do: 'note', kind: 'event', text: last ? `Finished: ${last}` : 'Finished.' },
      ];
    }
  }
}

/**
 * What a hook prints for the agent, given what the server answered. At the start: the lines themselves, which the
 * agent reads as context. At a stop that is held: the form that asks the agent to go on, with the reason. Otherwise
 * nothing. Pure.
 */
export function hookOutput(event: 'start' | 'stop' | 'tool', answer: { say: string | null; hold: boolean }): string | null {
  if (!answer.say) return null;
  if (event === 'start') return answer.say;
  if (event === 'stop' && answer.hold) return JSON.stringify({ decision: 'block', reason: answer.say });
  return null;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The command line that runs the `aubergine` command from this checkout. */
export function aubergineCommand(): string {
  return `${shellQuote(stableNodePath())} ${shellQuote(path.join(packageRoot(), 'bin', 'aubergine.mjs'))}`;
}

/**
 * The `hooks` section of a Claude Code settings file. `command` is how to
 * run `aubergine`. The hooks do nothing outside an Aubergine session.
 */
export function claudeHooksSettings(command: string = aubergineCommand()): { hooks: Record<string, unknown> } {
  const hooks: Record<string, unknown> = {};
  for (const event of HOOK_EVENTS) {
    const matcher = CLAUDE_MATCHER[event];
    hooks[CLAUDE_EVENT[event]] = [{ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: `${command} hook ${event}`, timeout: 10 }] }];
  }
  return { hooks };
}

/** Where the settings file with the hooks is, in the data folder. */
export const claudeSettingsFile = (dataDir: string): string => path.join(dataDir, 'agents', 'claude-code-settings.json');

/** Writes the settings file into the data folder and returns its path. */
export async function writeClaudeSettings(dataDir: string): Promise<string> {
  const dir = path.join(dataDir, 'agents');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = claudeSettingsFile(dataDir);
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
  /** A file of ours that names an MCP server for the agent, passed with `--mcp-config`. A path the server made, never one a caller sent. */
  mcpConfig?: string | null;
}

/**
 * What to type into a session to start Claude Code with the hooks:
 * the launch command, then the agent's arguments and `--settings <file>`.
 * A launcher that needs those somewhere other than the end marks the place
 * with `{flags}`.
 */
export function claudeLaunchLine(settingsFile: string, options: LaunchOptions = {}): string {
  const command = (options.command ?? 'claude').trim() || 'claude';
  const flags = [shellJoin(options.args ?? []), `--settings ${shellQuote(settingsFile)}`, options.mcpConfig ? `--mcp-config ${shellQuote(options.mcpConfig)}` : ''].filter(Boolean).join(' ');
  return command.includes(FLAGS_PLACEHOLDER) ? command.replaceAll(FLAGS_PLACEHOLDER, flags) : `${command} ${flags}`;
}

/** Quotes words for a shell command line, leaving plain words as they are. */
export function shellJoin(words: readonly string[]): string {
  return words.map((word) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : shellQuote(word))).join(' ');
}
