import "server-only";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  // On App Hosting, credentials come from the runtime service account (ADC).
  // Locally, the *_EMULATOR_HOST variables route the Admin SDK to the emulators.
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Next.js bundles server code per route, but firebase-admin is shared across
// bundles, so the configured instance must be cached process-wide.
const cache = globalThis as typeof globalThis & { __kestroFirestore?: Firestore };

export function db(): Firestore {
  if (!cache.__kestroFirestore) {
    const firestore = getFirestore(app());
    firestore.settings({ ignoreUndefinedProperties: true });
    cache.__kestroFirestore = firestore;
  }
  return cache.__kestroFirestore;
}

export const adminAuth = () => getAuth(app());
export const bucket = () => getStorage(app()).bucket();
