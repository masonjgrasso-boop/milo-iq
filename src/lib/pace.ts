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
// A positive gap always means behind the plan, whichever goal is in force.
// For someone losing weight the plan is a deficit and the gap closes by eating
// less; for someone gaining it is a surplus and the gap closes by eating more.
// The direction flip lives in one line below, because getting it wrong means
// telling someone who is 100 short of their surplus that they are ahead.

import type { DayKey } from './dates';
import { estimateTdee } from './targets';
import type { Confidence, MaintenanceResult } from './maintenance';
import type { DayLog, Goal, UserProfile } from './types';

/**
 * Gaps smaller than this are noise, not a problem to solve. Without a floor
 * the app would offer a three-day plan to recover forty calories.
 */
export const MIN_WORTH_CHASING = 100;

/**
 * Maintaining counts as on track while the average stays within this many
 * calories a day of maintenance, either side.
 *
 * Nobody eats their maintenance figure exactly, and demanding it would make a
 * maintain goal permanently unachievable. A hundred calories a day is about a
 * tenth of a pound a month — close enough to be holding steady.
 */
export const MAINTAIN_BAND = 100;

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
 * - `ahead`: more of a gap than the goal asked for, in the goal's direction
 * - `on-track`: within `MIN_WORTH_CHASING` of the intended gap, or inside
 *   `MAINTAIN_BAND` of maintenance when maintaining
 * - `behind`: short of the intended gap, but still on the right side of
 *   maintenance
 * - `above-maintenance`: eating at or above maintenance when the goal wanted
 *   to be below it
 * - `under-maintenance`: eating at or below maintenance when the goal wanted
 *   to be above it, which is the mirror image for someone gaining
 * - `no-data`: nothing logged, so there is nothing to say
 */
export type PaceStatus =
  | 'ahead'
  | 'on-track'
  | 'behind'
  | 'above-maintenance'
  | 'under-maintenance'
  | 'no-data';

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
  /**
   * How far short of the plan the average is, in the goal's own direction.
   * Positive means behind, whether that is too little deficit or too little
   * surplus. Negative means ahead.
   */
  gapPerDay: number;
  gapTotal: number;
  status: PaceStatus;
  /** True when the gap is big enough to be worth a catch-up plan. */
  worthChasing: boolean;
}

export interface PaceTotals {
  /** Calories eaten across the logged buckets only. */
  totalCalories: number;
  daysLogged: number;
  maintenanceCalories: number;
  targetCalories: number;
  goal: Goal;
}

/**
 * The three numbers from totals alone.
 *
 * Split out from `paceSummary` because the year view works from precomputed
 * weekly roll-ups rather than raw day logs, and both need the same arithmetic.
 */
export function paceFromTotals(input: PaceTotals): PaceSummary {
  const { totalCalories, daysLogged, maintenanceCalories, targetCalories, goal } = input;

  const avgIntake = daysLogged === 0 ? 0 : Math.round(totalCalories / daysLogged);

  const targetPerDay = Math.round(maintenanceCalories - targetCalories);
  const actualPerDay = daysLogged === 0 ? 0 : Math.round(maintenanceCalories - avgIntake);

  // Both figures above are deficit-signed: positive is below maintenance. For
  // someone gaining, the plan and the progress are both negative, so the raw
  // difference comes out backwards — eating 400 above maintenance against a
  // 500 surplus plan would read as 100 ahead when it is 100 short. Flipping
  // the sign for a gain goal is what makes "positive means behind" true for
  // everyone.
  const direction = goal === 'gain' ? -1 : 1;
  const rawGap = direction * (targetPerDay - actualPerDay);
  // Normalising -0, which flipping the sign of an exact zero produces and
  // which then compares unequal to 0 everywhere downstream.
  const gapPerDay = daysLogged === 0 || rawGap === 0 ? 0 : rawGap;

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
    // Maintaining is not a gap to close but a line to sit near, so it is
    // judged on distance from maintenance in either direction.
    if (goal === 'maintain') {
      if (Math.abs(actualPerDay) <= MAINTAIN_BAND) return 'on-track';
      return actualPerDay < 0 ? 'above-maintenance' : 'under-maintenance';
    }

    // Meeting the plan is checked first, and deliberately so. A period that
    // spans a goal change is measured against the blend of the two targets,
    // which for someone who has just switched to gaining can still sit below
    // maintenance. Checking the side of maintenance first would tell them
    // they had made no progress on a period they ate exactly to plan.
    if (gapPerDay <= 0) return 'ahead';

    // Behind, and on the wrong side of maintenance altogether, which is its
    // own thing to say: not a shortfall against the plan but no progress at
    // all. Gaining is the mirror image, and sitting exactly at maintenance
    // counts for both.
    if (goal === 'lose' && actualPerDay <= 0) return 'above-maintenance';
    if (goal === 'gain' && actualPerDay >= 0) return 'under-maintenance';

    if (gapPerDay * daysLogged < MIN_WORTH_CHASING) return 'on-track';
    return 'behind';
  })();

  return {
    ...base,
    status,
    // Only a real shortfall earns a plan: being ahead is good news, not
    // something to correct, so a negative gap never becomes one. Because the
    // gap is goal-directed, "short" means too little deficit for someone
    // losing and too little surplus for someone gaining.
    worthChasing: base.gapTotal >= MIN_WORTH_CHASING,
  };
}

export function paceSummary(input: PaceInput): PaceSummary {
  const { days, start, end, maintenanceCalories, targetCalories, goal } = input;

  // Logged days only. This is the rule the whole app rests on: a day you
  // forgot to log must never be counted as a day you ate nothing.
  const logged = days.filter(
    (day) => day.date >= start && day.date <= end && day.calories > 0,
  );

  return paceFromTotals({
    totalCalories: logged.reduce((sum, day) => sum + day.calories, 0),
    daysLogged: logged.length,
    maintenanceCalories,
    targetCalories,
    goal,
  });
}
