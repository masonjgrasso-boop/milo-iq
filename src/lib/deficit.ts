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
  addDays, monthLabel, shortDateLabel, startOfWeek, toWeekKey, weekKeyToMonday,
  type DayKey, type WeekKey,
} from './dates';
import { progressToward } from './goals';
import type { DayLog, Goal, PeriodSummary } from './types';

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
 * How wide one bar is: a single day, or a whole week.
 *
 * Ninety daily bars across a phone is about three pixels each, so anything
 * past a month is bucketed by week. This is its own idea, separate from how
 * far back the chart reaches, because the axis labels and the rolling average
 * both depend on the bar width rather than on the range.
 */
export type BucketSize = 'day' | 'week';

export const BUCKET_FOR: Record<TrendRange, BucketSize> = {
  month: 'day',
  quarter: 'week',
  year: 'week',
};

/** The average line covers the last this many days of logging. */
export const ROLLING_DAYS = 7;
/** And in the week-bucketed views, the nearest equivalent. */
export const ROLLING_WEEKS = 4;

export const ROLLING_WINDOW: Record<BucketSize, number> = {
  day: ROLLING_DAYS,
  week: ROLLING_WEEKS,
};

/** Named on the chart, so the line never claims a window it did not use. */
export const ROLLING_LABELS: Record<BucketSize, string> = {
  day: String(ROLLING_DAYS) + '-day average',
  week: String(ROLLING_WEEKS) + '-week average',
};

export interface DeficitPoint {
  label: string;
  /**
   * The bar. Maintenance minus intake for a lose or maintain goal, and intake
   * minus maintenance for a gain goal, so a bar above the line always means
   * the day went the way the goal wanted. Null when nothing was logged, so it
   * draws as a gap rather than as a zero.
   */
  deficit: number | null;
  /** The trailing average over the last few buckets, on the same scale. */
  rollingAvg: number | null;
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

/**
 * The bars, and a trailing average across the last `window` of them.
 *
 * The average is trailing rather than cumulative. An average of everything
 * since you started barely moves once a few weeks are in, so it stops
 * answering the question the line is there for, which is what you are doing
 * lately. Weighted by days logged, so a week counts for its real length and a
 * bucket with nothing in it neither contributes nor resets.
 */
function toPoints(
  buckets: Bucket[],
  maintenanceCalories: number,
  window: number,
): DeficitPoint[] {
  return buckets.map((bucket, index) => {
    let days = 0;
    let deficit = 0;
    for (let i = Math.max(0, index - window + 1); i <= index; i++) {
      const seen = buckets[i];
      if (seen.daysLogged === 0) continue;
      days += seen.daysLogged;
      deficit += maintenanceCalories * seen.daysLogged - seen.totalCalories;
    }

    return {
      label: bucket.label,
      deficit:
        bucket.daysLogged === 0
          ? null
          : Math.round(maintenanceCalories - bucket.totalCalories / bucket.daysLogged),
      // Null when the whole window is empty; the line connects across it.
      rollingAvg: days === 0 ? null : Math.round(deficit / days),
      daysLogged: bucket.daysLogged,
    };
  });
}

/**
 * Turns deficit-signed points round for a gain goal, so that up is always the
 * direction the user meant to go.
 *
 * Without this a surplus plots below the line and lands in the bucket
 * labelled "over", telling someone deliberately eating above maintenance that
 * every good day was a mistake.
 */
export function orientPoints(points: DeficitPoint[], goal: Goal): DeficitPoint[] {
  if (goal !== 'gain') return points;
  return points.map((point) => ({
    ...point,
    deficit: point.deficit === null ? null : progressToward(goal, point.deficit),
    rollingAvg: point.rollingAvg === null ? null : progressToward(goal, point.rollingAvg),
  }));
}

/**
 * The first bucket with anything in it.
 *
 * Someone four days into using the app should see four bars, not four bars
 * and twenty-six days of blank chart. Returns 0 when nothing is logged at
 * all, which is the case where the caller shows an empty state instead.
 */
export function firstActiveIndex(hasData: boolean[]): number {
  const index = hasData.findIndex(Boolean);
  return index === -1 ? 0 : index;
}

/** One bar per day, for the month view. */
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
  return toPoints(buckets, maintenanceCalories, ROLLING_DAYS);
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
 * One bar per week, for the 3-month and year views.
 *
 * Reads the precomputed weekly roll-ups rather than hundreds of raw day logs.
 * A week with no document is a week with nothing logged, so it becomes a gap.
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
  return toPoints(buckets, maintenanceCalories, ROLLING_WEEKS);
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
