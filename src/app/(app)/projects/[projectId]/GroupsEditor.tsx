"use client";

import { useState } from "react";
import { saveGroupsAction } from "@/app/actions";
import type { Group } from "@/lib/types";

/** Optional presentation groups (e.g. Level 0, Exterior, Roof). Order controls report layout. */
export function GroupsEditor({ projectId, groups }: { projectId: string; groups: Group[] }) {
  const [items, setItems] = useState(() => [...groups].sort((a, b) => a.order - b.order).map(({ id, name }) => ({ id, name })));
  const [status, setStatus] = useState<string | null>(null);
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
  };

  return (
    <section className="card p-4" aria-labelledby="groups-heading">
      <h2 id="groups-heading" className="mb-1 text-sm font-semibold">Observation groups (optional)</h2>
      <p className="mb-3 text-xs text-text-muted">Groups only affect presentation. Reports without groups work normally.</p>
      <ul className="space-y-2">
        {items.map((g, i) => (
          <li key={g.id ?? i} className="flex gap-2">
            <label className="sr-only" htmlFor={`g-${i}`}>Group name</label>
            <input id={`g-${i}`} className="input" value={g.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <button type="button" className="btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove group">✕</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="btn" onClick={() => setItems([...items, { id: "", name: "" }])}>Add group</button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            const res = await saveGroupsAction(projectId, items);
            setStatus(res.ok ? "Saved" : res.error);
          }}
        >
          Save groups
        </button>
        {status && <span className="text-xs text-text-muted" role="status">{status}</span>}
      </div>
    </section>
  );
}
