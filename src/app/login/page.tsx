"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { EmailLinkSignIn, exchangeForSession } from "@/components/EmailLinkSignIn";
import { Wordmark } from "@/components/Wordmark";

export default function LoginPage() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl">
          <Wordmark />
        </h1>
        <p className="mb-5 text-sm text-text-muted">Sign in with your work email. Only invited staff can enter.</p>
        <Suspense>
          <EmailLinkSignIn
            returnPath="/login"
            onToken={async (token) => {
              const error = await exchangeForSession(token);
              if (!error) router.replace("/projects");
              return error;
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}
