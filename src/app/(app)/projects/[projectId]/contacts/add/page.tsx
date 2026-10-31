import { getProject } from "@/server/services/projects";
import { listContacts } from "@/server/services/contacts";
import { ProjectSubpageHeader } from "../../ProjectSubpageHeader";
import { AddProjectContacts } from "./AddProjectContacts";

export default async function AddProjectContactsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProject((await params).projectId);
  const contacts = await listContacts();
  return (
    <main className="page">
      <ProjectSubpageHeader project={project} title="Add contacts" />
      <div className="form-width">
        <AddProjectContacts projectId={project.id} contacts={contacts} existingIds={project.contactIds} />
      </div>
    </main>
  );
}
