import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeHooksSettings, claudeLaunchLine, hookActions, shellJoin, writeClaudeSettings } from './claude-code';

describe('hookActions', () => {
  it('logs the prompt and marks the session as working', () => {
    const input = { hook_event_name: 'UserPromptSubmit', session_id: 'abc', prompt: '  fix the failing test  ' };
    // 'abc' is too short to be a conversation ID, so nothing is reported about the agent.
    expect(hookActions('prompt', input)).toEqual([
      { do: 'attention', state: 'working' },
      { do: 'note', kind: 'prompt', text: 'fix the failing test' },
    ]);
  });

  it('marks the session as waiting when the agent needs a person', () => {
    const input = { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' };
    expect(hookActions('notification', input)).toEqual([
      { do: 'attention', state: 'waiting', message: 'Claude needs your permission to use Bash' },
    ]);
    expect(hookActions('notification', { notification_type: 'idle_prompt', message: 'Waiting for your input' })).toHaveLength(1);
    // Older versions send no type; treat any notification as a request for attention.
    expect(hookActions('notification', { message: 'hello' })).toEqual([{ do: 'attention', state: 'waiting', message: 'hello' }]);
  });

  it('ignores notifications that do not need a person', () => {
    expect(hookActions('notification', { notification_type: 'auth_success', message: 'Signed in' })).toEqual([]);
  });

  it('marks the session as done and logs a short line when the agent stops', () => {
    const actions = hookActions('stop', { last_assistant_message: 'All 12 tests pass now.\nI changed two files.' });
    expect(actions).toEqual([
      { do: 'attention', state: 'done' },
      { do: 'note', kind: 'event', text: 'Finished: All 12 tests pass now.' },
    ]);
    expect(hookActions('stop', {})).toEqual([
      { do: 'attention', state: 'done' },
      { do: 'note', kind: 'event', text: 'Finished.' },
    ]);
  });

  it('reports the conversation ID first, when the input carries a plain one', () => {
    const id = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
    expect(hookActions('stop', { session_id: id })[0]).toEqual({ do: 'agent', conversationId: id });
    expect(hookActions('notification', { session_id: id, notification_type: 'auth_success' })).toEqual([
      { do: 'agent', conversationId: id },
    ]);
    for (const bad of ['x; rm -rf ~', '$(whoami)aaaaaaaa', 42, null]) {
      expect(hookActions('stop', { session_id: bad }).some((a) => a.do === 'agent')).toBe(false);
    }
  });

  it('never throws on input it does not understand', () => {
    for (const input of [null, undefined, 'text', 42, [], { prompt: 7 }]) {
      expect(() => hookActions('prompt', input)).not.toThrow();
      expect(hookActions('prompt', input)).toEqual([{ do: 'attention', state: 'working' }]);
    }
  });
});

describe('generated settings', () => {
  it('attaches one command hook to each of the three events', () => {
    const settings = claudeHooksSettings('aubergine');
    expect(Object.keys(settings.hooks).sort()).toEqual(['Notification', 'Stop', 'UserPromptSubmit']);
    expect(settings.hooks.UserPromptSubmit).toEqual([
      { hooks: [{ type: 'command', command: 'aubergine hook prompt', timeout: 10 }] },
    ]);
  });

  it("is written to the data folder, never to the user's own configuration", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-agents-'));
    try {
      const file = await writeClaudeSettings(dir);
      expect(file.startsWith(dir)).toBe(true);
      const written = JSON.parse(await readFile(file, 'utf8'));
      expect(written.hooks.Stop[0].hooks[0].command).toMatch(/aubergine\.mjs' hook stop$/);
      expect(claudeLaunchLine(file)).toBe(`claude --settings '${file}'`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('builds the plain launch line, with the agent\u2019s arguments before the settings', () => {
    expect(claudeLaunchLine('/d/s.json')).toBe("claude --settings '/d/s.json'");
    expect(claudeLaunchLine('/d/s.json', { args: ['--continue'] })).toBe("claude --continue --settings '/d/s.json'");
    expect(claudeLaunchLine('/d/s.json', { args: ['--resume', 'abc-123', '--fork-session'] })).toBe(
      "claude --resume abc-123 --fork-session --settings '/d/s.json'",
    );
  });

  it('uses a launcher command line as it is, spaces and its own -- included', () => {
    expect(claudeLaunchLine('/d/s.json', { command: 'mytool launch -- claude', args: ['--continue'] })).toBe(
      "mytool launch -- claude --continue --settings '/d/s.json'",
    );
    expect(claudeLaunchLine('/d/s.json', { command: "'/opt/my tools/run' --profile work claude" })).toBe(
      "'/opt/my tools/run' --profile work claude --settings '/d/s.json'",
    );
    expect(claudeLaunchLine('/d/s.json', { command: '   ' })).toBe("claude --settings '/d/s.json'");
  });

  it('puts the flags where a {flags} placeholder says', () => {
    expect(claudeLaunchLine('/d/s.json', { command: 'mytool run claude {flags} --then-something', args: ['--continue'] })).toBe(
      "mytool run claude --continue --settings '/d/s.json' --then-something",
    );
  });

  it('quotes pass-through arguments so they stay one word each', () => {
    expect(claudeLaunchLine('/d/s.json', { args: ['--append-system-prompt', 'be brief; no tables', '$(whoami)'] })).toBe(
      "claude --append-system-prompt 'be brief; no tables' '$(whoami)' --settings '/d/s.json'",
    );
  });

  it('joins words into a command line, quoting only where needed', () => {
    expect(shellJoin(['npm', 'run', 'dev'])).toBe('npm run dev');
    expect(shellJoin(['echo', 'two words', "it's"])).toBe(`echo 'two words' 'it'\\''s'`);
  });

  it('quotes a settings path that contains spaces or quotes', () => {
    expect(claudeLaunchLine("/Users/me/Application Support/it's/settings.json")).toBe(
      `claude --settings '/Users/me/Application Support/it'\\''s/settings.json'`,
    );
  });
});
