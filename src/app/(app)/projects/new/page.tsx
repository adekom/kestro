import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { listContacts } from "@/server/services/contacts";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  const [user, contacts] = await Promise.all([requirePageUser(), listContacts()]);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <Link href="/projects" className="link text-xs">← Projects</Link>
      <h1 className="text-xl font-semibold">New project</h1>
      <NewProjectForm contacts={contacts} currentContactId={user.contactId} />
    </main>
  );
}
