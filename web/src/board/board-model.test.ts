import { describe, expect, it } from 'vitest';
import { agentInFront, filtersFrom, liveFilters, nextCard, type Box } from './board-model';

const box = (id: string, column: number, row: number): Box => ({ id, left: column * 220, top: row * 90, width: 200, height: 80 });

describe('the board in the browser', () => {
  it('reads stored filters and drops what is not one', () => {
    expect(filtersFrom({ canvasId: 'c', workflowId: 'w', status: 'awaiting', tag: 'api' })).toEqual({ canvasId: 'c', workflowId: 'w', status: 'awaiting', tag: 'api' });
    expect(filtersFrom({ status: 'approved', tag: 7, canvasId: '' })).toEqual({});
    expect(filtersFrom('nonsense')).toEqual({});
    expect(filtersFrom(null)).toEqual({});
    // A canvas that was closed, a workflow that was removed: the filter goes, the others stay.
    expect(liveFilters({ canvasId: 'gone', workflowId: 'w', tag: 'api' }, { canvasIds: ['c'], workflowIds: ['w'] })).toEqual({ workflowId: 'w', tag: 'api' });
  });

  it('moves with the arrows: up and down within a column, left and right to the nearest card of the next column that has one', () => {
    // Three columns; the middle one is empty in the first row.
    const boxes = [box('a1', 0, 0), box('a2', 0, 1), box('a3', 0, 2), box('b2', 1, 1), box('c1', 2, 0), box('c2', 2, 1)];
    expect(nextCard(boxes, 'a1', 'down')).toBe('a2');
    expect(nextCard(boxes, 'a3', 'down')).toBeNull();
    expect(nextCard(boxes, 'a2', 'up')).toBe('a1');
    expect(nextCard(boxes, 'a2', 'right')).toBe('b2');
    expect(nextCard(boxes, 'a1', 'right')).toBe('c1');
    expect(nextCard(boxes, 'c2', 'left')).toBe('b2');
    expect(nextCard(boxes, 'a1', 'left')).toBeNull();
    // Down from a column's only card does not jump to another column.
    expect(nextCard(boxes, 'b2', 'down')).toBeNull();
    // With nothing chosen yet, any arrow goes to the first card.
    expect(nextCard(boxes, 'nothing', 'down')).toBe('a1');
    expect(nextCard([], 'nothing', 'down')).toBeNull();
  });

  it('says what is known about an agent in a terminal, and claims nothing more', () => {
    const agent = { kind: 'claude-code' as const, conversationId: null, program: 'the-agent' };
    expect(agentInFront({ agent, command: 'the-agent', state: 'open' })).toEqual({ ready: true, words: 'an agent is in front' });
    expect(agentInFront({ agent, command: 'vim', state: 'open' })).toEqual({ ready: false, words: 'an agent was here; “vim” is in front now' });
    expect(agentInFront({ agent: null, command: 'zsh', state: 'open' }).ready).toBe(false);
    expect(agentInFront({ agent: { ...agent, program: null }, command: 'node', state: 'open' }).words).toContain('no agent seen here');
    expect(agentInFront({ agent, command: 'the-agent', state: 'exited' }).words).toBe('its shell has ended');
  });
});
