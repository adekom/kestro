import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { Wordmark } from "@/components/Wordmark";
import { UserMenu } from "@/components/UserMenu";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center bg-text px-4">
        <Link href="/projects" className="text-lg" aria-label="kestro home">
          <Wordmark inverse />
        </Link>
        <div className="ml-auto">
          <UserMenu firstName={user.firstName} email={user.email} isAdmin={user.role === "admin"} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
