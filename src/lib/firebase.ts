// Firebase setup. Everything initializes lazily so the app can show a helpful
// setup screen instead of a stack trace when .env.local is missing.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import { planAppCheck } from './appcheck';
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
let appCheckStarted = false;

/**
 * Start App Check, if a reCAPTCHA Enterprise site key is configured.
 *
 * This runs inside getApp, immediately after initializeApp and before any
 * service can make a request. That ordering matters: the SDK attaches tokens
 * to requests made after App Check is initialized, so starting it late would
 * send the first few requests unattested - which reads as unverified traffic
 * in monitoring mode and fails outright once enforcement is on.
 *
 * Any failure here is swallowed deliberately. A broken or missing site key
 * must not take the whole app down; it degrades to unattested requests, which
 * is visible in the App Check metrics and is the problem to fix there.
 */
function startAppCheck(instance: FirebaseApp): void {
  if (appCheckStarted) return;
  appCheckStarted = true;

  const plan = planAppCheck({
    siteKey: import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY,
    hostname: window.location.hostname,
  });
  if (plan.mode === 'off') return;

  if (plan.mode === 'debug') {
    // Makes the SDK print a debug token to the console on first load. Register
    // that token once under App Check > Apps > Manage debug tokens, and this
    // machine keeps working after enforcement is turned on.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }

  try {
    initializeAppCheck(instance, {
      provider: new ReCaptchaEnterpriseProvider(plan.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('App Check did not start; requests will be unattested.', error);
  }
}

function getApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(config);
    startAppCheck(app);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getApp());
}

/**
 * Firestore with a persistent on-device cache. This is the single biggest
 * lever on cost: repeat views of data already fetched cost zero reads.
 */
/**
 * Points every data module at a different Firestore.
 *
 * The one seam in this file that production never uses. The emulator flow
 * tests exist to prove that the real functions in src/data work against the
 * real rules; without this they would have to re-implement the same writes by
 * hand, which proves only that the test agrees with itself. Called with
 * undefined to put it back.
 */
export function setDbForTests(instance: Firestore | undefined): void {
  db = instance;
}

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
