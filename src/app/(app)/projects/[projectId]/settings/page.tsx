import { getProject } from "@/server/services/projects";
import { ProjectDetailsForm } from "./ProjectDetailsForm";
import { GroupsEditor } from "./GroupsEditor";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProject((await params).projectId);
  return (
    <main className="page">
      <h1 className="page-title">Project settings</h1>
      <div className="form-width space-y-6">
        <ProjectDetailsForm project={project} />
        <GroupsEditor key={project.groups.map((g) => g.id).join()} projectId={project.id} groups={project.groups} />
      </div>
    </main>
  );
}
