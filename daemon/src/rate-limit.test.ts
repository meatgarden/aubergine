import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
  it('allows a minute\'s worth at once, then says when to come back', () => {
    let now = 0;
    const limiter = new RateLimiter(60, () => now);
    for (let i = 0; i < 60; i++) expect(limiter.take('a')).toEqual({ ok: true });
    expect(limiter.take('a')).toEqual({ ok: false, retryAfterSeconds: 1 });
    // One call's worth comes back every second.
    now += 1000;
    expect(limiter.take('a')).toEqual({ ok: true });
    expect(limiter.take('a').ok).toBe(false);
  });

  it('counts each caller on its own', () => {
    let now = 0;
    const limiter = new RateLimiter(2, () => now);
    expect(limiter.take('a').ok).toBe(true);
    expect(limiter.take('a').ok).toBe(true);
    expect(limiter.take('a')).toEqual({ ok: false, retryAfterSeconds: 30 });
    expect(limiter.take('b').ok).toBe(true);
    now += 30_000;
    expect(limiter.take('a').ok).toBe(true);
  });

  it('never saves up more than a minute\'s worth, and forgets a caller when told to', () => {
    let now = 0;
    const limiter = new RateLimiter(3, () => now);
    now += 60 * 60 * 1000;
    for (let i = 0; i < 3; i++) expect(limiter.take('a').ok).toBe(true);
    expect(limiter.take('a').ok).toBe(false);
    limiter.forget('a');
    expect(limiter.take('a').ok).toBe(true);
  });
});
