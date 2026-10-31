import { buildReportView } from "@/server/services/reportView";
import { getContactsByIds } from "@/server/services/contacts";
import { FieldReportPage } from "./FieldReportPage";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
  searchParams: Promise<{ obs?: string }>;
}) {
  const { projectId, reportId } = await params;
  const { obs } = await searchParams;
  const view = await buildReportView(projectId, reportId);
  const contacts = await getContactsByIds(view.project.contactIds);
  const openId = view.observations.some((o) => o.observation.id === obs) ? (obs ?? null) : null;
  return <FieldReportPage view={view} contacts={[...contacts.values()]} initialOpenId={openId} />;
}
