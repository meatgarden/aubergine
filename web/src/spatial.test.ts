import { describe, expect, it } from 'vitest';
import { neighbour, type Box } from './spatial';

const box = (id: string, x: number, y: number, width = 100, height = 60): Box => ({ id, x, y, width, height });

// a b c
// d e
//     f (far below c)
const grid = [box('a', 0, 0), box('b', 120, 0), box('c', 240, 0), box('d', 0, 80), box('e', 120, 80), box('f', 240, 400)];

describe('neighbour', () => {
  it('moves along a row and a column', () => {
    expect(neighbour(grid, 'a', 'right')?.id).toBe('b');
    expect(neighbour(grid, 'b', 'right')?.id).toBe('c');
    expect(neighbour(grid, 'b', 'left')?.id).toBe('a');
    expect(neighbour(grid, 'a', 'down')?.id).toBe('d');
    expect(neighbour(grid, 'e', 'up')?.id).toBe('b');
  });

  it('stays put at an edge', () => {
    expect(neighbour(grid, 'a', 'left')).toBeNull();
    expect(neighbour(grid, 'a', 'up')).toBeNull();
    expect(neighbour(grid, 'f', 'down')).toBeNull();
    expect(neighbour(grid, 'f', 'right')).toBeNull();
  });

  it('prefers what is level with you over what is nearer but off to the side', () => {
    // From d, going right: e is level; b is as near but a row up.
    expect(neighbour(grid, 'd', 'right')?.id).toBe('e');
    // A box in the same column wins although another is closer in a straight line.
    const boxes = [box('from', 0, 0), box('level', 400, 10), box('near', 110, 70)];
    expect(neighbour(boxes, 'from', 'right')?.id).toBe('level');
  });

  it('falls back to the nearest when nothing lines up', () => {
    expect(neighbour(grid, 'e', 'down')?.id).toBe('f');
    expect(neighbour(grid, 'f', 'up')?.id).toBe('c');
    expect(neighbour(grid, 'f', 'left')?.id).toBe('e');
  });

  it('starts at the top left when there is nothing to start from', () => {
    expect(neighbour(grid, null, 'right')?.id).toBe('a');
    expect(neighbour(grid, 'gone', 'down')?.id).toBe('a');
    expect(neighbour([], null, 'left')).toBeNull();
  });

  it('handles boxes that overlap', () => {
    const boxes = [box('one', 0, 0, 200, 200), box('two', 50, 50, 200, 200)];
    expect(neighbour(boxes, 'one', 'right')?.id).toBe('two');
    expect(neighbour(boxes, 'two', 'up')?.id).toBe('one');
  });
});
