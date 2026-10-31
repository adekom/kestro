// Points the Admin SDK at the test emulators started by `npm run test:emulator`
// (firebase.test.json). They use a separate project ID and ports from the development
// emulators, so tests never touch — or wipe — local development data.
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-kestro-test";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "demo-kestro-test.appspot.com";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9109";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9299";
process.env.KESTRO_BOOTSTRAP_SECRET = "test-bootstrap-secret-0123456789";
