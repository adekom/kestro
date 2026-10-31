import Link from "next/link";
import { listContacts } from "@/server/services/contacts";
import { ContactTable } from "./ContactTable";
import { PageHeader } from "@/components/PageHeader";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <main className="page">
      <PageHeader title="Contacts" actions={<Link className="btn btn-primary" href="/contacts/new">New contact</Link>} />
      <ContactTable contacts={contacts} />
    </main>
  );
}
