import { requirePageUser } from "@/server/auth";
import { listUsers } from "@/server/services/users";
import { SettingsNav } from "../SettingsNav";
import { UsersEditor } from "./UsersEditor";
import { PageHeader } from "@/components/PageHeader";

export default async function UsersPage() {
  const me = await requirePageUser("admin");
  const users = await listUsers();
  return (
    <main className="page">
      <PageHeader title="Settings" />
      <SettingsNav />
      <UsersEditor users={users} currentEmail={me.email} />
    </main>
  );
}
