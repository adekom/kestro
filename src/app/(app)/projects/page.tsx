import { requirePageUser } from "@/server/auth";
import { listProjects } from "@/server/services/projects";
import { listContacts } from "@/server/services/contacts";
import { getSettings } from "@/server/services/settings";
import { ProjectsHome } from "./ProjectsHome";

/** Home page: every project, with the signed-in person's own projects first. */
export default async function ProjectsPage() {
  const [user, active, archived, contacts, settings] = await Promise.all([
    requirePageUser(),
    listProjects({ archived: false }),
    listProjects({ archived: true }),
    listContacts(),
    getSettings(),
  ]);
  const toRow = (p: (typeof active)[number]) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    address: p.address,
    reportCount: p.reportCount,
    createdAt: p.createdAt,
    archived: p.archived,
    mine: Boolean(user.contactId && p.contactIds.includes(user.contactId)),
  });
  return (
    <ProjectsHome
      firstName={user.firstName}
      rows={[...active, ...archived].map(toRow)}
      contacts={contacts}
      currentContactId={user.contactId}
      statuses={settings.statuses}
    />
  );
}
