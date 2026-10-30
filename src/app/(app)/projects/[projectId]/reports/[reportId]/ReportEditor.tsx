"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { addMembershipsAction, createObservationAction, reorderMembershipsAction } from "@/app/actions";
import { SaveIndicator, SaveStatusProvider } from "@/components/autosave";
import { reportLabel } from "@/lib/domain";
import type { ReportView } from "@/server/services/reportView";
import type { Contact, Photo } from "@/lib/types";
import { ReportInfoPanel } from "./ReportInfoPanel";
import { ObservationPanel, type ObservationDraft } from "./ObservationPanel";
import { LibraryPanel } from "./LibraryPanel";

export type Tab = "info" | "obs" | "photos";

export interface EditorProps {
  view: ReportView;
  contacts: Contact[];
  library: Photo[];
  addable: Array<{ id: string; number: string; title: string }>;
  previousOngoingWork: string;
  initialTab: Tab;
  initialObservationId: string | null;
}

export function ReportEditor(props: EditorProps) {
  return (
    <SaveStatusProvider>
      <Editor {...props} />
    </SaveStatusProvider>
  );
}

function Editor({ view, contacts, library, addable, previousOngoingWork, initialTab, initialObservationId }: EditorProps) {
  const { project, report, settings } = view;
  const pid = project.id;
  const rid = report.id;
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(initialObservationId);
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});
  // Latest saved observation edits, so reopening an observation never starts from stale server props.
  const obsCache = useRef(new Map<string, ObservationDraft>());
  const [query, setQuery] = useState("");

  // Keep the URL shareable without a server round-trip on every click.
  const navigate = (next: Tab, oid: string | null = selectedId) => {
    setTabState(next);
    setSelectedId(oid);
    const params = new URLSearchParams({ tab: next, ...(next === "obs" && oid ? { obs: oid } : {}) });
    window.history.replaceState(null, "", `?${params}`);
  };

  const statusById = useMemo(() => new Map(settings.statuses.map((s) => [s.id, s])), [settings.statuses]);
  const groupById = useMemo(() => new Map(project.groups.map((g) => [g.id, g])), [project.groups]);
  const q = query.trim().toLowerCase();
  const visible = view.observations.filter(
    (o) => !q || `${o.number} ${titleOverrides[o.observation.id] ?? o.observation.title}`.toLowerCase().includes(q),
  );
  const selected = view.observations.find((o) => o.observation.id === selectedId) ?? null;
  const pdfUrl = `/api/projects/${pid}/reports/${rid}/pdf`;

  const move = async (index: number, delta: number) => {
    const ids = view.observations.map((o) => o.observation.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    await reorderMembershipsAction(pid, rid, ids);
  };

  // Group headings in the list mirror the PDF; ungrouped reports show a flat list.
  const showGroups = project.groups.length > 0 && view.observations.some((o) => o.observation.groupId);
  let lastGroup: string | null | undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2">
        <div className="min-w-0">
          <Link href={`/projects/${pid}`} className="link block truncate text-xs">{project.name}</Link>
          <h1 className="text-base font-semibold">
            {reportLabel(project.reportPrefix, report.sequence)}
            <span className="ml-2 font-normal text-text-muted">{report.visitDate}</span>
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator />
          <a className="btn" href={pdfUrl} target="_blank" rel="noopener">Preview PDF</a>
          <a className="btn btn-primary" href={`${pdfUrl}?download=1`}>Export PDF</a>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-surface" aria-label="Report navigation">
          <nav className="flex flex-col gap-0.5 border-b border-border p-2 text-sm">
            <TabButton active={tab === "info"} onClick={() => navigate("info")}>Report information</TabButton>
            <TabButton active={tab === "photos"} onClick={() => navigate("photos")}>Project photos</TabButton>
          </nav>
          <div className="flex items-center gap-2 p-2">
            <h2 className="mr-auto px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Observations ({view.observations.length})
            </h2>
          </div>
          <div className="px-2 pb-2">
            <label htmlFor="obs-search" className="sr-only">Search observations</label>
            <input id="obs-search" className="input" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto pb-2 text-sm">
            {visible.map((o) => {
              const index = view.observations.indexOf(o);
              const groupId = o.observation.groupId ?? null;
              const heading = showGroups && groupId !== lastGroup ? (groupById.get(groupId ?? "")?.name ?? "General") : null;
              lastGroup = groupId;
              const active = tab === "obs" && o.observation.id === selectedId;
              return (
                <li key={o.observation.id}>
                  {heading && <div className="px-3 pt-2 text-xs font-semibold text-text-muted">{heading}</div>}
                  <div className={`group flex items-center gap-1 px-2 ${active ? "bg-primary-subtle" : "hover:bg-surface-muted"}`}>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                      aria-current={active ? "true" : undefined}
                      onClick={() => navigate("obs", o.observation.id)}
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: statusById.get(o.statusId ?? "")?.color ?? "transparent" }}
                      />
                      <span className="w-10 shrink-0 font-medium">{o.number}</span>
                      <span className="truncate">{titleOverrides[o.observation.id] ?? o.observation.title}</span>
                      <span className="sr-only">, {statusById.get(o.statusId ?? "")?.label ?? "No status"}</span>
                    </button>
                    {!q && (
                      <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                        <button type="button" className="px-1 text-text-muted hover:text-text disabled:invisible" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${o.number} up`}>↑</button>
                        <button type="button" className="px-1 text-text-muted hover:text-text disabled:invisible" disabled={index === view.observations.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${o.number} down`}>↓</button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <AddObservation
            pid={pid}
            rid={rid}
            view={view}
            addable={addable}
            onCreated={(oid) => navigate("obs", oid)}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {/* Stays mounted so unsaved edits and the version counter survive tab switches. */}
          <div hidden={tab !== "info"}>
            <ReportInfoPanel view={view} contacts={contacts} previousOngoingWork={previousOngoingWork} />
          </div>
          {tab === "photos" && <LibraryPanel projectId={pid} library={library} />}
          {tab === "obs" &&
            (selected ? (
              <ObservationPanel
                key={selected.observation.id}
                view={view}
                item={selected}
                library={library}
                statusById={statusById}
                cache={obsCache.current}
                onTitleChange={(t) => setTitleOverrides((m) => ({ ...m, [selected.observation.id]: t }))}
                onRemoved={() => navigate("info", null)}
              />
            ) : (
              <p className="text-sm text-text-muted">Select or add an observation.</p>
            ))}
        </main>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 text-left ${active ? "bg-primary-subtle font-medium text-primary-hover" : "hover:bg-surface-muted"}`}
    >
      {children}
    </button>
  );
}

function AddObservation({
  pid,
  rid,
  view,
  addable,
  onCreated,
}: {
  pid: string;
  rid: string;
  view: ReportView;
  addable: EditorProps["addable"];
  onCreated: (oid: string) => void;
}) {
  const { settings, project } = view;
  const defaultStatus = settings.statuses.find((s) => s.id !== settings.resolvedStatusId)?.id ?? settings.statuses[0]?.id ?? "";
  const [mode, setMode] = useState<"closed" | "new" | "existing">("closed");
  const [title, setTitle] = useState("");
  const [statusId, setStatusId] = useState(defaultStatus);
  const [groupId, setGroupId] = useState("");
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (mode === "closed") {
    return (
      <div className="flex gap-2 border-t border-border p-2">
        <button type="button" className="btn btn-primary flex-1 justify-center" onClick={() => setMode("new")}>Add observation</button>
        <button type="button" className="btn flex-1 justify-center" onClick={() => setMode("existing")} disabled={addable.length === 0}>
          Carry forward
        </button>
      </div>
    );
  }

  if (mode === "existing") {
    const q = lookup.trim().toLowerCase();
    const matches = addable.filter((a) => !q || `${a.number} ${a.title}`.toLowerCase().includes(q)).slice(0, 20);
    return (
      <div className="space-y-2 border-t border-border p-2">
        <label className="label" htmlFor="add-existing">Add an existing project observation</label>
        <input id="add-existing" className="input" autoFocus placeholder="Search by number or title" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        <ul className="max-h-48 overflow-y-auto text-sm">
          {matches.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left hover:bg-surface-muted"
                onClick={async () => {
                  const res = await addMembershipsAction(pid, rid, [a.id]);
                  if (res.ok) {
                    setMode("closed");
                    onCreated(a.id);
                  } else setError(res.error);
                }}
              >
                <span className="mr-2 font-medium">{a.number}</span>
                {a.title}
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
        <button type="button" className="btn" onClick={() => setMode("closed")}>Cancel</button>
      </div>
    );
  }

  return (
    <form
      className="space-y-2 border-t border-border p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await createObservationAction(pid, rid, { title, description: "", statusId, groupId: groupId || null });
        if (!res.ok) return setError(res.error);
        setTitle("");
        setMode("closed");
        onCreated(res.data);
      }}
    >
      <div>
        <label className="label" htmlFor="new-obs-title">Title</label>
        <input id="new-obs-title" className="input" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor="new-obs-status">Status</label>
          <select id="new-obs-status" className="input" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            {settings.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        {project.groups.length > 0 && (
          <div className="flex-1">
            <label className="label" htmlFor="new-obs-group">Group</label>
            <select id="new-obs-group" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">None</option>
              {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary">Add</button>
        <button type="button" className="btn" onClick={() => setMode("closed")}>Cancel</button>
      </div>
    </form>
  );
}

