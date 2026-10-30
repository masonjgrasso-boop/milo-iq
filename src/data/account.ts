// Exporting and deleting everything the app holds about a user.
//
// Both of these are promises the privacy policy makes, so they have to be
// real: the export contains every collection, and the deletion leaves nothing
// behind — including the user's membership of other people's groups.

import {
  collection, deleteDoc, doc, getDoc, getDocs, writeBatch, type DocumentData,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { deleteUser, type User } from 'firebase/auth';
import { getDb, getFirebaseStorage } from '../lib/firebase';
import { toCsv } from '../lib/csv';
import { listMyGroups } from './groups';
import type { ProgressPhoto } from './photos';

/** The subcollections beneath users/{uid} that hold the user's own data. */
const USER_SUBCOLLECTIONS = [
  'days', 'weeks', 'months', 'foods', 'rules', 'exercises', 'photos', 'groups',
] as const;

export interface ExportBundle {
  exportedAt: string;
  uid: string;
  profile: DocumentData | null;
  collections: Record<string, DocumentData[]>;
  /** Sessions keyed by exercise id, since they live one level deeper. */
  workoutSessions: Record<string, DocumentData[]>;
}

async function readCollection(uid: string, name: string): Promise<DocumentData[]> {
  const snap = await getDocs(collection(getDb(), 'users', uid, name));
  return snap.docs.map((document) => ({ id: document.id, ...document.data() }));
}

/** Reads everything the app stores for this user. */
export async function exportUserData(uid: string): Promise<ExportBundle> {
  const entries = await Promise.all(
    USER_SUBCOLLECTIONS.map(async (name) => [name, await readCollection(uid, name)] as const),
  );
  const collections = Object.fromEntries(entries);

  // Workout sessions hang beneath each exercise.
  const workoutSessions: Record<string, DocumentData[]> = {};
  for (const exercise of collections.exercises ?? []) {
    const snap = await getDocs(
      collection(getDb(), 'users', uid, 'exercises', String(exercise.id), 'sessions'),
    );
    if (snap.docs.length > 0) {
      workoutSessions[String(exercise.name ?? exercise.id)] = snap.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
    }
  }

  const profile = await getDoc(doc(getDb(), 'users', uid));

  return {
    exportedAt: new Date().toISOString(),
    uid,
    profile: profile.exists() ? profile.data() : null,
    collections,
    workoutSessions,
  };
}

export function bundleToJson(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export interface CsvFile {
  name: string;
  content: string;
}

/** The day logs and workouts as spreadsheets, which is what people actually open. */
export function bundleToCsvFiles(bundle: ExportBundle): CsvFile[] {
  const files: CsvFile[] = [];

  const days = bundle.collections.days ?? [];
  files.push({
    name: 'milo-iq-days.csv',
    content: toCsv(
      ['date', 'calories', 'weight_kg', 'entries'],
      days.map((day) => [
        String(day.date ?? day.id),
        Number(day.calories ?? 0),
        day.weightKg ?? '',
        Array.isArray(day.entries)
          ? day.entries.map((entry: DocumentData) => `${entry.name} (${entry.calories})`).join('; ')
          : '',
      ]),
    ),
  });

  const sessionRows: (string | number)[][] = [];
  for (const [exerciseName, sessions] of Object.entries(bundle.workoutSessions)) {
    for (const session of sessions) {
      const sets = Array.isArray(session.sets) ? session.sets : [];
      sessionRows.push([
        String(session.date ?? session.id),
        exerciseName,
        sets.map((set: DocumentData) => `${set.weightKg}kg x ${set.reps}`).join('; '),
        Number(session.bestE1rmKg ?? 0).toFixed(1),
      ]);
    }
  }
  files.push({
    name: 'milo-iq-workouts.csv',
    content: toCsv(['date', 'exercise', 'sets', 'best_e1rm_kg'], sessionRows),
  });

  const foods = bundle.collections.foods ?? [];
  files.push({
    name: 'milo-iq-foods.csv',
    content: toCsv(
      ['name', 'serving_grams', 'calories_per_serving', 'times_used'],
      foods.map((food) => [
        String(food.name ?? ''),
        Number(food.servingGrams ?? 0),
        Number(food.caloriesPerServing ?? 0),
        Number(food.useCount ?? 0),
      ]),
    ),
  });

  return files;
}

/** Firestore batches cap at 500 writes, so deletes go in chunks. */
async function deleteAll(refs: ReturnType<typeof doc>[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(getDb());
    for (const target of refs.slice(i, i + 400)) batch.delete(target);
    await batch.commit();
  }
}

export interface DeletionProgress {
  step: string;
}

/**
 * Removes every trace of the user, then the account itself.
 *
 * Group memberships are removed first: leaving a stale member document behind
 * would keep granting the deleted user's slot read access to that group.
 */
export async function deleteAccount(
  user: User,
  onProgress?: (progress: DeletionProgress) => void,
): Promise<void> {
  const uid = user.uid;
  const db = getDb();

  onProgress?.({ step: 'Leaving groups' });
  const memberships = await listMyGroups(uid);
  for (const membership of memberships) {
    await deleteDoc(
      doc(db, 'groups', membership.groupId, 'members', uid, 'shared', 'summary'),
    ).catch(() => undefined);
    await deleteDoc(doc(db, 'groups', membership.groupId, 'members', uid)).catch(
      () => undefined,
    );
  }

  onProgress?.({ step: 'Deleting photos' });
  const photoDocs = await readCollection(uid, 'photos');
  const storage = getFirebaseStorage();
  for (const photo of photoDocs as unknown as ProgressPhoto[]) {
    for (const path of [photo.fullPath, photo.thumbPath]) {
      if (path) await deleteObject(ref(storage, path)).catch(() => undefined);
    }
  }

  onProgress?.({ step: 'Deleting your logs' });
  for (const name of USER_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));

    // Exercises own a sessions subcollection, which must go first.
    if (name === 'exercises') {
      for (const exercise of snap.docs) {
        const sessions = await getDocs(
          collection(db, 'users', uid, 'exercises', exercise.id, 'sessions'),
        );
        await deleteAll(sessions.docs.map((document) => document.ref));
      }
    }

    await deleteAll(snap.docs.map((document) => document.ref));
  }

  onProgress?.({ step: 'Deleting your profile' });
  await deleteDoc(doc(db, 'users', uid));

  onProgress?.({ step: 'Closing your account' });
  await deleteUser(user);
}
