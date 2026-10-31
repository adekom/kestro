"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { saveStatusesAction } from "@/app/actions";
import type { StatusDef } from "@/lib/types";
import { InlineText } from "@/components/ui/InlineEdit";

const PALETTE = ["#C2410C", "#B45309", "#2563EB", "#7C3AED", "#15803D", "#475569"];

/**
 * Organization-wide status catalog. Exactly one status is designated
 * "resolved" (by ID); it only affects which observations are preselected
 * when carrying forward into the next report.
 */
export function StatusesEditor({ statuses, resolvedStatusId }: { statuses: StatusDef[]; resolvedStatusId: string }) {
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  // `key` identifies a row on screen; `id` is empty until the status is saved.
  const [items, setItems] = useState(sorted.map(({ id, label, color }) => ({ key: id, id, label, color })));
  const [resolvedIndex, setResolvedIndex] = useState(Math.max(0, sorted.findIndex((s) => s.id === resolvedStatusId)));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const update = (i: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
    if (resolvedIndex === i) setResolvedIndex(i + d);
    else if (resolvedIndex === i + d) setResolvedIndex(i);
  };

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Observation statuses</h2>
      <p className="mb-3 text-xs text-text-muted">
        Renaming or recoloring keeps all history. The resolved status is excluded by default when carrying observations into
        the next report. A status in use cannot be removed.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-muted">
          <tr>
            <th className="py-1 font-medium">Name</th>
            <th className="py-1 font-medium">Color</th>
            <th className="py-1 font-medium">Resolved</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((s, i) => (
            <tr key={s.key} className="border-t border-border">
              <td className="py-1.5 pr-2">
                <InlineText id={`status-${s.key}`} ariaLabel="Status name" startEditing={!s.id && !s.label} placeholder="Status name" value={s.label} onChange={(v) => update(i, { label: v })} />
              </td>
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <input type="color" aria-label={`${s.label} color`} value={s.color} onChange={(e) => update(i, { color: e.target.value.toUpperCase() })} className="h-8 w-10 cursor-pointer rounded border border-border" />
                  <div className="w-28"><InlineText id={`status-hex-${s.key}`} ariaLabel={`${s.label} hex color`} className="font-mono text-xs" value={s.color} onChange={(v) => update(i, { color: v })} /></div>
                </div>
              </td>
              <td className="py-1.5">
                <input type="radio" name="resolved" className="accent-primary" aria-label={`${s.label} is the resolved status`} checked={resolvedIndex === i} onChange={() => setResolvedIndex(i)} />
              </td>
              <td className="py-1.5 text-right whitespace-nowrap">
                <button type="button" className="btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="h-4 w-4" aria-hidden /></button>{" "}
                <button type="button" className="btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="h-4 w-4" aria-hidden /></button>{" "}
                <button
                  type="button"
                  className="btn"
                  disabled={items.length === 1 || resolvedIndex === i}
                  onClick={() => {
                    setItems(items.filter((_, j) => j !== i));
                    if (resolvedIndex > i) setResolvedIndex(resolvedIndex - 1);
                  }}
                  aria-label="Remove status"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="btn" onClick={() => setItems([...items, { key: crypto.randomUUID(), id: "", label: "", color: PALETTE[items.length % PALETTE.length] }])}>
          Add status
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            const res = await saveStatusesAction(items.map(({ id, label, color }) => ({ id, label, color })), resolvedIndex);
            setMessage(res.ok ? { ok: true, text: "Statuses saved." } : { ok: false, text: res.error });
          }}
        >
          Save statuses
        </button>
        {message && (
          <span role="status" className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</span>
        )}
      </div>
    </section>
  );
}
