// The ranges and buckets behind the Trends graphs.
//
// The series themselves live in ./chartSeries; what is left here is the shape
// of the x-axis: how far back each range reaches, how wide one point is, where
// the chart should start, and which points earn a label.
//
// Periods are rolling, never calendar. A calendar month shows nothing but zeros
// on the 1st, which is the worst thing this screen could say to someone who has
// been logging for weeks.

import {
  addDays, monthLabel, shortDateLabel, startOfWeek, toWeekKey,
  type DayKey, type WeekKey,
} from './dates';
import type { DayLog, PeriodSummary } from './types';

export type TrendRange = 'month' | 'quarter' | 'year';

export const RANGE_DAYS: Record<TrendRange, number> = {
  month: 30,
  quarter: 90,
  year: 365,
};

export const RANGE_LABELS: Record<TrendRange, string> = {
  month: 'the last 30 days',
  quarter: 'the last 90 days',
  year: 'the last 365 days',
};

/**
 * How wide one point is: a single day, or a whole week.
 *
 * Ninety daily points is a dense scribble on a phone, so anything past a
 * month is bucketed by week. This is its own idea, separate from how far back
 * the chart reaches, because the axis labels and the averaging window both
 * depend on the point width rather than on the range.
 */
export type BucketSize = 'day' | 'week';

export const BUCKET_FOR: Record<TrendRange, BucketSize> = {
  month: 'day',
  quarter: 'week',
  year: 'week',
};

/**
 * The first bucket with anything in it.
 *
 * Someone four days into using the app should see four days, not four days
 * and twenty-six of blank chart. Returns 0 when nothing is logged at all,
 * which is the case where the caller shows an empty state instead.
 */
export function firstActiveIndex(hasData: boolean[]): number {
  const index = hasData.findIndex(Boolean);
  return index === -1 ? 0 : index;
}

/** Calories eaten and days logged, which is all the summary figures need. */
export interface LoggedTotals {
  totalCalories: number;
  daysLogged: number;
}

/** Whole ISO weeks covering the last `days` days, oldest first. */
export function weekKeysFor(end: DayKey, days: number): WeekKey[] {
  const keys: WeekKey[] = [];
  const lastMonday = startOfWeek(end);
  let monday = startOfWeek(addDays(end, -(days - 1)));
  while (monday <= lastMonday) {
    keys.push(toWeekKey(monday));
    monday = addDays(monday, 7);
  }
  return keys;
}

export function sumDays(days: DayLog[]): LoggedTotals {
  const logged = days.filter((day) => day.calories > 0);
  return {
    totalCalories: logged.reduce((sum, day) => sum + day.calories, 0),
    daysLogged: logged.length,
  };
}

export function sumWeeks(summaries: PeriodSummary[]): LoggedTotals {
  return {
    totalCalories: summaries.reduce((sum, week) => sum + week.totalCalories, 0),
    daysLogged: summaries.reduce((sum, week) => sum + week.daysLogged, 0),
  };
}

/** About five dates, evenly spaced, whatever the bar count. */
function spacedTicks(dates: DayKey[]): string[] {
  const step = Math.max(1, Math.ceil(dates.length / 5));
  return dates.map((date, index) => (index % step === 0 ? shortDateLabel(date) : ''));
}

/**
 * The labels to print under the bars, one per bucket, empty where the axis
 * should stay blank.
 *
 * Thirty date labels do not fit across a phone, and rotating them is worse
 * than showing fewer. Week-bucketed charts get one label where each month
 * begins, which is what a reader is looking for at that zoom; day-bucketed
 * ones get an even spacing.
 *
 * That spacing follows the bar count rather than the range, because a chart
 * trimmed back to someone's first log can be far shorter than the range they
 * picked.
 */
export function axisTicks(dates: DayKey[], bucket: BucketSize): string[] {
  if (bucket === 'week') {
    const monthOf = (date: DayKey) => date.slice(0, 7);
    const ticks = dates.map((date, index) => {
      // The first bucket only earns a label if it genuinely starts a month,
      // so the left edge never shows a cramped pair.
      const starts =
        index === 0
          ? Number(date.slice(8, 10)) <= 7
          : monthOf(date) !== monthOf(dates[index - 1]);
      return starts ? monthLabel(date) : '';
    });
    // A short chart may hold no month boundary at all, which would leave the
    // axis blank. Fall through to plain spacing when that happens.
    if (ticks.filter(Boolean).length >= 2) return ticks;
  }

  return spacedTicks(dates);
}
