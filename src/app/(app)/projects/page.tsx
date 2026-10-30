import Link from "next/link";
import { listProjects } from "@/server/services/projects";
import { NewProjectForm } from "./NewProjectForm";
import { ProjectTable } from "./ProjectTable";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const archived = (await searchParams).archived === "1";
  const projects = await listProjects({ archived });
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{archived ? "Archived projects" : "Projects"}</h1>
        <Link className="link text-sm" href={archived ? "/projects" : "/projects?archived=1"}>
          {archived ? "Show active projects" : "Show archived projects"}
        </Link>
      </div>
      <ProjectTable projects={projects} archived={archived} />
      {!archived && <NewProjectForm />}
    </main>
  );
}
