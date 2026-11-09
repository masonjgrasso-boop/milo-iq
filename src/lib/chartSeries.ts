// The series behind the two Trends charts.
//
// Both charts answer "where am I against the plan, over time", which means
// every line has to be recomputed as of each date rather than drawn from a
// single present-day figure. Maintenance in particular is not a constant: it
// is measured from a trailing window of logs, so it moves, and a chart that
// drew today's figure across the whole period would misplace every earlier
// point on it.
//
// Everything here is pure and works on buckets, so the same functions serve
// the month view (one bucket per day, straight from the logs) and the longer
// views (one bucket per week, from the precomputed roll-ups).

import { daysBetween, type DayKey } from './dates';
import { goalOn } from './goals';
import { MIN_DAYS, MIN_WEIGH_INS, MIN_WEIGH_IN_SPAN } from './maintenance';
import type { PaceSummary } from './pace';
import { dailyCalorieDelta, KCAL_PER_KG } from './targets';
import { firstTrend, latestTrend, trendSeries, weighInSpan } from './trend';
import type { Goal, GoalPeriod } from './types';

/** One point's worth of logging: a single day, or a whole week. */
export interface IntakeBucket {
  /** The day, or the Monday that starts the week. */
  date: DayKey;
  totalCalories: number;
  daysLogged: number;
  /** The scale reading for this bucket, unsmoothed, or null for none. */
  weightKg: number | null;
}

export interface MaintenancePoint {
  calories: number;
  /** False while this is still the starting estimate rather than a measurement. */
  measured: boolean;
}

/** The goal and rate to fall back on when a date predates any history. */
export interface GoalSpec {
  goal: Goal;
  targetRateKgPerWeek: number;
}

/**
 * Maintenance measured from one window of buckets, or null when the window
 * does not hold enough to say.
 *
 * Deliberately the same arithmetic as `estimateMaintenance`, applied to
 * buckets instead of days so that a week can count for seven. There is a test
 * asserting the two agree on day-sized buckets, because two implementations
 * of this formula drifting apart would put the chart and the headline at odds.
 */
export function measureMaintenance(window: IntakeBucket[]): number | null {
  const logged = window.filter((bucket) => bucket.daysLogged > 0);
  const daysLogged = logged.reduce((sum, bucket) => sum + bucket.daysLogged, 0);
  if (daysLogged < MIN_DAYS) return null;

  const points = trendSeries(
    window.map((bucket) => ({
      date: bucket.date,
      weightKg: bucket.weightKg ?? undefined,
    })),
  );
  if (points.filter((point) => point.weightKg !== null).length < MIN_WEIGH_INS) return null;

  const span = weighInSpan(points);
  if (span < MIN_WEIGH_IN_SPAN) return null;

  const start = firstTrend(points);
  const end = latestTrend(points);
  if (start === null || end === null) return null;

  const avgIntake = logged.reduce((sum, bucket) => sum + bucket.totalCalories, 0) / daysLogged;
  // The energy the body supplied (losing) or stored (gaining) per day is the
  // part of maintenance the intake average alone cannot see.
  return Math.round(avgIntake - ((end - start) * KCAL_PER_KG) / span);
}

/**
 * Maintenance as it would have been measured on each date.
 *
 * Each point looks back `windowDays` from its own date, so the line is a
 * record of what the app knew at the time. Until there is enough history the
 * point falls back to the starting estimate and says so, which is what lets
 * the chart label that stretch honestly rather than passing a formula off as
 * a measurement.
 */
export function maintenanceSeries(
  buckets: IntakeBucket[],
  windowDays: number,
  estimate: number,
): MaintenancePoint[] {
  return buckets.map((bucket, index) => {
    const window = buckets.filter(
      (seen, i) => i <= index && daysBetween(seen.date, bucket.date) < windowDays,
    );
    const measured = measureMaintenance(window);
    return measured === null
      ? { calories: estimate, measured: false }
      : { calories: measured, measured: true };
  });
}

/**
 * The daily calorie offset from maintenance that a goal asks for.
 *
 * Positive above maintenance, negative below, zero for maintaining. Derived
 * from the rate rather than read off the stored target, because the goal line
 * has to sit a fixed distance from a maintenance line that moves.
 */
export function goalOffset(spec: GoalSpec): number {
  if (spec.goal === 'maintain') return 0;
  const delta = Math.round(dailyCalorieDelta(spec.targetRateKgPerWeek));
  return spec.goal === 'gain' ? delta : -delta;
}

