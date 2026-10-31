import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { listProjects } from "@/server/services/projects";
import { ProjectTable } from "./ProjectTable";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const archived = (await searchParams).archived === "1";
  const [user, projects] = await Promise.all([requirePageUser(), listProjects({ archived })]);
  const mine = user.contactId ? projects.filter((p) => p.contactIds.includes(user.contactId!)) : [];
  const others = projects.filter((p) => !mine.includes(p));

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <h1 className="mr-auto text-xl font-semibold">{archived ? "Archived projects" : "Projects"}</h1>
        <Link className="link text-sm" href={archived ? "/projects" : "/projects?archived=1"}>
          {archived ? "Show active projects" : "Show archived projects"}
        </Link>
        {!archived && <Link className="btn btn-primary" href="/projects/new">New project</Link>}
      </div>
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
