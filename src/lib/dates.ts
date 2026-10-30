// Date keys. Everything in Firestore is keyed by a local calendar date string
// rather than a timestamp, because "what did I eat on Tuesday" is a calendar
// question — a user who logs at 11pm and one who logs at 1am should not land
// on different days because of UTC.

export type DayKey = string; // YYYY-MM-DD
export type WeekKey = string; // YYYY-Www (ISO week)
export type MonthKey = string; // YYYY-MM

const pad = (n: number): string => String(n).padStart(2, '0');

/** Formats a Date as a local YYYY-MM-DD key. */
export function toDayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses a YYYY-MM-DD key into a local Date at midnight. */
export function fromDayKey(key: DayKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayKey(): DayKey {
  return toDayKey(new Date());
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: DayKey, to: DayKey): number {
  const ms = fromDayKey(to).getTime() - fromDayKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every day key from `from` to `to`, inclusive. */
export function rangeKeys(from: DayKey, to: DayKey): DayKey[] {
  const keys: DayKey[] = [];
  for (let key = from; daysBetween(key, to) >= 0; key = addDays(key, 1)) keys.push(key);
  return keys;
}

/** The N day keys ending at `end`, oldest first. */
export function lastNDays(end: DayKey, n: number): DayKey[] {
  return rangeKeys(addDays(end, -(n - 1)), end);
}

/** ISO week number and the year that week belongs to. */
function isoWeekParts(key: DayKey): { year: number; week: number } {
  const date = fromDayKey(key);
  // Work in UTC to sidestep DST, then shift to the Thursday of this week:
  // ISO weeks belong to whichever year holds their Thursday.
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utc.getUTCDay() || 7; // Sunday is 7, not 0
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNumber);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  const week = Math.ceil((utc.getTime() - yearStart) / 86_400_000 / 7 + 1 / 7);
  return { year: utc.getUTCFullYear(), week };
}

export function toWeekKey(key: DayKey): WeekKey {
  const { year, week } = isoWeekParts(key);
  return `${year}-W${pad(week)}`;
}

export function toMonthKey(key: DayKey): MonthKey {
  return key.slice(0, 7);
}

/** The Monday of the ISO week containing `key`. */
export function startOfWeek(key: DayKey): DayKey {
  const date = fromDayKey(key);
  const dayNumber = date.getDay() || 7;
  return addDays(key, 1 - dayNumber);
}

export function endOfWeek(key: DayKey): DayKey {
  return addDays(startOfWeek(key), 6);
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key: DayKey): DayKey {
  const date = fromDayKey(key);
  return toDayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-indexed weekday number, 0-6. Matches the rules feature's dayOfWeek. */
export function weekdayIndex(key: DayKey): number {
  return (fromDayKey(key).getDay() + 6) % 7;
}

export function weekdayLabel(key: DayKey): string {
  return WEEKDAYS[weekdayIndex(key)];
}

export const WEEKDAY_LABELS = WEEKDAYS;

/** Short human label such as "Mar 4". */
export function shortDateLabel(key: DayKey): string {
  return fromDayKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Today", "Yesterday", or a short date. */
export function friendlyDayLabel(key: DayKey, today: DayKey = todayKey()): string {
  const diff = daysBetween(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return fromDayKey(key).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** The Monday that starts a given ISO week key. The inverse of toWeekKey. */
export function weekKeyToMonday(week: WeekKey): DayKey {
  const [yearPart, weekPart] = week.split('-W');
  // 4 January is always in ISO week 1, so week 1's Monday anchors everything.
  const jan4 = new Date(Number(yearPart), 0, 4);
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));

  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (Number(weekPart) - 1) * 7);
  return toDayKey(monday);
}

/** "Week of Mar 2" reads better than "2026-W10". */
export function weekKeyLabel(week: WeekKey): string {
  return `Week of ${shortDateLabel(weekKeyToMonday(week))}`;
}
