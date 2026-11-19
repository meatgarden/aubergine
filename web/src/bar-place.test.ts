import { describe, expect, it } from 'vitest';
import { BAR_PLACES, BAR_PLACE_WORDS, DEFAULT_BAR_PLACE, opensUp, placeFrom } from './bar-place';

describe('where the bar over the canvas stands', () => {
  it('is the top left unless this browser chose a known place', () => {
    expect(DEFAULT_BAR_PLACE).toBe('top-left');
    expect(placeFrom(null)).toBe('top-left');
    expect(placeFrom('bottom-center')).toBe('bottom-center');
    expect(placeFrom('nowhere')).toBe('top-left');
  });

  it('is never the map\'s corner, and each place has words', () => {
    expect(BAR_PLACES).not.toContain('bottom-right');
    for (const place of BAR_PLACES) expect(BAR_PLACE_WORDS[place].length).toBeGreaterThan(0);
  });

  it('opens what hangs from it upward at the foot of the canvas', () => {
    expect(BAR_PLACES.filter(opensUp)).toEqual(['bottom-left', 'bottom-center']);
  });
});
