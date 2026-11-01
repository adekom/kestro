"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { setProjectArchivedAction, setProjectOptionsAction, setProjectStatusesAction, updateProjectAction, revertToCompanyStatusesAction } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusesEditor } from "@/app/(app)/settings/StatusesEditor";
import { SaveIndicator, SaveStatusProvider, useAutosave } from "@/components/autosave";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineSelect, InlineText, InlineTextarea } from "@/components/ui/InlineEdit";
import type { Project, StatusDef, SummaryOverride } from "@/lib/types";

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
    </section>
  );
}

/** Options that apply to every field report in the project. */
export function ProjectOptions({ project, orgShowsSummary }: { project: Project; orgShowsSummary: boolean }) {
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryOverride>(project.summaryOverride);
  const [weather, setWeather] = useState(project.includeWeather);
  const [error, setError] = useState<string | null>(null);
  const save = async (options: Parameters<typeof setProjectOptionsAction>[1]) => {
    const res = await setProjectOptionsAction(project.id, options);
    setError(res.ok ? null : res.error);
    if (res.ok) router.refresh();
  };

  return (
    <section className="card space-y-3 p-4" aria-labelledby="options-heading">
      <h2 id="options-heading" className="field-inset text-sm font-semibold">Project Settings</h2>
      <div>
        <label className="label" htmlFor="p-summary">Include summary of all observations at bottom of PDF Export</label>
        <InlineSelect
          id="p-summary"
          value={summary}
          onCommit={(v) => {
            setSummary(v as SummaryOverride);
            void save({ summaryOverride: v as SummaryOverride });
          }}
          options={[
            { value: "default", label: `Organization default (${orgShowsSummary ? "yes" : "no"})` },
            { value: "show", label: "Yes" },
            { value: "hide", label: "No" },
          ]}
        />
      </div>
      <div>
        <label className="label" htmlFor="p-weather">Include Weather in Report</label>
        <InlineSelect
          id="p-weather"
          value={weather ? "yes" : "no"}
          onCommit={(v) => {
            setWeather(v === "yes");
            void save({ includeWeather: v === "yes" });
          }}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </div>
      {error && <p className="field-inset text-xs text-danger" role="alert">{error}</p>}
    </section>
  );
}

/** Archiving hides the project from the active list; it can be restored at any time. */
export function ArchiveProject({ project }: { project: Project }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const Icon = project.archived ? ArchiveRestore : Archive;
  return (
    <section className="space-y-2 border-t border-border pt-6">
      <p className="field-inset text-sm text-text-muted">
        {project.archived
          ? "This project is archived. Restore it to return it to the active project list."
          : "Archived projects move to the Archived tab. Nothing is deleted, and they can be restored at any time."}
      </p>
      <button type="button" className="btn" onClick={() => setConfirming(true)}>
        <Icon className="h-4 w-4" aria-hidden /> {project.archived ? "Restore project" : "Archive project"}
      </button>
      <ConfirmDialog
        open={confirming}
        title={project.archived ? "Restore project?" : "Archive project?"}
        confirmLabel={project.archived ? "Restore" : "Archive"}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          const res = await setProjectArchivedAction(project.id, !project.archived);
          if (!res.ok) return res.error;
          router.refresh();
          return null;
        }}
      >
        <p>
          <span className="font-medium">{project.name}</span>{" "}
          {project.archived ? "will return to the active project list." : "will move to the Archived tab."}
        </p>
      </ConfirmDialog>
    </section>
  );
}

/**
 * The project's observation statuses: the company standard, or the project's
 * own list (starting as a copy of the company's, so existing history keeps
 * its meaning).
 */
export function ProjectStatuses({ project, company }: { project: Project; company: { statuses: StatusDef[]; resolvedStatusId: string } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const custom = project.statusOverride ?? null;
  return (
    <section className="card space-y-3 p-4" aria-labelledby="statuses-heading">
      <h2 id="statuses-heading" className="field-inset text-sm font-semibold">Observation statuses</h2>
      <div>
        <label className="label" htmlFor="p-statuses">Statuses for this project</label>
        <InlineSelect
          id="p-statuses"
          value={custom ? "custom" : "company"}
          onCommit={async (v) => {
            const res =
              v === "custom"
                ? await setProjectStatusesAction(project.id, company.statuses, Math.max(0, company.statuses.findIndex((s) => s.id === company.resolvedStatusId)))
                : await revertToCompanyStatusesAction(project.id);
            setError(res.ok ? null : res.error);
            if (res.ok) router.refresh();
          }}
          options={[
            { value: "company", label: "Use company standard" },
            { value: "custom", label: "Customize for this project" },
          ]}
        />
      </div>
      {error && <p className="field-inset text-xs text-danger" role="alert">{error}</p>}
      {custom ? (
        <StatusesEditor
          key={custom.statuses.map((s) => s.id + s.label + s.color).join() + custom.resolvedStatusId}
          embedded
          statuses={custom.statuses}
          resolvedStatusId={custom.resolvedStatusId}
          onSave={async (list, resolvedIndex) => {
            const res = await setProjectStatusesAction(project.id, list, resolvedIndex);
            if (res.ok) router.refresh();
            return res;
          }}
        />
      ) : (
        <ul className="field-inset flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {[...company.statuses].sort((a, b) => a.order - b.order).map((s) => (
            <li key={s.id}><StatusBadge status={s} />{s.id === company.resolvedStatusId && <span className="ml-1 text-xs text-text-muted">(resolved)</span>}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
