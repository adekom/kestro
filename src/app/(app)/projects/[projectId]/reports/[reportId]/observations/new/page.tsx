import { getProject } from "@/server/services/projects";
import { getReport } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { formatLongDate, reportLabel } from "@/lib/domain";
import { NewObservationForm } from "./NewObservationForm";
import { PageHeader } from "@/components/PageHeader";

export default async function NewObservationPage({ params }: { params: Promise<{ projectId: string; reportId: string }> }) {
  const { projectId, reportId } = await params;
  const [project, report, settings] = await Promise.all([getProject(projectId), getReport(projectId, reportId), getSettings()]);
  const reportHref = `/projects/${projectId}/reports/${reportId}`;
  return (
    <main className="page">
      <PageHeader back={{ href: reportHref, label: `${reportLabel(project.reportPrefix, report.sequence)} · ${formatLongDate(report.visitDate)}` }} title="New observation" />
      <div className="form-width">
      <NewObservationForm
        projectId={projectId}
        reportId={reportId}
        reportHref={reportHref}
        statuses={settings.statuses}
        resolvedStatusId={settings.resolvedStatusId}
        groups={[...project.groups].sort((a, b) => a.order - b.order)}
      />
      </div>
    </main>
  );
}
