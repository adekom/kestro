import Link from "next/link";
import { getProject, listContacts } from "@/server/services/projects";
import { listReports } from "@/server/services/reports";
import { reportLabel } from "@/lib/domain";
import { ProjectDetailsForm } from "./ProjectDetailsForm";
import { ContactsEditor } from "./ContactsEditor";
import { GroupsEditor } from "./GroupsEditor";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, reports, contacts] = await Promise.all([
    getProject(projectId),
    listReports(projectId),
    listContacts(projectId),
  ]);
  const newest = [...reports].reverse();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="link text-xs">← Projects</Link>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-sm text-text-muted">
            {[project.code, project.address].filter(Boolean).join(" · ")}
            {project.archived && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs">Archived</span>}
          </p>
        </div>
        {!project.archived && (
          <Link className="btn btn-primary" href={`/projects/${projectId}/reports/new`}>New report</Link>
        )}
      </div>

      <section className="card" aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="border-b border-border px-4 py-2.5 text-sm font-semibold">Reports</h2>
        {newest.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No reports yet.</p>
        ) : (
          <ul>
            {newest.map((r) => (
              <li key={r.id} className="flex items-center gap-4 border-t border-border px-4 py-2 text-sm first:border-t-0 hover:bg-surface-muted">
                <Link className="link w-40 font-medium" href={`/projects/${projectId}/reports/${r.id}`}>
                  {reportLabel(project.reportPrefix, r.sequence)}
                </Link>
                <span>{r.visitDate}</span>
                <span className="text-text-muted">{r.authorName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectDetailsForm project={project} />
        <div className="space-y-6">
          <ContactsEditor projectId={projectId} contacts={contacts} />
          <GroupsEditor key={project.groups.map((g) => g.id).join()} projectId={projectId} groups={project.groups} />
        </div>
      </div>
    </main>
  );
}
