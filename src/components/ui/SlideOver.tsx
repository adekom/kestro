"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

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
  const panel = useRef<HTMLElement>(null);

  // A click outside closes the panel. Clicks in pop-ups and menus don't, nor do
  // clicks on rows/cards that open panels (they toggle or switch it themselves).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || panel.current?.contains(t)) return;
      if (t.closest("dialog[open], [role='menu'], [role='listbox'], [data-slideover-trigger]")) return;
      if (document.querySelector("dialog[open]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onClose]);

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
      ref={panel}
      aria-label="Details"
      aria-hidden={!open}
      inert={!open}
      className={`fixed top-12 right-0 bottom-0 z-30 flex w-[480px] max-w-full flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 className="field-inset min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
        {actions}
        <button type="button" className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text" onClick={onClose} aria-label="Close panel">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{open && children}</div>
    </aside>
  );
}
