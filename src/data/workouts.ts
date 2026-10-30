// Exercises and workout sessions.
//
//   users/{uid}/exercises/{exerciseId}
//   users/{uid}/exercises/{exerciseId}/sessions/{YYYY-MM-DD}
//
// Sessions hang beneath their exercise and are keyed by date, so the progress
// graph is one ordered collection read with no composite index, and logging
// the same lift twice in a day merges rather than duplicating.
//
// Each exercise also caches its last session, so prefilling the next one is a
// single document read instead of a query.

import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp,
  setDoc, writeBatch,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { bestSetE1rm, STARTER_EXERCISES, type WorkoutSet } from '../lib/strength';
import type { DayKey } from '../lib/dates';
import type { Exercise, WorkoutSession } from '../lib/types';

export const exercisesCollection = (uid: string) =>
  collection(getDb(), 'users', uid, 'exercises');

export const sessionsCollection = (uid: string, exerciseId: string) =>
  collection(exercisesCollection(uid), exerciseId, 'sessions');

export async function listExercises(uid: string): Promise<Exercise[]> {
  const snap = await getDocs(query(exercisesCollection(uid), orderBy('name')));
  return snap.docs.map((document) => ({ ...(document.data() as Exercise), id: document.id }));
}

export async function getExercise(uid: string, exerciseId: string): Promise<Exercise | null> {
  const snap = await getDoc(doc(exercisesCollection(uid), exerciseId));
  return snap.exists() ? { ...(snap.data() as Exercise), id: snap.id } : null;
}

export async function createExercise(
  uid: string,
  name: string,
  isCustom = true,
): Promise<Exercise> {
  const ref = doc(exercisesCollection(uid));
  const exercise: Exercise = { id: ref.id, name, isCustom };
  await setDoc(ref, { ...exercise, createdAt: serverTimestamp() });
  return exercise;
}

/**
 * Seeds the starter list on first use, in one batch rather than 22 writes.
 * Returns the created exercises so the caller need not re-read them.
 */
export async function seedStarterExercises(uid: string): Promise<Exercise[]> {
  const batch = writeBatch(getDb());
  const created: Exercise[] = [];

  for (const name of STARTER_EXERCISES) {
    const ref = doc(exercisesCollection(uid));
    const exercise: Exercise = { id: ref.id, name, isCustom: false };
    batch.set(ref, { ...exercise, createdAt: serverTimestamp() });
    created.push(exercise);
  }

  await batch.commit();
  return created;
}

export async function listSessions(
  uid: string,
  exerciseId: string,
): Promise<WorkoutSession[]> {
  const snap = await getDocs(query(sessionsCollection(uid, exerciseId), orderBy('date')));
  return snap.docs.map((document) => document.data() as WorkoutSession);
}

export async function getSession(
  uid: string,
  exerciseId: string,
  date: DayKey,
): Promise<WorkoutSession | null> {
  const snap = await getDoc(doc(sessionsCollection(uid, exerciseId), date));
  return snap.exists() ? (snap.data() as WorkoutSession) : null;
}

/** Saves a session and refreshes the exercise's cached "last session". */
export async function saveSession(
  uid: string,
  exercise: Exercise,
  date: DayKey,
  sets: WorkoutSet[],
): Promise<WorkoutSession> {
  const bestE1rmKg = bestSetE1rm(sets);
  const session: WorkoutSession = { date, sets, bestE1rmKg };

  const batch = writeBatch(getDb());
  batch.set(doc(sessionsCollection(uid, exercise.id), date), {
    ...session,
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(exercisesCollection(uid), exercise.id),
    {
      lastDate: date,
      lastSets: sets,
      bestE1rmKg: Math.max(bestE1rmKg, exercise.bestE1rmKg ?? 0),
    },
    { merge: true },
  );
  await batch.commit();

  return session;
}

export async function deleteSession(
  uid: string,
  exerciseId: string,
  date: DayKey,
): Promise<void> {
  await deleteDoc(doc(sessionsCollection(uid, exerciseId), date));
}
