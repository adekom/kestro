import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { Wordmark } from "@/components/Wordmark";
import { NavLink } from "@/components/NavLink";
import { UserMenu } from "@/components/UserMenu";

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
          <NavLink href="/contacts">Contacts</NavLink>
        </nav>
        <div className="ml-auto">
          <UserMenu firstName={user.firstName} email={user.email} isAdmin={user.role === "admin"} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
