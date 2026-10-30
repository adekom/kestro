"use client";

import Link from "next/link";
import { useState } from "react";
import { setProjectArchivedAction } from "@/app/actions";
import type { Project } from "@/lib/types";

export function ProjectTable({ projects, archived }: { projects: Project[]; archived: boolean }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? projects.filter((p) => [p.name, p.code, p.address].some((f) => f.toLowerCase().includes(q)))
    : projects;

  return (
    <div className="card">
      <div className="border-b border-border p-3">
        <label htmlFor="project-search" className="sr-only">Search projects</label>
        <input
          id="project-search"
          className="input max-w-xs"
          placeholder="Search by name, number or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {shown.length === 0 ? (
        <p className="p-4 text-sm text-text-muted">{projects.length ? "No matching projects." : "No projects yet."}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">No.</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Reports</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-surface-muted">
                <td className="px-3 py-2">
                  <Link className="link font-medium" href={`/projects/${p.id}`}>{p.name}</Link>
                </td>
                <td className="px-3 py-2">{p.code}</td>
                <td className="px-3 py-2 text-text-muted">{p.address}</td>
                <td className="px-3 py-2">{p.reportCount}</td>
                <td className="px-3 py-2 text-right">
                  {archived && (
                    <button className="btn" onClick={() => setProjectArchivedAction(p.id, false)}>Restore</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
