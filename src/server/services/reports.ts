import "server-only";
import { db } from "../firebaseAdmin";
import { runTransaction } from "../transactions";
import {
  attachmentsCol,
  membershipsCol,
  observationsCol,
  projectDoc,
  reportDoc,
  reportsCol,
  statusEventsCol,
} from "../paths";
import { newId, now } from "../time";
import { ConflictError, UserError } from "../errors";
import { isIsoDate, observationNumber, preselectForCarryForward, statusOn } from "@/lib/domain";
import type { Attendee, Membership, Observation, Project, Report, StatusEvent } from "@/lib/types";
import { deletedReportIds } from "./reportDeletion";
import { renumberReport } from "./reportOrder";

const MAX_MEMBERSHIPS_PER_CREATE = 400; // stays well inside Firestore's 500-write transaction limit
// Simultaneous report creation in one project contends on the same documents;
// allow extra retries so a busy moment yields a number, not an error.
const CREATE_ATTEMPTS = 15;

export async function listReports(pid: string): Promise<Report[]> {
  const snap = await reportsCol(pid).where("deletedAt", "==", null).get();
  return snap.docs.map((d) => d.data() as Report).sort((a, b) => a.sequence - b.sequence);
}

export async function getReport(pid: string, rid: string): Promise<Report> {
  const snap = await reportDoc(pid, rid).get();
  const report = snap.data() as Report | undefined;
  if (!report || report.deletedAt) throw new UserError("Report not found.");
  return report;
}

/** Current display sequence for every live report, keyed by stable report ID. */
export async function reportSequenceMap(pid: string): Promise<Map<string, number>> {
  return new Map((await listReports(pid)).map((r) => [r.id, r.sequence]));
}

export async function getMemberships(pid: string, rid: string): Promise<Membership[]> {
  const snap = await membershipsCol(pid, rid).orderBy("order").get();
  return snap.docs.map((d) => d.data() as Membership);
}

const NONE: ReadonlySet<string> = new Set();

/** Status history, without events recorded in deleted reports (`hidden`). */
export async function getStatusEvents(pid: string, oid: string, hidden: ReadonlySet<string> = NONE): Promise<StatusEvent[]> {
  const snap = await statusEventsCol(pid, oid).get();
  return snap.docs.map((d) => d.data() as StatusEvent).filter((e) => !e.reportId || !hidden.has(e.reportId));
}

export interface ReportSummary {
  report: Report;
  /** Observation count per status ID as of the report's visit date ("" = no status). */
  statusCounts: Record<string, number>;
}

