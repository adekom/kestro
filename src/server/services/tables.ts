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
  /** Report where the observation was first added. */
  originReportId: string;
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
      originReportId: o.originReportId,
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
  /** Report (and observation) for "go to most recent report that contains this photo". */
  mostRecent: { reportId: string; observationId: string } | null;
  /** Report (and observation) where the photo was first added. */
  firstAdded: { reportId: string; observationId: string } | null;
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
  // Which reports include each observation, latest last.
  const memberships = await Promise.all(reports.map((r) => getMemberships(pid, r.id)));
  const reportsByObs = new Map<string, string[]>();
  reports.forEach((r, i) => memberships[i].forEach((m) => reportsByObs.set(m.observationId, [...(reportsByObs.get(m.observationId) ?? []), r.id])));
  type Place = { reportId: string; observationId: string; seq: number };
  const latestByPhoto = new Map<string, Place>();
  const firstByPhoto = new Map<string, Place>();
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
    if (a.detachedAt || seq === undefined) continue;
    const first = firstByPhoto.get(a.photoId);
    if (!first || seq < first.seq) firstByPhoto.set(a.photoId, { reportId: a.reportId, observationId: o.id, seq });
    // The photo appears from the report it was added in onwards, in reports that include the observation.
    const latestRid = (reportsByObs.get(o.id) ?? []).filter((rid) => (seqMap.get(rid) ?? 0) >= seq).at(-1);
    const latestSeq = latestRid ? (seqMap.get(latestRid) ?? 0) : 0;
    const latest = latestByPhoto.get(a.photoId);
    if (latestRid && (!latest || latestSeq > latest.seq)) latestByPhoto.set(a.photoId, { reportId: latestRid, observationId: o.id, seq: latestSeq });
  }
  const place = (p: Place | undefined) => (p ? { reportId: p.reportId, observationId: p.observationId } : null);
  return photos.map((photo) => ({
    photo,
    uses: usesByPhoto.get(photo.id) ?? [],
    mostRecent: place(latestByPhoto.get(photo.id)),
    firstAdded: place(firstByPhoto.get(photo.id)),
  }));
}
