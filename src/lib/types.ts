// Shared data shapes. Everything is stored in metric internally and converted
// only for display, so the math never has to care which units the user picked.

import type { DayKey } from './dates';

export type UnitSystem = 'imperial' | 'metric';
export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very';

export interface UserProfile {
  units: UnitSystem;
  heightCm: number;
  weightKg: number;
  age: number;
  sex: Sex;
  goal: Goal;
  activity: ActivityLevel;
  /** Desired rate of change, always a positive magnitude. 0 when maintaining. */
  targetRateKgPerWeek: number;
  /** Starting daily calorie target. Phase 3 replaces this with a measured one. */
  calorieTarget: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** One thing eaten. Grams are optional because sometimes you just know the number. */
export interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  grams?: number;
  /** Kept so an entry can be edited later without re-reading the label. */
  servingGrams?: number;
  caloriesPerServing?: number;
}

/**
 * One calendar day. Calories, weight and rule check-offs live together in a
 * single document so a month view costs 31 reads rather than hundreds.
 */
export interface DayLog {
  date: DayKey;
  calories: number;
  entries: FoodEntry[];
  weightKg?: number;
  /** ruleId -> whether it was done (yes/no rules) or how much (numeric rules). */
  rules?: Record<string, boolean | number>;
  updatedAt?: unknown;
}

/** A food the user saved for one-tap reuse. */
export interface SavedFood {
  id: string;
  name: string;
  servingGrams: number;
  caloriesPerServing: number;
  useCount?: number;
  lastUsedAt?: unknown;
  createdAt?: unknown;
}

/**
 * A precomputed week or month roll-up, written whenever a day changes so that
 * dashboards never have to re-read the raw logs.
 */
export interface PeriodSummary {
  /** The week key (YYYY-Www) or month key (YYYY-MM). */
  key: string;
  start: DayKey;
  end: DayKey;
  daysLogged: number;
  totalCalories: number;
  avgCalories: number;
  /** The daily target in force when this summary was computed. */
  targetCalories: number;
  /** Positive means under target across the logged days. */
  deficit: number;
  weighIns: number;
  firstWeightKg: number | null;
  lastWeightKg: number | null;
  avgWeightKg: number | null;
  updatedAt?: unknown;
}
