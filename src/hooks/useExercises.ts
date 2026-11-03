// The exercise library, seeded on first use so there is always something to
// pick. Shared by the routine editor, the workout runner and the exercise
// list, which all need the same list and the same first-run behaviour.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { createExercise, listExercises, seedStarterExercises } from '../data/workouts';
import type { Exercise } from '../lib/types';

const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name);

export function useExercises() {
  const { user } = useAuth();
  const uid = user?.uid;

  const [exercises, setExercises] = useState<Exercise[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    listExercises(uid).then(async (found) => {
      // First visit: lay down the starter list so there is something to tap.
      const list = found.length === 0 ? await seedStarterExercises(uid) : found;
      if (!cancelled) setExercises([...list].sort(byName));
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  /** Adds a custom exercise and folds it into the loaded list. */
  const addExercise = useCallback(
    async (name: string): Promise<Exercise | null> => {
      if (!uid) return null;
      const created = await createExercise(uid, name.trim());
      setExercises((current) => [...(current ?? []), created].sort(byName));
      return created;
    },
    [uid],
  );

  return { exercises, setExercises, addExercise, loading: exercises === null };
}
