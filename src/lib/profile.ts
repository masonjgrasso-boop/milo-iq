// Reading and writing the user's profile document at users/{uid}.

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import type { UserProfile } from './types';

export const profileRef = (uid: string) => doc(getDb(), 'users', uid);

export async function loadProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(profileRef(uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

/** Creates or updates the profile, stamping updatedAt on every write. */
export async function saveProfile(
  uid: string,
  profile: Omit<UserProfile, 'createdAt' | 'updatedAt'>,
  isNew = false,
): Promise<void> {
  await setDoc(
    profileRef(uid),
    {
      ...profile,
      ...(isNew ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
