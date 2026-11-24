/**
 * A terminal's log, told by day: the entries as they are (oldest first), under a heading for each local calendar day.
 * Pure: the same entries and the same moment give the same days. Nothing reorders the entries.
 */

export interface LogDay<T> {
  /** The local calendar day, as `YYYY-MM-DD`: a key, and the `dateTime` of its heading. */
  day: string;
  /** "Today", "Yesterday", else the date, with the year when it is another. */
  label: string;
  entries: T[];
}

const pad = (n: number): string => String(n).padStart(2, '0');
const dayOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** What a day is called, seen from `now`. */
export function dayLabel(date: Date, now: Date): string {
  if (dayOf(date) === dayOf(now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayOf(date) === dayOf(yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

/** The entries grouped by the day they were written on, in the order they are given. An entry whose time is not a time is put with the one before it. */
export function logDays<T extends { at: string }>(entries: readonly T[], now: Date): LogDay<T>[] {
  const days: LogDay<T>[] = [];
  for (const entry of entries) {
    const date = new Date(entry.at);
    const day = Number.isNaN(date.getTime()) ? (days.at(-1)?.day ?? '') : dayOf(date);
    const last = days.at(-1);
    if (last && last.day === day) last.entries.push(entry);
    else days.push({ day, label: Number.isNaN(date.getTime()) ? '' : dayLabel(date, now), entries: [entry] });
  }
  return days;
}
