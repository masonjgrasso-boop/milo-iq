// Measuring the user's actual maintenance calories from their own data.
//
// Formulas like Mifflin-St Jeor guess from height, weight, age and a
// self-reported activity level, and can be out by several hundred calories.
// Once there is enough logging history, this replaces the guess with a
// measurement:
//
//   maintenance = average daily intake - (trend weight change x energy per kg) / days
//
// If you ate 2,000 a day and your trend weight fell, the missing energy came
// from you, and that difference is what maintenance really is.

import { addDays, daysBetween, type DayKey } from './dates';
import { KCAL_PER_KG } from './targets';
import { firstTrend, latestTrend, trendSeries, weighInSpan, type TrendPoint } from './trend';
import type { DayLog } from './types';

/** No estimate is shown before this much history, however tempting. */
export const MIN_DAYS = 14;
/** The rolling window never looks further back than this. */
export const MAX_WINDOW_DAYS = 28;
/** Below this many days between the first and last weigh-in, the trend is noise. */
export const MIN_WEIGH_IN_SPAN = 10;
export const MIN_WEIGH_INS = 3;

export type Confidence = 'low' | 'medium' | 'high';

export interface MaintenanceReady {
  status: 'ready';
  maintenanceCalories: number;
  confidence: Confidence;
  /** Calendar days the window covers. */
  windowDays: number;
  daysLogged: number;
  weighIns: number;
  avgIntake: number;
  trendChangeKg: number;
}

export interface MaintenanceNotReady {
  status: 'not-ready';
  daysLogged: number;
  weighIns: number;
  /** How many more logged days are needed, 0 once that part is satisfied. */
  daysStillNeeded: number;
  reason: 'needs-days' | 'needs-weigh-ins' | 'needs-span';
}

export type MaintenanceResult = MaintenanceReady | MaintenanceNotReady;

function confidenceFrom(daysLogged: number, weighIns: number, span: number): Confidence {
  // Confidence grows with all three: more logged days, more weigh-ins, and a
  // longer span for the trend to separate itself from noise.
  const score =
    0.45 * Math.min(daysLogged / MAX_WINDOW_DAYS, 1) +
    0.35 * Math.min(weighIns / 12, 1) +
    0.2 * Math.min(span / 21, 1);
  if (score < 0.55) return 'low';
  if (score < 0.8) return 'medium';
  return 'high';
}

/**
 * Estimates maintenance from the most recent window of day logs.
 *
 * `days` may contain gaps and need not be sorted. Days with no calories
 * logged are excluded from the intake average, because a forgotten day is not
 * a fasted day — counting it would drag the estimate down and tell the user
 * they need to eat less than they really do.
 */
export function estimateMaintenance(days: DayLog[], today: DayKey): MaintenanceResult {
  const windowStart = (() => {
    const earliest = days.reduce<DayKey | null>(
      (min, day) => (min === null || day.date < min ? day.date : min),
      null,
    );
    if (earliest === null) return today;
    const cap = daysBetween(earliest, today) > MAX_WINDOW_DAYS - 1;
    return cap ? addDays(today, -(MAX_WINDOW_DAYS - 1)) : earliest;
  })();

  const window = days
    .filter((day) => day.date >= windowStart && day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const logged = window.filter((day) => day.calories > 0);
  const points: TrendPoint[] = trendSeries(window);
  const weighIns = points.filter((point) => point.weightKg !== null).length;
  const span = weighInSpan(points);

  if (logged.length < MIN_DAYS) {
    return {
      status: 'not-ready',
      daysLogged: logged.length,
      weighIns,
      daysStillNeeded: MIN_DAYS - logged.length,
      reason: 'needs-days',
    };
  }
  if (weighIns < MIN_WEIGH_INS) {
    return {
      status: 'not-ready',
      daysLogged: logged.length,
      weighIns,
      daysStillNeeded: 0,
      reason: 'needs-weigh-ins',
    };
  }
  if (span < MIN_WEIGH_IN_SPAN) {
    return {
      status: 'not-ready',
      daysLogged: logged.length,
      weighIns,
      daysStillNeeded: 0,
      reason: 'needs-span',
    };
  }

  const start = firstTrend(points);
  const end = latestTrend(points);
  // Guarded by the weigh-in checks above; this keeps TypeScript honest.
  if (start === null || end === null) {
    return {
      status: 'not-ready',
      daysLogged: logged.length,
      weighIns,
      daysStillNeeded: 0,
      reason: 'needs-weigh-ins',
    };
  }

  const avgIntake = logged.reduce((sum, day) => sum + day.calories, 0) / logged.length;
  const trendChangeKg = end - start;
  // Energy the body supplied (when losing) or stored (when gaining), per day.
  const energyFromBody = (trendChangeKg * KCAL_PER_KG) / span;

  return {
    status: 'ready',
    maintenanceCalories: Math.round(avgIntake - energyFromBody),
    confidence: confidenceFrom(logged.length, weighIns, span),
    windowDays: window.length,
    daysLogged: logged.length,
    weighIns,
    avgIntake: Math.round(avgIntake),
    trendChangeKg,
  };
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: 'Early estimate',
  medium: 'Getting clearer',
  high: 'Well established',
};
