import { listContacts } from "@/server/services/contacts";
import { ContactTable } from "./ContactTable";
import { PageHeader } from "@/components/PageHeader";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <main className="page">
      <PageHeader title="Firm contacts" subtitle="Everyone your firm works with across projects, including staff." />
      <ContactTable contacts={contacts} />
    </main>
  );
}
