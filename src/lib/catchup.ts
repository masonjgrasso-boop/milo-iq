// Getting back on track after going over.
//
// The failure mode this whole app exists to prevent: one heavy weekend, a
// feeling of having blown it, and the user stops logging altogether. So the
// plan here is deliberately gentle. It spreads the shortfall across several
// days rather than demanding one punishing day, it never recommends eating
// below a safe minimum, and when the shortfall is too large to undo
// comfortably it says so and lets the rest go instead of inventing a crash
// diet.
//
// It works in both directions. Someone gaining who under-ate is just as
// behind as someone losing who over-ate, and the same gentleness applies: the
// suggestion is a bit more food each day for a while, capped so it never
// becomes an eating contest.

import { GOAL_WORDS } from './goals';
import { SAFE_MIN_CALORIES } from './targets';
import type { DayLog, Goal, Sex } from './types';

/** The adjustment is spread across at least this many days. */
export const MIN_SPREAD_DAYS = 3;
/** And at most this many, after which the excess stops being worth chasing. */
export const MAX_SPREAD_DAYS = 7;

/**
 * Which way a shortfall is put right.
 *
 * Someone short of a deficit eats less; someone short of a surplus eats more.
 * They are not symmetrical in how they can go wrong, which is why they are
 * bounded differently below.
 */
export type CatchUpFix = 'eat-less' | 'eat-more';

/**
 * The ceiling on eating more, as a share of the target and as a hard cap.
 *
 * Eating less has a natural floor — the safe minimum — but eating more has
 * none, so it gets an explicit one. A catch-up for a gain goal should read as
 * an extra snack, never as a challenge: nobody is helped by being told to put
 * away another 1,500 calories today because they under-ate last week.
 */
export const MAX_INCREASE_SHARE = 0.2;
export const MAX_DAILY_INCREASE = 400;

/** The most we will ever add to one day's target. */
export function maxIncrease(dailyTarget: number): number {
  return Math.max(
    0,
    Math.min(MAX_DAILY_INCREASE, Math.round(dailyTarget * MAX_INCREASE_SHARE)),
  );
}

/** Which direction a goal's shortfall is closed in. */
export function fixFor(goal: Goal): CatchUpFix {
  return GOAL_WORDS[goal].fix;
}

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
  /** Defaults to eating less, which is what a deficit goal always wants. */
  fix?: CatchUpFix;
  minDays?: number;
  maxDays?: number;
}

export interface CatchUpPlan {
  needed: boolean;
  surplusCalories: number;
  /** Days the adjustment is spread across. */
  days: number;
  /** Which way the plan moves the target. */
  fix: CatchUpFix;
  /**
   * Calories to move each day's target by, always a positive magnitude. Which
   * way it moves is `fix`.
   */
  dailyAdjustment: number;
  /**
   * The temporary daily target: never below the safe minimum when eating
   * less, never more than `maxIncrease` above the target when eating more.
   */
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
    surplusCalories, dailyTarget, safeMinimum, fix = 'eat-less',
    minDays = MIN_SPREAD_DAYS, maxDays = MAX_SPREAD_DAYS,
  } = input;

  const none: CatchUpPlan = {
    needed: false,
    surplusCalories: Math.max(0, surplusCalories),
    days: 0,
    fix,
    dailyAdjustment: 0,
    adjustedTarget: dailyTarget,
    coveredCalories: 0,
    shortfallCalories: 0,
    fullyCovered: true,
  };

  if (!(surplusCalories > 0)) return none;

  // The most we will ever move a day by, so the plan can never push someone
  // below a safe intake, nor hand someone gaining an unreasonable number.
  const maxDailyAdjustment = fix === 'eat-more'
    ? maxIncrease(dailyTarget)
    : Math.max(0, dailyTarget - safeMinimum);
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
    fix,
    dailyAdjustment,
    adjustedTarget: fix === 'eat-more'
      ? dailyTarget + dailyAdjustment
      : dailyTarget - dailyAdjustment,
    coveredCalories,
    shortfallCalories,
    fullyCovered: shortfallCalories === 0,
  };
}

/**
 * Convenience wrapper that picks the safe floor from the user's sex and the
 * direction from their goal.
 */
export function planCatchUpForUser(
  surplusCalories: number,
  dailyTarget: number,
  sex: Sex,
  goal: Goal = 'lose',
): CatchUpPlan {
  return planCatchUp({
    surplusCalories,
    dailyTarget,
    safeMinimum: SAFE_MIN_CALORIES[sex],
    fix: fixFor(goal),
  });
}

/** The horizon the Trends screen offers to get back on pace over. */
export const RECOVERY_DAYS = 30;
/** Widened to at most this when a 30-day cut would breach the safe floor. */
export const MAX_RECOVERY_DAYS = 90;

/**
 * Getting back on pace over the next month.
 *
 * Only ever chases a month's worth of the shortfall, however long the period
 * being viewed. A year's accumulated gap is history, not a debt — prescribing
 * a cut big enough to repay it would be both impossible and exactly the
 * "you blew it" message this app exists to avoid. Capping at the per-day gap
 * times thirty also makes the suggestion land near the per-day gap itself,
 * which is what "get back on track" means to a reader.
 */
export function planRecovery(
  gapPerDay: number,
  gapTotal: number,
  dailyTarget: number,
  sex: Sex,
  goal: Goal = 'lose',
): CatchUpPlan {
  return planCatchUp({
    surplusCalories: Math.min(gapTotal, gapPerDay * RECOVERY_DAYS),
    dailyTarget,
    safeMinimum: SAFE_MIN_CALORIES[sex],
    fix: fixFor(goal),
    minDays: RECOVERY_DAYS,
    maxDays: MAX_RECOVERY_DAYS,
  });
}
