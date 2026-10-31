import { requirePageUser } from "@/server/auth";
import { getProject } from "@/server/services/projects";
import { listReports } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { formatLongDate, reportLabel } from "@/lib/domain";
import { NewReportForm } from "./NewReportForm";
import { PageHeader } from "@/components/PageHeader";

export default async function NewReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [user, project, reports, settings] = await Promise.all([
    requirePageUser(),
    getProject(projectId),
    listReports(projectId),
    getSettings(),
  ]);
  const sources = [...reports].reverse().map((r) => ({
    id: r.id,
    label: `${reportLabel(project.reportPrefix, r.sequence)} — ${formatLongDate(r.visitDate)}`,
  }));

  return (
    <main className="page">
      <PageHeader
        back={{ href: `/projects/${projectId}`, label: project.name }}
        title={<>New report <span className="text-text-muted">({reportLabel(project.reportPrefix, project.reportCount + 1)})</span></>}
      />
      <NewReportForm
        projectId={projectId}
        sources={sources}
        statuses={settings.statuses}
        resolvedStatusId={settings.resolvedStatusId}
        defaultAuthor={user.email}
      />
    </main>
  );
}
