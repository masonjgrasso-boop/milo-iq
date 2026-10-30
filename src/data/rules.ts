// Personal rules at users/{uid}/rules/{ruleId}.
//
// The rules themselves live here; whether each one was kept on a given day is
// stored on that day's log, so checking a box costs no extra document.

import {
  collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { toDayKey, todayKey } from '../lib/dates';
import type { Rule } from '../lib/types';

/**
 * Rules created before `startDate` existed only carry a server timestamp, so
 * their start day is recovered from that. Without it they would judge every
 * day in the logs, including days before the rule was written.
 */
function withStartDate(rule: Rule): Rule {
  if (rule.startDate !== undefined) return rule;
  const createdAt = rule.createdAt as { toDate?: () => Date } | undefined;
  const created = createdAt?.toDate?.();
  return created ? { ...rule, startDate: toDayKey(created) } : rule;
}

export const rulesCollection = (uid: string) => collection(getDb(), 'users', uid, 'rules');

export async function listRules(uid: string): Promise<Rule[]> {
  const snap = await getDocs(query(rulesCollection(uid), orderBy('createdAt')));
  return snap.docs.map((document) =>
    withStartDate({ ...(document.data() as Rule), id: document.id }),
  );
}

export async function createRule(uid: string, rule: Omit<Rule, 'id'>): Promise<Rule> {
  const ref = doc(rulesCollection(uid));
  // Stamped on the client so the rule counts from today in the user's own
  // timezone, which is the one their day keys are in.
  const created: Rule = { startDate: todayKey(), ...rule, id: ref.id };
  await setDoc(ref, { ...created, createdAt: serverTimestamp() });
  return created;
}

export async function updateRule(
  uid: string,
  ruleId: string,
  changes: Partial<Omit<Rule, 'id'>>,
): Promise<void> {
  await updateDoc(doc(rulesCollection(uid), ruleId), changes);
}

export async function deleteRule(uid: string, ruleId: string): Promise<void> {
  await deleteDoc(doc(rulesCollection(uid), ruleId));
}
