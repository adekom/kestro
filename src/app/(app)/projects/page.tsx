import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { listProjects } from "@/server/services/projects";
import { ProjectTable } from "./ProjectTable";
import { PageHeader } from "@/components/PageHeader";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const archived = (await searchParams).archived === "1";
  const [user, projects] = await Promise.all([requirePageUser(), listProjects({ archived })]);
  const mine = user.contactId ? projects.filter((p) => p.contactIds.includes(user.contactId!)) : [];
  const others = projects.filter((p) => !mine.includes(p));

  return (
    <main className="page">
      <PageHeader
        title={archived ? "Archived projects" : "Projects"}
        actions={
          <>
            <Link className="link mr-2 text-sm" href={archived ? "/projects" : "/projects?archived=1"}>
              {archived ? "Show active projects" : "Show archived projects"}
            </Link>
            {!archived && <Link className="btn btn-primary" href="/projects/new">New project</Link>}
          </>
        }
      />
      <ProjectTable
        archived={archived}
        sections={[
          { title: "My projects", projects: mine, empty: "You aren't listed as a contact on any project yet." },
          { title: "All other projects", projects: others, empty: "No other projects." },
        ]}
      />
    </main>
  );
}
