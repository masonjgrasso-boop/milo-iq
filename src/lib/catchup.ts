// Getting back on track after going over.
//
// The failure mode this whole app exists to prevent: one heavy weekend, a
// feeling of having blown it, and the user stops logging altogether. So the
// plan here is deliberately gentle. It spreads the excess across several days
// rather than demanding one punishing day, it never recommends eating below a
// safe minimum, and when the excess is too large to undo comfortably it says
// so and lets the rest go instead of inventing a crash diet.

import { SAFE_MIN_CALORIES } from './targets';
import type { DayLog, Sex } from './types';

/** The adjustment is spread across at least this many days. */
export const MIN_SPREAD_DAYS = 3;
/** And at most this many, after which the excess stops being worth chasing. */
export const MAX_SPREAD_DAYS = 7;

export interface CatchUpInput {
  /**
   * Calories to make up across the period; zero or less needs no plan.
   *
   * Callers pass the shortfall against their intended pace — see `gapTotal`
   * in `./pace` — rather than raw calories over target. Being 400 over a
   * target that already sits 600 below maintenance is not a 400 problem.
   */
  surplusCalories: number;
  dailyTarget: number;
  safeMinimum: number;
  minDays?: number;
  maxDays?: number;
}

export interface CatchUpPlan {
  needed: boolean;
  surplusCalories: number;
  /** Days the adjustment is spread across. */
  days: number;
  /** Calories to come off each day's target. */
  dailyAdjustment: number;
  /** The temporary daily target, never below the safe minimum. */
  adjustedTarget: number;
  coveredCalories: number;
  /** Excess the plan deliberately does not chase. */
  shortfallCalories: number;
  fullyCovered: boolean;
}

/** Total calories eaten above target across logged days; never negative. */
export function surplusFrom(days: DayLog[], dailyTarget: number): number {
  const total = days
    .filter((day) => day.calories > 0)
    .reduce((sum, day) => sum + (day.calories - dailyTarget), 0);
  return Math.max(0, total);
}

export function planCatchUp(input: CatchUpInput): CatchUpPlan {
  const {
    surplusCalories, dailyTarget, safeMinimum,
    minDays = MIN_SPREAD_DAYS, maxDays = MAX_SPREAD_DAYS,
  } = input;

  const none: CatchUpPlan = {
    needed: false,
    surplusCalories: Math.max(0, surplusCalories),
    days: 0,
    dailyAdjustment: 0,
    adjustedTarget: dailyTarget,
    coveredCalories: 0,
    shortfallCalories: 0,
    fullyCovered: true,
  };

  if (!(surplusCalories > 0)) return none;

  // The most we will ever take off a day, so the plan can never push the user
  // below a safe intake.
  const maxDailyAdjustment = Math.max(0, dailyTarget - safeMinimum);
  if (maxDailyAdjustment === 0) {
    return {
      ...none,
      needed: true,
      days: 0,
      shortfallCalories: surplusCalories,
      fullyCovered: false,
    };
  }

  // Use the fewest days that keeps each day's cut comfortable, widening the
  // spread rather than deepening the cut.
  let days = minDays;
  while (surplusCalories / days > maxDailyAdjustment && days < maxDays) days++;

  const dailyAdjustment = Math.round(Math.min(surplusCalories / days, maxDailyAdjustment));
  const coveredCalories = dailyAdjustment * days;
  const shortfallCalories = Math.max(0, Math.round(surplusCalories - coveredCalories));

  return {
    needed: true,
    surplusCalories,
    days,
    dailyAdjustment,
    adjustedTarget: dailyTarget - dailyAdjustment,
    coveredCalories,
    shortfallCalories,
    fullyCovered: shortfallCalories === 0,
  };
}

/** Convenience wrapper that picks the safe floor from the user's sex. */
export function planCatchUpForUser(
  surplusCalories: number,
  dailyTarget: number,
  sex: Sex,
): CatchUpPlan {
  return planCatchUp({
    surplusCalories,
    dailyTarget,
    safeMinimum: SAFE_MIN_CALORIES[sex],
  });
}
