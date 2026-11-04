// Workout days you set up once and reuse.
//
// The point of a routine is that deciding what to do is done in advance, so
// the gym itself is just entering numbers. Everything here is about keeping
// that list in the order the user put it in, and working out which day they
// are due for next.

import type { Routine, RoutineExercise } from './types';

/** Sets for a newly added exercise — a common starting block. */
export const DEFAULT_SETS = 3;

/**
 * Set counts are typed by hand, so they need a bound.
 *
 * Reps are deliberately not part of a routine. Planning them encourages
 * logging the plan rather than the session, and the only reps worth keeping
 * are the ones actually done — so they are typed in the gym, nowhere else.
 */
export const MAX_SETS = 12;

export const clampSets = (value: number): number =>
  Math.min(MAX_SETS, Math.max(1, Math.round(value) || 1));

/** Routine days in the order the user arranged them. */
export function sortRoutines(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * The day the user is due for next.
 *
 * Whatever they did most recently, the next one in the rotation comes round
 * after it. A day that has never been done wins outright, because the point
 * of writing a routine down is to get through it.
 */
export function nextDueRoutine(routines: Routine[]): Routine | null {
  const ordered = sortRoutines(routines);
  if (ordered.length === 0) return null;

  const neverDone = ordered.find((routine) => !routine.lastDoneDate);
  if (neverDone) return neverDone;

  // All done at least once: step past the most recent one, wrapping around.
  let latestIndex = 0;
  ordered.forEach((routine, index) => {
    const best = ordered[latestIndex].lastDoneDate ?? '';
    if ((routine.lastDoneDate ?? '') > best) latestIndex = index;
  });

  return ordered[(latestIndex + 1) % ordered.length];
}

/** Total planned sets across a day, for the "6 exercises · 20 sets" line. */
export function plannedSetCount(exercises: RoutineExercise[]): number {
  return exercises.reduce((sum, exercise) => sum + clampSets(exercise.sets), 0);
}
