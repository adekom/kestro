import { requirePageUser } from "@/server/auth";
import { listUsers } from "@/server/services/users";
import { SettingsNav } from "../SettingsNav";
import { UsersEditor } from "./UsersEditor";

export default async function UsersPage() {
  const me = await requirePageUser("admin");
  const users = await listUsers();
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <SettingsNav />
      <UsersEditor users={users} currentEmail={me.email} />
    </main>
  );
}
