import { getProject } from "@/server/services/projects";
import { listContacts } from "@/server/services/contacts";
import { ProjectSubpageHeader } from "../../ProjectSubpageHeader";
import { AddProjectContacts } from "./AddProjectContacts";

export default async function AddProjectContactsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProject((await params).projectId);
  const contacts = await listContacts();
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <ProjectSubpageHeader project={project} title="Add contacts" />
      <AddProjectContacts projectId={project.id} contacts={contacts} existingIds={project.contactIds} />
    </main>
  );
}
