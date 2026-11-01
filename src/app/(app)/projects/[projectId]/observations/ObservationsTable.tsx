"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { ObservationSlideOver } from "@/components/observations/ObservationSlideOver";
import { formatLongDate } from "@/lib/domain";
import type { Group, StatusDef } from "@/lib/types";
import type { ObservationRow } from "@/server/services/tables";

/**
 * Every observation in the project, read-only. Observations are created and
 * edited in the context of a field report; "Go to most recent report that includes observation" opens it there.
 */
export function ObservationsTable({
  projectId,
  rows,
  statuses,
  groups,
}: {
  projectId: string;
  rows: ObservationRow[];
  statuses: StatusDef[];
  groups: Group[];
}) {
  const router = useRouter();
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
      // Projects without groups have no Group column.
      ...(groups.length
        ? [{ id: "group", header: "Group", weight: 1.4, cell: (r: ObservationRow) => groupById.get(r.groupId ?? "")?.name ?? "", sortValue: (r: ObservationRow) => groupById.get(r.groupId ?? "")?.order ?? 999 }]
        : []),
      { id: "visit", header: "Visit Date", weight: 1.4, cell: (r) => formatLongDate(r.originalDate), sortValue: (r) => r.originalDate },
    ],
    [statusById, groupById, groups.length],
  );

  return (
    <>
      <DataTable
        storageKey={groups.length ? "observations-v4" : "observations-v4-nogroups"}
        rows={rows}
        columns={columns}
        rowId={(r) => r.id}
        selectable={false}
        filterText={(r) => `${r.number} ${r.title} ${statusById.get(r.statusId ?? "")?.label ?? ""} ${groupById.get(r.groupId ?? "")?.name ?? ""}`}
        filterPlaceholder="Filter observations"
        onRowClick={(r) => setOpenId((id) => (id === r.id ? null : r.id))}
        activeRowId={openId}
        initialSort={{ id: "number", dir: "asc" }}
        emptyMessage="No observations yet. Observations are added in field reports."
        rowActions={(r) => [
          ...(r.latestReportId
            ? [{ label: "Go to most recent report that includes observation", icon: FileText, onSelect: () => router.push(`/projects/${projectId}/reports/${r.latestReportId}?obs=${r.id}`) }]
            : []),
          ...(r.originReportId !== r.latestReportId
            ? [{ label: "Go to report where observation was first added", icon: FileText, onSelect: () => router.push(`/projects/${projectId}/reports/${r.originReportId}?obs=${r.id}`) }]
            : []),
        ]}
      />
      <ObservationSlideOver projectId={projectId} observationId={openId} readOnly onClose={() => setOpenId(null)} />
    </>
  );
}
