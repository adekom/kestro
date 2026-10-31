import Link from "next/link";
import type { Project } from "@/lib/types";

/** Back link and title shared by a project's Settings, Contacts and Groups pages. */
export function ProjectSubpageHeader({ project, title, action }: { project: Project; title: string; action?: React.ReactNode }) {
  return (
    <div>
      <Link href={`/projects/${project.id}`} className="link text-xs">← {project.name}</Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {action}
      </div>
    </div>
  );
}
