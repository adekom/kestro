import { getProject } from "@/server/services/projects";
import { ProjectSubpageHeader } from "../ProjectSubpageHeader";
import { ProjectDetailsForm } from "./ProjectDetailsForm";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProject((await params).projectId);
  return (
    <main className="page">
      <ProjectSubpageHeader project={project} title="Project settings" />
      <div className="form-width">
        <ProjectDetailsForm project={project} />
      </div>
    </main>
  );
}
