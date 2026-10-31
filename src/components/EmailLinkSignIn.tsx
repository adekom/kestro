"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearClientAuth,
  completeMagicLink,
  describeAuthError,
  isMagicLink,
  rememberedEmail,
  sendMagicLink,
} from "@/lib/firebaseClient";

// Per-tab record of the sign-in link this tab has already used (sessionStorage
// survives a second page load in the same tab, unlike component state).
const HANDLED_KEY = "kestro.handledSignInLink";
const linkCode = () => new URL(window.location.href).searchParams.get("oobCode");
function handledLinkCode(): string | null {
  try {
    return window.sessionStorage.getItem(HANDLED_KEY);
  } catch {
    return null;
  }
}
function markLinkHandled(code: string | null) {
  try {
    if (code) window.sessionStorage.setItem(HANDLED_KEY, code);
    else window.sessionStorage.removeItem(HANDLED_KEY);
  } catch {
    // Without storage the guard simply doesn't apply.
  }
}

type Phase ="enter-email" | "sent" | "confirm-email" | "working" | "signed-in";

/**
 * Email-link sign-in. Calls `onToken` with a fresh ID token once the link is
 * completed; the caller exchanges it with the server.
 */
export function EmailLinkSignIn({
  returnPath,
  onToken,
  submitLabel = "Email me a sign-in link",
  autoFinish = true,
}: {
  returnPath: string;
  onToken: (idToken: string) => Promise<string | null>;
  submitLabel?: string;
  /** When false, a returning link waits for the user to press Continue (e.g. to enter other fields first). */
  autoFinish?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("enter-email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A sign-in link works once. Guard against React running the effect twice
  // in development, and against double-clicking Continue.
  const linkUsed = useRef(false);

  useEffect(() => {
    if (!isMagicLink()) return;
    // The page can load a second time while the first load is still completing
    // this link (and has already used it). Wait for that instead of asking again;
    // if it doesn't navigate away, reload the plain page, where the server
    // forwards signed-in users onwards.
    if (handledLinkCode() === linkCode()) {
      setPhase("working");
      const t = setTimeout(() => window.location.assign(returnPath), 4000);
      return () => clearTimeout(t);
    }
    const remembered = rememberedEmail();
    if (remembered && autoFinish) return void finish(remembered);
    setEmail(remembered ?? "");
    setPhase("confirm-email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish(address: string) {
    if (linkUsed.current) return;
    linkUsed.current = true;
    setPhase("working");
    setError(null);
    markLinkHandled(linkCode());
    try {
      const token = await completeMagicLink(address);
      // The link is now spent; drop it from the address bar so a reload can't retry it.
      window.history.replaceState(null, "", window.location.pathname);
      const failure = await onToken(token);
      await clearClientAuth();
      if (failure) {
        setError(failure);
        setPhase("enter-email");
      } else {
        setPhase("signed-in");
      }
    } catch (e) {
      setError(describeAuthError(e));
      // A mistyped email doesn't consume the link, so let the user try again.
      const retryable = (e as { code?: string })?.code === "auth/invalid-email";
      linkUsed.current = !retryable;
      if (retryable) markLinkHandled(null);
      setPhase(retryable ? "confirm-email" : "enter-email");
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("working");
    try {
      await sendMagicLink(email.trim(), returnPath);
      setPhase("sent");
    } catch (err) {
      setError(describeAuthError(err));
      setPhase("enter-email");
    }
  }

  if (phase === "sent") {
    return (
      <p className="text-sm" role="status">
        Check <strong>{email}</strong> for a sign-in link. You can close this tab; the link opens Kestro.
      </p>
    );
  }
  if (phase === "working" || phase === "signed-in") {
    return <p className="text-sm text-text-muted" role="status">Signing in…</p>;
  }

  const confirming = phase === "confirm-email";
  return (
    <form
      onSubmit={confirming ? (e) => (e.preventDefault(), void finish(email.trim())) : send}
      className="space-y-3"
    >
      {confirming && <p className="text-sm">Confirm the email address this link was sent to.</p>}
      <div>
        <label htmlFor="email" className="label">Work email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "signin-error" : undefined}
        />
      </div>
      {error && (
        <p id="signin-error" className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full justify-center">
        {confirming ? "Continue" : submitLabel}
      </button>
    </form>
  );
}

export async function exchangeForSession(idToken: string): Promise<string | null> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Sign-in failed.";
}
