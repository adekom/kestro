"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { formatLongDate } from "@/lib/domain";

/*
 * Click-to-edit fields. A value is shown as text; hovering shows a dashed
 * outline and a pencil at the top right; clicking swaps in the input with the
 * cursor in it. Enter (single-line) or leaving the field finishes editing;
 * Escape restores the value from before editing.
 *
 * Controlled with `onChange` (every keystroke, for autosaved forms) or with
 * `onCommit` (once, when editing finishes). Text and input share padding and
 * border width, so nothing shifts when switching.
 */

interface BaseProps {
  id: string;
  /** Start in editing mode (for a row that was just added). */
  startEditing?: boolean;
  /** Accessible name when no visible <label htmlFor={id}> exists. */
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface ValueProps extends BaseProps {
  value: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
}

function useInlineValue({ value, onChange, onCommit, startEditing }: Pick<ValueProps, "value" | "onChange" | "onCommit" | "startEditing">) {
  const [editing, setEditing] = useState(Boolean(startEditing));
  const [draft, setDraft] = useState(value);
  const before = useRef(value);
  return {
    editing,
    current: onCommit ? draft : value,
    start: () => {
      before.current = value;
      setDraft(value);
      setEditing(true);
    },
    change: (v: string) => (onCommit ? setDraft(v) : onChange?.(v)),
    finish: () => {
      if (onCommit && draft !== value) onCommit(draft);
      setEditing(false);
    },
    cancel: () => {
      if (!onCommit) onChange?.(before.current);
      setEditing(false);
    },
    /** Stop editing, keeping whatever was chosen. */
    exit: () => setEditing(false),
  };
}

function Display({
  id,
  ariaLabel,
  disabled,
  multiline,
  className = "",
  onStart,
  children,
  empty,
  placeholder,
}: {
  id: string;
  ariaLabel?: string;
  disabled?: boolean;
  multiline?: boolean;
  className?: string;
  onStart: () => void;
  children: React.ReactNode;
  empty: boolean;
  placeholder?: string;
}) {
  if (disabled) {
    return <div className={`border border-transparent px-3 py-2 text-sm ${multiline ? "whitespace-pre-wrap" : "truncate"} ${className}`}>{empty ? "—" : children}</div>;
  }
  return (
    <button
      type="button"
      id={id}
      aria-label={ariaLabel}
      onClick={onStart}
      className={`group relative block min-h-[38px] w-full rounded-md border border-transparent px-3 py-2 pr-8 text-left text-sm hover:border-dashed hover:border-text-muted/60 focus-visible:border-dashed focus-visible:border-text-muted/60 ${
        multiline ? "whitespace-pre-wrap" : "truncate"
      } ${className}`}
    >
      {empty ? <span className="text-text-muted">{placeholder ?? "Click to add"}</span> : children}
      <Pencil aria-hidden className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

export function InlineText(props: ValueProps & { type?: "text" | "email" | "tel" }) {
  const s = useInlineValue(props);
  if (!s.editing) {
    return (
      <Display {...props} empty={!props.value} onStart={s.start}>
        {props.value}
      </Display>
    );
  }
  return (
    <input
      id={props.id}
      aria-label={props.ariaLabel}
      type={props.type ?? "text"}
      autoFocus
      className={`input ${props.className ?? ""}`}
      placeholder={props.placeholder}
      value={s.current}
      onChange={(e) => s.change(e.target.value)}
      onBlur={s.finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          s.cancel();
        }
      }}
    />
  );
}

export function InlineTextarea(props: ValueProps & { minHeight?: string }) {
  const s = useInlineValue(props);
  if (!s.editing) {
    return (
      <Display {...props} multiline empty={!props.value} onStart={s.start}>
        {props.value}
      </Display>
    );
  }
  return (
    <textarea
      id={props.id}
      aria-label={props.ariaLabel}
      autoFocus
      // Cursor at the end of the existing text.
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      className={`input ${props.minHeight ?? "min-h-28"} ${props.className ?? ""}`}
      placeholder={props.placeholder}
      value={s.current}
      onChange={(e) => s.change(e.target.value)}
      onBlur={s.finish}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          s.cancel();
        }
      }}
    />
  );
}

/** Date shown as "July 14, 2026"; edited with the browser's date picker. */
export function InlineDate(props: ValueProps) {
  const s = useInlineValue(props);
  if (!s.editing) {
    return (
      <Display {...props} empty={!props.value} onStart={s.start}>
        {props.value ? formatLongDate(props.value) : ""}
      </Display>
    );
  }
  return (
    <input
      id={props.id}
      aria-label={props.ariaLabel}
      type="date"
      autoFocus
      className={`input ${props.className ?? ""}`}
      value={s.current}
      // An emptied date picker keeps the previous date (visit dates are required).
      onChange={(e) => e.target.value && s.change(e.target.value)}
      onBlur={s.finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          s.cancel();
        }
      }}
    />
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Time shown as "9:30 AM"; edited with the browser's time picker. */
export function InlineTime(props: ValueProps) {
  const s = useInlineValue(props);
  if (!s.editing) {
    return (
      <Display {...props} empty={!props.value} onStart={s.start}>
        {props.value ? formatTime(props.value) : ""}
      </Display>
    );
  }
  return (
    <input
      id={props.id}
      aria-label={props.ariaLabel}
      type="time"
      autoFocus
      className={`input ${props.className ?? ""}`}
      value={s.current}
      onChange={(e) => s.change(e.target.value)}
      onBlur={s.finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          s.cancel();
        }
      }}
    />
  );
}

/** A choice shown as its label; picking an option finishes editing. */
export function InlineSelect(props: ValueProps & { options: Array<{ value: string; label: string }> }) {
  const s = useInlineValue(props);
  const label = props.options.find((o) => o.value === props.value)?.label ?? "";
  if (!s.editing) {
    return (
      <Display {...props} empty={!label} onStart={s.start}>
        {label}
      </Display>
    );
  }
  return (
    <select
      id={props.id}
      aria-label={props.ariaLabel}
      autoFocus
      className={`input ${props.className ?? ""}`}
      value={s.current}
      onChange={(e) => {
        if (props.onCommit) props.onCommit(e.target.value);
        else props.onChange?.(e.target.value);
        s.exit();
      }}
      onBlur={s.exit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          s.cancel();
        }
      }}
    >
      {!props.options.some((o) => o.value === s.current) && (
        <option value={s.current} disabled>{props.placeholder ?? "Choose…"}</option>
      )}
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
