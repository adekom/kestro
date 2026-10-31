"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { formatLongDate } from "@/lib/domain";
import type { StatusDef } from "@/lib/types";
import { NewReportForm } from "./NewReportForm";
import { DeleteReportsDialog } from "./DeleteReportsDialog";

interface ReportRow {
  id: string;
  sequence: number;
  label: string;
  observationCount: number;
  visitDate: string;
  author: string;
}

const COLUMNS: Column<ReportRow>[] = [
  { id: "number", header: "Report Number", weight: 2, cell: (r) => <span className="font-medium text-primary">{r.label}</span>, sortValue: (r) => r.sequence },
  { id: "observations", header: "Observations", weight: 1, cell: (r) => r.observationCount, sortValue: (r) => r.observationCount },
  { id: "visit", header: "Visit Date", weight: 1.5, cell: (r) => formatLongDate(r.visitDate), sortValue: (r) => r.visitDate },
  { id: "author", header: "Author", weight: 2, cell: (r) => r.author, sortValue: (r) => r.author },
];

export function FieldReportsTable({
  projectId,
  rows,
  archived,
  newReport,
}: {
  projectId: string;
  rows: ReportRow[];
  archived: boolean;
  newReport: { sources: Array<{ id: string; label: string }>; statuses: StatusDef[]; resolvedStatusId: string; defaultAuthor: string; nextLabel: string };
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  return (
    <>
      <DataTable
        storageKey="field-reports-v2"
        rows={rows}
        columns={COLUMNS}
        rowId={(r) => r.id}
        filterText={(r) => `${r.label} ${r.author}`}
        filterPlaceholder="Filter field reports"
        onCreate={archived ? undefined : () => setCreating(true)}
        onRowClick={(r) => router.push(`/projects/${projectId}/reports/${r.id}`)}
        initialSort={{ id: "number", dir: "desc" }}
        emptyMessage="No field reports yet."
        selectionActions={(selected) => (
          <button type="button" className="btn btn-danger" onClick={() => setDeleting(selected.map((r) => r.id))}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </button>
        )}
        rowActions={(r) => [{ label: "Delete report", icon: Trash2, danger: true, onSelect: () => setDeleting([r.id]) }]}
      />
      <DeleteReportsDialog
        projectId={projectId}
        reportIds={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => router.refresh()}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title={`Create ${newReport.nextLabel}`} width="max-w-4xl">
        <NewReportForm
          projectId={projectId}
          sources={newReport.sources}
          statuses={newReport.statuses}
          resolvedStatusId={newReport.resolvedStatusId}
          defaultAuthor={newReport.defaultAuthor}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}
