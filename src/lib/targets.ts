// Starting calorie target from the onboarding answers.
//
// This is only an estimate. After 14 days of logging, Phase 3's adaptive
// maintenance calculation measures the user's real maintenance from their own
// data and takes over from this formula.

import type { ActivityLevel, Goal, Sex } from './types';

/** Energy density of body mass, used to convert weight change to calories. */
export const KCAL_PER_KG = 7700;
export const KCAL_PER_LB = 3500;

/**
 * Floors we never recommend eating below. These are the commonly cited
 * minimums for unsupervised dieting; the app clamps every target and every
 * catch-up plan to them.
 */
export const SAFE_MIN_CALORIES: Record<Sex, number> = {
  female: 1200,
  male: 1500,
};

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Mostly sitting',
  light: 'Light activity 1-3 days/week',
  moderate: 'Moderate activity 3-5 days/week',
  very: 'Hard activity 6-7 days/week',
};

export interface BmrInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}

/** Mifflin-St Jeor resting metabolic rate, the current standard estimate. */
export function mifflinStJeorBmr({ weightKg, heightCm, age, sex }: BmrInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === 'male' ? 5 : -161);
}

/** Total daily energy expenditure: resting rate scaled by activity. */
export function estimateTdee(input: BmrInput & { activity: ActivityLevel }): number {
  return mifflinStJeorBmr(input) * ACTIVITY_MULTIPLIERS[input.activity];
}

/** Daily calorie gap needed to change weight at the given weekly rate. */
export function dailyCalorieDelta(rateKgPerWeek: number): number {
  return (rateKgPerWeek * KCAL_PER_KG) / 7;
}

export interface TargetInput extends BmrInput {
  activity: ActivityLevel;
  goal: Goal;
  /** Positive magnitude; ignored when the goal is "maintain". */
  targetRateKgPerWeek: number;
}

export interface TargetResult {
  tdee: number;
  calorieTarget: number;
  /** True when the requested rate would have dropped below the safe floor. */
  clampedToFloor: boolean;
}

/**
 * The starting daily calorie target, never below the safe floor for the user's
 * sex. If the requested rate is too aggressive we clamp and say so, rather
 * than silently handing back an unsafe number.
 */
export function calculateCalorieTarget(input: TargetInput): TargetResult {
  const tdee = estimateTdee(input);
  const delta = input.goal === 'maintain' ? 0 : dailyCalorieDelta(input.targetRateKgPerWeek);

  let target = tdee;
  if (input.goal === 'lose') target = tdee - delta;
  if (input.goal === 'gain') target = tdee + delta;

  const floor = SAFE_MIN_CALORIES[input.sex];
  const clampedToFloor = target < floor;

  return {
    tdee: Math.round(tdee),
    calorieTarget: Math.round(clampedToFloor ? floor : target),
    clampedToFloor,
  };
}
