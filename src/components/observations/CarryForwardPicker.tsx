"use client";

import { useState } from "react";
import { addMembershipsAction } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import type { StatusDef } from "@/lib/types";

export interface Candidate {
  id: string;
  number: string;
  title: string;
  statusId: string | null;
}

/** Pick earlier project observations to add to a report (membership only; nothing is copied). */
export function CarryForwardPicker({
  projectId,
  reportId,
  candidates,
  statuses,
  onAdded,
  onCancel,
}: {
  projectId: string;
  reportId: string;
  candidates: Candidate[];
  statuses: StatusDef[];
  onAdded: () => void;
  onCancel: () => void;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = candidates.filter((c) => !q || `${c.number} ${c.title}`.toLowerCase().includes(q));

  if (candidates.length === 0) {
    return <p className="card p-4 text-sm text-text-muted">Every observation in this project is already in this report.</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border">
        <div className="border-b border-border p-3">
          <label htmlFor="obs-lookup" className="sr-only">Search observations</label>
          <input id="obs-lookup" className="input max-w-sm" placeholder="Search by number or title" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-t border-border first:border-t-0">
                <td className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    aria-label={`Add ${c.number} ${c.title}`}
                    checked={selected.has(c.id)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td className="w-16 px-3 py-2 font-medium">{c.number}</td>
                <td className="px-3 py-2">{c.title}</td>
                <td className="px-3 py-2"><StatusBadge status={c.statusId ? statusById.get(c.statusId) : undefined} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || selected.size === 0}
          onClick={async () => {
            setBusy(true);
            // Keep the project's numbering order when adding several at once.
            const ids = candidates.filter((c) => selected.has(c.id)).map((c) => c.id);
            const res = await addMembershipsAction(projectId, reportId, ids);
            setBusy(false);
            if (res.ok) onAdded();
            else setError(res.error);
          }}
        >
          Add {selected.size || ""} to report
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
