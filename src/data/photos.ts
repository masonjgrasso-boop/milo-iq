// Progress photos.
//
//   Storage:   users/{uid}/photos/{weekKey}/full.jpg  and  thumb.jpg
//   Firestore: users/{uid}/photos/{weekKey}
//
// The week key doubles as the document id, which is what enforces the
// one-photo-per-week rule: a second upload in the same week replaces the
// first rather than accumulating.

import {
  collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getDb, getFirebaseStorage } from '../lib/firebase';
import { preparePhoto } from '../lib/images';
import { toWeekKey, type DayKey, type WeekKey } from '../lib/dates';

export interface ProgressPhoto {
  week: WeekKey;
  date: DayKey;
  fullPath: string;
  thumbPath: string;
  fullUrl: string;
  thumbUrl: string;
  bytes: number;
  createdAt?: unknown;
}

export const photosCollection = (uid: string) => collection(getDb(), 'users', uid, 'photos');

const storagePaths = (uid: string, week: WeekKey) => ({
  full: `users/${uid}/photos/${week}/full.jpg`,
  thumb: `users/${uid}/photos/${week}/thumb.jpg`,
});

/** Most recent first, newest weeks at the top of the timeline. */
export async function listPhotos(uid: string, max = 60): Promise<ProgressPhoto[]> {
  const snap = await getDocs(query(photosCollection(uid), orderBy('week', 'desc'), limit(max)));
  return snap.docs.map((document) => document.data() as ProgressPhoto);
}

/**
 * Compresses and uploads a photo for the week containing `date`.
 *
 * Replacing an existing week overwrites the same storage paths, so nothing is
 * orphaned and storage use stays flat.
 */
export async function uploadPhoto(
  uid: string,
  date: DayKey,
  file: File,
): Promise<ProgressPhoto> {
  const week = toWeekKey(date);
  const paths = storagePaths(uid, week);
  const storage = getFirebaseStorage();

  const { full, thumb, fullBytes, thumbBytes } = await preparePhoto(file);

  const metadata = { contentType: 'image/jpeg', cacheControl: 'private, max-age=31536000' };
  const [fullSnap, thumbSnap] = await Promise.all([
    uploadBytes(ref(storage, paths.full), full, metadata),
    uploadBytes(ref(storage, paths.thumb), thumb, metadata),
  ]);

  const [fullUrl, thumbUrl] = await Promise.all([
    getDownloadURL(fullSnap.ref),
    getDownloadURL(thumbSnap.ref),
  ]);

  const photo: ProgressPhoto = {
    week,
    date,
    fullPath: paths.full,
    thumbPath: paths.thumb,
    fullUrl,
    thumbUrl,
    bytes: fullBytes + thumbBytes,
  };

  await setDoc(doc(photosCollection(uid), week), { ...photo, createdAt: serverTimestamp() });
  return photo;
}

export async function deletePhoto(uid: string, week: WeekKey): Promise<void> {
  const paths = storagePaths(uid, week);
  const storage = getFirebaseStorage();

  // Remove the files first; if one is already gone that is not an error worth
  // blocking the delete over.
  await Promise.all(
    [paths.full, paths.thumb].map((path) =>
      deleteObject(ref(storage, path)).catch(() => undefined),
    ),
  );
  await deleteDoc(doc(photosCollection(uid), week));
}
