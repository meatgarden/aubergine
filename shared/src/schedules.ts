import { z } from 'zod';
import { EnvironmentKindName } from './environment';
import { Id } from './ids';
import { PlainWords, TASK_DETAILS_MAX, registerTaskSource } from './tasks';
import { PlainName } from './workflows';

/**
 * Schedules: "at these times, run this there."
 *
 * A schedule is a source of tasks. When its time comes it adds one task to
 * the queue, and the queue starts it by its own rules: the limit and the hold
 * count for it like for any other. Aubergine calls nothing itself and holds
 * no credential: the agent the element runs on uses its own tools.
 *
 * Deciding when is one pure function, `dueSchedules`. It is given the time;
 * it never reads a clock.
 */

const Timestamp = z.iso.datetime();

export const SCHEDULES_MAX = 50;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const Weekday = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof Weekday>;
const DAY_WORDS: Record<Weekday, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

/** A time of day on this computer's clock, `08:30`. */
export const TimeOfDay = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'A time of day is written like 08:30');
const Days = z
  .array(Weekday)
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, 'A day is named once');

/** What a schedule runs: one element from the shelf, or a workflow. */
export const ScheduleWhat = z.discriminatedUnion('kind', [z.object({ kind: z.literal('element'), elementId: Id }), z.object({ kind: z.literal('workflow'), workflowId: Id })]);
export type ScheduleWhat = z.infer<typeof ScheduleWhat>;

/** Where it runs: a terminal the owner named, or a new agent terminal on a canvas the owner named. */
export const ScheduleWhere = z.discriminatedUnion('kind', [z.object({ kind: z.literal('session'), sessionId: Id }), z.object({ kind: z.literal('new'), canvasId: Id })]);
export type ScheduleWhere = z.infer<typeof ScheduleWhere>;

/** How a time of a schedule ended. */
export const ScheduleResult = z.enum(['fired', 'late', 'by-hand', 'skipped', 'missed', 'could-not-run']);
export type ScheduleResult = z.infer<typeof ScheduleResult>;

export const ScheduleLast = z.object({
  at: Timestamp.describe('When this was decided.'),
  due: Timestamp.nullable().describe('The time it was for. Null when the owner ran it by hand.'),
  result: ScheduleResult,
  lateMinutes: z.number().int().min(0).default(0).describe('With `late`: by how many minutes.'),
  reason: z.string().max(600).nullable().default(null).describe('With `skipped`, `missed` and `could-not-run`: why, in a sentence.'),
  taskId: Id.nullable().default(null).describe('The task it became, when it became one.'),
});
export type ScheduleLast = z.infer<typeof ScheduleLast>;

export const Schedule = z.object({
  id: Id,
  name: PlainName.describe('What it is called. Shown in lists and beside what it hands in.'),
  time: TimeOfDay.describe("The time of day, on this computer's clock and in its time zone."),
  days: Days.describe('The days of the week it runs on.'),
  what: ScheduleWhat.describe('What it runs: one element from the shelf, or a workflow.'),
  where: ScheduleWhere.describe('Where: a terminal, or a new agent terminal on a canvas.'),
  folder: z.string().startsWith('/').max(4096).nullable().default(null).describe('For a new terminal: the folder it starts in. Null: the folder new terminals start in.'),
  environment: EnvironmentKindName.nullable().default(null).describe('For a new terminal: where it works. Null: a working copy of its own where the folder can have one.'),
  task: PlainWords(TASK_DETAILS_MAX).default('').describe('What the agent is told to do, as the task of what it runs. Plain text.'),
  on: z.boolean().default(true),
  since: Timestamp.describe('Times up to this moment are not its own: it was made, changed or switched on then.'),
  last: ScheduleLast.nullable().default(null).describe('How its latest time ended.'),
  taskId: Id.nullable().default(null).describe('The task of its latest firing. While that one waits or is at work, it does not fire again.'),
  problem: z.string().max(600).nullable().default(null).describe('Why it cannot run as it is written, when it cannot. Said once on the owner\'s list, until it is changed or runs again.'),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Schedule = z.infer<typeof Schedule>;

export const SchedulesState = z.object({
  items: z.array(Schedule).max(SCHEDULES_MAX).default([]),
  /** When the schedules were last looked at and something was due. Null: never. */
  checkedAt: Timestamp.nullable().default(null),
});
export type SchedulesState = z.infer<typeof SchedulesState>;

/* ---------- A task that came from a schedule ---------- */

registerTaskSource({
  kind: 'schedule',
  title: 'A schedule',
  says: true,
  words: (source) => {
    const name = typeof source.name === 'string' && source.name ? `the schedule “${source.name}”` : 'a schedule';
    const late = typeof source.lateMinutes === 'number' && source.lateMinutes > 0 ? `, ${minutesWords(source.lateMinutes)} late` : '';
    return `from ${name}${source.byHand === true ? ', run by hand' : late}`;
  },
});

/** `40 minutes`, `2 hours`, `1 hour 20 minutes`. */
export function minutesWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 0 ? '' : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const m = rest === 0 && hours > 0 ? '' : `${rest} ${rest === 1 ? 'minute' : 'minutes'}`;
  return [h, m].filter((part) => part !== '').join(' ');
}

/* ---------- Clocks and zones ---------- */

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let made = formatters.get(zone);
  if (!made) {
    made = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formatters.set(zone, made);
  }
  return made;
}

