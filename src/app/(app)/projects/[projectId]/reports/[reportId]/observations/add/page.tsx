import { getProject } from "@/server/services/projects";
import { getMemberships, getReport, getStatusEvents, reportSequenceMap } from "@/server/services/reports";
import { listProjectObservations } from "@/server/services/observations";
import { getSettings } from "@/server/services/settings";
import { formatLongDate, observationNumber, reportLabel, statusOn } from "@/lib/domain";
import { AddExistingObservations } from "./AddExistingObservations";
import { PageHeader } from "@/components/PageHeader";

/** Carry earlier project observations into this report (membership only; nothing is copied). */
export default async function AddExistingPage({ params }: { params: Promise<{ projectId: string; reportId: string }> }) {
  const { projectId, reportId } = await params;
  const [project, report, memberships, observations, seqMap, settings] = await Promise.all([
    getProject(projectId),
    getReport(projectId, reportId),
    getMemberships(projectId, reportId),
    listProjectObservations(projectId),
    reportSequenceMap(projectId),
    getSettings(),
  ]);
  const inReport = new Set(memberships.map((m) => m.observationId));
  const candidates = await Promise.all(
    observations
      .filter((o) => !inReport.has(o.id))
      .map(async (o) => ({
        id: o.id,
        number: observationNumber(o, seqMap),
        title: o.title,
        statusId: statusOn(await getStatusEvents(projectId, o.id), report.visitDate),
      })),
  );
  candidates.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const reportHref = `/projects/${projectId}/reports/${reportId}`;

  return (
    <main className="page">
      <PageHeader
        back={{ href: reportHref, label: `${reportLabel(project.reportPrefix, report.sequence)} · ${formatLongDate(report.visitDate)}` }}
        title="Carry forward observations"
        subtitle="Add earlier observations from this project to this report. They keep their number and history."
      />
      <AddExistingObservations
        projectId={projectId}
        reportId={reportId}
        reportHref={reportHref}
        candidates={candidates}
        statuses={settings.statuses}
      />
    </main>
  );
}
