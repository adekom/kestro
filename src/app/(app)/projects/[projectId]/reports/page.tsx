import { requirePageUser } from "@/server/auth";
import { getContact } from "@/server/services/contacts";
import { getProject } from "@/server/services/projects";
import { reportSummaries } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { contactName, formatLongDate, reportLabel } from "@/lib/domain";
import { FieldReportsTable } from "./FieldReportsTable";

export default async function FieldReportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [user, project, summaries, settings] = await Promise.all([
    requirePageUser(),
    getProject(projectId),
    reportSummaries(projectId),
    getSettings(),
  ]);
  const me = user.contactId ? await getContact(user.contactId).catch(() => null) : null;
  const rows = summaries.map(({ report: r, statusCounts }) => ({
    id: r.id,
    sequence: r.sequence,
    label: reportLabel(project.reportPrefix, r.sequence),
    observationCount: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    createdAt: r.createdAt,
    author: r.authorName,
  }));
  const sources = [...summaries].reverse().map(({ report: r }) => ({
    id: r.id,
    label: `${reportLabel(project.reportPrefix, r.sequence)} — ${formatLongDate(r.visitDate)}`,
  }));

  return (
    <main className="page">
      <h1 className="page-title">Field Reports</h1>
      <FieldReportsTable
        projectId={projectId}
        rows={rows}
        archived={project.archived}
        newReport={{
          sources,
          statuses: settings.statuses,
          resolvedStatusId: settings.resolvedStatusId,
          defaultAuthor: (me && contactName(me)) || user.email,
          nextLabel: reportLabel(project.reportPrefix, project.reportCount + 1),
        }}
      />
    </main>
  );
}
