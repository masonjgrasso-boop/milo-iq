// Shared data shapes. Everything is stored in metric internally and converted
// only for display, so the math never has to care which units the user picked.

import type { DayKey } from './dates';

export type UnitSystem = 'imperial' | 'metric';
export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very';

/**
 * One goal and the day it started.
 *
 * Kept so that a day already logged is always judged against the goal that
 * was active on it. Someone who spent March in a deficit and then switched to
 * gaining has not failed at gaining in March.
 */
export interface GoalPeriod {
  /** The first day this goal counts for. */
  startDate: DayKey;
  goal: Goal;
  /** Positive magnitude, as on the profile. 0 when maintaining. */
  targetRateKgPerWeek: number;
  /** The daily calorie target this goal was saved with. */
  calorieTarget: number;
  /**
   * The trend weight when this goal started.
   *
   * What milestones are measured from, so switching from losing to gaining
   * counts progress again from scratch rather than inheriting a tally that
   * now means the opposite. Absent on goals saved before milestones existed,
   * where the caller falls back to the profile's starting weight.
   */
  startWeightKg?: number;
}

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
  /**
   * Every goal this user has held, oldest first, including the current one.
   *
   * Stored on the profile rather than in its own collection because the
   * profile is already read once at start-up and handed to every screen, so
   * history costs no extra query anywhere it is needed. Absent for anyone who
   * has never changed goals.
   */
  goalHistory?: GoalPeriod[];
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

/**
 * A personal rule the user holds themselves to.
 *
 * - `boolean`: did you do it, yes or no ("No weekday drinking")
 * - `numeric`: did you hit a daily number ("10k steps")
 * - `weeklyLimit`: on at most N days a week ("Eat out max 1 day/week")
 */
export type RuleType = 'boolean' | 'numeric' | 'weeklyLimit';

export interface Rule {
  id: string;
  name: string;
  type: RuleType;
  /** Daily goal for numeric rules; maximum days per week for weekly limits. */
  target: number;
  /** What a numeric rule counts, shown beside the input. */
  unit?: string;
  /** Monday-indexed weekdays the rule applies to. Empty means every day. */
  daysOfWeek: number[];
  /** Position in the checklist. Absent on rules made before ordering existed. */
  order?: number;
  active: boolean;
  /**
   * The first day the rule counts for. A rule cannot have been kept or broken
   * before it existed, so days before this are never judged against it.
   */
  startDate?: DayKey;
  createdAt?: unknown;
}

/** An exercise in the user's list, with a cached copy of its last session. */
export interface Exercise {
  id: string;
  name: string;
  isCustom: boolean;
  /** Denormalised so prefilling the next session costs one read, not a query. */
  lastDate?: DayKey;
  lastSets?: { weightKg: number; reps: number }[];
  bestE1rmKg?: number;
  createdAt?: unknown;
}

/** One exercise on one day, stored at exercises/{id}/sessions/{YYYY-MM-DD}. */
export interface WorkoutSession {
  date: DayKey;
  sets: { weightKg: number; reps: number }[];
  bestE1rmKg: number;
  updatedAt?: unknown;
}

/**
 * One exercise slot in a routine day.
 *
 * The name is denormalised so a routine renders without reading every
 * exercise document; the id is what history hangs off, so renaming or
 * reordering a routine never touches past sessions.
 */
export interface RoutineExercise {
  exerciseId: string;
  name: string;
  /** Planned sets. The weight and reps actually done are typed in the gym. */
  sets: number;
}

/**
 * A workout day you set up once and reuse, such as "Day 1: Legs".
 *
 * The exercise list lives inside the document as an array, so the Workouts
 * tab is one query of a handful of small documents and reordering is one
 * write.
 */
export interface Routine {
  id: string;
  name: string;
  /** Position in the week's rotation. */
  order: number;
  exercises: RoutineExercise[];
  /** Last day this routine was worked, used to pick the next one due. */
  lastDoneDate?: DayKey;
  createdAt?: unknown;
  updatedAt?: unknown;
}
