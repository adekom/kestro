import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { AddStaffForm } from "./AddStaffForm";

export default async function AddStaffPage() {
  await requirePageUser("admin");
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <Link href="/settings/users" className="link text-xs">← Staff</Link>
      <h1 className="text-xl font-semibold">Add staff member</h1>
      <p className="text-sm text-text-muted">
        They can sign in with an email link sent to this address. They are also added to the firm contact list (or linked to their
        existing contact).
      </p>
      <AddStaffForm />
    </main>
  );
}
