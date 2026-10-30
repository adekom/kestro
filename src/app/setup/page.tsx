import { notFound } from "next/navigation";
import { isBootstrapOpen } from "@/server/services/users";
import { Wordmark } from "@/components/Wordmark";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

/** One-time first-administrator setup. Returns 404 once completed or when no secret is configured. */
export default async function SetupPage() {
  if (!(await isBootstrapOpen())) notFound();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-6">
        <h1 className="mb-1 text-2xl">
          <Wordmark />
        </h1>
        <h2 className="mb-2 text-base font-semibold">First administrator setup</h2>
        <p className="mb-5 text-sm text-text-muted">
          Sign in with the email that will own this workspace, then enter the setup secret configured by the
          deployment owner (KESTRO_BOOTSTRAP_SECRET). This page disappears permanently after setup.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
