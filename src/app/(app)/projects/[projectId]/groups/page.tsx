import { getProject } from "@/server/services/projects";
import { ProjectSubpageHeader } from "../ProjectSubpageHeader";
import { GroupsEditor } from "./GroupsEditor";

export default async function ProjectGroupsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProject((await params).projectId);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <ProjectSubpageHeader project={project} title="Observation groups" />
      <GroupsEditor key={project.groups.map((g) => g.id).join()} projectId={project.id} groups={project.groups} />
    </main>
  );
}
