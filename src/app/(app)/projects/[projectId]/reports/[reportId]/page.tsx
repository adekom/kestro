import { buildReportView } from "@/server/services/reportView";
import { listContacts } from "@/server/services/projects";
import { listLibrary } from "@/server/services/photos";
import { listProjectObservations } from "@/server/services/observations";
import { getReport, reportSequenceMap } from "@/server/services/reports";
import { observationNumber } from "@/lib/domain";
import { ReportEditor } from "./ReportEditor";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
  searchParams: Promise<{ tab?: string; obs?: string }>;
}) {
  const { projectId, reportId } = await params;
  const { tab, obs } = await searchParams;
  const [view, contacts, library, allObservations, seqMap] = await Promise.all([
    buildReportView(projectId, reportId),
    listContacts(projectId),
    listLibrary(projectId),
    listProjectObservations(projectId),
    reportSequenceMap(projectId),
  ]);
  const source = view.report.sourceReportId
    ? await getReport(projectId, view.report.sourceReportId).catch(() => null)
    : null;
  const inReport = new Set(view.observations.map((o) => o.observation.id));
  const addable = allObservations
    .filter((o) => !inReport.has(o.id))
    .map((o) => ({ id: o.id, number: observationNumber(o, seqMap), title: o.title }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  return (
    <ReportEditor
      view={view}
      contacts={contacts}
      library={library}
      addable={addable}
      previousOngoingWork={source?.ongoingWork ?? ""}
      initialTab={tab === "photos" || tab === "info" ? tab : obs ? "obs" : view.observations.length ? "obs" : "info"}
      initialObservationId={obs ?? view.observations[0]?.observation.id ?? null}
    />
  );
}
