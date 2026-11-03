// Doing a workout: what counts as a logged set, and what to say at the end.
//
// Weight is never prefilled and never guessed. Lifters change the load every
// session, and a prefilled number that nobody corrected is worse than no
// number at all — it quietly poisons the progress graph. So a set cannot be
// logged without a weight the user typed.
//
// Reps are different: the plan already says how many, so the planned figure
// is shown as a hint and the user types what they actually managed.

import { bestSetE1rm, estimateOneRepMax, type WorkoutSet } from './strength';

/**
 * Whether a set is complete enough to log.
 *
 * Zero is a legitimate weight — bodyweight pull-ups, for instance — but blank
 * is not, which is why this takes the parsed value rather than a string and
 * treats null as "not entered".
 */
export function canLogSet(weightKg: number | null, reps: number | null): boolean {
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg < 0) return false;
  if (reps === null || !Number.isFinite(reps) || reps < 1) return false;
  return true;
}

/**
 * Whether a set beats everything before it.
 *
 * A margin keeps rounding noise from awarding a best: 0.1 kg is well below
 * the smallest plate anybody owns.
 */
export const BEST_MARGIN_KG = 0.1;

export function isNewBest(
  weightKg: number,
  reps: number,
  previousBestKg: number,
): boolean {
  if (!canLogSet(weightKg, reps)) return false;
  return estimateOneRepMax(weightKg, reps) > previousBestKg + BEST_MARGIN_KG;
}

export interface WorkoutExerciseLog {
  exerciseId: string;
  name: string;
  sets: WorkoutSet[];
  /** Best estimated 1RM before this workout started. */
  previousBestKg: number;
}

export interface NewBest {
  name: string;
  e1rmKg: number;
  previousKg: number;
}

export interface WorkoutSummary {
  setsDone: number;
  exercisesDone: number;
  totalVolumeKg: number;
  newBests: NewBest[];
}

/**
 * What to show on the finish screen.
 *
 * Counts only exercises that actually have sets, so swapping something in and
 * then skipping it does not pad the total.
 */
export function summarizeWorkout(logs: WorkoutExerciseLog[]): WorkoutSummary {
  const worked = logs.filter((log) => log.sets.length > 0);

  const newBests: NewBest[] = [];
  for (const log of worked) {
    const best = bestSetE1rm(log.sets);
    if (best > log.previousBestKg + BEST_MARGIN_KG) {
      newBests.push({ name: log.name, e1rmKg: best, previousKg: log.previousBestKg });
    }
  }

  return {
    setsDone: worked.reduce((sum, log) => sum + log.sets.length, 0),
    exercisesDone: worked.length,
    totalVolumeKg: worked.reduce(
      (sum, log) => sum + log.sets.reduce((v, set) => v + set.weightKg * set.reps, 0),
      0,
    ),
    // Biggest jump first: that is the one worth reading.
    newBests: newBests.sort((a, b) => b.e1rmKg - b.previousKg - (a.e1rmKg - a.previousKg)),
  };
}
