"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RowMenu, type RowAction } from "./RowMenu";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from "lucide-react";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  /** Relative starting width (columns share the table width in proportion). */
  weight?: number;
}

type Sort = { id: string; dir: "asc" | "desc" } | null;

const MIN_SHARE = 0.05;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Full-width table: row checkboxes, click-to-sort headings (ascending, then
 * descending), drag-to-resize columns, Create button and filter above.
 */
export function DataTable<T>({
  rows,
  columns,
  rowId,
  filterText,
  onCreate,
  toolbar,
  createLabel = "Create",
  filterPlaceholder = "Filter",
  onRowClick,
  activeRowId,
  initialSort = null,
  emptyMessage = "Nothing here yet.",
  storageKey,
  selectionActions,
  rowActions,
  selectable = true,
}: {
  rows: T[];
  columns: Column<T>[];
  rowId: (row: T) => string;
  /** Text the filter box matches against. */
  filterText: (row: T) => string;
  onCreate?: () => void;
  createLabel?: string;
  /** More buttons beside the Create button. */
  toolbar?: React.ReactNode;
  filterPlaceholder?: string;
  onRowClick?: (row: T) => void;
  activeRowId?: string | null;
  initialSort?: Sort;
  emptyMessage?: string;
  /** Remembers this viewer's column widths for this table. */
  storageKey?: string;
  /** Buttons shown above the table while rows are ticked. */
  selectionActions?: (selected: T[], clearSelection: () => void) => React.ReactNode;
  /** Items for a three-dot menu in an unlabelled last column. */
  rowActions?: (row: T) => RowAction[];
  /** Show row checkboxes (and select-all). */
  selectable?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>(initialSort);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shares, setShares] = useState<number[]>(() => defaultShares(columns));
  // Saved widths are applied after mount so server and browser render the same HTML.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`kestro.columns.${storageKey}`) ?? "null");
      if (Array.isArray(saved) && saved.length === columns.length) setShares(saved);
    } catch {}
  }, [storageKey, columns.length]);
  const tableRef = useRef<HTMLTableElement>(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => filterText(r).toLowerCase().includes(q)) : rows;
    const col = sort && columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return filtered;
    const value = col.sortValue;
    const sorted = [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
    });
    return sort?.dir === "desc" ? sorted.reverse() : sorted;
  }, [rows, filter, sort, columns, filterText]);

  const visibleIds = visible.map(rowId);
  // Rows that disappear (e.g. removed) drop out of the selection automatically.
  const selectedRows = rows.filter((r) => selected.has(rowId(r)));
  const clearSelection = () => setSelected(new Set());
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someChecked = visibleIds.some((id) => selected.has(id));

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id === id ? { id, dir: s.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" }));

  // Drag the boundary between column i and i+1: width moves between the two.
  const startResize = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const total = tableRef.current?.getBoundingClientRect().width ?? 1;
    const start = e.clientX;
    const startShares = shares;
    const onMove = (ev: PointerEvent) => {
      const delta = (ev.clientX - start) / total;
      const pair = startShares[i] + startShares[i + 1];
      const left = Math.min(pair - MIN_SHARE, Math.max(MIN_SHARE, startShares[i] + delta));
      const next = [...startShares];
      next[i] = left;
      next[i + 1] = pair - left;
      setShares(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setShares((s) => {
        if (storageKey) {
          try {
            window.localStorage.setItem(`kestro.columns.${storageKey}`, JSON.stringify(s));
          } catch {}
        }
        return s;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 pb-4">
        {onCreate && (
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {createLabel}
          </button>
        )}
        {toolbar}
        {selectedRows.length > 0 && (
          <>
            {selectionActions?.(selectedRows, clearSelection)}
            <span className="text-sm text-text-muted">
              {selectedRows.length} selected ·{" "}
              <button type="button" className="link" onClick={clearSelection}>Clear</button>
            </span>
          </>
        )}
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-text-muted" aria-hidden />
          <label className="sr-only" htmlFor={`filter-${storageKey ?? "table"}`}>{filterPlaceholder}</label>
          <input
            id={`filter-${storageKey ?? "table"}`}
            className="input pl-9"
            placeholder={filterPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table ref={tableRef} className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {selectable && <col style={{ width: 44 }} />}
            {columns.map((c, i) => (
              <col key={c.id} style={{ width: `${(shares[i] * 100).toFixed(3)}%` }} />
            ))}
            {rowActions && <col style={{ width: 52 }} />}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface text-left text-xs font-semibold text-text-muted">
            <tr className="border-b-2 border-border">
              {selectable && (
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    aria-label="Select all rows"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked && !allChecked;
                    }}
                    onChange={() => {
                      const next = new Set(selected);
                      visibleIds.forEach((id) => (allChecked ? next.delete(id) : next.add(id)));
                      setSelected(next);
                    }}
                  />
                </th>
                )}
              {columns.map((c, i) => {
                const dir = sort?.id === c.id ? sort.dir : null;
                return (
                  <th
                    key={c.id}
                    className="group relative px-4 py-3 select-none hover:bg-surface-muted"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                  >
                    {c.sortValue ? (
                      <button type="button" className="flex w-full items-center gap-1.5 truncate text-left group-hover:text-text" onClick={() => toggleSort(c.id)}>
                        <span className="min-w-0 flex-1 truncate">{c.header}</span>
                        <SortIcon dir={dir} />
                      </button>
                    ) : (
                      <span className="truncate">{c.header}</span>
                    )}
                    {i < columns.length - 1 && (
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${c.header} column`}
                        onPointerDown={(e) => startResize(i, e)}
                        className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize after:absolute after:top-1/4 after:left-1/2 after:h-1/2 after:w-px after:bg-border hover:after:bg-primary"
                      />
                    )}
                  </th>
                );
              })}
              {rowActions && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0) + (selectable ? 1 : 0)} className="px-4 py-10 text-center text-text-muted">
                  {rows.length ? "No rows match the filter." : emptyMessage}
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const id = rowId(row);
              const checked = selected.has(id);
              const active = activeRowId === id;
              return (
                <tr
                  key={id}
                  data-slideover-trigger={onRowClick ? "" : undefined}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-border ${onRowClick ? "cursor-pointer" : ""} ${
                    active ? "bg-primary-subtle" : checked ? "bg-primary-subtle/50" : "hover:bg-surface-muted"
                  }`}
                >
                  {selectable && (
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="accent-primary"
                        aria-label="Select row"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(selected);
                          if (checked) next.delete(id);
                          else next.add(id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    )}
                  {columns.map((c) => (
                    <td key={c.id} className="truncate px-4 py-3.5">{c.cell(row)}</td>
                  ))}
                  {rowActions && (
                    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <RowMenu actions={rowActions(row)} label="Row actions" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="pt-3 text-xs text-text-muted">
        Showing {visible.length} of {rows.length}
      </p>
    </div>
  );
}

function defaultShares<T>(columns: Column<T>[]): number[] {
  const weights = columns.map((c) => c.weight ?? 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

/** Sorted column: arrow for its direction. Others: up/down hint on hover only. */
function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  if (dir === "asc") return <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />;
  if (dir === "desc") return <ArrowDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />;
  return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60" aria-hidden />;
}