/** Reports for the project page, each with its observations counted by status. */
export async function reportSummaries(pid: string): Promise<ReportSummary[]> {
  const reports = await listReports(pid);
  const [memberships, hidden] = await Promise.all([Promise.all(reports.map((r) => getMemberships(pid, r.id))), deletedReportIds(pid)]);
  const observationIds = [...new Set(memberships.flat().map((m) => m.observationId))];
  const [obsSnaps, events] = await Promise.all([
    observationIds.length ? db().getAll(...observationIds.map((id) => observationsCol(pid).doc(id))) : [],
    Promise.all(observationIds.map((id) => getStatusEvents(pid, id, hidden))),
  ]);
  const live = new Set(obsSnaps.filter((s) => s.exists && !(s.data() as Observation).deletedAt).map((s) => s.id));
  const eventsById = new Map(observationIds.map((id, i) => [id, events[i]]));
  return reports.map((report, i) => {
    const statusCounts: Record<string, number> = {};
    for (const m of memberships[i]) {
      if (!live.has(m.observationId)) continue;
      const status = statusOn(eventsById.get(m.observationId) ?? [], report.visitDate) ?? "";
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
    return { report, statusCounts };
  });
}

export interface CarryForwardCandidate {
  observationId: string;
  number: string;
  title: string;
  statusId: string | null;
  preselected: boolean;
}

/**
 * Step 2 of carry-forward (spec §6): observations in the source report,
 * preselected unless resolved as of the source visit date, plus older project
 * observations available for manual lookup.
 */
export async function carryForwardCandidates(
  pid: string,
  sourceRid: string,
  resolvedStatusId: string,
): Promise<{ fromSource: CarryForwardCandidate[]; older: CarryForwardCandidate[] }> {
  const [source, memberships, seqMap, obsSnap, hidden] = await Promise.all([
    getReport(pid, sourceRid),
    getMemberships(pid, sourceRid),
    reportSequenceMap(pid),
    observationsCol(pid).where("deletedAt", "==", null).get(),
    deletedReportIds(pid),
  ]);
  const observations = new Map(obsSnap.docs.map((d) => [d.id, d.data() as Observation]));
  const toCandidate = async (o: Observation, inSource: boolean): Promise<CarryForwardCandidate> => {
    const events = await getStatusEvents(pid, o.id, hidden);
    return {
      observationId: o.id,
      number: observationNumber(o, seqMap),
      title: o.title,
      statusId: statusOn(events, source.visitDate),
      preselected: inSource && preselectForCarryForward(events, source.visitDate, resolvedStatusId),
    };
  };
  const inSource = new Set(memberships.map((m) => m.observationId));
  const fromSource = await Promise.all(
    memberships.flatMap((m) => {
      const o = observations.get(m.observationId);
      return o ? [toCandidate(o, true)] : [];
    }),
  );
  const older = await Promise.all(
    [...observations.values()].filter((o) => !inSource.has(o.id)).map((o) => toCandidate(o, false)),
  );
  older.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  return { fromSource, older };
}

export interface CreateReportInput {
  visitDate: string;
  visitTime: string;
  authorName: string;
  sourceReportId: string | null;
  observationIds: string[];
}

/**
 * Creates a report with the next gap-free sequence number. The sequence is
 * allocated inside a transaction that reads the project's live report set,
 * so concurrent creates (or a concurrent renumber) retry rather than collide.
 */
export async function createReport(pid: string, input: CreateReportInput): Promise<string> {
  if (!isIsoDate(input.visitDate)) throw new UserError("Choose a valid visit date.");
  const observationIds = [...new Set(input.observationIds)];
  if (observationIds.length > MAX_MEMBERSHIPS_PER_CREATE) {
    throw new UserError(`A report can carry forward at most ${MAX_MEMBERSHIPS_PER_CREATE} observations at once.`);
  }
  const rid = newId();
  await runTransaction(async (tx) => {
    const project = (await tx.get(projectDoc(pid))).data() as Project | undefined;
    if (!project) throw new UserError("Project not found.");
    const live = await tx.get(reportsCol(pid).where("deletedAt", "==", null));
    if (live.size !== project.reportCount) {
      throw new ConflictError("Report numbering is being updated. Please try again.");
    }

    let attendees: Attendee[] = [];
    if (input.sourceReportId) {
      const source = live.docs.find((d) => d.id === input.sourceReportId)?.data() as Report | undefined;
      if (!source) throw new UserError("The source report no longer exists.");
      // Reuse the attendee list but require presence to be confirmed for this visit.
      attendees = source.attendees.map((a) => ({ ...a, present: false }));
    }
    if (observationIds.length) {
      const obsSnaps = await tx.getAll(...observationIds.map((id) => observationsCol(pid).doc(id)));
      if (obsSnaps.some((s) => !s.exists || (s.data() as Observation).deletedAt)) {
        throw new UserError("One of the selected observations no longer exists.");
      }
    }

    const report: Report = {
      id: rid,
      projectId: pid,
      sequence: project.reportCount + 1,
      visitDate: input.visitDate,
      visitTime: input.visitTime.slice(0, 20),
      authorName: input.authorName.slice(0, 200),
      ongoingWork: "", // deliberately not copied: the user reviews the previous text explicitly
      attendees,
      nextLocalSeq: 1,
      sourceReportId: input.sourceReportId,
      deletedAt: null,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    tx.create(reportDoc(pid, rid), report);
    observationIds.forEach((observationId, order) => {
      const m: Membership = { observationId, order, addedAt: now() };
      tx.create(membershipsCol(pid, rid).doc(observationId), m);
    });
    tx.update(projectDoc(pid), { reportCount: project.reportCount + 1, updatedAt: now() });
  }, CREATE_ATTEMPTS);
  return rid;
}

export interface ReportInfoPatch {
  visitDate?: string;
  visitTime?: string;
  authorName?: string;
  ongoingWork?: string;
  weather?: string;
  attendees?: Attendee[];
}

/** Autosave target for report information. Detects concurrent edits by version. */
export async function updateReportInfo(
  pid: string,
  rid: string,
  patch: ReportInfoPatch,
  expectedVersion: number,
): Promise<number> {
  if (patch.visitDate !== undefined && !isIsoDate(patch.visitDate)) throw new UserError("Choose a valid visit date.");
  const clean: ReportInfoPatch = {
    ...patch,
    visitTime: patch.visitTime?.slice(0, 20),
    ongoingWork: patch.ongoingWork?.slice(0, 20000),
    weather: patch.weather?.slice(0, 300),
    authorName: patch.authorName?.slice(0, 200),
    attendees: patch.attendees?.slice(0, 200).map((a) => ({
      id: a.id || newId(),
      contactId: a.contactId ?? null,
      name: String(a.name).slice(0, 200),
      company: String(a.company).slice(0, 200),
      present: Boolean(a.present),
    })),
  };
  let previousDate = "";
  const version = await db().runTransaction(async (tx) => {
    const ref = reportDoc(pid, rid);
    const report = (await tx.get(ref)).data() as Report | undefined;
    if (!report || report.deletedAt) throw new UserError("Report not found.");
    if (report.version !== expectedVersion) throw new ConflictError();
    previousDate = report.visitDate;
    tx.update(ref, { ...clean, version: report.version + 1, updatedAt: now() });
    return report.version + 1;
  });
  if (clean.visitDate && clean.visitDate !== previousDate) await moveReportDatedEvents(pid, rid, clean.visitDate);
  return version;
}

/** Keeps updates, status events and attachments recorded in this report on its visit date. */
async function moveReportDatedEvents(pid: string, rid: string, date: string): Promise<void> {
  const [updates, events, attachments] = await Promise.all([
    db().collectionGroup("updates").where("reportId", "==", rid).get(),
    db().collectionGroup("statusEvents").where("reportId", "==", rid).get(),
    attachmentsCol(pid).where("reportId", "==", rid).get(),
  ]);
  const docs = [...updates.docs, ...events.docs, ...attachments.docs];
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db().batch();
    docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { date }));
    await batch.commit();
  }
}

export async function addMemberships(pid: string, rid: string, observationIds: string[]): Promise<void> {
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(membershipsCol(pid, rid));
    const present = new Set(existing.docs.map((d) => d.id));
    let order = existing.docs.reduce((max, d) => Math.max(max, (d.data() as Membership).order), -1);
    for (const observationId of observationIds) {
      if (present.has(observationId)) continue;
      const m: Membership = { observationId, order: ++order, addedAt: now() };
      tx.create(membershipsCol(pid, rid).doc(observationId), m);
    }
  });
}

/** Removes the observation from this report only; the shared observation is untouched. */
export async function removeMembership(pid: string, rid: string, oid: string): Promise<void> {
  await membershipsCol(pid, rid).doc(oid).delete();
  await renumberReport(pid, rid);
}

export async function reorderMemberships(pid: string, rid: string, orderedIds: string[]): Promise<void> {
  const batch = db().batch();
  orderedIds.slice(0, 450).forEach((oid, order) => batch.update(membershipsCol(pid, rid).doc(oid), { order }));
  await batch.commit();
}
