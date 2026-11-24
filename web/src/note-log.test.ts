import { describe, expect, it } from 'vitest';
import { dayLabel, logDays } from './note-log';

// Local times, so that the days are the same wherever the test runs.
const at = (y: number, m: number, d: number, h = 12, min = 0): string => new Date(y, m - 1, d, h, min).toISOString();
const NOW = new Date(2026, 10, 24, 15, 0);

describe('the log told by day', () => {
  it('names today and yesterday, else the date, with the year only when it is another', () => {
    expect(dayLabel(new Date(2026, 10, 24, 0, 1), NOW)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 23, 23, 59), NOW)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 20), NOW)).toBe(new Date(2026, 10, 20).toLocaleDateString([], { month: 'short', day: 'numeric' }));
    expect(dayLabel(new Date(2025, 11, 31), NOW)).toBe(new Date(2025, 11, 31).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }));
    expect(dayLabel(new Date(2025, 11, 31), NOW)).toMatch(/2025/);
    // Yesterday of the first of a month is the last of the one before.
    expect(dayLabel(new Date(2026, 9, 31, 22), new Date(2026, 10, 1, 8))).toBe('Yesterday');
  });

  it('groups the entries by local day, oldest day first, and keeps their order', () => {
    const entries = [
      { id: 'a', at: at(2025, 12, 31, 9) },
      { id: 'b', at: at(2026, 11, 20, 9) },
      { id: 'c', at: at(2026, 11, 20, 18) },
      { id: 'd', at: at(2026, 11, 23, 8) },
      { id: 'e', at: at(2026, 11, 24, 1) },
      { id: 'f', at: at(2026, 11, 24, 14, 30) },
    ];
    const days = logDays(entries, NOW);
    expect(days.map((day) => [day.day, day.entries.map((entry) => entry.id)])).toEqual([
      ['2025-12-31', ['a']],
      ['2026-11-20', ['b', 'c']],
      ['2026-11-23', ['d']],
      ['2026-11-24', ['e', 'f']],
    ]);
    expect(days.map((day) => day.label).slice(2)).toEqual(['Yesterday', 'Today']);
    expect(days.flatMap((day) => day.entries)).toEqual(entries);
  });

  it('reorders nothing: an entry out of order starts a day of its own again', () => {
    const days = logDays([{ at: at(2026, 11, 24, 9) }, { at: at(2026, 11, 23, 9) }, { at: at(2026, 11, 24, 10) }], NOW);
    expect(days.map((day) => day.label)).toEqual(['Today', 'Yesterday', 'Today']);
  });

  it('is empty for no entries, and puts an entry whose time cannot be read with the one before it', () => {
    expect(logDays([], NOW)).toEqual([]);
    const days = logDays([{ at: at(2026, 11, 24, 9) }, { at: 'not a time' }], NOW);
    expect(days).toHaveLength(1);
    expect(days[0]?.entries).toHaveLength(2);
  });
});
