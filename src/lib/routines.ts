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

/**
 * Moves one item to a new index, leaving everything else in order.
 *
 * Returns the same array when the move is a no-op, so a drag that ends where
 * it started causes no write.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;

  const target = Math.min(list.length - 1, Math.max(0, to));
  if (target === from) return list;

  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

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

/** The next order value, so a new day lands at the end of the rotation. */
export function nextOrder(routines: Routine[]): number {
  return routines.reduce((max, routine) => Math.max(max, routine.order), -1) + 1;
}

/** Renumbers from zero after a reorder, so the stored order has no gaps. */
export function renumber(routines: Routine[]): Routine[] {
  return routines.map((routine, index) => ({ ...routine, order: index }));
}
