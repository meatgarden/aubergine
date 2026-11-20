import { describe, expect, it } from 'vitest';
import { canvasViewFrom } from './canvas-view';

describe('how the canvases are shown', () => {
  it('is tabs unless this browser chose the list', () => {
    expect(canvasViewFrom(null)).toBe('tabs');
    expect(canvasViewFrom('tabs')).toBe('tabs');
    expect(canvasViewFrom('list')).toBe('list');
    expect(canvasViewFrom('dropdown')).toBe('tabs');
  });
});
