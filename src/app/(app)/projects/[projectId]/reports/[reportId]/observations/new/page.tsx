import Link from "next/link";
import { getProject } from "@/server/services/projects";
import { getReport } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { formatLongDate, reportLabel } from "@/lib/domain";
import { NewObservationForm } from "./NewObservationForm";

export default async function NewObservationPage({ params }: { params: Promise<{ projectId: string; reportId: string }> }) {
  const { projectId, reportId } = await params;
  const [project, report, settings] = await Promise.all([getProject(projectId), getReport(projectId, reportId), getSettings()]);
  const reportHref = `/projects/${projectId}/reports/${reportId}`;
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <Link href={reportHref} className="link text-xs">
        ← {reportLabel(project.reportPrefix, report.sequence)} · {formatLongDate(report.visitDate)}
      </Link>
      <h1 className="text-xl font-semibold">New observation</h1>
      <NewObservationForm
        projectId={projectId}
        reportId={reportId}
        reportHref={reportHref}
        statuses={settings.statuses}
        resolvedStatusId={settings.resolvedStatusId}
        groups={[...project.groups].sort((a, b) => a.order - b.order)}
      />
    </main>
  );
}
