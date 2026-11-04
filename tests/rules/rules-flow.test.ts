// Rules against the emulator and the real security rules.
//
// The point being proved here is the promise made in the UI: editing or
// deleting a rule never erases what you already ticked. Check-offs live on
// each day's own document, so there is nothing for a rule's deletion to take
// with it — but that is worth asserting rather than asserting by comment.

import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, writeBatch,
  type Firestore,
} from 'firebase/firestore';

const UID = 'ruler';
const MONDAY = '2026-03-02';
const TUESDAY = '2026-03-03';

let testEnv: RulesTestEnvironment;
const asUser = () => testEnv.authenticatedContext(UID).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'milo-iq-rules-flow',
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

const rules = (db: Firestore) => collection(db, 'users', UID, 'rules');
const days = (db: Firestore) => collection(db, 'users', UID, 'days');

describe('keeping and checking off rules', () => {
  it('runs the whole flow through', async () => {
    const db = asUser();

    // --- Create two rules. -------------------------------------------------
    const stepsRef = doc(rules(db));
    const drinkRef = doc(rules(db));
    await setDoc(stepsRef, {
      id: stepsRef.id, name: '10k steps', type: 'numeric', target: 10_000,
      unit: 'steps', daysOfWeek: [], active: true, startDate: MONDAY, order: 0,
      // listRules orders by this, and Firestore skips documents without it.
      createdAt: new Date('2026-03-02T09:00:00Z'),
    });
    await setDoc(drinkRef, {
      id: drinkRef.id, name: 'No weekday drinking', type: 'boolean', target: 0,
      daysOfWeek: [0, 1, 2, 3, 4], active: true, startDate: MONDAY, order: 1,
      createdAt: new Date('2026-03-02T09:05:00Z'),
    });

    // --- The tab lists them, and keeps a listener on the same collection. --
    const listed = await getDocs(query(rules(db), orderBy('createdAt')));
    expect(listed.docs).toHaveLength(2);

    // --- Tick both off for Monday, on the day's own document. --------------
    await setDoc(
      doc(days(db), MONDAY),
      { date: MONDAY, calories: 0, entries: [], rules: { [stepsRef.id]: 11_200, [drinkRef.id]: true } },
      { merge: true },
    );

    const monday = await getDoc(doc(days(db), MONDAY));
    expect(monday.data()?.rules[stepsRef.id]).toBe(11_200);

    // --- Tuesday starts blank with no clearing step. -----------------------
    const tuesday = await getDoc(doc(days(db), TUESDAY));
    expect(tuesday.exists()).toBe(false);

    // --- Reordering is one batch over the rule documents only. ------------
    const reorder = writeBatch(db);
    reorder.set(doc(rules(db), drinkRef.id), { order: 0 }, { merge: true });
    reorder.set(doc(rules(db), stepsRef.id), { order: 1 }, { merge: true });
    await reorder.commit();
    expect((await getDoc(doc(rules(db), drinkRef.id))).data()?.order).toBe(0);
    // Monday's check-offs are untouched by a reorder.
    expect((await getDoc(doc(days(db), MONDAY))).data()?.rules[drinkRef.id]).toBe(true);

    // --- Editing a rule changes the rule, not the history. ----------------
    await setDoc(doc(rules(db), stepsRef.id), { target: 12_000 }, { merge: true });
    expect((await getDoc(doc(days(db), MONDAY))).data()?.rules[stepsRef.id]).toBe(11_200);

    // --- Deleting a rule leaves every day it was ticked on exactly as is. -
    await deleteDoc(doc(rules(db), stepsRef.id));
    expect((await getDoc(doc(rules(db), stepsRef.id))).exists()).toBe(false);

    const afterDelete = await getDoc(doc(days(db), MONDAY));
    expect(afterDelete.data()?.rules[stepsRef.id]).toBe(11_200);
    expect(afterDelete.data()?.rules[drinkRef.id]).toBe(true);
  });
});
