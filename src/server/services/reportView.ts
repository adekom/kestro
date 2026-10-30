import "server-only";
import { attachmentsCol, observationDoc, photosCol, updatesCol } from "../paths";
import { getMemberships, getReport, getStatusEvents, reportSequenceMap } from "./reports";
import { getProject } from "./projects";
import { getSettings } from "./settings";
import { applicableToReport, observationNumber, sortStatusEvents, statusOn } from "@/lib/domain";
import type {
  Observation,
  ObservationUpdate,
  OrgSettings,
  Photo,
  PhotoAttachment,
  Project,
  Report,
  StatusEvent,
} from "@/lib/types";

export interface ObservationInReport {
  observation: Observation;
  number: string;
  order: number;
  /** Status in effect on this report's visit date. */
  statusId: string | null;
  statusEvents: StatusEvent[];
  updates: ObservationUpdate[];
  attachments: Array<PhotoAttachment & { photo: Photo }>;
}

export interface ReportView {
  settings: OrgSettings;
  project: Project;
  report: Report;
  observations: ObservationInReport[];
}

/**
 * Assembles a report as of its visit date: only status events, updates and
 * photos dated on or before the visit (or recorded in this report) are
 * included, so older reports never show later history (spec §5.1, §6 step 5).
 * The editor and the PDF both use this, so preview matches export.
 */
export async function buildReportView(pid: string, rid: string): Promise<ReportView> {
  const [settings, project, report, memberships, seqMap] = await Promise.all([
    getSettings(),
    getProject(pid),
    getReport(pid, rid),
    getMemberships(pid, rid),
    reportSequenceMap(pid),
  ]);

  const observations = await Promise.all(
    memberships.map(async (m): Promise<ObservationInReport | null> => {
      const snap = await observationDoc(pid, m.observationId).get();
      const observation = snap.data() as Observation | undefined;
      if (!observation || observation.deletedAt) return null;
      const [events, updatesSnap, attachmentsSnap] = await Promise.all([
        getStatusEvents(pid, observation.id),
        updatesCol(pid, observation.id).get(),
        attachmentsCol(pid).where("observationId", "==", observation.id).get(),
      ]);
      const statusEvents = sortStatusEvents(applicableToReport(events, report));
      const updates = applicableToReport(
        updatesSnap.docs.map((d) => d.data() as ObservationUpdate),
        report,
      ).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
      const attachments = applicableToReport(
        attachmentsSnap.docs.map((d) => d.data() as PhotoAttachment).filter((a) => !a.detachedAt),
        report,
      ).sort((a, b) => a.order - b.order);
      const photos = await Promise.all(attachments.map((a) => photosCol(pid).doc(a.photoId).get()));
      return {
        observation,
        number: observationNumber(observation, seqMap),
        order: m.order,
        statusId: statusOn(statusEvents, report.visitDate),
        statusEvents,
        updates,
        attachments: attachments.flatMap((a, i) =>
          photos[i].exists ? [{ ...a, photo: photos[i].data() as Photo }] : [],
        ),
      };
    }),
  );

  return {
    settings,
    project,
    report,
    observations: observations.filter((o): o is ObservationInReport => o !== null),
  };
}
