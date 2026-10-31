import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "./firebaseAdmin";
import { contactsCol, usersCol } from "./paths";
import type { AppUser, Contact, Role } from "@/lib/types";

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  uid: string;
  email: string;
  role: Role;
  contactId: string | null;
  /** For display; falls back to the email's local part when no name is set. */
  firstName: string;
}

export class AuthError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthError";
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Looks up an allowlisted, enabled user. Returns null for unknown or disabled accounts. */
export async function findActiveUser(email: string): Promise<AppUser | null> {
  const snap = await usersCol().doc(normalizeEmail(email)).get();
  if (!snap.exists) return null;
  const user = snap.data() as AppUser;
  return user.enabled ? user : null;
}

/**
 * Validates the session cookie (including revocation) and re-checks the
 * allowlist on every call, so disabling a user or changing a role takes effect
 * immediately.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    if (!decoded.email) return null;
    const user = await findActiveUser(decoded.email);
    if (!user) return null;
    const contact = user.contactId ? ((await contactsCol().doc(user.contactId).get()).data() as Contact | undefined) : undefined;
    return {
      uid: decoded.uid,
      email: user.email,
      role: user.role,
      contactId: user.contactId ?? null,
      firstName: contact?.firstName || user.email.split("@")[0],
    };
  } catch {
    return null;
  }
}

/** For server actions and route handlers: throws when not signed in / not permitted. */
export async function requireUser(role: Role = "editor"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Not signed in");
  if (role === "admin" && user.role !== "admin") throw new AuthError("Administrator access required");
  return user;
}

/** For pages: redirects instead of throwing. */
export async function requirePageUser(role: Role = "editor"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (role === "admin" && user.role !== "admin") redirect("/projects");
  return user;
}
