// Smoothed trend weight.
//
// Day-to-day scale readings swing by a kilo or more on water alone, which is
// why weighing in feels discouraging. An exponential moving average follows
// the underlying direction instead, and it is what every other calculation in
// the app uses in place of a raw reading.

import type { DayKey } from './dates';

/**
 * Smoothing factor. 0.1 gives roughly a ten-day memory: responsive enough to
 * show a real change within a week, damped enough to ignore a salty dinner.
 */
export const DEFAULT_ALPHA = 0.1;

export interface TrendPoint {
  date: DayKey;
  /** What the scale said, or null on a day with no weigh-in. */
  weightKg: number | null;
  /** The smoothed value, or null before the first weigh-in. */
  trendKg: number | null;
}

/** Plain exponential moving average over a dense series. */
export function smoothSeries(values: number[], alpha = DEFAULT_ALPHA): number[] {
  const out: number[] = [];
  for (const value of values) {
    const previous = out[out.length - 1];
    out.push(previous === undefined ? value : alpha * value + (1 - alpha) * previous);
  }
  return out;
}

/**
 * Trend weight across a run of days, which may have gaps.
 *
 * The trend only moves on days the user actually weighed in and holds steady
 * in between, so skipping the scale for a week neither invents data nor
 * resets progress.
 */
export function trendSeries(
  days: { date: DayKey; weightKg?: number }[],
  alpha = DEFAULT_ALPHA,
): TrendPoint[] {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let trend: number | null = null;

  return ordered.map((day) => {
    const weightKg = day.weightKg ?? null;
    if (weightKg !== null) {
      trend = trend === null ? weightKg : alpha * weightKg + (1 - alpha) * trend;
    }
    return { date: day.date, weightKg, trendKg: trend };
  });
}

/** The most recent smoothed value, or null if nothing has been weighed yet. */
export function latestTrend(points: TrendPoint[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].trendKg !== null) return points[i].trendKg;
  }
  return null;
}

/** The first smoothed value, which is where a change is measured from. */
export function firstTrend(points: TrendPoint[]): number | null {
  for (const point of points) {
    if (point.trendKg !== null) return point.trendKg;
  }
  return null;
}

/** Days between the first and last weigh-in, which bounds how much we can say. */
export function weighInSpan(points: TrendPoint[]): number {
  const weighed = points.filter((point) => point.weightKg !== null);
  if (weighed.length < 2) return 0;
  const first = weighed[0].date;
  const last = weighed[weighed.length - 1].date;
  const ms = new Date(last).getTime() - new Date(first).getTime();
  return Math.round(ms / 86_400_000);
}

export const countWeighIns = (points: TrendPoint[]): number =>
  points.filter((point) => point.weightKg !== null).length;
