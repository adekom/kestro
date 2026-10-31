"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addUpdateAction,
  deleteObservationAction,
  deleteUpdateAction,
  editUpdateAction,
  getObservationDetailAction,
  removeMembershipAction,
  setStatusAction,
  updateObservationAction,
} from "@/app/actions";
import { SaveIndicator, SaveStatusProvider, useAutosave } from "@/components/autosave";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusSelect } from "@/components/StatusSelect";
import { SlideOver } from "@/components/ui/SlideOver";
import { formatLongDate } from "@/lib/domain";
import type { ObservationDetail } from "@/server/services/reportView";
import { PhotoAttachments } from "./PhotoAttachments";

/**
 * Observation editor sliding in from the right. With `reportId`, status,
 * updates and photos are recorded in that report; otherwise in the most
 * recent report that includes the observation.
 */
export function ObservationSlideOver({
  projectId,
  observationId,
  reportId = null,
  onClose,
}: {
  projectId: string;
  observationId: string | null;
  reportId?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<ObservationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!observationId) return;
    const res = await getObservationDetailAction(projectId, observationId, reportId);
    if (res.ok) {
      setDetail(res.data);
      setLoadError(null);
    } else setLoadError(res.error);
  }, [projectId, observationId, reportId]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  // After any change: reload this panel and the page behind it.
  const changed = useCallback(() => {
    void load();
    router.refresh();
  }, [load, router]);

  const current = detail?.item.observation.id === observationId ? detail : null;

  return (
    <SlideOver
      open={Boolean(observationId)}
      onClose={onClose}
      title={current ? `${current.item.number}  ${current.item.observation.title}` : "Observation"}
    >
      {loadError && <p className="text-sm text-danger" role="alert">{loadError}</p>}
      {!current && !loadError && <p className="text-sm text-text-muted">Loading…</p>}
      {current && (
        <SaveStatusProvider>
          <ObservationEditor
            key={current.item.observation.id}
            projectId={projectId}
            detail={current}
            allowRemoveFromReport={Boolean(reportId)}
            onChanged={changed}
            onGone={() => {
              onClose();
              router.refresh();
            }}
          />
        </SaveStatusProvider>
      )}
    </SlideOver>
  );
}

function ObservationEditor({
  projectId,
  detail,
  allowRemoveFromReport,
  onChanged,
  onGone,
}: {
  projectId: string;
  detail: ObservationDetail;
  allowRemoveFromReport: boolean;
  onChanged: () => void;
  onGone: () => void;
}) {
  const { item, report, statuses, resolvedStatusId, groups } = detail;
  const o = item.observation;
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const [fields, setFields] = useState({ title: o.title, description: o.description, groupId: o.groupId });
  const version = useRef(o.version);
  const { conflict } = useAutosave(`obs-${o.id}`, fields, async (v) => {
    const res = await updateObservationAction(projectId, o.id, v, version.current);
    if (res.ok) {
      version.current = res.data;
      onChanged();
    }
    return res;
  });
  const [error, setError] = useState<string | null>(null);
  const [newUpdate, setNewUpdate] = useState("");
  const carriedForward = o.originReportId !== report.id;

  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    setError(res.ok ? null : (res.error ?? "Failed"));
    if (res.ok) onChanged();
    return res.ok;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 rounded-md bg-surface-muted px-3 py-2 text-xs text-text-muted">
        <span>
          Status, updates and photos are recorded in <span className="font-medium text-text">{detail.reportLabel}</span>.
        </span>
        <SaveIndicator />
      </div>
      {conflict && (
        <div role="alert" className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger">
          Someone else edited this observation. Your latest edits were not saved.{" "}
          <button className="underline" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <label className="label" htmlFor="obs-title">Title</label>
          <input id="obs-title" className="input" value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="obs-status">Status</label>
            <StatusSelect
              id="obs-status"
              statuses={statuses}
              value={item.statusId}
              resolvedStatusId={resolvedStatusId}
              onChange={(statusId) => run(setStatusAction(projectId, report.id, o.id, statusId))}
            />
          </div>
          <div>
            <label className="label" htmlFor="obs-group">Group</label>
            <select
              id="obs-group"
              className="input"
              value={fields.groupId ?? ""}
              disabled={groups.length === 0}
              onChange={(e) => setFields({ ...fields, groupId: e.target.value || null })}
            >
              <option value="">{groups.length ? "None" : "No groups defined"}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="obs-desc">Description</label>
          <textarea id="obs-desc" className="input min-h-28" value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} />
        </div>
        <p className="text-xs text-text-muted">Opened {formatLongDate(o.originalDate)}. Shared by every report that includes it.</p>
      </section>

      {/* An observation created in this report is its initial record: no history or updates yet. */}
      {carriedForward && (
        <section aria-labelledby="history-heading" className="space-y-2">
          <h3 id="history-heading" className="text-sm font-semibold">History</h3>
          <ol className="space-y-2 text-sm">
            {item.statusEvents.map((e) => (
              <li key={e.id} className="flex gap-3 text-text-muted">
                <span className="w-28 shrink-0">{formatLongDate(e.date)}</span>
                <span>Status: <StatusBadge status={statusById.get(e.statusId)} /></span>
              </li>
            ))}
            {item.updates.map((u) =>
              u.reportId === report.id ? (
                <EditableUpdate
                  key={u.id}
                  date={u.date}
                  text={u.text}
                  onSave={(text) => run(editUpdateAction(projectId, report.id, o.id, u.id, text))}
                  onDelete={() => run(deleteUpdateAction(projectId, report.id, o.id, u.id))}
                />
              ) : (
                <li key={u.id} className="flex gap-3">
                  <span className="w-28 shrink-0 text-text-muted">{formatLongDate(u.date)}</span>
                  <span className="whitespace-pre-wrap">{u.text}</span>
                </li>
              ),
            )}
          </ol>
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(addUpdateAction(projectId, report.id, o.id, newUpdate))) setNewUpdate("");
            }}
          >
            <label className="label" htmlFor="new-update">Update for {formatLongDate(report.visitDate)}</label>
            <textarea id="new-update" className="input min-h-16" value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} />
            <button className="btn" disabled={!newUpdate.trim()}>Add update</button>
          </form>
        </section>
      )}

      <PhotoAttachments pid={projectId} rid={report.id} item={item} onChanged={onChanged} onError={setError} />

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <section className="flex flex-wrap gap-2 border-t border-border pt-4">
        {allowRemoveFromReport && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (await run(removeMembershipAction(projectId, report.id, o.id))) onGone();
            }}
          >
            Remove from this report
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const typed = window.prompt(
              `Delete observation ${item.number} from the entire project? It will disappear from every report that includes it.\n\nType ${item.number} to confirm.`,
            );
            if (typed?.trim() === item.number && (await run(deleteObservationAction(projectId, report.id, o.id)))) onGone();
          }}
        >
          Delete from project…
        </button>
      </section>
    </div>
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
      <span className="w-28 shrink-0 text-text-muted">{formatLongDate(date)}</span>
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
