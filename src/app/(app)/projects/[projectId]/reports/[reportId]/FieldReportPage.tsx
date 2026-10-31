"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SaveIndicator, SaveStatusProvider } from "@/components/autosave";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { CarryForwardPicker, type Candidate } from "@/components/observations/CarryForwardPicker";
import { NewObservationForm } from "@/components/observations/NewObservationForm";
import { ObservationSlideOver } from "@/components/observations/ObservationSlideOver";
import { photoUrl } from "@/components/observations/PhotoAttachments";
import { formatLongDate, reportLabel } from "@/lib/domain";
import type { ObservationInReport, ReportView } from "@/server/services/reportView";
import type { Contact } from "@/lib/types";
import { Card, ReportInfoPanel } from "./ReportInfoPanel";

/**
 * A field report laid out like the printed report: details, attendance,
 * ongoing work, then one card per observation. Clicking an observation opens
 * the same editor as the Observations table, recording changes in this report.
 */
export function FieldReportPage({
  view,
  contacts,
  previousOngoingWork,
  candidates,
}: {
  view: ReportView;
  contacts: Contact[];
  previousOngoingWork: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const { project, report, settings } = view;
  const [openId, setOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | "carry" | null>(null);
  const statusById = useMemo(() => new Map(settings.statuses.map((s) => [s.id, s])), [settings.statuses]);
  const groups = useMemo(() => [...project.groups].sort((a, b) => a.order - b.order), [project.groups]);
  const pdfUrl = `/api/projects/${project.id}/reports/${report.id}/pdf`;
  const title = reportLabel(project.reportPrefix, report.sequence);
  const closeModal = () => setModal(null);
  const afterChange = () => {
    setModal(null);
    router.refresh();
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
      <div className="flex shrink-0 items-center gap-4 border-b border-border bg-surface px-6 py-3">
        <div className="min-w-0">
          <Link href={`/projects/${project.id}/reports`} className="link text-xs">← Field Reports</Link>
          <h1 className="text-xl font-semibold">
            {title}
            <span className="ml-3 text-base font-normal text-text-muted">{formatLongDate(report.visitDate)}</span>
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator />
          <a className="btn" href={pdfUrl} target="_blank" rel="noopener">Preview PDF</a>
          <a className="btn btn-primary" href={`${pdfUrl}?download=1`}>Export PDF</a>
        </div>
      </div>

      <main className="page">
        <div className="w-full max-w-4xl space-y-4">
          <ReportInfoPanel view={view} contacts={contacts} previousOngoingWork={previousOngoingWork} />

          <Card
            title={`Observations (${view.observations.length})`}
            actions={
              !project.archived && (
                <>
                  <button type="button" className="btn" onClick={() => setModal("carry")} disabled={candidates.length === 0}>
                    Carry forward
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setModal("new")}>Add observation</button>
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
                    {section.title && <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{section.title}</h3>}
                    {section.items.map((o) => (
                      <ObservationCard
                        key={o.observation.id}
                        projectId={project.id}
                        item={o}
                        reportId={report.id}
                        status={statusById.get(o.statusId ?? "")}
                        active={openId === o.observation.id}
                        onOpen={() => setOpenId(o.observation.id)}
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
      <Modal open={modal === "carry"} onClose={closeModal} title={`Carry observations into ${title}`} width="max-w-3xl">
        <CarryForwardPicker
          projectId={project.id}
          reportId={report.id}
          candidates={candidates}
          statuses={settings.statuses}
          onCancel={closeModal}
          onAdded={afterChange}
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
}: {
  projectId: string;
  item: ObservationInReport;
  reportId: string;
  status: Parameters<typeof StatusBadge>[0]["status"];
  active: boolean;
  onOpen: () => void;
}) {
  const o = item.observation;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`block w-full rounded-md border p-4 text-left transition-colors ${
        active ? "border-primary bg-primary-subtle" : "border-border bg-surface hover:border-primary/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 font-semibold">{item.number}</span>
        <span className="min-w-0 flex-1 font-semibold">{o.title}</span>
        <StatusBadge status={status} />
      </div>
      {o.description && <p className="mt-2 text-sm whitespace-pre-wrap">{o.description}</p>}
      {item.updates.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-border pl-3 text-sm">
          {item.updates.map((u) => (
            <li key={u.id}>
              <span className={`font-medium ${u.reportId === reportId ? "text-primary-hover" : "text-text-muted"}`}>{formatLongDate(u.date)}:</span>{" "}
              {u.text}
            </li>
          ))}
        </ul>
      )}
      {item.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.attachments.map((a) => (
            <figure key={a.id} className="w-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(projectId, a.photoId)} alt={a.caption || a.photo.fileName} className="aspect-[4/3] w-full rounded object-cover" loading="lazy" />
              {a.caption && <figcaption className="mt-0.5 truncate text-xs text-text-muted">{a.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
    </button>
  );
}
