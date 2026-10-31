"use client";

import Link from "next/link";
import { useState } from "react";
import { setProjectArchivedAction } from "@/app/actions";
import type { Project } from "@/lib/types";

interface Section {
  title: string;
  projects: Project[];
  empty: string;
}

export function ProjectTable({ sections, archived }: { sections: Section[]; archived: boolean }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filter = (projects: Project[]) =>
    q ? projects.filter((p) => [p.name, p.code, p.address].some((f) => f.toLowerCase().includes(q))) : projects;

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="project-search" className="sr-only">Search projects</label>
        <input
          id="project-search"
          className="input max-w-xs"
          placeholder="Search by name, number or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {sections.map((section) => {
        const shown = filter(section.projects);
        return (
          <section key={section.title} className="card" aria-labelledby={`h-${section.title}`}>
            <h2 id={`h-${section.title}`} className="border-b border-border px-4 py-2.5 text-sm font-semibold">
              {section.title} <span className="font-normal text-text-muted">({section.projects.length})</span>
            </h2>
            {shown.length === 0 ? (
              <p className="p-4 text-sm text-text-muted">{section.projects.length ? "No matching projects." : section.empty}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">No.</th>
                    <th className="px-4 py-2 font-medium">Address</th>
                    <th className="px-4 py-2 font-medium">Reports</th>
                    {archived && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-surface-muted">
                      <td className="px-4 py-2">
                        <Link className="link font-medium" href={`/projects/${p.id}`}>{p.name}</Link>
                      </td>
                      <td className="px-4 py-2">{p.code}</td>
                      <td className="px-4 py-2 text-text-muted">{p.address}</td>
                      <td className="px-4 py-2">{p.reportCount}</td>
                      {archived && (
                        <td className="px-4 py-2 text-right">
                          <button className="btn" onClick={() => setProjectArchivedAction(p.id, false)}>Restore</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
