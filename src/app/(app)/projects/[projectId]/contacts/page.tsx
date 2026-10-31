import Link from "next/link";
import { getProject } from "@/server/services/projects";
import { getContactsByIds } from "@/server/services/contacts";
import { ProjectSubpageHeader } from "../ProjectSubpageHeader";
import { ProjectContactList } from "./ProjectContactList";

export default async function ProjectContactsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProject((await params).projectId);
  const contacts = await getContactsByIds(project.contactIds);
  const rows = project.contacts.flatMap((pc) => {
    const contact = contacts.get(pc.contactId);
    return contact ? [{ ...pc, contact }] : [];
  });
  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <ProjectSubpageHeader
        project={project}
        title="Project contacts"
        action={<Link className="btn btn-primary" href={`/projects/${project.id}/contacts/add`}>Add contacts</Link>}
      />
      <ProjectContactList projectId={project.id} rows={rows} />
    </main>
  );
}
