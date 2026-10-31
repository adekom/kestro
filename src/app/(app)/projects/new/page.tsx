import { requirePageUser } from "@/server/auth";
import { listContacts } from "@/server/services/contacts";
import { NewProjectForm } from "./NewProjectForm";
import { PageHeader } from "@/components/PageHeader";

export default async function NewProjectPage() {
  const [user, contacts] = await Promise.all([requirePageUser(), listContacts()]);
  return (
    <main className="page">
      <PageHeader back={{ href: "/projects", label: "Projects" }} title="New project" />
      <div className="form-width">
        <NewProjectForm contacts={contacts} currentContactId={user.contactId} />
      </div>
    </main>
  );
}
