// The user's personal food list at users/{uid}/foods/{foodId}.
//
// Sorted by how often each food is used, so the things you eat every day rise
// to the top and stay one tap away.

import {
  collection, deleteDoc, doc, getDocs, increment, limit, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import type { SavedFood } from '../lib/types';

export const foodsCollection = (uid: string) => collection(getDb(), 'users', uid, 'foods');

export async function listFoods(uid: string, max = 100): Promise<SavedFood[]> {
  const snap = await getDocs(
    query(foodsCollection(uid), orderBy('useCount', 'desc'), limit(max)),
  );
  return snap.docs.map((document) => ({ ...(document.data() as SavedFood), id: document.id }));
}

export async function saveFood(
  uid: string,
  food: Pick<SavedFood, 'name' | 'servingGrams' | 'caloriesPerServing'>,
): Promise<SavedFood> {
  const ref = doc(foodsCollection(uid));
  const saved: SavedFood = { ...food, id: ref.id, useCount: 1 };
  await setDoc(ref, { ...saved, createdAt: serverTimestamp(), lastUsedAt: serverTimestamp() });
  return saved;
}

/** Bumps the use count so the list keeps ordering itself. */
export async function touchFood(uid: string, foodId: string): Promise<void> {
  await updateDoc(doc(foodsCollection(uid), foodId), {
    useCount: increment(1),
    lastUsedAt: serverTimestamp(),
  });
}

export async function deleteFood(uid: string, foodId: string): Promise<void> {
  await deleteDoc(doc(foodsCollection(uid), foodId));
}
