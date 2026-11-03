// The whole workout flow, against the emulator and the real rules.
//
// The unit tests cover the arithmetic and the component tests cover the
// screen, but neither touches Firestore. This walks the exact sequence the app
// performs — create a day, add exercises with set counts, start it, log sets,
// finish — through the same paths, the same queries and the same rules that
// are deployed, so a missing rule or a query the engine rejects shows up here
// rather than as a spinner that never stops.

import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, orderBy, query, setDoc, writeBatch,
  type Firestore,
} from 'firebase/firestore';

const UID = 'lifter';
const DATE = '2026-11-02';

let testEnv: RulesTestEnvironment;
const asUser = () => testEnv.authenticatedContext(UID).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'milo-iq-workout-flow',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// The same collection helpers the data layer uses, against the test database.
const routines = (db: Firestore) => collection(db, 'users', UID, 'routines');
const exercises = (db: Firestore) => collection(db, 'users', UID, 'exercises');
const sessions = (db: Firestore, exerciseId: string) =>
  collection(exercises(db), exerciseId, 'sessions');

describe('setting up and doing a workout', () => {
  it('runs the whole flow through', async () => {
    const db = asUser();

    // --- The exercise library is seeded on first use, in one batch. ---------
    const seed = writeBatch(db);
    const squatRef = doc(exercises(db));
    const rdlRef = doc(exercises(db));
    seed.set(squatRef, { id: squatRef.id, name: 'Back squat', isCustom: false });
    seed.set(rdlRef, { id: rdlRef.id, name: 'Romanian deadlift', isCustom: false });
    await seed.commit();

    const library = await getDocs(query(exercises(db), orderBy('name')));
    expect(library.docs).toHaveLength(2);

    // --- Create a workout day. ---------------------------------------------
    const dayRef = doc(routines(db));
    await setDoc(dayRef, { id: dayRef.id, name: 'Legs', order: 0, exercises: [] });

    // --- Add exercises with set counts, and nothing else. ------------------
    const planned = [
      { exerciseId: squatRef.id, name: 'Back squat', sets: 3 },
      { exerciseId: rdlRef.id, name: 'Romanian deadlift', sets: 2 },
    ];
    await setDoc(dayRef, { exercises: planned }, { merge: true });

    // --- The Workouts tab reads the days in order. -------------------------
    const listed = await getDocs(query(routines(db), orderBy('order')));
    expect(listed.docs).toHaveLength(1);
    expect(listed.docs[0].data().exercises).toEqual(planned);
    // Reps are deliberately absent from the plan.
    for (const slot of listed.docs[0].data().exercises) {
      expect(slot.plannedReps).toBeUndefined();
    }

    // --- Starting the workout reads the day, then today's sets per exercise.
    const day = await getDoc(dayRef);
    expect(day.exists()).toBe(true);
    const existing = await Promise.all(
      planned.map((slot) => getDoc(doc(sessions(db, slot.exerciseId), DATE))),
    );
    expect(existing.every((snap) => !snap.exists())).toBe(true);

    // --- Ticking a set writes the session and refreshes the cache. ---------
    const sets = [{ weightKg: 100, reps: 8 }];
    const log = writeBatch(db);
    log.set(doc(sessions(db, squatRef.id), DATE), { date: DATE, sets, bestE1rmKg: 126.7 });
    log.set(
      doc(exercises(db), squatRef.id),
      { lastDate: DATE, lastSets: sets, bestE1rmKg: 126.7 },
      { merge: true },
    );
    await log.commit();

    // --- Reopening mid workout finds the set that is done. -----------------
    const saved = await getDoc(doc(sessions(db, squatRef.id), DATE));
    expect(saved.exists()).toBe(true);
    expect(saved.data()?.sets).toEqual(sets);

    // The cached last session is what the "Last time" line reads.
    const cached = await getDoc(doc(exercises(db), squatRef.id));
    expect(cached.data()?.lastSets).toEqual(sets);

    // --- The progress graph reads every session for one exercise. ----------
    const history = await getDocs(query(sessions(db, squatRef.id), orderBy('date')));
    expect(history.docs).toHaveLength(1);

    // --- Finishing stamps the day, which moves the rotation along. ---------
    await setDoc(dayRef, { lastDoneDate: DATE }, { merge: true });
    const finished = await getDoc(dayRef);
    expect(finished.data()?.lastDoneDate).toBe(DATE);
  });

  it('keeps a session when its exercise is dropped from the routine', async () => {
    const db = asUser();

    const squatRef = doc(exercises(db));
    await setDoc(squatRef, { id: squatRef.id, name: 'Back squat', isCustom: false });

    const dayRef = doc(routines(db));
    await setDoc(dayRef, {
      id: dayRef.id,
      name: 'Legs',
      order: 0,
      exercises: [{ exerciseId: squatRef.id, name: 'Back squat', sets: 3 }],
    });

    await setDoc(doc(sessions(db, squatRef.id), DATE), {
      date: DATE,
      sets: [{ weightKg: 100, reps: 8 }],
      bestE1rmKg: 126.7,
    });

    // Editing the plan to remove the exercise must not touch its history.
    await setDoc(dayRef, { exercises: [] }, { merge: true });

    const still = await getDoc(doc(sessions(db, squatRef.id), DATE));
    expect(still.exists()).toBe(true);
    expect(still.data()?.sets).toEqual([{ weightKg: 100, reps: 8 }]);
  });
});
