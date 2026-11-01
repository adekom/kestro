import { listContacts } from "@/server/services/contacts";
import { projectsByContact } from "../projectsByContact";
import { ExternalContactsTable } from "./ExternalContactsTable";

/** People outside the firm (staff are on the Staff tab). */
export default async function ExternalContactsPage() {
  const contacts = (await listContacts()).filter((c) => !c.userEmail);
  const projects = await projectsByContact(contacts);
  return <ExternalContactsTable contacts={contacts} projects={projects} />;
}
