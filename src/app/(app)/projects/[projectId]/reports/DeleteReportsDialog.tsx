"use client";

import { useEffect, useState } from "react";
import { deleteReportsAction, previewReportDeletionAction } from "@/app/actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { DeletionPreview } from "@/server/services/reportDeletion";

/**
 * Confirms deleting field reports, showing beforehand exactly what changes:
 * which reports and observations are renumbered, and which observations are
 * removed. Nothing changes until the user confirms.
 */
export function DeleteReportsDialog({
  projectId,
  reportIds,
  onClose,
  onDeleted,
}: {
  projectId: string;
  reportIds: string[] | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!reportIds?.length) return;
    let cancelled = false;
    previewReportDeletionAction(projectId, reportIds).then((res) => {
      if (cancelled) return;
      if (res.ok) setPreview(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, reportIds]);

  const count = reportIds?.length ?? 0;
  return (
    <ConfirmDialog
      open={count > 0}
      title={count > 1 ? `Delete ${count} field reports?` : "Delete field report?"}
      confirmLabel="Delete"
      danger
      onClose={onClose}
      onConfirm={async () => {
        if (!preview) return error ?? "Still preparing the preview. Try again in a moment.";
        const res = await deleteReportsAction(projectId, reportIds ?? []);
        if (!res.ok) return res.error;
        onDeleted();
        return null;
      }}
    >
      {error && <p className="text-danger">{error}</p>}
      {!preview && !error && <p className="text-text-muted">Working out what will change…</p>}
      {preview && (
        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          <p>
            <span className="font-medium">{preview.deleting.join(", ")}</span> will be deleted. Updates, status changes and photos
            recorded during {count > 1 ? "those visits" : "that visit"} will no longer appear anywhere. This can’t be undone in Kestro.
          </p>
          {preview.renumbered.length > 0 && (
            <Section title="Reports renumbered">
              {preview.renumbered.map((r) => <li key={r.from}>{r.from} → {r.to}</li>)}
            </Section>
          )}
          {preview.observationChanges.length > 0 && (
            <Section title="Observation numbers changing">
              {preview.observationChanges.map((c) => (
                <li key={c.from}>
                  {c.from} → {c.to} <span className="text-text-muted">{c.title}</span>
                </li>
              ))}
            </Section>
          )}
          {preview.removedObservations.length > 0 && (
            <Section title="Observations removed (not in any other report)">
              {preview.removedObservations.map((o) => (
                <li key={o.number}>
                  {o.number} <span className="text-text-muted">{o.title}</span>
                </li>
              ))}
            </Section>
          )}
          <p className="rounded-md bg-surface-muted p-3 text-text-muted">
            PDFs that were already downloaded don’t change and will still show the old numbers.
          </p>
        </div>
      )}
    </ConfirmDialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5">{children}</ul>
    </div>
  );
}
