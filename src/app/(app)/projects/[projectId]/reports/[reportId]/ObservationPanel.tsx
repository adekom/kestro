"use client";

import { useRef, useState } from "react";
import {
  addUpdateAction,
  deleteObservationAction,
  deleteUpdateAction,
  editUpdateAction,
  removeMembershipAction,
  setStatusAction,
  updateObservationAction,
} from "@/app/actions";
import { useAutosave } from "@/components/autosave";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusSelect } from "@/components/StatusSelect";
import { formatLongDate } from "@/lib/domain";
import type { ObservationInReport, ReportView } from "@/server/services/reportView";
import type { Photo, StatusDef } from "@/lib/types";
import { PhotoAttachments } from "./PhotoAttachments";

export interface ObservationDraft {
  version: number;
  fields: { title: string; description: string; groupId: string | null };
}

export function ObservationPanel({
  view,
  item,
  library,
  statusById,
  cache,
  onTitleChange,
  onRemoved,
}: {
  view: ReportView;
  item: ObservationInReport;
  library: Photo[];
  statusById: Map<string, StatusDef>;
  cache: Map<string, ObservationDraft>;
  onTitleChange: (title: string) => void;
  onRemoved: () => void;
}) {
  const { project, report, settings } = view;
  const o = item.observation;
  const cached = cache.get(o.id);
  const fresh = !cached || cached.version < o.version;
  const [fields, setFields] = useState(
    fresh ? { title: o.title, description: o.description, groupId: o.groupId } : cached.fields,
  );
  const version = useRef(fresh ? o.version : cached.version);
  const { conflict } = useAutosave(`obs-${o.id}`, fields, async (v) => {
    const res = await updateObservationAction(project.id, o.id, v, version.current);
    if (res.ok) {
      version.current = res.data;
      cache.set(o.id, { version: res.data, fields: v });
    }
    return res;
  });
  const [error, setError] = useState<string | null>(null);
  const [newUpdate, setNewUpdate] = useState("");
  const thisVisitUpdates = item.updates.filter((u) => u.reportId === report.id);
  const carriedForward = o.originReportId !== report.id;

  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    setError(res.ok ? null : (res.error ?? "Failed"));
    return res.ok;
  };

  return (
    <article className="max-w-4xl space-y-5" aria-labelledby="obs-heading">
      {conflict && (
        <div role="alert" className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger">
          Someone else edited this observation. Your latest edits were not saved.{" "}
          <button className="underline" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
      <header className="flex items-start gap-3">
        <span className="rounded-md bg-surface px-2 py-1 text-lg font-semibold ring-1 ring-border" title="Display number (derived from the originating report)">
          {item.number}
        </span>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="obs-title">Title</label>
          <input
            id="obs-title"
            className="input text-base font-semibold"
            value={fields.title}
            onChange={(e) => {
              setFields({ ...fields, title: e.target.value });
              onTitleChange(e.target.value);
            }}
          />
          <p className="mt-1 text-xs text-text-muted">Opened {formatLongDate(o.originalDate)}. Shared across every report that includes it.</p>
        </div>
      </header>

      <section className="card grid grid-cols-2 gap-3 p-4">
        <div>
          <label className="label" htmlFor="obs-status">Status as of this visit ({formatLongDate(report.visitDate)})</label>
          <StatusSelect
            id="obs-status"
            statuses={settings.statuses}
            value={item.statusId}
            resolvedStatusId={settings.resolvedStatusId}
            onChange={(statusId) => run(setStatusAction(project.id, report.id, o.id, statusId))}
          />
        </div>
        {project.groups.length > 0 && (
          <div>
            <label className="label" htmlFor="obs-group">Group</label>
            <select
              id="obs-group"
              className="input"
              value={fields.groupId ?? ""}
              onChange={(e) => setFields({ ...fields, groupId: e.target.value || null })}
            >
              <option value="">None</option>
              {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className="label" htmlFor="obs-desc">Original description</label>
          <textarea id="obs-desc" className="input min-h-28" value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} />
        </div>
      </section>

      {/* An observation created in this report is its initial record: no history or updates yet. */}
      {carriedForward && (
        <section className="card p-4" aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-2 text-sm font-semibold">History up to this visit</h2>
          <ol className="space-y-2 text-sm">
            {item.statusEvents.map((e) => (
              <li key={e.id} className="flex gap-3 text-text-muted">
                <span className="w-32 shrink-0">{formatLongDate(e.date)}</span>
                <span>Status: <StatusBadge status={statusById.get(e.statusId)} /></span>
              </li>
            ))}
            {item.updates.map((u) =>
              u.reportId === report.id ? (
                <EditableUpdate
                  key={u.id}
                  date={u.date}
                  text={u.text}
                  onSave={(text) => run(editUpdateAction(project.id, report.id, o.id, u.id, text))}
                  onDelete={() => run(deleteUpdateAction(project.id, report.id, o.id, u.id))}
                />
              ) : (
                <li key={u.id} className="flex gap-3">
                  <span className="w-32 shrink-0 text-text-muted">{formatLongDate(u.date)}</span>
                  <span className="whitespace-pre-wrap">{u.text}</span>
                </li>
              ),
            )}
          </ol>
          <form
            className="mt-3 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(addUpdateAction(project.id, report.id, o.id, newUpdate))) setNewUpdate("");
            }}
          >
            <label className="label" htmlFor="new-update">
              {thisVisitUpdates.length ? "Add another update for this visit" : `Update for this visit (${formatLongDate(report.visitDate)})`}
            </label>
            <textarea id="new-update" className="input min-h-16" value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} />
            <button className="btn" disabled={!newUpdate.trim()}>Add update</button>
          </form>
        </section>
      )}

      <PhotoAttachments view={view} item={item} library={library} onError={setError} />

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <section className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (await run(removeMembershipAction(project.id, report.id, o.id))) onRemoved();
          }}
        >
          Remove from this report
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const typed = window.prompt(
              `Delete observation ${item.number} from the entire project? It will disappear from every report that includes it.\n\nType ${item.number} to confirm.`,
            );
            if (typed?.trim() === item.number && (await run(deleteObservationAction(project.id, report.id, o.id)))) onRemoved();
          }}
        >
          Delete from project…
        </button>
      </section>
    </article>
  );
}

function EditableUpdate({
  date,
  text,
  onSave,
  onDelete,
}: {
  date: string;
  text: string;
  onSave: (text: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  return (
    <li className="flex gap-3">
      <span className="w-32 shrink-0 text-text-muted">{formatLongDate(date)}</span>
      {editing ? (
        <div className="flex-1 space-y-1">
          <textarea className="input min-h-16" aria-label="Edit update" value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="btn" onClick={async () => (await onSave(value)) && setEditing(false)}>Save</button>{" "}
          <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <>
          <span className="flex-1 whitespace-pre-wrap">{text}</span>
          <button type="button" className="link text-xs" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="link text-xs" onClick={onDelete}>Delete</button>
        </>
      )}
    </li>
  );
}
