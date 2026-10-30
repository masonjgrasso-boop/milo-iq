// Estimated one-rep max.
//
// Plotting the weight on the bar alone hides progress: three more reps at the
// same weight is real improvement but draws a flat line, which is exactly the
// graph that makes people quit. The Epley estimate folds weight and reps into
// one number, so more weight *or* more reps both move the line up.
//
//   e1RM = weight x (1 + reps / 30)

import type { DayKey } from './dates';

export interface WorkoutSet {
  /** Always kilograms. Display converts. */
  weightKg: number;
  reps: number;
}

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || weightKg < 0) {
    throw new RangeError('Weight must be zero or more');
  }
  if (!Number.isFinite(reps) || reps < 1) {
    throw new RangeError('Reps must be at least 1');
  }
  return weightKg * (1 + reps / 30);
}

/** The same calculation for live input, returning null rather than throwing. */
export function tryEstimateOneRepMax(weightKg: number, reps: number): number | null {
  try {
    return estimateOneRepMax(weightKg, reps);
  } catch {
    return null;
  }
}

/**
 * The best estimate across a session's sets.
 *
 * A session is judged by its best effort, so adding easy back-off sets after
 * a heavy top set never drags the line down.
 */
export function bestSetE1rm(sets: WorkoutSet[]): number {
  const valid = sets.filter((set) => set.reps >= 1 && Number.isFinite(set.weightKg));
  if (valid.length === 0) return 0;
  return Math.max(...valid.map((set) => estimateOneRepMax(set.weightKg, set.reps)));
}

export interface SessionPoint {
  date: DayKey;
  e1rmKg: number;
}

/** One point per session, oldest first, for the progress graph. */
export function sessionBests(
  sessions: { date: DayKey; sets: WorkoutSet[] }[],
): SessionPoint[] {
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => ({ date: session.date, e1rmKg: bestSetE1rm(session.sets) }))
    .filter((point) => point.e1rmKg > 0);
}

/** Total weight moved in a session, the other number lifters care about. */
export function sessionVolume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0);
}

/** The starter list, so a new user can log their first session immediately. */
export const STARTER_EXERCISES = [
  'Back squat',
  'Front squat',
  'Bench press',
  'Incline bench press',
  'Deadlift',
  'Romanian deadlift',
  'Overhead press',
  'Barbell row',
  'Pull-up',
  'Lat pulldown',
  'Seated cable row',
  'Leg press',
  'Leg curl',
  'Leg extension',
  'Hip thrust',
  'Lunge',
  'Calf raise',
  'Dumbbell curl',
  'Tricep pushdown',
  'Lateral raise',
  'Chest fly',
  'Face pull',
] as const;
