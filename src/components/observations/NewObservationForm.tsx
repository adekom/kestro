"use client";

import { useState } from "react";
import { createObservationAction } from "@/app/actions";
import { StatusSelect } from "@/components/StatusSelect";
import type { Group, StatusDef } from "@/lib/types";

/**
 * Create form for an observation. It originates in a field report: fixed when
 * opened from a report, otherwise chosen from `reports` (newest first).
 */
export function NewObservationForm({
  projectId,
  reportId: fixedReportId,
  reports = [],
  statuses,
  resolvedStatusId,
  groups,
  onCreated,
  onCancel,
}: {
  projectId: string;
  reportId?: string;
  reports?: Array<{ id: string; label: string }>;
  statuses: StatusDef[];
  resolvedStatusId: string;
  groups: Group[];
  onCreated: (observationId: string) => void;
  onCancel: () => void;
}) {
  const [reportId, setReportId] = useState(fixedReportId ?? reports[0]?.id ?? "");
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState(sorted.find((s) => s.id !== resolvedStatusId)?.id ?? sorted[0]?.id ?? "");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("Creating observation…");
    const res = await createObservationAction(projectId, reportId, { title, description, statusId, groupId: groupId || null });
    if (!res.ok) {
      setBusy(null);
      return setError(res.error);
    }
    const oid = res.data;
    if (files.length) {
      setBusy(`Uploading ${files.length} photo${files.length > 1 ? "s" : ""}…`);
      const form = new FormData();
      form.set("reportId", reportId);
      form.set("observationId", oid);
      files.forEach((f) => form.append("files", f));
      try {
        const up = await fetch(`/api/projects/${projectId}/photos/upload`, { method: "POST", body: form });
        const body = (await up.json()) as { error?: string; results?: Array<{ ok: boolean; error?: string }> };
        const failures = body.results?.filter((r) => !r.ok).map((r) => r.error) ?? (body.error ? [body.error] : []);
        if (failures.length) {
          // The observation exists; send the user to it so they can retry the failed photos there.
          window.alert(`The observation was created, but some photos weren't uploaded:\n\n${failures.join("\n")}`);
        }
      } catch {
        window.alert("The observation was created, but the photos couldn't be uploaded. Add them from the observation.");
      }
    }
    setBusy(null);
    onCreated(oid);
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <section className="space-y-3">
        {!fixedReportId && (
          <div>
            <label className="label" htmlFor="obs-report">Field report<span className="text-danger"> *</span></label>
            <select id="obs-report" className="input" required value={reportId} onChange={(e) => setReportId(e.target.value)}>
              {reports.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-text-muted">The observation is numbered from this report (e.g. 6.4).</p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="new-obs-title">Title<span className="text-danger"> *</span></label>
          <input id="new-obs-title" className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="new-obs-status">Status</label>
            <StatusSelect id="new-obs-status" statuses={statuses} value={statusId} onChange={setStatusId} />
          </div>
          {groups.length > 0 && (
            <div>
              <label className="label" htmlFor="new-obs-group">Group</label>
              <select id="new-obs-group" className="input" required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="new-obs-description">Description</label>
          <textarea id="new-obs-description" className="input min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="new-obs-photos">Photos (optional, JPEG or PNG)</label>
          <input
            id="new-obs-photos"
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="text-sm"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
          {files.length > 0 && <p className="mt-1 text-xs text-text-muted">{files.length} selected</p>}
        </div>
      </section>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" disabled={Boolean(busy)}>Create observation</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        {busy && <span className="text-sm text-text-muted" role="status">{busy}</span>}
      </div>
    </form>
  );
}
