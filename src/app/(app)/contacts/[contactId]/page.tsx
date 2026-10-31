import Link from "next/link";
import { getContact } from "@/server/services/contacts";
import { listProjectsForContact } from "@/server/services/projects";
import { contactName } from "@/lib/domain";
import { EditContactForm } from "./EditContactForm";
import { PageHeader } from "@/components/PageHeader";

export default async function ContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const [contact, projects] = await Promise.all([getContact(contactId), listProjectsForContact(contactId)]);
  return (
    <main className="page">
      <PageHeader back={{ href: "/contacts", label: "Contacts" }} title={contactName(contact) || contact.email} />
      <div className="card form-width p-4">
        <EditContactForm contact={contact} />
      </div>
      <section className="card form-width">
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
