import "server-only";
import { listProjects } from "@/server/services/projects";
import { roleOnProject } from "@/lib/domain";
import type { Contact } from "@/lib/types";

export type ContactProject = { id: string; name: string; role: string; archived: boolean };

/** Projects each contact is on, with their role there. */
export async function projectsByContact(contacts: Contact[]): Promise<Record<string, ContactProject[]>> {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const [active, archived] = await Promise.all([listProjects({ archived: false }), listProjects({ archived: true })]);
  const out: Record<string, ContactProject[]> = {};
  for (const p of [...active, ...archived]) {
    for (const pc of p.contacts) {
      if (!byId.has(pc.contactId)) continue;
      (out[pc.contactId] ??= []).push({ id: p.id, name: p.name, role: roleOnProject(pc, byId.get(pc.contactId)), archived: p.archived });
    }
  }
  return out;
}
