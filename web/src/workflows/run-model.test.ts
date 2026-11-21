import { describe, expect, it } from 'vitest';
import { agentSeen, notSeenWords } from './run-model';

const terminal = (agent: boolean, state: 'idle' | 'busy') => ({ agent: agent ? { program: 'claude', kind: 'claude-code' } : null, status: { state } }) as never;

describe('agentSeen and notSeenWords', () => {
  it('sees no agent where none was reported', () => {
    expect(agentSeen(terminal(false, 'busy'))).toBe(false);
    expect(notSeenWords(terminal(false, 'busy'))).toMatch(/No agent is seen/);
    expect(notSeenWords(terminal(false, 'idle'))).toMatch(/No agent is seen/);
  });
  it('does not see an agent whose shell is idle', () => {
    expect(agentSeen(terminal(true, 'idle'))).toBe(false);
    expect(notSeenWords(terminal(true, 'idle'))).toMatch(/not running now/);
  });
  it('sees an agent in front of a busy shell', () => {
    expect(agentSeen(terminal(true, 'busy'))).toBe(true);
    expect(notSeenWords(terminal(true, 'busy'))).toBeNull();
  });
});
