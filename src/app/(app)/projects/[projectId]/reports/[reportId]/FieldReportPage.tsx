"use client";

import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, Download, Eye, Plus } from "lucide-react";
import { moveObservationAction } from "@/app/actions";
import { moveTarget } from "@/lib/reportOrder";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SaveIndicator, SaveStatusProvider } from "@/components/autosave";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { NewObservationForm } from "@/components/observations/NewObservationForm";
import { ObservationSlideOver } from "@/components/observations/ObservationSlideOver";
import { attachmentUrl } from "@/components/observations/PhotoAttachments";
import { formatLongDate, reportLabel, statusOn } from "@/lib/domain";
import { cropPosition } from "@/lib/markup";
import type { ObservationInReport, ReportView } from "@/server/services/reportView";
import type { Contact, StatusDef } from "@/lib/types";
import { Card, ReportInfoPanel } from "./ReportInfoPanel";

/**
 * A field report laid out like the printed report: details, attendance,
 * ongoing work, then one card per observation. Clicking an observation opens
 * the same editor as the Observations table, recording changes in this report.
 */
export function FieldReportPage({
  view,
  contacts,
  initialOpenId = null,
}: {
  view: ReportView;
  contacts: Contact[];
  /** Observation whose panel opens on arrival (from "Go to Report"). */
  initialOpenId?: string | null;
}) {
  const router = useRouter();
  const { project, report, settings } = view;
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [modal, setModal] = useState<"new" | null>(null);
  const statusById = useMemo(() => new Map(settings.statuses.map((s) => [s.id, s])), [settings.statuses]);
  const groups = useMemo(() => [...project.groups].sort((a, b) => a.order - b.order), [project.groups]);
  const pdfUrl = `/api/projects/${project.id}/reports/${report.id}/pdf`;
  const title = reportLabel(project.reportPrefix, report.sequence);
  const closeModal = () => setModal(null);
  const afterChange = () => {
    setModal(null);
    router.refresh();
  };

  // Up/down for this report's own observations, never past earlier reports' ones.
  const orderItems = view.observations.map((o) => ({
    observationId: o.observation.id,
    originReportId: o.observation.originReportId,
    originLocalSeq: o.observation.originLocalSeq,
    originSequence: 0,
    groupId: o.observation.groupId ?? null,
    order: o.order,
  }));
  const moveControls = (o: ObservationInReport) => {
    if (project.archived || o.observation.originReportId !== report.id) return undefined;
    const go = (direction: -1 | 1) =>
      moveTarget(orderItems, report.id, o.observation.id, direction)
        ? async () => {
            const res = await moveObservationAction(project.id, report.id, o.observation.id, direction);
            if (res.ok) router.refresh();
            else window.alert(res.error);
          }
        : null;
    return { up: go(-1), down: go(1) };
  };

  // Group headings follow the PDF; reports without groups list observations plainly.
  const sections = useMemo(() => {
    const grouped = groups.length > 0 && view.observations.some((o) => o.observation.groupId);
    if (!grouped) return [{ title: null as string | null, items: view.observations }];
    const known = new Set(groups.map((g) => g.id));
    const out = groups.map((g) => ({ title: g.name as string | null, items: view.observations.filter((o) => o.observation.groupId === g.id) }));
    out.push({ title: "General", items: view.observations.filter((o) => !o.observation.groupId || !known.has(o.observation.groupId)) });
    return out.filter((s) => s.items.length);
  }, [groups, view.observations]);

  return (
    <SaveStatusProvider>
      <div className="flex shrink-0 items-center gap-4 border-b border-border bg-surface py-5 pr-10 pl-6">
        <div className="min-w-0">
          <Link href={`/projects/${project.id}/reports`} className="link inline-flex items-center gap-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Field Reports
          </Link>
          <h1 className="page-title">
            {title}
            <span className="ml-3 text-base font-normal text-text-muted">{formatLongDate(report.visitDate)}</span>
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator />
          <a className="btn" href={pdfUrl} target="_blank" rel="noopener">
            <Eye className="h-4 w-4" aria-hidden /> Preview PDF
          </a>
          <a className="btn btn-primary" href={`${pdfUrl}?download=1`}>
            <Download className="h-4 w-4" aria-hidden /> Export PDF
          </a>
        </div>
      </div>

      <main className="page">
        <div className="w-full max-w-4xl space-y-4">
          <ReportInfoPanel view={view} contacts={contacts} />

          <Card
            title={`Observations (${view.observations.length})`}
            actions={
              !project.archived && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => setModal("new")}>
                    <Plus className="h-4 w-4" aria-hidden /> Add observation
                  </button>
                </>
              )
            }
          >
            {view.observations.length === 0 ? (
              <p className="text-sm text-text-muted">No observations in this report yet.</p>
            ) : (
              <div className="space-y-5">
                {sections.map((section) => (
                  <div key={section.title ?? "all"} className="space-y-3">
                    {section.title && <h3 className="field-inset text-xs font-semibold tracking-wide text-text-muted uppercase">{section.title}</h3>}
                    {section.items.map((o) => (
                      <ObservationCard
                        key={o.observation.id}
                        projectId={project.id}
                        item={o}
                        reportId={report.id}
                        status={statusById.get(o.statusId ?? "")}
                        active={openId === o.observation.id}
                        onOpen={() => setOpenId((id) => (id === o.observation.id ? null : o.observation.id))}
                        move={moveControls(o)}
                        statusById={statusById}
                        updateLabel={(u) => {
                          const seq = view.reportSequences[u.reportId];
                          return seq ? `${formatLongDate(u.date)} · ${reportLabel(project.reportPrefix, seq)}` : formatLongDate(u.date);
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>

      <Modal open={modal === "new"} onClose={closeModal} title={`Add observation to ${title}`}>
        <NewObservationForm
          projectId={project.id}
          reportId={report.id}
          statuses={settings.statuses}
          resolvedStatusId={settings.resolvedStatusId}
          groups={groups}
          onCancel={closeModal}
          onCreated={afterChange}
        />
      </Modal>
      <ObservationSlideOver projectId={project.id} observationId={openId} reportId={report.id} onClose={() => setOpenId(null)} />
    </SaveStatusProvider>
  );
}

function ObservationCard({
  projectId,
  item,
  reportId,
  status,
  active,
  onOpen,
  move,
  statusById,
  updateLabel,
}: {
  projectId: string;
  item: ObservationInReport;
  reportId: string;
  status: Parameters<typeof StatusBadge>[0]["status"];
  active: boolean;
  onOpen: () => void;
  /** Present only for this report's own observations. */
  move?: { up: (() => void) | null; down: (() => void) | null };
  statusById: ReadonlyMap<string, StatusDef>;
  updateLabel: (u: ObservationInReport["updates"][number]) => string;
}) {
  const o = item.observation;
  return (
    <div className="flex items-start gap-2">
    <button
      type="button"
      data-slideover-trigger=""
      onClick={onOpen}
      className={`block min-w-0 flex-1 rounded-md border py-4 pr-4 pl-3 text-left transition-colors ${
        active ? "border-primary bg-primary-subtle" : "border-border bg-surface hover:border-primary/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 font-semibold">{item.number}</span>
        <span className="min-w-0 flex-1 font-semibold">{o.title}</span>
        <StatusBadge status={status} />
      </div>
      <div className="text-xs text-text-muted">{formatLongDate(o.originalDate)}</div>
      {o.description && <p className="mt-2 text-sm whitespace-pre-wrap">{o.description}</p>}
      {item.updates.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">Updates</h4>
          <ol>
            {item.updates.map((u, i) => {
              const color = statusById.get(statusOn(item.statusEvents, u.date) ?? "")?.color;
              const last = i === item.updates.length - 1;
              return (
                <li key={u.id} className="relative pb-3 text-sm last:pb-0">
                  {!last && <span aria-hidden className="absolute top-3.5 bottom-0 -left-[7px] w-px bg-border" />}
                  <span
                    aria-hidden
                    className="absolute top-1 -left-[11px] h-2.5 w-2.5 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: color ?? "var(--color-surface)" }}
                  />
                  <div className={`text-xs font-semibold ${u.reportId === reportId ? "text-primary-hover" : "text-text-muted"}`}>{updateLabel(u)}</div>
                  <p className="whitespace-pre-wrap">{u.text}</p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {item.attachments.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">Photos</h4>
          <div className="flex flex-wrap gap-2">
          {item.attachments.map((a) => (
            <figure key={a.id} className="w-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachmentUrl(projectId, a)} alt={a.caption || a.photo.fileName} className="aspect-square w-full rounded object-cover" style={{ objectPosition: cropPosition(a.markup) }} loading="lazy" />
              <figcaption className="mt-1 text-xs">
                <span className="block font-semibold text-text-muted">{shortDate(a.date)}</span>
                {a.caption && <span className="block">{a.caption}</span>}
              </figcaption>
            </figure>
          ))}
          </div>
        </div>
      )}
    </button>
      {/* Reserved for every card so they line up, own or carried. */}
      <div className="flex w-7 shrink-0 flex-col items-center gap-0.5 pt-3">
        {move && (
          <>
            <button
              type="button"
              className="rounded p-0.5 text-text-muted hover:bg-surface-muted hover:text-text disabled:invisible"
              disabled={!move.up}
              onClick={move.up ?? undefined}
              aria-label={`Move ${item.number} up`}
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-text-muted hover:bg-surface-muted hover:text-text disabled:invisible"
              disabled={!move.down}
              onClick={move.down ?? undefined}
              aria-label={`Move ${item.number} down`}
              title="Move down"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** "07/28/26" */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y.slice(2)}` : iso;
}
