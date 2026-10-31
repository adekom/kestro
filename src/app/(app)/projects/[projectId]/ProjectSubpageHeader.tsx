import { PageHeader } from "@/components/PageHeader";
import type { Project } from "@/lib/types";

/** Header shared by a project's Settings, Contacts and Groups pages. */
export function ProjectSubpageHeader({ project, title, action }: { project: Project; title: string; action?: React.ReactNode }) {
  return <PageHeader back={{ href: `/projects/${project.id}`, label: project.name }} title={title} actions={action} />;
}
