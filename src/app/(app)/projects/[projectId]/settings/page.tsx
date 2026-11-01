import { getProject } from "@/server/services/projects";
import { getSettings } from "@/server/services/settings";
import { ProjectDetailsForm } from "./ProjectDetailsForm";
import { GroupsEditor } from "./GroupsEditor";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, settings] = await Promise.all([getProject(projectId), getSettings()]);
  return (
    <main className="page">
      <h1 className="page-title">Project settings</h1>
      <div className="form-width space-y-6">
        <ProjectDetailsForm project={project} orgShowsSummary={settings.showSummaryDefault} />
        <GroupsEditor key={project.groups.map((g) => g.id).join()} projectId={project.id} groups={project.groups} />
      </div>
    </main>
  );
}
