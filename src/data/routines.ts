// Routine days at users/{uid}/routines/{routineId}.
//
// The exercise list lives inside the document as an array, so the Workouts tab
// costs one query of a handful of small documents, and adding, removing or
// reordering exercises is a single write.
//
// Routines hold only exercise ids and names. History stays under
// users/{uid}/exercises/{id}/sessions, so editing a routine can never lose a
// past session.

import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp,
  setDoc, writeBatch,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { DayKey } from '../lib/dates';
import { nextOrder, renumber } from '../lib/routines';
import type { Routine, RoutineExercise } from '../lib/types';

export const routinesCollection = (uid: string) =>
  collection(getDb(), 'users', uid, 'routines');

export async function listRoutines(uid: string): Promise<Routine[]> {
  const snap = await getDocs(query(routinesCollection(uid), orderBy('order')));
  return snap.docs.map((document) => ({ ...(document.data() as Routine), id: document.id }));
}

export async function getRoutine(uid: string, routineId: string): Promise<Routine | null> {
  const snap = await getDoc(doc(routinesCollection(uid), routineId));
  return snap.exists() ? { ...(snap.data() as Routine), id: snap.id } : null;
}

export async function createRoutine(
  uid: string,
  name: string,
  existing: Routine[],
): Promise<Routine> {
  const ref = doc(routinesCollection(uid));
  const routine: Routine = {
    id: ref.id,
    name,
    order: nextOrder(existing),
    exercises: [],
  };
  await setDoc(ref, { ...routine, createdAt: serverTimestamp() });
  return routine;
}

/** Saves a day's name and exercise list. One write, whatever changed. */
export async function saveRoutine(
  uid: string,
  routineId: string,
  changes: { name?: string; exercises?: RoutineExercise[]; order?: number },
): Promise<void> {
  await setDoc(
    doc(routinesCollection(uid), routineId),
    { ...changes, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Stamps the day as done, which is what moves the rotation along. */
export async function markRoutineDone(
  uid: string,
  routineId: string,
  date: DayKey,
): Promise<void> {
  await setDoc(
    doc(routinesCollection(uid), routineId),
    { lastDoneDate: date, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteRoutine(uid: string, routineId: string): Promise<void> {
  await deleteDoc(doc(routinesCollection(uid), routineId));
}

/** Writes a whole reordered rotation in one batch, with no gaps left behind. */
export async function reorderRoutines(uid: string, ordered: Routine[]): Promise<Routine[]> {
  const numbered = renumber(ordered);
  const batch = writeBatch(getDb());
  for (const routine of numbered) {
    batch.set(
      doc(routinesCollection(uid), routine.id),
      { order: routine.order, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  return numbered;
}
