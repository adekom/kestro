"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailLinkSignIn, exchangeForSession } from "@/components/EmailLinkSignIn";

export function SetupForm() {
  const router = useRouter();
  const [secret, setSecret] = useState("");

  return (
    <div className="space-y-4">
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
          After you return from the email link, enter the secret here and press Continue. It is never stored in the browser.
        </p>
      </div>
      <EmailLinkSignIn
        returnPath="/setup"
        submitLabel="Email me a setup link"
        autoFinish={false}
        onToken={async (idToken) => {
          if (!secret) return "Enter the setup secret, then request a new link.";
          const res = await fetch("/api/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, secret }),
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