/** Whether a time zone's name is one this computer knows. */
export function knownZone(zone: string): boolean {
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What the clock on the wall shows in a zone at a moment. */
function wallAt(instant: number, zone: string): Wall {
  const parts: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(new Date(instant))) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  return { year: parts.year ?? 0, month: parts.month ?? 1, day: parts.day ?? 1, hour: parts.hour ?? 0, minute: parts.minute ?? 0, second: parts.second ?? 0 };
}

/** How far the zone's clock is ahead of universal time at a moment, in milliseconds. */
function offsetAt(instant: number, zone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  const wall = wallAt(whole, zone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - whole;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * The moment at which a zone's clock shows this date and time. Where the
 * clocks go forward and the time does not exist that day, it is the first
 * moment after the gap. Where they go back and the time comes twice, it is
 * the first of the two.
 */
export function momentOf(year: number, month: number, day: number, hour: number, minute: number, zone: string): number {
  const asUniversal = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetAt(asUniversal - DAY_MS, zone);
  const after = offsetAt(asUniversal + DAY_MS, zone);
  const shows = (instant: number): boolean => {
    const wall = wallAt(instant, zone);
    return wall.year === year && wall.month === month && wall.day === day && wall.hour === hour && wall.minute === minute;
  };
  const real = [asUniversal - before, asUniversal - after].filter(shows);
  if (real.length > 0) return Math.min(...real);
  // The time is in a gap: find the moment the clocks changed, between a day before and a day after.
  let low = asUniversal - DAY_MS;
  let high = asUniversal + DAY_MS;
  while (high - low > 1000) {
    const middle = low + Math.floor((high - low) / 2000) * 1000;
    if (offsetAt(middle, zone) === before) low = middle;
    else high = middle;
  }
  return high;
}

const dayOfDate = (year: number, month: number, day: number): Weekday => WEEKDAYS[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7] as Weekday;

/** The moment of a schedule's time on the day that is `offset` days from the day it is at `now` in the zone; null when that is not one of its days. */
function momentOnDay(schedule: Pick<Schedule, 'time' | 'days'>, now: number, offset: number, zone: string): number | null {
  const today = wallAt(now, zone);
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
  const [year, month, day] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  if (!schedule.days.includes(dayOfDate(year, month, day))) return null;
  const [hour, minute] = schedule.time.split(':').map(Number) as [number, number];
  return momentOf(year, month, day, hour, minute, zone);
}

/** The latest of a schedule's times that is not after `now`; null when there is none in the last eight days. */
export function latestTime(schedule: Pick<Schedule, 'time' | 'days'>, now: number, zone: string): number | null {
  for (let back = 0; back >= -8; back -= 1) {
    const moment = momentOnDay(schedule, now, back, zone);
    if (moment !== null && moment <= now) return moment;
  }
  return null;
}

/** The next of a schedule's times after `now`, whether or not it is switched on. */
export function nextTime(schedule: Pick<Schedule, 'time' | 'days'>, now: number, zone: string): number | null {
  for (let ahead = 0; ahead <= 8; ahead += 1) {
    const moment = momentOnDay(schedule, now, ahead, zone);
    if (moment !== null && moment > now) return moment;
  }
  return null;
}

/* ---------- Deciding when ---------- */

/** After how long a firing is called late. The timer looks once a minute, so less than this is on time. */
export const LATE_AFTER_MS = 2 * 60 * 1000;
export const LATE_WITHIN_HOURS_DEFAULT = 6;

export interface DueSchedule {
  scheduleId: string;
  /** The time it is for. */
  due: string;
  /** How long ago that was, in whole minutes. */
  lateMinutes: number;
  /** `fire`: on time. `late`: its time passed while nobody looked, and not too long ago. `missed`: too long ago; it does not fire. */
  verdict: 'fire' | 'late' | 'missed';
}

/**
 * Which schedules have a time to answer for now. Pure: the time is passed in.
 *
 * For each schedule that is on, the latest of its times that is after the
 * last look (and after the moment it was made, changed or switched on, and
 * after the time it last answered for) and not after `now`. One at most,
 * however many of its times passed: three missed days are one, the latest.
 * A time older than `lateWithinMs` is `missed` and does not fire.
 */
export function dueSchedules(schedules: readonly Schedule[], lastChecked: number | null, now: number, zone: string, lateWithinMs: number = LATE_WITHIN_HOURS_DEFAULT * 3600 * 1000): DueSchedule[] {
  const due: DueSchedule[] = [];
  for (const schedule of schedules) {
    if (!schedule.on) continue;
    const moment = latestTime(schedule, now, zone);
    if (moment === null) continue;
    const floor = Math.max(lastChecked ?? -Infinity, Date.parse(schedule.since), schedule.last?.due ? Date.parse(schedule.last.due) : -Infinity);
    if (moment <= floor) continue;
    const late = now - moment;
    due.push({ scheduleId: schedule.id, due: new Date(moment).toISOString(), lateMinutes: Math.floor(late / 60_000), verdict: late < LATE_AFTER_MS ? 'fire' : late > lateWithinMs ? 'missed' : 'late' });
  }
  return due;
}

/* ---------- In words ---------- */

/** `every day`, `weekdays`, `Monday, Wednesday and Friday`. */
export function daysWords(days: readonly Weekday[]): string {
  const have = WEEKDAYS.filter((day) => days.includes(day));
  if (have.length === 7) return 'every day';
  if (have.length === 5 && !have.includes('sat') && !have.includes('sun')) return 'weekdays';
  if (have.length === 2 && have.includes('sat') && have.includes('sun')) return 'weekends';
  const names = have.map((day) => DAY_WORDS[day]);
  return names.length <= 1 ? (names[0] ?? 'no day') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** Days from words: `weekdays`, `every day`, `mon,wed,fri`. Null when it is none of these. */
export function daysFromWords(words: string): Weekday[] | null {
  const said = words.trim().toLowerCase();
  if (said === 'weekdays') return ['mon', 'tue', 'wed', 'thu', 'fri'];
  if (said === 'weekends') return ['sat', 'sun'];
  if (said === 'every day' || said === 'daily' || said === 'all') return [...WEEKDAYS];
  const parts = said.split(/[\s,]+/).filter((part) => part !== '');
  const days = parts.map((part) => WEEKDAYS.find((day) => part === day || part === DAY_WORDS[day].toLowerCase()));
  if (parts.length === 0 || days.some((day) => day === undefined)) return null;
  return WEEKDAYS.filter((day) => days.includes(day));
}

/** `weekdays at 08:30`. */
export const whenWords = (schedule: Pick<Schedule, 'time' | 'days'>): string => `${daysWords(schedule.days)} at ${schedule.time}`;

/** A moment as the zone's clock shows it, relative to now: `today at 08:30`, `tomorrow at 08:30`, `Monday at 08:30`. */
export function momentWords(moment: number, now: number, zone: string): string {
  const wall = wallAt(moment, zone);
  const today = wallAt(now, zone);
  const days = Math.round((Date.UTC(wall.year, wall.month - 1, wall.day) - Date.UTC(today.year, today.month - 1, today.day)) / DAY_MS);
  const time = `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`;
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : days > 1 && days < 7 ? DAY_WORDS[dayOfDate(wall.year, wall.month, wall.day)] : `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
  return `${day} at ${time}`;
}

/** How a schedule's latest time ended, in a sentence; for its row. */
export function lastWords(last: ScheduleLast | null, now: number, zone: string): string {
  if (last === null) return 'It has not run yet.';
  const when = momentWords(Date.parse(last.due ?? last.at), now, zone);
  switch (last.result) {
    case 'fired':
      return `Ran ${when}.`;
    case 'late':
      return `Ran ${minutesWords(last.lateMinutes)} late, for ${when}.`;
    case 'by-hand':
      return `Run by hand ${when}.`;
    case 'skipped':
      return `Skipped ${when}: ${last.reason ?? 'its earlier run was not over.'}`;
    case 'missed':
      return `Missed ${when}: ${last.reason ?? 'nothing was looking at that time.'}`;
    case 'could-not-run':
      return `Could not run ${when}: ${last.reason ?? 'something it names is gone.'}`;
  }
}
