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
import { InlineSelect, InlineText, InlineTextarea } from "@/components/ui/InlineEdit";
import { FileText, Trash2 } from "lucide-react";
import { formatLongDate, statusOn } from "@/lib/domain";
import type { StatusDef } from "@/lib/types";
import type { ObservationDetail } from "@/server/services/reportView";
import { PhotoAttachments, photoUrl } from "./PhotoAttachments";
import Link from "next/link";

/**
 * Observation editor sliding in from the right. With `reportId`, status,
 * updates and photos are recorded in that report; otherwise in the most
 * recent report that includes the observation. `readOnly` shows it without
 * any editing (observations are edited in the context of a field report).
 */
export function ObservationSlideOver({
  projectId,
  observationId,
  reportId = null,
  readOnly = false,
  onClose,
}: {
  projectId: string;
  observationId: string | null;
  reportId?: string | null;
  readOnly?: boolean;
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
      {current && readOnly && <ObservationReadOnly key={current.item.observation.id} projectId={projectId} detail={current} />}
      {current && !readOnly && (
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
  // In a later report the original record is fixed: only updates and status change.
  const carriedForward = o.originReportId !== report.id;
  const [fields, setFields] = useState({ title: o.title, description: o.description, groupId: o.groupId });
  const version = useRef(o.version);
  const { conflict } = useAutosave(`obs-${o.id}`, fields, async (v) => {
    const patch = carriedForward ? { groupId: v.groupId } : v;
    const res = await updateObservationAction(projectId, o.id, patch, version.current, report.id);
    if (res.ok) {
      version.current = res.data;
      onChanged();
    }
    return res;
  });
  const [error, setError] = useState<string | null>(null);
  const [newUpdate, setNewUpdate] = useState("");

  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    setError(res.ok ? null : (res.error ?? "Failed"));
    if (res.ok) onChanged();
    return res.ok;
  };

  // Timeline: the original record, then each later visit with its updates and the status then.
  const laterDates = historyDates(item);

  return (
    <div className="space-y-6">
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

      <section className="space-y-4">
        {!carriedForward && (
          <div>
            <label className="label" htmlFor="obs-title">Title</label>
            <InlineText id="obs-title" value={fields.title} onChange={(v) => setFields({ ...fields, title: v })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="obs-status">Status</label>
            <StatusSelect
              inline
              id="obs-status"
              statuses={statuses}
              value={item.statusId}
              resolvedStatusId={resolvedStatusId}
              onChange={(statusId) => run(setStatusAction(projectId, report.id, o.id, statusId))}
            />
          </div>
          <div>
            <label className="label" htmlFor="obs-group">Group</label>
            <InlineSelect
              id="obs-group"
              value={fields.groupId ?? ""}
              disabled={groups.length === 0}
              onChange={(v) => setFields({ ...fields, groupId: v || null })}
              options={[{ value: "", label: groups.length ? "None" : "No groups defined" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
            />
          </div>
        </div>
        {!carriedForward && (
          <div>
            <label className="label" htmlFor="obs-desc">Description</label>
            <InlineTextarea id="obs-desc" value={fields.description} onChange={(v) => setFields({ ...fields, description: v })} placeholder="Describe the condition observed" />
          </div>
        )}
      </section>

      <section aria-labelledby="history-heading" className="space-y-3">
        <h3 id="history-heading" className="field-inset text-sm font-semibold">History</h3>
        <ol>
          <TimelineEntry
            date={o.originalDate}
            heading="Observation created"
            status={statusById.get(statusOn(item.statusEvents, o.originalDate) ?? "")}
            last={laterDates.length === 0}
          >
            {o.description && <p className="whitespace-pre-wrap">{o.description}</p>}
          </TimelineEntry>
          {laterDates.map((date, i) => {
            const updates = item.updates.filter((u) => u.date === date);
            return (
              <TimelineEntry
                key={date}
                date={date}
                heading={updates.length ? "Update" : "Status changed"}
                status={statusById.get(statusOn(item.statusEvents, date) ?? "")}
                last={i === laterDates.length - 1}
              >
                {updates.map((u) =>
                  u.reportId === report.id ? (
                    <EditableUpdate
                      key={u.id}
                      id={u.id}
                      text={u.text}
                      onSave={(text) => run(editUpdateAction(projectId, report.id, o.id, u.id, text))}
                      onDelete={() => run(deleteUpdateAction(projectId, report.id, o.id, u.id))}
                    />
                  ) : (
                    <p key={u.id} className="whitespace-pre-wrap">{u.text}</p>
                  ),
                )}
              </TimelineEntry>
            );
          })}
        </ol>
        {/* Updates belong to later visits; the creating report holds the original description. */}
        {carriedForward && !item.updates.some((u) => u.reportId === report.id) && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(addUpdateAction(projectId, report.id, o.id, newUpdate))) setNewUpdate("");
            }}
          >
            <label className="label" htmlFor="new-update">Add update for {formatLongDate(report.visitDate)}</label>
            <textarea id="new-update" className="input min-h-20" value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} />
            <button className="btn" disabled={!newUpdate.trim()}>Add update</button>
          </form>
        )}
      </section>

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

/** The observation as recorded, with no editing. */
function ObservationReadOnly({ projectId, detail }: { projectId: string; detail: ObservationDetail }) {
  const { item, report, statuses, groups } = detail;
  const o = item.observation;
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const laterDates = historyDates(item);
  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <div className="label">{label}</div>
      <div className="field-inset py-2 text-sm">{value}</div>
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2 text-xs text-text-muted">
        <span>
          As of <span className="font-medium text-text">{detail.reportLabel}</span>. Edit observations from their field report.
        </span>
        <Link className="btn shrink-0" href={`/projects/${projectId}/reports/${report.id}?obs=${o.id}`}>
          <FileText className="h-4 w-4" aria-hidden /> Go to most recent report
        </Link>
      </div>
      <section className="grid grid-cols-2 gap-3">
        {fact("Status", <StatusBadge status={statusById.get(item.statusId ?? "")} />)}
        {fact("Group", groups.find((g) => g.id === o.groupId)?.name ?? "None")}
      </section>
      <section aria-labelledby="ro-history" className="space-y-3">
        <h3 id="ro-history" className="field-inset text-sm font-semibold">History</h3>
        <ol>
          <TimelineEntry
            date={o.originalDate}
            heading="Observation created"
            status={statusById.get(statusOn(item.statusEvents, o.originalDate) ?? "")}
            last={laterDates.length === 0}
          >
            {o.description && <p className="whitespace-pre-wrap">{o.description}</p>}
          </TimelineEntry>
          {laterDates.map((date, i) => {
            const updates = item.updates.filter((u) => u.date === date);
            return (
              <TimelineEntry
                key={date}
                date={date}
                heading={updates.length ? "Update" : "Status changed"}
                status={statusById.get(statusOn(item.statusEvents, date) ?? "")}
                last={i === laterDates.length - 1}
              >
                {updates.map((u) => <p key={u.id} className="whitespace-pre-wrap">{u.text}</p>)}
              </TimelineEntry>
            );
          })}
        </ol>
      </section>
      {item.attachments.length > 0 && (
        <section aria-labelledby="ro-photos">
          <h3 id="ro-photos" className="field-inset mb-2 text-sm font-semibold">Photos</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {item.attachments.map((a) => (
              <li key={a.id}>
                <a href={photoUrl(projectId, a.photoId, "web")} target="_blank" rel="noopener" title="Open full image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(projectId, a.photoId)} alt={a.caption || a.photo.fileName} className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" />
                </a>
                {a.caption && <p className="mt-1 text-xs text-text-muted">{a.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Visits shown after the creation dot: those with an update, or where the
 * status differs from the visit before. Re-selecting the same status, or
 * deleting the only update, leaves no dot.
 */
function historyDates(item: ObservationDetail["item"]): string[] {
  const o = item.observation;
  const dates = [...new Set([...item.updates.map((u) => u.date), ...item.statusEvents.map((e) => e.date)])]
    .filter((d) => d > o.originalDate)
    .sort();
  return dates.filter((d) => {
    if (item.updates.some((u) => u.date === d)) return true;
    const before = statusOn(item.statusEvents.filter((e) => e.date < d), d);
    return statusOn(item.statusEvents, d) !== before;
  });
}

/** One dot on the history timeline, joined to the next by a vertical line. */
function TimelineEntry({
  date,
  heading,
  status,
  last,
  children,
}: {
  date: string;
  heading: string;
  status: StatusDef | undefined;
  last: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative pb-5 pl-7 last:pb-0">
      {!last && <span aria-hidden className="absolute top-4 bottom-0 left-[6px] w-0.5 bg-border" />}
      <span
        aria-hidden
        className="absolute top-1 left-0 h-3.5 w-3.5 rounded-full border-2 border-surface ring-1 ring-border"
        style={{ backgroundColor: status?.color ?? "var(--color-surface)" }}
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{formatLongDate(date)}</span>
        <span className="text-xs text-text-muted">{heading}</span>
        <span className="ml-auto text-sm"><StatusBadge status={status} /></span>
      </div>
      {children && <div className="mt-1 space-y-2 text-sm">{children}</div>}
    </li>
  );
}

/** An update recorded in this report: click to edit, icon to delete. */
function EditableUpdate({ id, text, onSave, onDelete }: { id: string; text: string; onSave: (text: string) => Promise<boolean>; onDelete: () => void }) {
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        <InlineTextarea
          id={`update-${id}`}
          ariaLabel="Update text"
          value={text}
          minHeight="min-h-20"
          onCommit={(v) => {
            if (v.trim()) void onSave(v);
          }}
        />
      </div>
      <button
        type="button"
        className="mt-1.5 rounded p-1 text-text-muted hover:bg-surface-muted hover:text-danger"
        aria-label="Delete update"
        title="Delete update"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
