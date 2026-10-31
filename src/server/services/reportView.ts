import "server-only";
import { attachmentsCol, membershipsCol, observationDoc, photosCol, updatesCol } from "../paths";
import { UserError } from "../errors";
import { getMemberships, getReport, getStatusEvents, listReports, reportSequenceMap } from "./reports";
import { getProject } from "./projects";
import { getSettings } from "./settings";
import { deletedReportIds } from "./reportDeletion";
import { reportDisplayOrder } from "@/lib/reportOrder";
import { applicableToReport, formatLongDate, observationNumber, reportLabel, sortStatusEvents, statusOn } from "@/lib/domain";
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
  const [settings, project, report, memberships, seqMap, hidden] = await Promise.all([
    getSettings(),
    getProject(pid),
    getReport(pid, rid),
    getMemberships(pid, rid),
    reportSequenceMap(pid),
    deletedReportIds(pid),
  ]);

  const observations = await Promise.all(
    memberships.map((m) => observationAsOfReport(pid, m.observationId, report, seqMap, hidden, m.order)),
  );

  const live = observations.filter((o): o is ObservationInReport => o !== null);
  const groupOrder = new Map(project.groups.map((g) => [g.id, g.order]));
  const ordered = reportDisplayOrder(
    live.map((o) => ({
      item: o,
      observationId: o.observation.id,
      originReportId: o.observation.originReportId,
      originLocalSeq: o.observation.originLocalSeq,
      originSequence: seqMap.get(o.observation.originReportId) ?? 0,
      groupId: o.observation.groupId ?? null,
      order: o.order,
    })),
    report.id,
    groupOrder,
  );
  return { settings, project, report, observations: ordered.map((x) => x.item) };
}

/**
 * One observation as of a report's visit: status, updates and photos dated on
 * or before the visit (or recorded in that report), excluding anything
 * recorded in deleted reports (`hidden`). Null if it was deleted.
 */
export async function observationAsOfReport(
  pid: string,
  oid: string,
  report: Report,
  seqMap: Map<string, number>,
  hidden: ReadonlySet<string>,
  order = 0,
): Promise<ObservationInReport | null> {
  const snap = await observationDoc(pid, oid).get();
  const observation = snap.data() as Observation | undefined;
  if (!observation || observation.deletedAt) return null;
  const [events, updatesSnap, attachmentsSnap] = await Promise.all([
    getStatusEvents(pid, oid, hidden),
    updatesCol(pid, oid).get(),
    attachmentsCol(pid).where("observationId", "==", oid).get(),
  ]);
  const statusEvents = sortStatusEvents(applicableToReport(events, report));
  const updates = applicableToReport(
    updatesSnap.docs.map((d) => d.data() as ObservationUpdate).filter((u) => !hidden.has(u.reportId)),
    report,
  ).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  const attachments = applicableToReport(
    attachmentsSnap.docs.map((d) => d.data() as PhotoAttachment).filter((a) => !a.detachedAt && !hidden.has(a.reportId)),
    report,
  ).sort((a, b) => a.order - b.order);
  const photos = await Promise.all(attachments.map((a) => photosCol(pid).doc(a.photoId).get()));
  return {
    observation,
    number: observationNumber(observation, seqMap),
    order,
    statusId: statusOn(statusEvents, report.visitDate),
    statusEvents,
    updates,
    attachments: attachments.flatMap((a, i) => (photos[i].exists ? [{ ...a, photo: photos[i].data() as Photo }] : [])),
  };
}

export interface ObservationDetail {
  item: ObservationInReport;
  /** The report whose visit this view and any edits (status, updates, photos) belong to. */
  report: Report;
  reportLabel: string;
  statuses: OrgSettings["statuses"];
  resolvedStatusId: string;
  groups: Project["groups"];
}

/**
 * Data for the observation editor panel. Without a report given, edits apply
 * to the most recent report that includes the observation.
 */
export async function getObservationDetail(pid: string, oid: string, rid: string | null): Promise<ObservationDetail> {
  const [settings, project, reports, seqMap, hidden] = await Promise.all([
    getSettings(),
    getProject(pid),
    listReports(pid),
    reportSequenceMap(pid),
    deletedReportIds(pid),
  ]);
  let report = rid ? reports.find((r) => r.id === rid) : undefined;
  if (!report) {
    const memberOf = await Promise.all(reports.map(async (r) => ((await membershipsCol(pid, r.id).doc(oid).get()).exists ? r : null)));
    report = memberOf.filter((r): r is Report => r !== null).at(-1);
  }
  if (!report) throw new UserError("This observation isn't in any report.");
  const item = await observationAsOfReport(pid, oid, report, seqMap, hidden);
  if (!item) throw new UserError("Observation not found.");
  return {
    item,
    report,
    reportLabel: `${reportLabel(project.reportPrefix, report.sequence)} · ${formatLongDate(report.visitDate)}`,
    statuses: settings.statuses,
    resolvedStatusId: settings.resolvedStatusId,
    groups: [...project.groups].sort((a, b) => a.order - b.order),
  };
}
