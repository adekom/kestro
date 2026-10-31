"use client";

import { useEffect, useRef } from "react";

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
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 id="modal-title" className="text-base font-semibold">{title}</h2>
            <button type="button" className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
                <path d="M5.3 4 4 5.3 8.7 10 4 14.7 5.3 16l4.7-4.7 4.7 4.7 1.3-1.3-4.7-4.7L16 5.3 14.7 4 10 8.7 5.3 4Z" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
