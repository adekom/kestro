"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/** Confirmation pop-up for actions that change or remove things. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Return an error message to keep the dialog open, or null when done. */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title={title} width="max-w-md">
      <div className="space-y-5">
        <div className="text-sm">{children}</div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`btn ${danger ? "border-danger bg-danger text-white hover:bg-danger/90" : "btn-primary"}`}
            disabled={busy}
            autoFocus
            onClick={async () => {
              setBusy(true);
              const failure = await onConfirm();
              setBusy(false);
              if (failure) setError(failure);
              else close();
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
