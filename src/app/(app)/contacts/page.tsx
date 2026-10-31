import Link from "next/link";
import { listContacts } from "@/server/services/contacts";
import { ContactTable } from "./ContactTable";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contacts</h1>
        <Link className="btn btn-primary" href="/contacts/new">New contact</Link>
      </div>
      <ContactTable contacts={contacts} />
    </main>
  );
}
