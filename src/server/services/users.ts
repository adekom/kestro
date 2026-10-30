import "server-only";
import { timingSafeEqual, createHash } from "node:crypto";
import { db } from "../firebaseAdmin";
import { adminAuth } from "../firebaseAdmin";
import { bootstrapDoc, usersCol } from "../paths";
import { now } from "../time";
import { UserError } from "../errors";
import { normalizeEmail } from "../auth";
import type { AppUser, Role } from "@/lib/types";

const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export async function listUsers(): Promise<AppUser[]> {
  const snap = await usersCol().orderBy("email").get();
  return snap.docs.map((d) => d.data() as AppUser);
}

export async function addUser(rawEmail: string, role: Role): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL.test(email)) throw new UserError("Enter a valid email address.");
  const ref = usersCol().doc(email);
  await db().runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) throw new UserError("That email is already on the staff list.");
    const user: AppUser = { email, role, enabled: true, uid: null, createdAt: now(), updatedAt: now(), lastSignInAt: null };
    tx.create(ref, user);
  });
}

/**
 * Changes role and/or enabled state, refusing any change that would leave the
 * organization without an enabled administrator.
 */
export async function updateUser(rawEmail: string, patch: { role?: Role; enabled?: boolean }): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const ref = usersCol().doc(email);
  const uid = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new UserError("User not found.");
    const user = snap.data() as AppUser;
    const next = { ...user, ...patch };
    const losesAdmin = user.role === "admin" && user.enabled && !(next.role === "admin" && next.enabled);
    if (losesAdmin) {
      const admins = await tx.get(usersCol().where("role", "==", "admin").where("enabled", "==", true));
      if (admins.size <= 1) throw new UserError("You cannot remove the last enabled administrator.");
    }
    tx.update(ref, { ...patch, updatedAt: now() });
    return user.uid;
  });
  // End existing sessions immediately when access is withdrawn.
  if (patch.enabled === false && uid) await adminAuth().revokeRefreshTokens(uid);
}

export async function recordSignIn(email: string, uid: string): Promise<void> {
  await usersCol().doc(normalizeEmail(email)).update({ uid, lastSignInAt: now() });
}

// ---- One-time first-administrator bootstrap (spec §3.1) ----

function secretMatches(provided: string): boolean {
  const expected = process.env.KESTRO_BOOTSTRAP_SECRET;
  if (!expected || expected.length < 16) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function isBootstrapOpen(): Promise<boolean> {
  const snap = await bootstrapDoc().get();
  return !snap.exists && Boolean(process.env.KESTRO_BOOTSTRAP_SECRET);
}

/**
 * Creates the first administrator. Requires the owner-held secret and a
 * verified email-link sign-in; once completed it can never run again.
 */
export async function completeBootstrap(rawEmail: string, uid: string, secret: string): Promise<void> {
  if (!secretMatches(secret)) throw new UserError("Setup is unavailable or the setup secret is incorrect.");
  const email = normalizeEmail(rawEmail);
  await db().runTransaction(async (tx) => {
    if ((await tx.get(bootstrapDoc())).exists) throw new UserError("Setup has already been completed.");
    const admin: AppUser = { email, role: "admin", enabled: true, uid, createdAt: now(), updatedAt: now(), lastSignInAt: now() };
    tx.set(usersCol().doc(email), admin);
    tx.create(bootstrapDoc(), { completedAt: now(), completedBy: email });
  });
}
