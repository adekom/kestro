"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/StatusBadge";
import { NewObservationForm } from "@/components/observations/NewObservationForm";
import { ObservationSlideOver } from "@/components/observations/ObservationSlideOver";
import { formatLongDate } from "@/lib/domain";
import type { Group, StatusDef } from "@/lib/types";
import type { ObservationRow } from "@/server/services/tables";

export function ObservationsTable({
  projectId,
  rows,
  statuses,
  resolvedStatusId,
  groups,
  reports,
  archived,
}: {
  projectId: string;
  rows: ObservationRow[];
  statuses: StatusDef[];
  resolvedStatusId: string;
  groups: Group[];
  reports: Array<{ id: string; label: string }>;
  archived: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const columns = useMemo<Column<ObservationRow>[]>(
    () => [
      { id: "number", header: "#", weight: 0.6, cell: (r) => <span className="font-medium">{r.number}</span>, sortValue: (r) => r.number },
      { id: "name", header: "Name", weight: 4, cell: (r) => r.title, sortValue: (r) => r.title },
      {
        id: "status",
        header: "Status",
        weight: 1.4,
        cell: (r) => <StatusBadge status={r.statusId ? statusById.get(r.statusId) : undefined} />,
        // Sort by the configured status order, not alphabetically.
        sortValue: (r) => statusById.get(r.statusId ?? "")?.order ?? 999,
      },
      { id: "group", header: "Group", weight: 1.4, cell: (r) => groupById.get(r.groupId ?? "")?.name ?? "", sortValue: (r) => groupById.get(r.groupId ?? "")?.order ?? 999 },
      { id: "created", header: "Date Created", weight: 1.4, cell: (r) => formatLongDate(r.originalDate), sortValue: (r) => r.originalDate },
    ],
    [statusById, groupById],
  );

  return (
    <>
      <DataTable
        storageKey="observations-v2"
        rows={rows}
        columns={columns}
        rowId={(r) => r.id}
        filterText={(r) => `${r.number} ${r.title} ${statusById.get(r.statusId ?? "")?.label ?? ""} ${groupById.get(r.groupId ?? "")?.name ?? ""}`}
        filterPlaceholder="Filter observations"
        onCreate={archived || reports.length === 0 ? undefined : () => setCreating(true)}
        onRowClick={(r) => setOpenId((id) => (id === r.id ? null : r.id))}
        activeRowId={openId}
        initialSort={{ id: "number", dir: "asc" }}
        emptyMessage={reports.length ? "No observations yet." : "Create a field report first; observations are recorded in reports."}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title="Create observation">
        <NewObservationForm
          projectId={projectId}
          reports={reports}
          statuses={statuses}
          resolvedStatusId={resolvedStatusId}
          groups={groups}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      </Modal>
      <ObservationSlideOver projectId={projectId} observationId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
