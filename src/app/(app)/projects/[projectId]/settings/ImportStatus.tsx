"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { ImportProjectWizard } from "@/app/(app)/projects/ImportProjectWizard";
import { formatLongDate } from "@/lib/domain";
import type { StatusDef } from "@/lib/types";

/**
 * For a project created by an import: how complete it is, resume uploading
 * photos that are missing (after an interruption), or undo the import.
 */
export function ImportStatus({
  projectId,
  projectName,
  batchId,
  createdAt,
  photosImported,
  photosPlanned,
  statuses,
}: {
  projectId: string;
  projectName: string;
  batchId: string;
  createdAt: string;
  photosImported: number;
  photosPlanned: number;
  statuses: StatusDef[];
}) {
  const router = useRouter();
  const [resuming, setResuming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const missing = Math.max(0, photosPlanned - photosImported);
  return (
    <section className="card space-y-3 p-4" aria-labelledby="import-heading">
      <h2 id="import-heading" className="field-inset text-sm font-semibold">Imported from ArchiSnapper</h2>
      <p className="field-inset text-sm">
        Imported on {formatLongDate(createdAt.slice(0, 10))}. {photosImported} of {photosPlanned} photos added.
      </p>
      {missing > 0 && (
        <p className="field-inset text-sm text-warning">
          {missing} photo{missing === 1 ? " is" : "s are"} missing, probably because the import was interrupted. Resume to add {missing === 1 ? "it" : "them"}.
        </p>
      )}
      <div className="field-inset flex flex-wrap gap-2">
        {missing > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => setResuming(true)}>
            <RotateCw className="h-4 w-4" aria-hidden /> Resume import
          </button>
        )}
        <button type="button" className="btn btn-danger" onClick={() => setUndoing(true)}>
          <Undo2 className="h-4 w-4" aria-hidden /> Undo import
        </button>
      </div>
      <Modal open={resuming} onClose={() => setResuming(false)} title={`Resume import of ${projectName}`} width="max-w-4xl" dismissible={false}>
        {resuming && (
          <ImportProjectWizard
            statuses={statuses}
            resume={{ batchId, projectId, projectName }}
            onClose={() => {
              setResuming(false);
              router.refresh();
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={undoing}
        title="Undo this import?"
        confirmLabel="Undo import"
        danger
        onClose={() => setUndoing(false)}
        onConfirm={async () => {
          try {
            const res = await fetch(`/api/import/${batchId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo" }) });
            if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The import couldn't be undone. Please try again.";
          } catch {
            return "Kestro couldn't be reached. Check your connection and try again.";
          }
          router.push("/projects");
          router.refresh();
          return null;
        }}
      >
        <p>
          <span className="font-medium">{projectName}</span> and all its reports and photos will be deleted. Contacts the import added are
          removed (unless another project uses them), and contacts it updated get their earlier details back. This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </section>
  );
}
