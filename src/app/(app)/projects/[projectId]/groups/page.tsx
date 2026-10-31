import { getProject } from "@/server/services/projects";
import { ProjectSubpageHeader } from "../ProjectSubpageHeader";
import { GroupsEditor } from "./GroupsEditor";

export default async function ProjectGroupsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProject((await params).projectId);
  return (
    <main className="page">
      <ProjectSubpageHeader project={project} title="Observation groups" />
      <div className="form-width">
        <GroupsEditor key={project.groups.map((g) => g.id).join()} projectId={project.id} groups={project.groups} />
      </div>
    </main>
  );
}
