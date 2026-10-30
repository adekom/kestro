// Points the Admin SDK at the Emulator Suite. Tests must run under
// `firebase emulators:exec` (see `npm run test:emulator`).
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "demo-kestro";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "demo-kestro.appspot.com";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
process.env.KESTRO_BOOTSTRAP_SECRET ??= "test-bootstrap-secret-0123456789";