/**
 * The goal line: maintenance on that date, plus whatever the goal in force on
 * that date asked for. Steps on the day a goal changed.
 */
export function goalSeries(
  buckets: IntakeBucket[],
  maintenance: MaintenancePoint[],
  history: GoalPeriod[],
  fallback: GoalSpec,
): number[] {
  return buckets.map((bucket, index) => {
    const period = goalOn(history, bucket.date);
    return maintenance[index].calories + goalOffset(period ?? fallback);
  });
}

/**
 * The user's own line: average daily intake across a trailing window.
 *
 * With day buckets and a seven-day window this is the 7-day rolling average.
 * With week buckets the same seven days reach only the bucket itself, which
 * is already a week's average — so the one function gives each view the right
 * answer without either needing a special case.
 */
export function intakeSeries(
  buckets: IntakeBucket[],
  windowDays: number,
): (number | null)[] {
  return buckets.map((bucket, index) => {
    let days = 0;
    let calories = 0;
    for (let i = index; i >= 0 && daysBetween(buckets[i].date, bucket.date) < windowDays; i--) {
      days += buckets[i].daysLogged;
      calories += buckets[i].totalCalories;
    }
    return days === 0 ? null : Math.round(calories / days);
  });
}

/**
 * Where the scale would read if the user had held their goal rate.
 *
 * Each goal period is anchored to the trend weight on the first charted day
 * it covers, then projected forward at that goal's rate. So the line restarts
 * from wherever the user actually was when they changed goals, rather than
 * carrying a stale projection across the change — which is what makes a new
 * goal reachable rather than something already failed on day one.
 */
export function goalPaceSeries(
  points: { date: DayKey; trendKg: number | null }[],
  history: GoalPeriod[],
  fallback: GoalSpec,
): (number | null)[] {
  let activeStart: string | null = null;
  let anchorDate: DayKey | null = null;
  let anchorKg: number | null = null;

  return points.map((point) => {
    const period = goalOn(history, point.date);
    const startKey = period?.startDate ?? 'none';

    // A new goal re-anchors: the projection starts again from here.
    if (startKey !== activeStart) {
      activeStart = startKey;
      anchorDate = null;
      anchorKg = null;
    }

    if (anchorKg === null || anchorDate === null) {
      if (point.trendKg === null) return null;
      anchorDate = point.date;
      anchorKg = point.trendKg;
      return anchorKg;
    }

    const spec = period ?? fallback;
    const direction = spec.goal === 'gain' ? 1 : spec.goal === 'lose' ? -1 : 0;
    const weeks = daysBetween(anchorDate, point.date) / 7;
    const projected = anchorKg + direction * spec.targetRateKgPerWeek * weeks;
    return Math.round(projected * 100) / 100;
  });
}

/**
 * The headline above the calorie chart.
 *
 * Says where the average sits against maintenance first, because that is the
 * fact, and only then how far that is from the plan. Built from the same
 * PaceSummary the rest of the app reasons with, so the sentence can never
 * disagree with the numbers beside it.
 */
export function standingLine(pace: PaceSummary): string {
  if (pace.daysLogged === 0) return 'Nothing logged in this range yet.';

  const over = -pace.actualPerDay;
  const lead = `${Math.abs(Math.round(over)).toLocaleString()} ${over >= 0 ? 'over' : 'under'} maintenance`;

  if (pace.goal === 'maintain') {
    return pace.status === 'on-track'
      ? `${lead} — holding steady.`
      : `${lead} — aim to bring it back to the line.`;
  }

  if (pace.gapPerDay <= 0) return `${lead} — on track.`;
  return `${lead} — ${Math.abs(Math.round(pace.gapPerDay)).toLocaleString()} short of your goal.`;
}

/** The two figures beside the headline, signed so the direction is explicit. */
export interface Standing {
  /** Average intake minus maintenance. Positive means above maintenance. */
  vsMaintenance: number;
  /** Distance from the goal in the goal's own direction. Negative means short. */
  vsGoal: number;
}

export function standing(pace: PaceSummary): Standing {
  return {
    vsMaintenance: -Math.round(pace.actualPerDay),
    vsGoal: -Math.round(pace.gapPerDay),
  };
}

/** A signed calorie figure, as both stat boxes and the side axis print it. */
export const signedCalories = (value: number): string =>
  (value > 0 ? '+' : '') + Math.round(value).toLocaleString();
