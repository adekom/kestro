import Link from "next/link";
import { getProject } from "@/server/services/projects";
import { reportSummaries } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { formatLongDate, reportLabel } from "@/lib/domain";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, summaries, settings] = await Promise.all([getProject(projectId), reportSummaries(projectId), getSettings()]);
  const statuses = [...settings.statuses].sort((a, b) => a.order - b.order);
  const newest = [...summaries].reverse();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <Link href="/projects" className="link text-xs">← Projects</Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <p className="text-sm text-text-muted">
              {[project.code, project.address].filter(Boolean).join(" · ")}
              {project.archived && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs">Archived</span>}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Project">
            <Link className="btn" href={`/projects/${projectId}/settings`}>Settings</Link>
            <Link className="btn" href={`/projects/${projectId}/contacts`}>
              Contacts <span className="text-text-muted">({project.contacts.length})</span>
            </Link>
            <Link className="btn" href={`/projects/${projectId}/groups`}>
              Groups <span className="text-text-muted">({project.groups.length})</span>
            </Link>
            {!project.archived && <Link className="btn btn-primary" href={`/projects/${projectId}/reports/new`}>New report</Link>}
          </nav>
        </div>
      </div>

      <section className="card" aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="border-b border-border px-4 py-2.5 text-sm font-semibold">Reports</h2>
        {newest.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No reports yet.</p>
        ) : (
          <ul>
            {newest.map(({ report: r, statusCounts }) => {
              const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
              return (
                <li key={r.id} className="border-t border-border first:border-t-0 hover:bg-surface-muted">
                  <Link href={`/projects/${projectId}/reports/${r.id}`} className="block px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="font-medium text-primary">{reportLabel(project.reportPrefix, r.sequence)}</span>
                      <span className="text-sm">{formatLongDate(r.visitDate)}</span>
                      <span className="ml-auto flex flex-wrap gap-3 text-xs" aria-label="Observations by status">
                        {total === 0 && <span className="text-text-muted">No observations</span>}
                        {statuses.map((s) =>
                          statusCounts[s.id] ? (
                            <span key={s.id} className="inline-flex items-center gap-1">
                              <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: s.color }} />
                              {statusCounts[s.id]} {s.label}
                            </span>
                          ) : null,
                        )}
                        {statusCounts[""] ? <span className="text-text-muted">{statusCounts[""]} no status</span> : null}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-text-muted">
                      {r.ongoingWork.trim() || <span className="italic">No ongoing work recorded.</span>}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
