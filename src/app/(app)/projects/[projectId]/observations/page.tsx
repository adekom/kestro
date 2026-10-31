import { getProject } from "@/server/services/projects";
import { listReports } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { observationRows } from "@/server/services/tables";
import { formatLongDate, reportLabel } from "@/lib/domain";
import { ObservationsTable } from "./ObservationsTable";

export default async function ObservationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, rows, reports, settings] = await Promise.all([
    getProject(projectId),
    observationRows(projectId),
    listReports(projectId),
    getSettings(),
  ]);
  return (
    <main className="page">
      <h1 className="page-title">Observations</h1>
      <ObservationsTable
        projectId={projectId}
        rows={rows}
        statuses={settings.statuses}
        resolvedStatusId={settings.resolvedStatusId}
        groups={[...project.groups].sort((a, b) => a.order - b.order)}
        reports={[...reports].reverse().map((r) => ({
          id: r.id,
          label: `${reportLabel(project.reportPrefix, r.sequence)} — ${formatLongDate(r.visitDate)}`,
        }))}
        archived={project.archived}
      />
    </main>
  );
}
