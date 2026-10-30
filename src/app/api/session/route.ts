import { NextResponse } from "next/server";
import { adminAuth } from "@/server/firebaseAdmin";
import { findActiveUser, SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/server/auth";
import { recordSignIn } from "@/server/services/users";

/** Exchanges a fresh Firebase ID token for an httpOnly session cookie, for allowlisted users only. */
export async function POST(req: Request) {
  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "Missing token." }, { status: 400 });
  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    // Require a recent sign-in so a leaked old ID token cannot mint a session.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    const user = decoded.email && decoded.email_verified ? await findActiveUser(decoded.email) : null;
    if (!user) {
      return NextResponse.json({ error: "This email is not authorized to use this Kestro workspace." }, { status: 403 });
    }
    const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    await recordSignIn(user.email, decoded.uid);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Sign-in could not be verified." }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
