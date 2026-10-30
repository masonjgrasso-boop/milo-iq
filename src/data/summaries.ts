// Precomputed week and month roll-ups at users/{uid}/weeks and /months.
//
// These are written whenever a day changes, so reading a dashboard costs one
// small document instead of a month of raw logs.

import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import {
  endOfMonth, endOfWeek, startOfMonth, startOfWeek, toMonthKey, toWeekKey, type DayKey,
} from '../lib/dates';
import { summarizeDays } from '../lib/summaries';
import type { PeriodSummary } from '../lib/types';
import { listDays } from './days';

export const weeksCollection = (uid: string) => collection(getDb(), 'users', uid, 'weeks');
export const monthsCollection = (uid: string) => collection(getDb(), 'users', uid, 'months');

export async function getWeekSummary(uid: string, weekKey: string): Promise<PeriodSummary | null> {
  const snap = await getDoc(doc(weeksCollection(uid), weekKey));
  return snap.exists() ? (snap.data() as PeriodSummary) : null;
}

export async function getMonthSummary(uid: string, monthKey: string): Promise<PeriodSummary | null> {
  const snap = await getDoc(doc(monthsCollection(uid), monthKey));
  return snap.exists() ? (snap.data() as PeriodSummary) : null;
}

/**
 * Recomputes and stores the week and month summaries containing `date`.
 *
 * The day reads this needs are almost always served from the local cache,
 * since the user has just been looking at that same week.
 */
export async function refreshSummaries(
  uid: string,
  date: DayKey,
  targetCalories: number,
): Promise<{ week: PeriodSummary; month: PeriodSummary }> {
  const weekKey = toWeekKey(date);
  const monthKey = toMonthKey(date);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);

  // A week can straddle two months, so read whichever span covers both.
  const from = weekStart < monthStart ? weekStart : monthStart;
  const to = weekEnd > monthEnd ? weekEnd : monthEnd;
  const days = await listDays(uid, from, to);

  const week = summarizeDays(days, {
    key: weekKey, start: weekStart, end: weekEnd, targetCalories,
  });
  const month = summarizeDays(days, {
    key: monthKey, start: monthStart, end: monthEnd, targetCalories,
  });

  await Promise.all([
    setDoc(doc(weeksCollection(uid), weekKey), { ...week, updatedAt: serverTimestamp() }),
    setDoc(doc(monthsCollection(uid), monthKey), { ...month, updatedAt: serverTimestamp() }),
  ]);

  return { week, month };
}
