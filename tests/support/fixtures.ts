import { adminAuth } from "@/server/firebaseAdmin";
import { usersCol } from "@/server/paths";
import type { AppUser, Role } from "@/lib/types";

const PROJECT = "demo-kestro";

/** Wipes all emulator data between tests. */
export async function resetEmulators(): Promise<void> {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

export async function allowlist(email: string, role: Role, enabled = true): Promise<void> {
  const user: AppUser = {
    email,
    role,
    enabled,
    uid: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSignInAt: null,
  };
  await usersCol().doc(email).set(user);
}

/** Signs a user in against the Auth emulator and returns a fresh ID token. */
export async function idTokenFor(email: string): Promise<string> {
  const auth = adminAuth();
  const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email, emailVerified: true }));
  const customToken = await auth.createCustomToken(user.uid);
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const body = (await res.json()) as { idToken: string };
  return body.idToken;
}

export async function sessionCookieFor(email: string): Promise<string> {
  return adminAuth().createSessionCookie(await idTokenFor(email), { expiresIn: 60 * 60 * 1000 });
}
