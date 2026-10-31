import { requirePageUser } from "@/server/auth";
import { getProject, listProjects } from "@/server/services/projects";
import { ProjectNav } from "./ProjectNav";

/** Every project page: left navigation plus the working area beside it. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [user, project, projects] = await Promise.all([requirePageUser(), getProject(projectId), listProjects({ archived: false })]);
  const mine = (p: (typeof projects)[number]) => Boolean(user.contactId && p.contactIds.includes(user.contactId));
  const switchable = [...projects].sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.name.localeCompare(b.name));
  if (!switchable.some((p) => p.id === project.id)) switchable.unshift(project); // archived projects stay reachable

  return (
    <>
      <ProjectNav
        project={{ id: project.id, name: project.name, archived: project.archived }}
        projects={switchable.map((p) => ({ id: p.id, name: p.name, code: p.code, mine: mine(p) }))}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-surface-muted">{children}</div>
    </>
  );
}
