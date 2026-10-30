import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { getProject } from "@/server/services/projects";
import { listReports } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { reportLabel } from "@/lib/domain";
import { NewReportForm } from "./NewReportForm";

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
    label: `${reportLabel(project.reportPrefix, r.sequence)} — ${r.visitDate}`,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <Link href={`/projects/${projectId}`} className="link text-xs">← {project.name}</Link>
      <h1 className="text-xl font-semibold">
        New report <span className="text-text-muted">({reportLabel(project.reportPrefix, project.reportCount + 1)})</span>
      </h1>
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
