import { describe, expect, it } from 'vitest';
import { keptOpenFrom } from './bar-open';

describe('the bar over the canvas', () => {
  it('is folded to "New terminal" unless this browser chose to keep it open', () => {
    expect(keptOpenFrom(null)).toBe(false);
    expect(keptOpenFrom('folded')).toBe(false);
    expect(keptOpenFrom('open')).toBe(true);
    expect(keptOpenFrom('yes')).toBe(false);
  });
});
