// Personal rules at users/{uid}/rules/{ruleId}.
//
// The rules themselves live here; whether each one was kept on a given day is
// stored on that day's log, so checking a box costs no extra document.

import {
  collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { Rule } from '../lib/types';

export const rulesCollection = (uid: string) => collection(getDb(), 'users', uid, 'rules');

export async function listRules(uid: string): Promise<Rule[]> {
  const snap = await getDocs(query(rulesCollection(uid), orderBy('createdAt')));
  return snap.docs.map((document) => ({ ...(document.data() as Rule), id: document.id }));
}

export async function createRule(uid: string, rule: Omit<Rule, 'id'>): Promise<Rule> {
  const ref = doc(rulesCollection(uid));
  const created: Rule = { ...rule, id: ref.id };
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
