import { getProject } from "@/server/services/projects";
import { getSettings } from "@/server/services/settings";
import { ArchiveProject, ProjectDetailsForm, ProjectOptions, ProjectStatuses } from "./ProjectDetailsForm";
import { GroupsEditor } from "./GroupsEditor";
import { ImportStatus } from "./ImportStatus";
import { importForProject } from "@/server/services/importer";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, settings] = await Promise.all([getProject(projectId), getSettings()]);
  const imported = project.importBatchId ? await importForProject(project.id) : null;
  return (
    <main className="page">
      <h1 className="page-title">Project settings</h1>
      <div className="form-width space-y-6">
        <ProjectDetailsForm project={project} />
        <ProjectOptions project={project} org={settings} />
        <ProjectStatuses project={project} company={{ statuses: settings.statuses, resolvedStatusId: settings.resolvedStatusId, defaultStatusId: settings.defaultStatusId }} locked={settings.locks.statuses} />
        <GroupsEditor key={project.groups.map((g) => g.id).join()} projectId={project.id} groups={project.groups} />
        {imported && (
          <ImportStatus
            projectId={project.id}
            projectName={project.name}
            batchId={imported.id}
            createdAt={imported.createdAt}
            photosImported={imported.counts.photosImported}
            photosPlanned={imported.counts.photosPlanned}
            statuses={settings.statuses}
          />
        )}
        <ArchiveProject project={project} />
      </div>
    </main>
  );
}
