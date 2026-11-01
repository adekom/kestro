import Link from "next/link";
import type { ContactProject } from "./projectsByContact";

/** The projects a person is on, with their role on each. */
export function ContactProjects({ projects }: { projects: ContactProject[] }) {
  return (
    <section className="space-y-2">
      <h3 className="field-inset text-sm font-semibold">Projects</h3>
      {projects.length === 0 ? (
        <p className="field-inset text-sm text-text-muted">Not on any project.</p>
      ) : (
        <ul className="divide-y divide-border">
          {projects.map((p) => (
            <li key={p.id} className="field-inset py-2 text-sm">
              <Link className="link" href={`/projects/${p.id}/contacts`}>{p.name}</Link>
              {p.archived && <span className="ml-2 text-xs text-text-muted">archived</span>}
              {p.role && <span className="ml-2 text-text-muted">{p.role}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
