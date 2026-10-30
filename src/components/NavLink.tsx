"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, exact = false }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1 ${active ? "bg-primary-subtle font-medium text-primary-hover" : "text-text hover:bg-surface-muted"}`}
    >
      {children}
    </Link>
  );
}
