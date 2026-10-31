"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createObservationAction } from "@/app/actions";
import { StatusSelect } from "@/components/StatusSelect";
import type { Group, StatusDef } from "@/lib/types";

export function NewObservationForm({
  projectId,
  reportId,
  reportHref,
  statuses,
  resolvedStatusId,
  groups,
}: {
  projectId: string;
  reportId: string;
  reportHref: string;
  statuses: StatusDef[];
  resolvedStatusId: string;
  groups: Group[];
}) {
  const router = useRouter();
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState(sorted.find((s) => s.id !== resolvedStatusId)?.id ?? sorted[0]?.id ?? "");
  const [groupId, setGroupId] = useState("");
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
    const next = `${reportHref}?tab=obs&obs=${oid}`;
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
    router.push(next);
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <section className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="obs-title">Title<span className="text-danger"> *</span></label>
          <input id="obs-title" className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="obs-status">Status</label>
            <StatusSelect id="obs-status" statuses={statuses} value={statusId} onChange={setStatusId} resolvedStatusId={resolvedStatusId} />
          </div>
          {groups.length > 0 && (
            <div>
              <label className="label" htmlFor="obs-group">Group</label>
              <select id="obs-group" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">None</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="obs-description">Description</label>
          <textarea id="obs-description" className="input min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="obs-photos">Photos (optional, JPEG or PNG)</label>
          <input
            id="obs-photos"
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
        <button type="button" className="btn" onClick={() => router.push(reportHref)}>Cancel</button>
        {busy && <span className="text-sm text-text-muted" role="status">{busy}</span>}
      </div>
    </form>
  );
}
