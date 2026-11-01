import { getProject } from "@/server/services/projects";
import { getProjectSettings } from "@/server/services/settings";
import { observationRows } from "@/server/services/tables";
import { ObservationsTable } from "./ObservationsTable";

export default async function ObservationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, rows, settings] = await Promise.all([getProject(projectId), observationRows(projectId), getProjectSettings(projectId)]);
  return (
    <main className="page">
      <h1 className="page-title">Observations</h1>
      <ObservationsTable
        projectId={projectId}
        rows={rows}
        statuses={settings.statuses}
        groups={[...project.groups].sort((a, b) => a.order - b.order)}
      />
    </main>
  );
}
