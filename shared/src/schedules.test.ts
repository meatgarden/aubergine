import { describe, expect, it } from 'vitest';
import { newId } from './ids';
import { Schedule, daysFromWords, daysWords, dueSchedules, lastWords, momentOf, momentWords, nextTime, type Weekday } from './schedules';
import { sourceWords } from './tasks';

/** Made-up zones with a change of clocks: one west of Greenwich, one east. */
const WEST = 'America/New_York';
const EAST = 'Europe/Berlin';
const HOURS = 3600 * 1000;
const at = (iso: string): number => Date.parse(iso);

function schedule(time: string, days: Weekday[], since: string, more: Partial<Schedule> = {}): Schedule {
  return Schedule.parse({ id: newId(), name: 'Morning list', time, days, what: { kind: 'element', elementId: newId() }, where: { kind: 'new', canvasId: newId() }, since, createdAt: since, updatedAt: since, ...more });
}
const EVERY: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

describe('the moment a clock shows a time', () => {
  it('is the plain one on an ordinary day', () => {
    // 2026-06-15 is in summer: New York is four hours behind.
    expect(new Date(momentOf(2026, 6, 15, 8, 30, WEST)).toISOString()).toBe('2026-06-15T12:30:00.000Z');
    expect(new Date(momentOf(2026, 1, 15, 8, 30, EAST)).toISOString()).toBe('2026-01-15T07:30:00.000Z');
  });

  it('is the first moment after the gap for a time that does not exist that day', () => {
    // Clocks go from 02:00 to 03:00 on 2026-03-08 in New York: 02:30 is not shown.
    expect(new Date(momentOf(2026, 3, 8, 2, 30, WEST)).toISOString()).toBe('2026-03-08T07:00:00.000Z');
    // And from 02:00 to 03:00 on 2026-03-29 in Berlin.
    expect(new Date(momentOf(2026, 3, 29, 2, 30, EAST)).toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('is the first of the two for a time that comes twice', () => {
    // Clocks go from 02:00 back to 01:00 on 2026-11-01 in New York: 01:30 is shown twice.
    expect(new Date(momentOf(2026, 11, 1, 1, 30, WEST)).toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(new Date(momentOf(2026, 10, 25, 2, 30, EAST)).toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });
});

describe('which schedules are due', () => {
  it('fires at its time on its days, and not on other days', () => {
    const s = schedule('08:30', WEEKDAYS, '2026-06-01T00:00:00.000Z');
    // Monday 2026-06-15, 08:29 in New York: not yet.
    expect(dueSchedules([s], at('2026-06-15T12:29:00.000Z'), at('2026-06-15T12:29:59.000Z'), WEST)).toEqual([]);
    expect(dueSchedules([s], at('2026-06-15T12:29:30.000Z'), at('2026-06-15T12:30:30.000Z'), WEST)).toEqual([{ scheduleId: s.id, due: '2026-06-15T12:30:00.000Z', lateMinutes: 0, verdict: 'fire' }]);
    // Saturday at the same time: not one of its days. The last look was after Friday's time.
    expect(dueSchedules([s], at('2026-06-20T12:29:30.000Z'), at('2026-06-20T12:30:30.000Z'), WEST)).toEqual([]);
  });

  it('does not fire twice for one time, and fires again the next day', () => {
    const s = schedule('08:30', EVERY, '2026-06-01T00:00:00.000Z');
    const first = dueSchedules([s], at('2026-06-15T12:29:30.000Z'), at('2026-06-15T12:30:30.000Z'), WEST);
    expect(first).toHaveLength(1);
    // The look after it knows it looked.
    expect(dueSchedules([s], at('2026-06-15T12:30:30.000Z'), at('2026-06-15T12:31:30.000Z'), WEST)).toEqual([]);
    // And without that, the schedule's own record of the time it answered for is enough.
    const answered = { ...s, last: { at: '2026-06-15T12:30:30.000Z', due: '2026-06-15T12:30:00.000Z', result: 'fired' as const, lateMinutes: 0, reason: null, taskId: null } };
    expect(dueSchedules([answered], null, at('2026-06-15T12:31:30.000Z'), WEST)).toEqual([]);
    expect(dueSchedules([answered], at('2026-06-16T12:29:30.000Z'), at('2026-06-16T12:30:30.000Z'), WEST).map((d) => d.due)).toEqual(['2026-06-16T12:30:00.000Z']);
  });

  it('does not fire while switched off', () => {
    const s = schedule('08:30', EVERY, '2026-06-01T00:00:00.000Z', { on: false });
    expect(dueSchedules([s], at('2026-06-15T12:29:30.000Z'), at('2026-06-15T12:30:30.000Z'), WEST)).toEqual([]);
  });

  it('does not fire for today when it was made, changed or switched on after its time today', () => {
    // Made at 09:00 on the 15th, for 08:30.
    const s = schedule('08:30', EVERY, '2026-06-15T13:00:00.000Z');
    expect(dueSchedules([s], null, at('2026-06-15T13:01:00.000Z'), WEST)).toEqual([]);
    expect(dueSchedules([s], at('2026-06-15T12:00:00.000Z'), at('2026-06-15T13:01:00.000Z'), WEST)).toEqual([]);
    // Tomorrow it does.
    expect(dueSchedules([s], at('2026-06-16T12:29:30.000Z'), at('2026-06-16T12:30:10.000Z'), WEST)).toHaveLength(1);
  });

  it('fires once at the next minute that exists when the clocks go forward over its time', () => {
    const s = schedule('02:30', EVERY, '2026-03-01T00:00:00.000Z');
    // 01:59 in New York on 2026-03-08 is 06:59Z; a minute later the clock shows 03:00.
    expect(dueSchedules([s], at('2026-03-08T06:58:30.000Z'), at('2026-03-08T06:59:30.000Z'), WEST)).toEqual([]);
    const due = dueSchedules([s], at('2026-03-08T06:59:30.000Z'), at('2026-03-08T07:00:30.000Z'), WEST);
    expect(due).toEqual([{ scheduleId: s.id, due: '2026-03-08T07:00:00.000Z', lateMinutes: 0, verdict: 'fire' }]);
    // Not again that day.
    for (let minute = 1; minute < 180; minute += 7) expect(dueSchedules([s], at('2026-03-08T07:00:30.000Z') + (minute - 1) * 60_000, at('2026-03-08T07:00:30.000Z') + minute * 60_000, WEST)).toEqual([]);
  });

  it('fires once when the clocks go back and its time comes twice', () => {
    const s = schedule('01:30', EVERY, '2026-10-20T00:00:00.000Z');
    let fired = 0;
    // Minute by minute from 00:30 to 03:30 on the wall, which is four hours of real time that night.
    let last = at('2026-11-01T04:30:30.000Z');
    for (let now = last + 60_000; now <= at('2026-11-01T08:30:30.000Z'); now += 60_000) {
      const due = dueSchedules([s], last, now, WEST);
      fired += due.length;
      if (due.length > 0) expect(due[0]?.due).toBe('2026-11-01T05:30:00.000Z');
      last = now;
    }
    expect(fired).toBe(1);
  });

  it('marks a time that passed while nobody looked as late, once, for any number of days', () => {
    const s = schedule('08:30', EVERY, '2026-06-01T00:00:00.000Z');
    // Last looked on the 12th in the evening; now it is the 15th at 09:10: three times passed.
    const due = dueSchedules([s], at('2026-06-12T23:00:00.000Z'), at('2026-06-15T13:10:00.000Z'), WEST);
    expect(due).toEqual([{ scheduleId: s.id, due: '2026-06-15T12:30:00.000Z', lateMinutes: 40, verdict: 'late' }]);
  });

  it('does not fire a time older than the bound, and says it was missed', () => {
    const s = schedule('08:30', EVERY, '2026-06-01T00:00:00.000Z');
    // 15:00 on the wall: six and a half hours after its time, with a bound of six.
    const due = dueSchedules([s], at('2026-06-14T23:00:00.000Z'), at('2026-06-15T19:00:00.000Z'), WEST, 6 * HOURS);
    expect(due).toEqual([{ scheduleId: s.id, due: '2026-06-15T12:30:00.000Z', lateMinutes: 390, verdict: 'missed' }]);
    // With a longer bound the same time is late, not missed.
    expect(dueSchedules([s], at('2026-06-14T23:00:00.000Z'), at('2026-06-15T19:00:00.000Z'), WEST, 8 * HOURS)[0]?.verdict).toBe('late');
    // Exactly at the bound it still fires.
    expect(dueSchedules([s], at('2026-06-14T23:00:00.000Z'), at('2026-06-15T18:30:00.000Z'), WEST, 6 * HOURS)[0]?.verdict).toBe('late');
  });

  it('answers for nothing when the clock was set back', () => {
    const s = schedule('08:30', EVERY, '2026-06-01T00:00:00.000Z');
    expect(dueSchedules([s], at('2026-06-15T12:31:00.000Z'), at('2026-06-15T12:30:10.000Z'), WEST)).toEqual([]);
  });
});

describe('in words', () => {
  it('says days, and reads them', () => {
    expect(daysWords(WEEKDAYS)).toBe('weekdays');
    expect(daysWords(EVERY)).toBe('every day');
    expect(daysWords(['fri', 'mon', 'wed'])).toBe('Monday, Wednesday and Friday');
    expect(daysFromWords('weekdays')).toEqual(WEEKDAYS);
    expect(daysFromWords('Mon, wed,fri')).toEqual(['mon', 'wed', 'fri']);
    expect(daysFromWords('someday')).toBeNull();
    expect(daysFromWords('')).toBeNull();
  });

  it('says the next time and how the last one ended', () => {
    const s = schedule('08:30', WEEKDAYS, '2026-06-01T00:00:00.000Z');
    // Friday the 19th at 09:00: next is Monday.
    const now = at('2026-06-19T13:00:00.000Z');
    const next = nextTime(s, now, WEST);
    expect(next).toBe(at('2026-06-22T12:30:00.000Z'));
    expect(momentWords(next as number, now, WEST)).toBe('Monday at 08:30');
    expect(momentWords(at('2026-06-20T12:30:00.000Z'), now, WEST)).toBe('tomorrow at 08:30');
    expect(lastWords(null, now, WEST)).toBe('It has not run yet.');
    expect(lastWords({ at: '2026-06-19T13:10:00.000Z', due: '2026-06-19T12:30:00.000Z', result: 'late', lateMinutes: 40, reason: null, taskId: null }, now, WEST)).toBe('Ran 40 minutes late, for today at 08:30.');
  });

  it('says where a task came from', () => {
    expect(sourceWords({ kind: 'schedule', name: 'Morning list' })).toBe('from the schedule “Morning list”');
    expect(sourceWords({ kind: 'schedule', name: 'Morning list', lateMinutes: 80 })).toBe('from the schedule “Morning list”, 1 hour 20 minutes late');
    expect(sourceWords({ kind: 'schedule', name: 'Morning list', byHand: true })).toBe('from the schedule “Morning list”, run by hand');
  });
});
