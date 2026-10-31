"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Account menu in the header: name, Settings (admins), Sign out. */
export function UserMenu({ firstName, email, isAdmin }: { firstName: string; email: string; isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-muted"
      >
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-primary-hover">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H3Z" />
          </svg>
        </span>
        <span className="font-medium">{firstName}</span>
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
          <path d="M5.5 7.5 10 12l4.5-4.5h-9Z" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lg">
          <div className="border-b border-border px-3 py-2 text-xs text-text-muted">{email}</div>
          {isAdmin && (
            <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm hover:bg-surface-muted">
              Settings
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
            onClick={async () => {
              await fetch("/api/session", { method: "DELETE" });
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
