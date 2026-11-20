import { describe, expect, it } from 'vitest';
import { BAR_PLACES, BAR_PLACE_WORDS, DEFAULT_BAR_PLACE, opensUp, placeFrom } from './bar-place';

describe('where the bar over the canvas stands', () => {
  it('is the bottom right, the map\'s corner, unless this browser chose a known place', () => {
    expect(DEFAULT_BAR_PLACE).toBe('bottom-right');
    expect(placeFrom(null)).toBe('bottom-right');
    expect(placeFrom('top-left')).toBe('top-left');
    expect(placeFrom('bottom-center')).toBe('bottom-center');
    expect(placeFrom('nowhere')).toBe('bottom-right');
  });

  it('may be the map\'s corner, and each place has words', () => {
    expect(BAR_PLACES).toContain('bottom-right');
    for (const place of BAR_PLACES) expect(BAR_PLACE_WORDS[place].length).toBeGreaterThan(0);
  });

  it('opens what hangs from it upward at the foot of the canvas', () => {
    expect(BAR_PLACES.filter(opensUp)).toEqual(['bottom-left', 'bottom-center', 'bottom-right']);
  });
});
