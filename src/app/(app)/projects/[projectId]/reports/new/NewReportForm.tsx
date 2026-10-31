"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { carryForwardCandidatesAction, createReportAction } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import type { StatusDef } from "@/lib/types";

interface Candidate {
  observationId: string;
  number: string;
  title: string;
  statusId: string | null;
  preselected: boolean;
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const nowTime = () => new Date().toTimeString().slice(0, 5); // HH:MM in local time

/**
 * Carry-forward (spec §6): defaults to the most recent report, preselecting
 * observations that were not resolved as of that visit. "Start empty" skips it.
 */
export function NewReportForm({
  projectId,
  sources,
  statuses,
  resolvedStatusId,
  defaultAuthor,
}: {
  projectId: string;
  sources: Array<{ id: string; label: string }>;
  statuses: StatusDef[];
  resolvedStatusId: string;
  defaultAuthor: string;
}) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState<string>(sources[0]?.id ?? "");
  // Filled in the browser: the server's clock may be in another time zone.
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  useEffect(() => {
    setVisitDate(today());
    setVisitTime(nowTime());
  }, []);
  const [authorName, setAuthorName] = useState(defaultAuthor);
  const [fromSource, setFromSource] = useState<Candidate[]>([]);
  const [older, setOlder] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lookup, setLookup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  useEffect(() => {
    setFromSource([]);
    setOlder([]);
    setSelected(new Set());
    if (!sourceId) return;
    let cancelled = false;
    setLoading(true);
    carryForwardCandidatesAction(projectId, sourceId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) return setError(res.error);
      setFromSource(res.data.fromSource);
      setOlder(res.data.older);
      setSelected(new Set(res.data.fromSource.filter((c) => c.preselected).map((c) => c.observationId)));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, sourceId]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const q = lookup.trim().toLowerCase();
  const olderMatches = q ? older.filter((c) => `${c.number} ${c.title}`.toLowerCase().includes(q)).slice(0, 30) : [];
  const recovered = older.filter((c) => selected.has(c.observationId));

  async function submit() {
    setBusy(true);
    setError(null);
    const ordered = [...fromSource, ...recovered].map((c) => c.observationId).filter((id) => selected.has(id));
    const res = await createReportAction(projectId, {
      visitDate,
      visitTime,
      authorName,
      sourceReportId: sourceId || null,
      observationIds: ordered,
    });
    setBusy(false);
    if (res.ok) router.push(`/projects/${projectId}/reports/${res.data}?tab=info`);
    else setError(res.error);
  }

  const row = (c: Candidate) => (
    <tr key={c.observationId} className="border-t border-border">
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          className="accent-primary"
          checked={selected.has(c.observationId)}
          onChange={() => toggle(c.observationId)}
          aria-label={`Include ${c.number} ${c.title}`}
        />
      </td>
      <td className="px-3 py-1.5 font-medium">{c.number}</td>
      <td className="px-3 py-1.5">{c.title}</td>
      <td className="px-3 py-1.5">
        <StatusBadge status={c.statusId ? statusById.get(c.statusId) : undefined} />
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <section className="card grid grid-cols-4 gap-3 p-4">
        <div className="col-span-2">
          <label className="label" htmlFor="source">Start from</label>
          <select id="source" className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
            <option value="">Start empty</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="visit-date">Visit date</label>
          <input id="visit-date" type="date" className="input" required value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="visit-time">Time</label>
          <input id="visit-time" type="time" className="input" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="author">Author</label>
          <input id="author" className="input" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
        </div>
      </section>

      {sourceId && (
        <section className="card" aria-labelledby="carry-heading">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <h2 id="carry-heading" className="mr-auto text-sm font-semibold">
              Observations to carry forward <span className="font-normal text-text-muted">({selected.size} selected)</span>
            </h2>
            <button type="button" className="btn" onClick={() => setSelected(new Set([...selected, ...fromSource.map((c) => c.observationId)]))}>Select all</button>
            <button
              type="button"
              className="btn"
              onClick={() => setSelected(new Set([...selected].filter((id) => fromSource.find((c) => c.observationId === id)?.statusId !== resolvedStatusId)))}
            >
              Exclude resolved
            </button>
            <button type="button" className="btn" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-text-muted">Loading observations…</p>
          ) : fromSource.length === 0 ? (
            <p className="p-4 text-sm text-text-muted">The source report has no observations.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>{fromSource.map(row)}</tbody>
            </table>
          )}
          <div className="border-t border-border p-4">
            <label className="label" htmlFor="lookup">Recover an older observation</label>
            <input id="lookup" className="input max-w-sm" placeholder="Search by number or title" value={lookup} onChange={(e) => setLookup(e.target.value)} />
            {(olderMatches.length > 0 || recovered.length > 0) && (
              <table className="mt-2 w-full text-sm">
                <tbody>{[...recovered, ...olderMatches.filter((c) => !selected.has(c.observationId))].map(row)}</tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || !visitDate} onClick={submit}>
        Create report
      </button>
    </div>
  );
}
