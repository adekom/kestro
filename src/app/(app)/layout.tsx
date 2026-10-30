import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { Wordmark } from "@/components/Wordmark";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-6 border-b border-border bg-surface px-4">
        <Link href="/projects" className="text-lg" aria-label="kestro home">
          <Wordmark />
        </Link>
        <nav className="flex gap-1 text-sm" aria-label="Main">
          <NavLink href="/projects">Projects</NavLink>
          {user.role === "admin" && <NavLink href="/settings">Settings</NavLink>}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-text-muted">
          <span>
            {user.email}
            {user.role === "admin" && <span className="ml-1.5 rounded bg-primary-subtle px-1.5 py-0.5 text-xs text-primary-hover">admin</span>}
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
