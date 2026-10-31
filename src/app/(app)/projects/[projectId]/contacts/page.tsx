import { getProject } from "@/server/services/projects";
import { listContacts } from "@/server/services/contacts";
import { projectContactRows } from "@/server/services/tables";
import { ContactsTable } from "./ContactsTable";

export default async function ProjectContactsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, rows, firmContacts] = await Promise.all([getProject(projectId), projectContactRows(projectId), listContacts()]);
  return (
    <main className="page">
      <h1 className="page-title">Contacts</h1>
      <ContactsTable projectId={projectId} rows={rows} firmContacts={firmContacts} existingIds={project.contactIds} />
    </main>
  );
}
