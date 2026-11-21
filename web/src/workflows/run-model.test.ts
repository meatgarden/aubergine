import { describe, expect, it } from 'vitest';
import { agentSeen, notSeenWords, terminalChoices } from './run-model';

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

describe('terminalChoices', () => {
  const t = (id: string, name: string, agent: boolean, state: 'idle' | 'busy' = 'busy', alive: 'running' | 'exited' = 'running') =>
    ({ id, name, state: alive, agent: agent ? { program: 'claude', kind: 'claude-code' } : null, status: { state } }) as never as Parameters<typeof terminalChoices>[0][number];
  const all = [t('b', 'beta', false), t('a', 'alpha', true), t('c', 'carol', false), t('x', 'gone', true, 'busy', 'exited')];
  const ids = (list: readonly { id: string }[]) => list.map((s) => s.id);

  it('with the filter on hides the terminals where no agent is seen, and counts them', () => {
    const found = terminalChoices(all, { onlySeen: true, keep: [] });
    expect(ids(found.seen)).toEqual(['a']);
    expect(found.notSeen).toEqual([]);
    expect(found.hidden).toBe(2);
  });
  it('with the filter off shows both groups, sorted by name', () => {
    const found = terminalChoices(all, { onlySeen: false, keep: [] });
    expect(ids(found.seen)).toEqual(['a']);
    expect(ids(found.notSeen)).toEqual(['b', 'c']);
    expect(found.hidden).toBe(0);
  });
  it('keeps a terminal that was asked for, and does not count it as hidden', () => {
    const found = terminalChoices(all, { onlySeen: true, keep: ['c', null] });
    expect(ids(found.notSeen)).toEqual(['c']);
    expect(found.hidden).toBe(1);
  });
  it('leaves out an exited terminal unless it is kept', () => {
    expect(ids(terminalChoices(all, { onlySeen: false, keep: [] }).seen)).not.toContain('x');
    expect(ids(terminalChoices(all, { onlySeen: true, keep: ['x'] }).seen)).toEqual(['a', 'x']);
  });
});
