// Progress measured against maintenance, not against target.
//
// Target is an instruction; maintenance is the fact. Someone who ate 2,400 on
// a 2,000 target is "400 over" against the instruction, which feels like
// failure — but if their maintenance is 2,800 they still spent the day in a
// deficit and still lost weight. Framing everything against maintenance is
// what lets a bad weekend read as a smaller dent rather than a write-off.
//
// Three numbers come out of here:
//
//   actual  = maintenance - average intake   (how far below you really are)
//   target  = maintenance - calorie target   (how far below you meant to be)
//   gap     = target - actual                (what it takes to get back on pace)
//
// A positive gap means behind the plan. The gap is only ever closed by eating
// less: this never tells someone to eat more, which would be a strange thing
// to read the morning after going over.

import type { DayKey } from './dates';
import { estimateTdee } from './targets';
import type { Confidence, MaintenanceResult } from './maintenance';
import type { DayLog, Goal, UserProfile } from './types';

/**
 * Gaps smaller than this are noise, not a problem to solve. Without a floor
 * the app would offer a three-day plan to recover forty calories.
 */
export const MIN_WORTH_CHASING = 100;

export type MaintenanceSource = 'measured' | 'estimated';

export interface MaintenanceBasis {
  calories: number;
  source: MaintenanceSource;
  /** Only meaningful for a measured basis. */
  confidence?: Confidence;
}

/**
 * The maintenance figure to reason with right now.
 *
 * Once there is enough history this is the measured one. Before that it falls
 * back to the Mifflin-St Jeor estimate from onboarding, so the app can still
 * say something useful on day one — labelled as an estimate, never passed off
 * as a measurement.
 */
export function maintenanceBasis(
  result: MaintenanceResult,
  profile: UserProfile,
  latestWeightKg?: number,
): MaintenanceBasis {
  if (result.status === 'ready') {
    return {
      calories: result.maintenanceCalories,
      source: 'measured',
      confidence: result.confidence,
    };
  }

  // The weight typed at onboarding goes stale, so prefer the current trend.
  return {
    calories: Math.round(
      estimateTdee({
        weightKg: latestWeightKg ?? profile.weightKg,
        heightCm: profile.heightCm,
        age: profile.age,
        sex: profile.sex,
        activity: profile.activity,
      }),
    ),
    source: 'estimated',
  };
}

export interface PaceInput {
  days: DayLog[];
  start: DayKey;
  end: DayKey;
  maintenanceCalories: number;
  targetCalories: number;
  goal: Goal;
}

/**
 * Where the user stands against their plan for a period.
 *
 * - `ahead`: more of a deficit than the goal asked for
 * - `on-track`: within `MIN_WORTH_CHASING` of the intended deficit
 * - `behind`: short of the intended deficit, but still below maintenance
 * - `above-maintenance`: eating at or above maintenance over the period
 * - `no-data`: nothing logged, so there is nothing to say
 */
export type PaceStatus = 'ahead' | 'on-track' | 'behind' | 'above-maintenance' | 'no-data';

export interface PaceSummary {
  daysLogged: number;
  avgIntake: number;
  maintenanceCalories: number;
  targetCalories: number;
  goal: Goal;
  /** Maintenance minus average intake. Positive means below maintenance. */
  actualPerDay: number;
  actualTotal: number;
  /** Maintenance minus target. Positive means the plan wants a deficit. */
  targetPerDay: number;
  targetTotal: number;
  /** Target minus actual. Positive means behind the plan. */
  gapPerDay: number;
  gapTotal: number;
  status: PaceStatus;
  /** True when the gap is big enough to be worth a catch-up plan. */
  worthChasing: boolean;
}

export function paceSummary(input: PaceInput): PaceSummary {
  const { days, start, end, maintenanceCalories, targetCalories, goal } = input;

  // Logged days only. This is the rule the whole app rests on: a day you
  // forgot to log must never be counted as a day you ate nothing.
  const logged = days.filter(
    (day) => day.date >= start && day.date <= end && day.calories > 0,
  );

  const daysLogged = logged.length;
  const avgIntake =
    daysLogged === 0
      ? 0
      : Math.round(logged.reduce((sum, day) => sum + day.calories, 0) / daysLogged);

  const targetPerDay = Math.round(maintenanceCalories - targetCalories);
  const actualPerDay = daysLogged === 0 ? 0 : Math.round(maintenanceCalories - avgIntake);
  const gapPerDay = daysLogged === 0 ? 0 : targetPerDay - actualPerDay;

  const base: Omit<PaceSummary, 'status' | 'worthChasing'> = {
    daysLogged,
    avgIntake,
    maintenanceCalories,
    targetCalories,
    goal,
    actualPerDay,
    actualTotal: actualPerDay * daysLogged,
    targetPerDay,
    targetTotal: targetPerDay * daysLogged,
    gapPerDay,
    gapTotal: gapPerDay * daysLogged,
  };

  if (daysLogged === 0) {
    return { ...base, status: 'no-data', worthChasing: false };
  }

  const status: PaceStatus = (() => {
    // Gaining is the mirror image: "below maintenance" is the problem there,
    // not the goal, and the sign of the gap already accounts for it.
    if (goal !== 'gain' && actualPerDay <= 0) return 'above-maintenance';
    if (gapPerDay <= 0) return 'ahead';
    if (gapPerDay * daysLogged < MIN_WORTH_CHASING) return 'on-track';
    return 'behind';
  })();

  return {
    ...base,
    status,
    // Only a real shortfall earns a plan, and only ever in the eat-less
    // direction — being ahead is good news, not something to correct.
    worthChasing: base.gapTotal >= MIN_WORTH_CHASING,
  };
}
