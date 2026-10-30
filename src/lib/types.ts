// Shared data shapes. Everything is stored in metric internally and converted
// only for display, so the math never has to care which units the user picked.

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
