// The deficit series behind the Trends graph.
//
// Trends asks one question: am I running the deficit I meant to? So the bars
// plot the deficit itself — maintenance minus what was eaten — rather than raw
// intake. Zero is maintenance, which makes the sign of a bar its meaning: above
// the line is a day that moved the scale, below it a day that did not.
//
// Periods are rolling, never calendar. A calendar month shows nothing but zeros
// on the 1st, which is the worst thing this screen could say to someone who has
// been logging for weeks.

import {
  addDays, monthLabel, shortDateLabel, startOfWeek, toWeekKey, weekdayLabel, weekKeyToMonday,
  type DayKey, type WeekKey,
} from './dates';
import type { DayLog, PeriodSummary } from './types';

export type TrendRange = 'week' | 'month' | 'year';

export const RANGE_DAYS: Record<TrendRange, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export const RANGE_LABELS: Record<TrendRange, string> = {
  week: 'the last 7 days',
  month: 'the last 30 days',
  year: 'the last 365 days',
};

export interface DeficitPoint {
  label: string;
  /** Maintenance minus intake. Null when nothing was logged, so it draws as a gap. */
  deficit: number | null;
  /** Average deficit across everything logged up to here. */
  runningAvg: number | null;
  daysLogged: number;
}

/** Calories eaten and days logged, which is all the three numbers need. */
export interface LoggedTotals {
  totalCalories: number;
  daysLogged: number;
}

/** One bar's worth of logging: a day, or a week in the year view. */
interface Bucket {
  label: string;
  totalCalories: number;
  daysLogged: number;
}

function toPoints(buckets: Bucket[], maintenanceCalories: number): DeficitPoint[] {
  let daysSoFar = 0;
  let deficitSoFar = 0;
  let runningAvg: number | null = null;

  return buckets.map((bucket) => {
    if (bucket.daysLogged > 0) {
      // Weighted by days, so a week counts for its real length. The average
      // holds steady across a gap rather than resetting — missing a day does
      // not change what you have already done.
      daysSoFar += bucket.daysLogged;
      deficitSoFar += maintenanceCalories * bucket.daysLogged - bucket.totalCalories;
      runningAvg = Math.round(deficitSoFar / daysSoFar);
    }

    return {
      label: bucket.label,
      deficit:
        bucket.daysLogged === 0
          ? null
          : Math.round(maintenanceCalories - bucket.totalCalories / bucket.daysLogged),
      runningAvg,
      daysLogged: bucket.daysLogged,
    };
  });
}

/** One bar per day, for the week and month views. */
export function dailyDeficitPoints(
  days: DayLog[],
  maintenanceCalories: number,
  labelFor: (date: DayKey) => string,
): DeficitPoint[] {
  const buckets = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      label: labelFor(day.date),
      totalCalories: day.calories,
      daysLogged: day.calories > 0 ? 1 : 0,
    }));
  return toPoints(buckets, maintenanceCalories);
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

/**
 * One bar per week, for the year view.
 *
 * Reads the precomputed weekly roll-ups rather than 365 raw day logs. A week
 * with no document is a week with nothing logged, so it becomes a gap.
 */
export function weeklyDeficitPoints(
  keys: WeekKey[],
  summaries: PeriodSummary[],
  maintenanceCalories: number,
): DeficitPoint[] {
  const byKey = new Map(summaries.map((summary) => [summary.key, summary]));
  const buckets = keys.map((key) => {
    const summary = byKey.get(key);
    return {
      label: shortDateLabel(weekKeyToMonday(key)),
      totalCalories: summary?.totalCalories ?? 0,
      daysLogged: summary?.daysLogged ?? 0,
    };
  });
  return toPoints(buckets, maintenanceCalories);
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

/**
 * The labels to print under the bars, one per bucket, empty where the axis
 * should stay blank.
 *
 * Thirty date labels do not fit across a phone, and rotating them is worse
 * than showing fewer. So each range gets a spacing that reads cleanly: day
 * names for a week, one date a week for a month, one per month for a year.
 */
export function axisTicks(dates: DayKey[], range: TrendRange): string[] {
  if (range === 'week') return dates.map((date) => weekdayLabel(date));

  if (range === 'month') {
    // Every seventh day, so about five labels across thirty bars.
    return dates.map((date, index) => (index % 7 === 0 ? shortDateLabel(date) : ''));
  }

  const monthOf = (date: DayKey) => date.slice(0, 7);
  return dates.map((date, index) => {
    // One label where each month begins. The first bucket only earns one if it
    // genuinely starts a month, so the left edge never shows a cramped pair.
    const starts =
      index === 0
        ? Number(date.slice(8, 10)) <= 7
        : monthOf(date) !== monthOf(dates[index - 1]);
    return starts ? monthLabel(date) : '';
  });
}
