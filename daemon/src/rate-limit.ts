/**
 * A limit on how often each caller may call: so many a minute, refilled
 * steadily, with room for a short burst up to the whole minute's worth.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Takes one call from the caller's allowance. When there is none left, says in how many seconds to try again. */
  take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const now = this.now();
    const perMs = this.perMinute / 60_000;
    const bucket = this.buckets.get(key) ?? { tokens: this.perMinute, at: now };
    bucket.tokens = Math.min(this.perMinute, bucket.tokens + (now - bucket.at) * perMs);
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / perMs / 1000)) };
  }

  /** Forgets a caller, so that a revoked token leaves nothing behind. */
  forget(key: string): void {
    this.buckets.delete(key);
  }
}
