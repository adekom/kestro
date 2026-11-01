import { requirePageUser } from "@/server/auth";
import { listUsers } from "@/server/services/users";
import { projectsByContact } from "./projectsByContact";
import { StaffTable } from "./StaffTable";

export default async function StaffPage() {
  const me = await requirePageUser();
  const users = await listUsers();
  const projects = await projectsByContact(users.flatMap((u) => (u.contact ? [u.contact] : [])));
  return <StaffTable users={users} currentEmail={me.email} isAdmin={me.role === "admin"} projects={projects} />;
}
