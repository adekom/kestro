"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, type LucideIcon } from "lucide-react";

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * Vertical three-dot menu for one table row. The menu is positioned against
 * the window so the table's scroll area never clips it.
 */
export function RowMenu({ actions, label }: { actions: RowAction[]; label: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => setPos(null);
    const onClick = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(pos)}
        className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text"
        onClick={(e) => {
          e.stopPropagation();
          if (pos) return setPos(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
      {pos && (
        <div
          ref={menu}
          role="menu"
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-40 min-w-48 rounded-md border border-border bg-surface py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map(({ label: text, icon: Icon, danger, onSelect }) => (
            <button
              key={text}
              role="menuitem"
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted ${danger ? "text-danger" : ""}`}
              onClick={() => {
                setPos(null);
                onSelect();
              }}
            >
              {Icon && <Icon className="h-4 w-4" aria-hidden />}
              {text}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
