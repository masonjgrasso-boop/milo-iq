// Reading and writing the user's profile document at users/{uid}.

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import { toDayKey, type DayKey } from './dates';
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

/**
 * The day this profile was created, when that can be recovered.
 *
 * Used to date the goal someone is leaving the first time they change one, so
 * their existing logs stay attached to what they were actually doing.
 * Firestore hands `createdAt` back as a Timestamp, but a profile written
 * before this mattered may not have one at all — hence the null, and hence
 * the caller choosing its own fallback.
 */
export function profileStartDate(profile: UserProfile): DayKey | null {
  const createdAt = profile.createdAt as { toDate?: () => Date } | undefined;
  const created = createdAt?.toDate?.();
  return created ? toDayKey(created) : null;
}
