import "server-only";
import { numberingFor } from "./numbering";
import { getContactsByIds } from "./contacts";
import { listProjectObservations } from "./observations";
import { getProject } from "./projects";
import { getMemberships, getStatusEvents, listReports } from "./reports";
import { deletedReportIds } from "./reportDeletion";
import { observationNumber, reportLabel, roleOnProject, statusOn } from "@/lib/domain";
import type { Contact, Photo, PhotoAttachment } from "@/lib/types";
import { listLibrary } from "./photos";
import { attachmentsCol } from "../paths";

export interface ObservationRow {
  id: string;
  number: string;
  title: string;
  /** Latest recorded status. */
  statusId: string | null;
  groupId: string | null;
  originalDate: string;
  /** Most recent report that includes it, where it is edited. */
  latestReportId: string | null;
}

/** Every live observation in the project with its current (latest) status. */
export async function observationRows(pid: string): Promise<ObservationRow[]> {
  const [observations, reports, hidden] = await Promise.all([listProjectObservations(pid), listReports(pid), deletedReportIds(pid)]);
  const seqMap = new Map(reports.map((r) => [r.id, r.sequence]));
  const numbering = await numberingFor(pid, seqMap);
  // Reports are in sequence order, so the last one seen for an observation is its latest.
  const latest = new Map<string, string>();
  const memberships = await Promise.all(reports.map((r) => getMemberships(pid, r.id)));
  reports.forEach((r, i) => memberships[i].forEach((m) => latest.set(m.observationId, r.id)));
  return Promise.all(
    observations.map(async (o) => ({
      id: o.id,
      number: observationNumber(o, seqMap, numbering),
      title: o.title,
      statusId: statusOn(await getStatusEvents(pid, o.id, hidden), "9999-12-31"),
      groupId: o.groupId,
      originalDate: o.originalDate,
      latestReportId: latest.get(o.id) ?? null,
    })),
  );
}

export interface ContactRow {
  contact: Contact;
  /** The project's own role for them; empty uses their default role. */
  projectRole: string;
  /** Role in effect on this project. */
  role: string;
}

export async function projectContactRows(pid: string): Promise<ContactRow[]> {
  const project = await getProject(pid);
  const contacts = await getContactsByIds(project.contactIds);
  return project.contacts.flatMap((pc) => {
    const contact = contacts.get(pc.contactId);
    return contact ? [{ contact, projectRole: pc.projectRole, role: roleOnProject(pc, contact) }] : [];
  });
}

export interface PhotoUse {
  attachmentId: string;
  observationId: string;
  number: string;
  title: string;
  reportLabel: string;
  caption: string;
  detached: boolean;
  /** A public link exists (it may already appear in exported PDFs). */
  shared: boolean;
}

export interface PhotoRow {
  photo: Photo;
  uses: PhotoUse[];
}

/** Every photo in the project library, with where it is attached. */
export async function photoRows(pid: string): Promise<PhotoRow[]> {
  const [photos, attachments, observations, reports, project] = await Promise.all([
    listLibrary(pid),
    attachmentsCol(pid).get(),
    listProjectObservations(pid),
    listReports(pid),
    getProject(pid),
  ]);
  const seqMap = new Map(reports.map((r) => [r.id, r.sequence]));
  const numbering = await numberingFor(pid, seqMap);
  const obsById = new Map(observations.map((o) => [o.id, o]));
  const usesByPhoto = new Map<string, PhotoUse[]>();
  for (const d of attachments.docs) {
    const a = d.data() as PhotoAttachment;
    const o = obsById.get(a.observationId);
    if (!o) continue; // observation deleted
    const seq = seqMap.get(a.reportId);
    const use: PhotoUse = {
      attachmentId: a.id,
      observationId: o.id,
      number: observationNumber(o, seqMap, numbering),
      title: o.title,
      reportLabel: seq ? reportLabel(project.reportPrefix, seq) : "Deleted report",
      caption: a.caption,
      detached: Boolean(a.detachedAt),
      shared: Boolean(a.shareToken),
    };
    usesByPhoto.set(a.photoId, [...(usesByPhoto.get(a.photoId) ?? []), use]);
  }
  return photos.map((photo) => ({ photo, uses: usesByPhoto.get(photo.id) ?? [] }));
}
