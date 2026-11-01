"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Page tabs as links: plain text, underlined when active (same look as the projects page tabs). */
export function TabNav({ label, tabs }: { label: string; tabs: Array<{ href: string; label: string; exact?: boolean }> }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="flex gap-6 border-b border-border text-sm">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-1 pb-2 ${active ? "border-primary font-medium text-text" : "border-transparent text-text-muted hover:text-text"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
