"use client";

import { useState } from "react";
import { setProjectArchivedAction, setProjectSummaryAction, updateProjectAction } from "@/app/actions";
import { SaveIndicator, SaveStatusProvider, useAutosave } from "@/components/autosave";
import type { Project, SummaryOverride } from "@/lib/types";
import { InlineSelect, InlineText, InlineTextarea } from "@/components/ui/InlineEdit";

/** `orgShowsSummary`: the organization's default for the PDF observation summary. */
export function ProjectDetailsForm({ project, orgShowsSummary }: { project: Project; orgShowsSummary: boolean }) {
  return (
    <SaveStatusProvider>
      <Form project={project} orgShowsSummary={orgShowsSummary} />
    </SaveStatusProvider>
  );
}

function Form({ project, orgShowsSummary }: { project: Project; orgShowsSummary: boolean }) {
  const [summary, setSummary] = useState<SummaryOverride>(project.summaryOverride);
  const [summaryError, setSummaryError] = useState<string | null>(null);
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
        <InlineTextarea id={`p-${k}`} minHeight="min-h-20" value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />
      ) : (
        <InlineText id={`p-${k}`} value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />
      )}
    </div>
  );

  return (
    <section className="card space-y-3 p-4" aria-labelledby="details-heading">
      <div className="flex items-center justify-between">
        <h2 id="details-heading" className="field-inset text-sm font-semibold">Project details</h2>
        <SaveIndicator />
      </div>
      {field("name", "Name")}
      {field("code", "Project number")}
      {field("address", "Address")}
      {field("reportPrefix", "Report label prefix (e.g. “Field Report ”)")}
      {field("description", "Description", true)}
      <div>
        <label className="label" htmlFor="p-summary">Observation summary in PDF</label>
        <InlineSelect
          id="p-summary"
          value={summary}
          onCommit={async (v) => {
            setSummary(v as SummaryOverride);
            const res = await setProjectSummaryAction(project.id, v as SummaryOverride);
            setSummaryError(res.ok ? null : res.error);
          }}
          options={[
            { value: "default", label: `Organization default (${orgShowsSummary ? "show" : "hide"})` },
            { value: "show", label: "Show" },
            { value: "hide", label: "Hide" },
          ]}
        />
        {summaryError && <p className="field-inset mt-1 text-xs text-danger" role="alert">{summaryError}</p>}
      </div>
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
