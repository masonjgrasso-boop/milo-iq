// How fast someone wants to change weight, and whether that is sensible.
//
// A rate can be entered per week or per month, in whichever units the person
// picked. Everything downstream works in kilograms per week, so that is what
// this module converts to, and it is the only place the month-to-week
// arithmetic lives.

import { SAFE_MIN_CALORIES } from './targets';
import { kgToLb, toKg } from './units';
import type { Sex, UnitSystem } from './types';

/** Weeks in an average month, from a 52-week year. */
export const WEEKS_PER_MONTH = 52 / 12;

export type RatePeriod = 'week' | 'month';

/** The period as it reads inside a sentence: "1 lb a week". */
export const PERIOD_WORDS: Record<RatePeriod, string> = {
  week: 'a week',
  month: 'a month',
};

/**
 * A rate as typed, converted to kilograms per week.
 *
 * Returns 0 for anything that is not a usable positive number, so a half-typed
 * field reads as "no rate yet" rather than as NaN.
 */
export function rateToKgPerWeek(
  value: number,
  period: RatePeriod,
  units: UnitSystem,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const kg = toKg(value, units);
  return period === 'month' ? kg / WEEKS_PER_MONTH : kg;
}

/**
 * Losing or gaining more than this share of body weight in a week is the point
 * at which we say something. One percent is the common rule of thumb: fast
 * enough to be hard to hold, and fast enough that more of the loss is muscle.
 */
export const AGGRESSIVE_WEEKLY_SHARE = 0.01;

/** What fraction of body weight a weekly rate represents. */
export function weeklyShareOfBodyWeight(rateKgPerWeek: number, weightKg: number): number {
  if (!(weightKg > 0)) return 0;
  return rateKgPerWeek / weightKg;
}

export type RateConcern = 'none' | 'below-minimum' | 'aggressive';

/**
 * Whether a rate is worth a word of caution, and which one.
 *
 * Being pushed under the safe intake floor wins over simply being fast,
 * because it is the more concrete problem: the target on screen is no longer
 * the target that was asked for.
 */
export function rateConcern({ rateKgPerWeek, weightKg, clampedToFloor }: {
  rateKgPerWeek: number;
  weightKg: number;
  clampedToFloor: boolean;
}): RateConcern {
  if (rateKgPerWeek <= 0) return 'none';
  if (clampedToFloor) return 'below-minimum';
  if (weeklyShareOfBodyWeight(rateKgPerWeek, weightKg) > AGGRESSIVE_WEEKLY_SHARE) {
    return 'aggressive';
  }
  return 'none';
}

/** The safe daily floor for someone, named so a note can quote it. */
export function safeMinimum(sex: Sex): number {
  return SAFE_MIN_CALORIES[sex];
}

/**
 * A rate that would sit right on the 1% line, for suggesting something slower.
 * Returned in the units and period the question was asked in.
 */
export function gentlerRate(weightKg: number, period: RatePeriod, units: UnitSystem): number {
  const kgPerWeek = weightKg * AGGRESSIVE_WEEKLY_SHARE;
  const kg = period === 'month' ? kgPerWeek * WEEKS_PER_MONTH : kgPerWeek;
  const value = units === 'metric' ? kg : kgToLb(kg);
  // One decimal is as precise as a bathroom scale deserves.
  return Math.round(value * 10) / 10;
}
