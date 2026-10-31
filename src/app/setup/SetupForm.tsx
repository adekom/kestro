"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailLinkSignIn, exchangeForSession } from "@/components/EmailLinkSignIn";

export function SetupForm() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="first-name" className="label">First name</label>
          <input id="first-name" className="input" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="last-name" className="label">Last name</label>
          <input id="last-name" className="input" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="secret" className="label">Setup secret</label>
        <input
          id="secret"
          type="password"
          className="input"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">
          After you return from the email link, fill in your name and the secret, then press Continue. It is never stored in the browser.
        </p>
      </div>
      <EmailLinkSignIn
        returnPath="/setup"
        submitLabel="Email me a setup link"
        autoFinish={false}
        onToken={async (idToken) => {
          if (!secret || !firstName.trim()) return "Enter your first name and the setup secret, then request a new link.";
          const res = await fetch("/api/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, secret, firstName, lastName }),
          });
          if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Setup failed.";
          const error = await exchangeForSession(idToken);
          if (!error) router.replace("/settings");
          return error;
        }}
      />
    </div>
  );
}
