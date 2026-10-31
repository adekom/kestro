"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Pop-up window over the page with a semi-opaque backdrop. Uses the native
 * <dialog> element, which traps focus and closes on Escape.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // click on the backdrop
      className={`m-auto max-h-[90vh] w-full ${width} overflow-hidden rounded-lg border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40`}
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 id="modal-title" className="field-inset text-lg font-semibold">{title}</h2>
            <button type="button" className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto p-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}
