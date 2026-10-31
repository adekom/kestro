import "server-only";
import { timingSafeEqual, createHash } from "node:crypto";
import { db } from "../firebaseAdmin";
import { adminAuth } from "../firebaseAdmin";
import { bootstrapDoc, usersCol } from "../paths";
import { now } from "../time";
import { UserError } from "../errors";
import { normalizeEmail } from "../auth";
import { ensureStaffContactInTx, getContactsByIds } from "./contacts";
import { EMAIL_PATTERN } from "@/lib/domain";
import type { AppUser, Contact, Role } from "@/lib/types";

export interface StaffNames {
  firstName: string;
  lastName: string;
}

export async function listUsers(): Promise<Array<AppUser & { contact: Contact | null }>> {
  const snap = await usersCol().orderBy("email").get();
  const users = snap.docs.map((d) => d.data() as AppUser);
  const contacts = await getContactsByIds(users.flatMap((u) => (u.contactId ? [u.contactId] : [])));
  return users.map((u) => ({ ...u, contact: (u.contactId && contacts.get(u.contactId)) || null }));
}

/** Adds a staff member. They also join (or are linked to) the firm contact list. */
export async function addUser(rawEmail: string, role: Role, names: StaffNames): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_PATTERN.test(email)) throw new UserError("Enter a valid email address.");
  if (!names.firstName.trim()) throw new UserError("First name is required.");
  const ref = usersCol().doc(email);
  await db().runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) throw new UserError("That email is already on the staff list.");
    const contactId = await ensureStaffContactInTx(tx, email, names);
    const user: AppUser = { email, role, enabled: true, uid: null, contactId, createdAt: now(), updatedAt: now(), lastSignInAt: null };
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

/** Records the sign-in and makes sure staff added before contacts existed get one. */
export async function recordSignIn(email: string, uid: string): Promise<void> {
  const ref = usersCol().doc(normalizeEmail(email));
  await db().runTransaction(async (tx) => {
    const user = (await tx.get(ref)).data() as AppUser | undefined;
    if (!user) return;
    const contactId = user.contactId ?? (await ensureStaffContactInTx(tx, user.email, { firstName: "", lastName: "" }));
    tx.update(ref, { uid, contactId, lastSignInAt: now() });
  });
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
export async function completeBootstrap(rawEmail: string, uid: string, secret: string, names: StaffNames): Promise<void> {
  if (!secretMatches(secret)) throw new UserError("Setup is unavailable or the setup secret is incorrect.");
  if (!names.firstName.trim()) throw new UserError("First name is required.");
  const email = normalizeEmail(rawEmail);
  await db().runTransaction(async (tx) => {
    if ((await tx.get(bootstrapDoc())).exists) throw new UserError("Setup has already been completed.");
    const contactId = await ensureStaffContactInTx(tx, email, names);
    const admin: AppUser = { email, role: "admin", enabled: true, uid, contactId, createdAt: now(), updatedAt: now(), lastSignInAt: now() };
    tx.set(usersCol().doc(email), admin);
    tx.create(bootstrapDoc(), { completedAt: now(), completedBy: email });
  });
}
