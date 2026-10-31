import { NextResponse } from "next/server";
import { adminAuth } from "@/server/firebaseAdmin";
import { completeBootstrap } from "@/server/services/users";
import { UserError } from "@/server/errors";

/** One-time creation of the first administrator; permanently closed after success. */
export async function POST(req: Request) {
  const { idToken, secret, firstName = "", lastName = "" } = (await req.json().catch(() => ({}))) as {
    idToken?: string;
    secret?: string;
    firstName?: string;
    lastName?: string;
  };
  if (!idToken || !secret) return NextResponse.json({ error: "Missing token or setup secret." }, { status: 400 });
  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    if (!decoded.email || !decoded.email_verified) {
      return NextResponse.json({ error: "Sign in with an email link first." }, { status: 401 });
    }
    await completeBootstrap(decoded.email, decoded.uid, secret, { firstName: String(firstName), lastName: String(lastName) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof UserError ? e.message : "Setup failed.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
