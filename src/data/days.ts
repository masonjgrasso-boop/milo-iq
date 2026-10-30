// Reading and writing day logs at users/{uid}/days/{YYYY-MM-DD}.

import {
  collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { DayKey } from '../lib/dates';
import type { DayLog } from '../lib/types';

export const daysCollection = (uid: string) => collection(getDb(), 'users', uid, 'days');
export const dayRef = (uid: string, date: DayKey) => doc(daysCollection(uid), date);

/** An untouched day, so callers never have to handle "not logged yet" twice. */
export const emptyDay = (date: DayKey): DayLog => ({ date, calories: 0, entries: [] });

export async function getDay(uid: string, date: DayKey): Promise<DayLog> {
  const snap = await getDoc(dayRef(uid, date));
  return snap.exists() ? (snap.data() as DayLog) : emptyDay(date);
}

/**
 * Every logged day in a date range, oldest first. Days with no document are
 * simply absent — callers fill gaps themselves so an empty day is explicit.
 */
export async function listDays(uid: string, from: DayKey, to: DayKey): Promise<DayLog[]> {
  const snap = await getDocs(
    query(daysCollection(uid), where('date', '>=', from), where('date', '<=', to), orderBy('date')),
  );
  return snap.docs.map((document) => document.data() as DayLog);
}

export async function saveDay(uid: string, day: DayLog): Promise<void> {
  await setDoc(dayRef(uid, day.date), { ...day, updatedAt: serverTimestamp() }, { merge: true });
}
