"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import type { StatusDef } from "@/lib/types";

function Dot({ color }: { color?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
      style={{ backgroundColor: color ?? "transparent" }}
    />
  );
}

/**
 * Status dropdown that shows each firm-configured colour beside its label
 * (a native <select> can't). Keyboard: arrows, Home/End, Enter/Space, Escape.
 */
export function StatusSelect({
  id,
  statuses,
  value,
  onChange,
  resolvedStatusId,
  disabled = false,
  inline = false,
}: {
  id: string;
  statuses: StatusDef[];
  value: string | null;
  onChange: (statusId: string) => void;
  resolvedStatusId?: string;
  disabled?: boolean;
  /** Click-to-edit look: plain text until clicked (dashed outline and pencil on hover). */
  inline?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  const current = sorted.find((s) => s.id === value);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, sorted.findIndex((s) => s.id === value)));
    setOpen(true);
  };
  const choose = (s: StatusDef) => {
    setOpen(false);
    button.current?.focus();
    if (s.id !== value) onChange(s.id);
  };

  const label = (s: StatusDef) => `${s.label}${s.id === resolvedStatusId ? " (resolved)" : ""}`;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={
          inline && !open
            ? "group relative flex min-h-[38px] w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 pr-8 text-left text-sm hover:border-dashed hover:border-text-muted/60 focus-visible:border-dashed focus-visible:border-text-muted/60 disabled:opacity-50"
            : "input flex items-center gap-2 text-left disabled:opacity-50"
        }
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <Dot color={current?.color} />
        <span className="flex-1 truncate">{current ? label(current) : "No status"}</span>
        {inline && !open ? (
          <Pencil aria-hidden className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
        ) : (
          <ChevronDown aria-hidden className="h-4 w-4 text-text-muted" />
        )}
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={id}
          aria-activedescendant={`${listId}-${active}`}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((i) => Math.min(sorted.length - 1, i + 1));
            else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
            else if (e.key === "Home") setActive(0);
            else if (e.key === "End") setActive(sorted.length - 1);
            else if (e.key === "Enter" || e.key === " ") choose(sorted[active]);
            else if (e.key === "Escape") {
              // Handled here: don't let the surrounding panel or dialog close too.
              e.stopPropagation();
              setOpen(false);
              button.current?.focus();
            } else if (e.key === "Tab") {
              setOpen(false);
              return;
            } else return;
            e.preventDefault();
          }}
        >
          {sorted.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={s.id === value}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${i === active ? "bg-primary-subtle" : ""} ${s.id === value ? "font-medium" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(s)}
            >
              <Dot color={s.color} />
              {label(s)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
