import { buildReportView } from "@/server/services/reportView";
import { getContactsByIds } from "@/server/services/contacts";
import { listLibrary } from "@/server/services/photos";
import { getReport } from "@/server/services/reports";
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
  const [view, library] = await Promise.all([buildReportView(projectId, reportId), listLibrary(projectId)]);
  const [source, contactMap] = await Promise.all([
    view.report.sourceReportId ? getReport(projectId, view.report.sourceReportId).catch(() => null) : null,
    getContactsByIds(view.project.contactIds),
  ]);

  return (
    <ReportEditor
      view={view}
      contacts={[...contactMap.values()]}
      library={library}
      previousOngoingWork={source?.ongoingWork ?? ""}
      initialTab={tab === "photos" || tab === "info" ? tab : obs ? "obs" : view.observations.length ? "obs" : "info"}
      initialObservationId={obs ?? view.observations[0]?.observation.id ?? null}
    />
  );
}
