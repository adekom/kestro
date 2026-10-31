"use client";

import { useEffect } from "react";

/**
 * Edit panel that slides in from the right edge, below the header. The page
 * behind stays visible and usable, so another row can be picked directly.
 */
export function SlideOver({
  open,
  onClose,
  title,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape inside a dialog or an open listbox belongs to that control.
      if (e.key === "Escape" && !document.querySelector("dialog[open]") && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      aria-label="Details"
      aria-hidden={!open}
      inert={!open}
      className={`fixed top-12 right-0 bottom-0 z-30 flex w-[480px] max-w-full flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        {actions}
        <button type="button" className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text" onClick={onClose} aria-label="Close panel">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
            <path d="M5.3 4 4 5.3 8.7 10 4 14.7 5.3 16l4.7-4.7 4.7 4.7 1.3-1.3-4.7-4.7L16 5.3 14.7 4 10 8.7 5.3 4Z" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{open && children}</div>
    </aside>
  );
}
