"use client";

import { useState } from "react";
import { setProjectArchivedAction, updateProjectAction } from "@/app/actions";
import { SaveIndicator, SaveStatusProvider, useAutosave } from "@/components/autosave";
import type { Project } from "@/lib/types";

export function ProjectDetailsForm({ project }: { project: Project }) {
  return (
    <SaveStatusProvider>
      <Form project={project} />
    </SaveStatusProvider>
  );
}

function Form({ project }: { project: Project }) {
  const [form, setForm] = useState({
    name: project.name,
    code: project.code,
    address: project.address,
    description: project.description,
    reportPrefix: project.reportPrefix,
  });
  useAutosave("project", form, (v) => updateProjectAction(project.id, v));
  const field = (k: keyof typeof form, label: string, multiline = false) => (
    <div>
      <label className="label" htmlFor={`p-${k}`}>{label}</label>
      {multiline ? (
        <textarea id={`p-${k}`} className="input min-h-20" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      ) : (
        <input id={`p-${k}`} className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      )}
    </div>
  );

  return (
    <section className="card space-y-3 p-4" aria-labelledby="details-heading">
      <div className="flex items-center justify-between">
        <h2 id="details-heading" className="text-sm font-semibold">Project details</h2>
        <SaveIndicator />
      </div>
      {field("name", "Name")}
      {field("code", "Project number")}
      {field("address", "Address")}
      {field("reportPrefix", "Report label prefix (e.g. “Field Report ”)")}
      {field("description", "Description", true)}
      <button
        type="button"
        className="btn"
        onClick={() => setProjectArchivedAction(project.id, !project.archived)}
      >
        {project.archived ? "Restore project" : "Archive project"}
      </button>
    </section>
  );
}
