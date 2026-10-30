// Firebase setup. Everything initializes lazily so the app can show a helpful
// setup screen instead of a stack trace when .env.local is missing.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

function getApp(): FirebaseApp {
  if (!app) app = initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getApp());
}

/**
 * Firestore with a persistent on-device cache. This is the single biggest
 * lever on cost: repeat views of data already fetched cost zero reads.
 */
export function getDb(): Firestore {
  if (!db) {
    db = initializeFirestore(getApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getApp());
}
