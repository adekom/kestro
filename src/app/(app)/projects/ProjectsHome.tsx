"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { setProjectsArchivedAction } from "@/app/actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { formatLongDate } from "@/lib/domain";
import type { Contact } from "@/lib/types";
import { NewProjectForm } from "./NewProjectForm";

export interface ProjectRow {
  id: string;
  name: string;
  code: string;
  address: string;
  reportCount: number;
  createdAt: string;
  archived: boolean;
  mine: boolean;
}

type View = "mine" | "all" | "archived";

const COLUMNS: Column<ProjectRow>[] = [
  { id: "name", header: "Name", weight: 3, cell: (r) => <span className="font-medium text-primary">{r.name}</span>, sortValue: (r) => r.name },
  { id: "code", header: "Number", weight: 1, cell: (r) => r.code, sortValue: (r) => r.code },
  { id: "address", header: "Address", weight: 3, cell: (r) => r.address, sortValue: (r) => r.address },
  { id: "reports", header: "Field reports", weight: 1, cell: (r) => r.reportCount, sortValue: (r) => r.reportCount },
  { id: "created", header: "Created on", weight: 1.5, cell: (r) => formatLongDate(r.createdAt.slice(0, 10)), sortValue: (r) => r.createdAt },
];

export function ProjectsHome({
  firstName,
  rows,
  contacts,
  currentContactId,
}: {
  firstName: string;
  rows: ProjectRow[];
  contacts: Contact[];
  currentContactId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(rows.some((r) => r.mine && !r.archived) ? "mine" : "all");
  const [creating, setCreating] = useState(false);
  // Projects awaiting confirmation to archive (or, on the Archived tab, restore).
  const [changing, setChanging] = useState<ProjectRow[] | null>(null);
  const restoring = view === "archived";
  const shown = rows.filter((r) => (view === "archived" ? r.archived : !r.archived && (view === "all" || r.mine)));
  const count = (v: View) => rows.filter((r) => (v === "archived" ? r.archived : !r.archived && (v === "all" || r.mine))).length;

  return (
    <main className="page">
      <div>
        <h1 className="page-title">Welcome, {firstName}</h1>
        <p className="text-sm text-text-muted">Choose a project to work on.</p>
      </div>
      <div role="tablist" aria-label="Which projects" className="flex gap-6 border-b border-border text-sm">
        {(
          [
            ["mine", "My projects"],
            ["all", "All projects"],
            ["archived", "Archived"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`-mb-px border-b-2 px-1 pb-2 ${view === v ? "border-primary font-medium text-text" : "border-transparent text-text-muted hover:text-text"}`}
          >
            {label} <span className="text-text-muted">({count(v)})</span>
          </button>
        ))}
      </div>
      <DataTable
        storageKey="projects"
        rows={shown}
        columns={COLUMNS}
        rowId={(r) => r.id}
        filterText={(r) => `${r.name} ${r.code} ${r.address}`}
        filterPlaceholder="Filter projects"
        onCreate={() => setCreating(true)}
        createLabel="Create project"
        onRowClick={(r) => router.push(`/projects/${r.id}/reports`)}
        initialSort={{ id: "name", dir: "asc" }}
        selectionActions={(selected) => (
          <button type="button" className="btn" onClick={() => setChanging(selected)}>
            {restoring ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
            {restoring ? "Restore" : "Archive"}
          </button>
        )}
        rowActions={(r) => [
          r.archived
            ? { label: "Restore project", icon: ArchiveRestore, onSelect: () => setChanging([r]) }
            : { label: "Archive project", icon: Archive, onSelect: () => setChanging([r]) },
        ]}
        emptyMessage={view === "mine" ? "You aren't listed as a contact on any project yet." : "No projects."}
      />
      <ConfirmDialog
        open={Boolean(changing)}
        title={`${restoring ? "Restore" : "Archive"} ${changing && changing.length > 1 ? `${changing.length} projects` : "project"}?`}
        confirmLabel={restoring ? "Restore" : "Archive"}
        onClose={() => setChanging(null)}
        onConfirm={async () => {
          const res = await setProjectsArchivedAction((changing ?? []).map((p) => p.id), !restoring);
          if (!res.ok) return res.error;
          router.refresh();
          return null;
        }}
      >
        {changing && changing.length === 1 ? (
          <p>
            <span className="font-medium">{changing[0].name}</span>{" "}
            {restoring ? "will return to the active project list." : "will move to the Archived tab."}
          </p>
        ) : (
          <>
            <p>{restoring ? "These projects will return to the active list:" : "These projects will move to the Archived tab:"}</p>
            <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5">
              {changing?.map((p) => <li key={p.id}>{p.name}</li>)}
            </ul>
          </>
        )}
        {!restoring && <p className="mt-2 text-text-muted">Nothing is deleted. Archived projects can be restored at any time.</p>}
      </ConfirmDialog>
      <Modal open={creating} onClose={() => setCreating(false)} title="Create project" width="max-w-3xl">
        <NewProjectForm
          contacts={contacts}
          currentContactId={currentContactId}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      </Modal>
    </main>
  );
}
