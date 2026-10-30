"use client";

import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
  type Auth,
} from "firebase/auth";

// The browser uses Firebase only for email-link authentication. All data
// access goes through the server, which holds the httpOnly session cookie.

let auth: Auth | undefined;

function clientAuth(): Auth {
  if (auth) return auth;
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  auth = getAuth(app);
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}

const EMAIL_KEY = "kestro.signInEmail";

export async function sendMagicLink(email: string, returnPath: string): Promise<void> {
  await sendSignInLinkToEmail(clientAuth(), email, {
    url: `${window.location.origin}${returnPath}`,
    handleCodeInApp: true,
  });
  try {
    window.localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // Storage may be unavailable; the user will be asked for the email again.
  }
}

export function isMagicLink(): boolean {
  return isSignInWithEmailLink(clientAuth(), window.location.href);
}

export function rememberedEmail(): string | null {
  try {
    return window.localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

/** Completes the email-link sign-in and returns a fresh ID token. */
export async function completeMagicLink(email: string): Promise<string> {
  const cred = await signInWithEmailLink(clientAuth(), email, window.location.href);
  try {
    window.localStorage.removeItem(EMAIL_KEY);
  } catch {}
  return cred.user.getIdToken();
}

/** The server session is authoritative; drop the client-side Firebase session. */
export async function clearClientAuth(): Promise<void> {
  await signOut(clientAuth());
}

export function describeAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/invalid-action-code" || code === "auth/expired-action-code") {
    return "This sign-in link has expired or was already used. Request a new one.";
  }
  if (code === "auth/invalid-email") return "That email address doesn't match the one the link was sent to.";
  if (code === "auth/quota-exceeded") return "Too many sign-in emails were sent. Try again later.";
  return "Sign-in failed. Please request a new link.";
}
