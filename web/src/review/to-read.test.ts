import { describe, expect, it } from 'vitest';
import { toReadWords } from './to-read';

describe('what waits to be read', () => {
  const none = { agentDrafts: 0, programDrafts: 0, installs: 0, files: 0 };
  it('names each thing as what it is, with the number right', () => {
    expect(toReadWords(none)).toBe('');
    expect(toReadWords({ ...none, agentDrafts: 1 })).toBe('1 draft from an agent to read before it can be used.');
    expect(toReadWords({ ...none, agentDrafts: 2 })).toBe('2 drafts from agents to read before they can be used.');
    expect(toReadWords({ ...none, installs: 1 })).toBe('1 item from the library to read before it can be used.');
    expect(toReadWords({ ...none, themes: 1 })).toBe('1 color theme proposed to read before it can be used.');
    expect(toReadWords({ agentDrafts: 1, programDrafts: 1, installs: 2, files: 1 })).toBe('1 draft from an agent, 1 draft from a program, 2 items from the library and 1 workflow file from a repository to read before they can be used.');
  });
});
