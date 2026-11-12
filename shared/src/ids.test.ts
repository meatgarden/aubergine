import { describe, expect, it } from 'vitest';
import { Id, newId } from './ids';

describe('newId', () => {
  it('produces valid UUIDv7 values', () => {
    for (let i = 0; i < 100; i++) expect(Id.safeParse(newId()).success).toBe(true);
  });

  it('encodes the timestamp so IDs sort by creation time', () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(a < b).toBe(true);
    expect(parseInt(a.replaceAll('-', '').slice(0, 12), 16)).toBe(1_700_000_000_000);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(seen.size).toBe(1000);
  });

  it('rejects other UUID versions', () => {
    expect(Id.safeParse('2c5ea4c0-4067-41f0-8e3b-3f0c0a4b2a10').success).toBe(false);
    expect(Id.safeParse('not-an-id').success).toBe(false);
  });
});
