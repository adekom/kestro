"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

interface ProjectOption {
  id: string;
  name: string;
  code: string;
  mine: boolean;
}

const SECTIONS = [
  { slug: "reports", label: "Field Reports", icon: "M5 3h7l4 4v10H5V3Zm7 1.5V8h3.5M7.5 11h6M7.5 14h6" },
  { slug: "observations", label: "Observations", icon: "M10 4c4 0 7 4 7 6s-3 6-7 6-7-4-7-6 3-6 7-6Zm0 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z" },
  { slug: "contacts", label: "Contacts", icon: "M8 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 7c0-2.8 2.2-5 5-5s5 2.2 5 5M13.5 9a2.5 2.5 0 1 0 0-5M15 11.8c1.8.6 3 2.4 3 4.7" },
] as const;
const SETTINGS_ICON =
  "M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM8.7 2.5h2.6l.4 2 1.6.9 1.9-.7 1.3 2.2-1.5 1.4v1.4l1.5 1.4-1.3 2.2-1.9-.7-1.6.9-.4 2H8.7l-.4-2-1.6-.9-1.9.7-1.3-2.2 1.5-1.4V8.3L3.5 6.9l1.3-2.2 1.9.7 1.6-.9.4-2Z";

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" className="h-5 w-5 shrink-0" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function ProjectNav({ project, projects }: { project: { id: string; name: string; archived: boolean }; projects: ProjectOption[] }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const base = `/projects/${project.id}`;
  const section = path.slice(base.length + 1).split("/")[0] || "reports";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = projects.filter((p) => !q || `${p.name} ${p.code}`.toLowerCase().includes(q));
  // Switching projects keeps you in the same section (e.g. Observations).
  const sectionRoot = SECTIONS.some((s) => s.slug === section) || section === "settings" ? section : "reports";

  const item = (href: string, label: string, icon: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 border-l-[3px] px-4 py-2 text-sm ${
        active ? "border-primary bg-primary-subtle font-medium text-primary-hover" : "border-transparent text-text hover:bg-surface-muted"
      }`}
    >
      <NavIcon d={icon} />
      {label}
    </Link>
  );

  return (
    <nav aria-label="Project" className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div ref={root} className="relative border-b border-border p-3">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-surface-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-text-muted">Project{project.archived ? " (archived)" : ""}</span>
            <span className="block truncate font-semibold">{project.name}</span>
          </span>
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
            <path d="M5.5 7.5 10 12l4.5-4.5h-9Z" />
          </svg>
        </button>
        {open && (
          <div className="absolute top-full right-3 left-3 z-30 mt-1 rounded-md border border-border bg-surface shadow-lg">
            <div className="border-b border-border p-2">
              <input
                autoFocus
                className="input"
                aria-label="Find a project"
                placeholder="Find a project"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul role="listbox" aria-label="Projects" className="max-h-72 overflow-y-auto py-1">
              {matches.map((p) => (
                <li key={p.id} role="option" aria-selected={p.id === project.id}>
                  <button
                    type="button"
                    className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${p.id === project.id ? "font-medium text-primary" : ""}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                      router.push(`/projects/${p.id}/${sectionRoot}`);
                    }}
                  >
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-xs text-text-muted">{[p.code, p.mine ? "My project" : ""].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">No matching projects.</li>}
            </ul>
            <div className="border-t border-border p-2">
              <Link href="/projects" className="link text-sm" onClick={() => setOpen(false)}>All projects</Link>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 py-2">
        {SECTIONS.map((s) => item(`${base}/${s.slug}`, s.label, s.icon, section === s.slug))}
      </div>
      <div className="border-t border-border py-2">{item(`${base}/settings`, "Settings", SETTINGS_ICON, section === "settings")}</div>
    </nav>
  );
}
