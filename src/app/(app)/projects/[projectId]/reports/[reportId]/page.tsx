import { buildReportView } from "@/server/services/reportView";
import { getContactsByIds } from "@/server/services/contacts";
import { listProjectObservations } from "@/server/services/observations";
import { getReport, getStatusEvents, reportSequenceMap } from "@/server/services/reports";
import { observationNumber, statusOn } from "@/lib/domain";
import { deletedReportIds } from "@/server/services/reportDeletion";
import { FieldReportPage } from "./FieldReportPage";

export default async function ReportPage({ params }: { params: Promise<{ projectId: string; reportId: string }> }) {
  const { projectId, reportId } = await params;
  const view = await buildReportView(projectId, reportId);
  const [source, contactMap, all, seqMap, hidden] = await Promise.all([
    view.report.sourceReportId ? getReport(projectId, view.report.sourceReportId).catch(() => null) : null,
    getContactsByIds(view.project.contactIds),
    listProjectObservations(projectId),
    reportSequenceMap(projectId),
    deletedReportIds(projectId),
  ]);
  // Earlier observations that could be carried into this report.
  const inReport = new Set(view.observations.map((o) => o.observation.id));
  const candidates = await Promise.all(
    all
      .filter((o) => !inReport.has(o.id))
      .map(async (o) => ({
        id: o.id,
        number: observationNumber(o, seqMap),
        title: o.title,
        statusId: statusOn(await getStatusEvents(projectId, o.id, hidden), view.report.visitDate),
      })),
  );
  candidates.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  return (
    <FieldReportPage
      view={view}
      contacts={[...contactMap.values()]}
      previousOngoingWork={source?.ongoingWork ?? ""}
      candidates={candidates}
    />
  );
}
