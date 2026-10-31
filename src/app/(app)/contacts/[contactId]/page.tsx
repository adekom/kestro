import Link from "next/link";
import { getContact } from "@/server/services/contacts";
import { listProjectsForContact } from "@/server/services/projects";
import { contactName } from "@/lib/domain";
import { EditContactForm } from "./EditContactForm";

export default async function ContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const [contact, projects] = await Promise.all([getContact(contactId), listProjectsForContact(contactId)]);
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <Link href="/contacts" className="link text-xs">← Contacts</Link>
      <h1 className="text-xl font-semibold">{contactName(contact) || contact.email}</h1>
      <div className="card p-4">
        <EditContactForm contact={contact} />
      </div>
      <section className="card">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">Projects</h2>
        {projects.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">Not listed on any project.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.id} className="border-t border-border px-4 py-2 text-sm first:border-t-0">
                <Link className="link" href={`/projects/${p.id}`}>{p.name}</Link>
                <span className="ml-2 text-text-muted">{p.contacts.find((c) => c.contactId === contactId)?.projectRole}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
