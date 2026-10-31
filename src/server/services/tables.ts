import "server-only";
import { getContactsByIds } from "./contacts";
import { listProjectObservations } from "./observations";
import { getProject } from "./projects";
import { getStatusEvents, reportSequenceMap } from "./reports";
import { deletedReportIds } from "./reportDeletion";
import { observationNumber, statusOn } from "@/lib/domain";
import type { Contact } from "@/lib/types";

export interface ObservationRow {
  id: string;
  number: string;
  title: string;
  /** Latest recorded status. */
  statusId: string | null;
  groupId: string | null;
  originalDate: string;
}

/** Every live observation in the project with its current (latest) status. */
export async function observationRows(pid: string): Promise<ObservationRow[]> {
  const [observations, seqMap, hidden] = await Promise.all([listProjectObservations(pid), reportSequenceMap(pid), deletedReportIds(pid)]);
  return Promise.all(
    observations.map(async (o) => ({
      id: o.id,
      number: observationNumber(o, seqMap),
      title: o.title,
      statusId: statusOn(await getStatusEvents(pid, o.id, hidden), "9999-12-31"),
      groupId: o.groupId,
      originalDate: o.originalDate,
    })),
  );
}

export interface ContactRow {
  contact: Contact;
  projectRole: string;
}

export async function projectContactRows(pid: string): Promise<ContactRow[]> {
  const project = await getProject(pid);
  const contacts = await getContactsByIds(project.contactIds);
  return project.contacts.flatMap((pc) => {
    const contact = contacts.get(pc.contactId);
    return contact ? [{ contact, projectRole: pc.projectRole }] : [];
  });
}
