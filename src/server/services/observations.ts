import "server-only";
import { db } from "../firebaseAdmin";
import { membershipsCol, observationDoc, observationsCol, reportDoc, statusEventsCol, updatesCol, projectDoc } from "../paths";
import { newId, now } from "../time";
import { ConflictError, UserError } from "../errors";
import { getSettings } from "./settings";
import { renumberReport } from "./reportOrder";
import { isIsoDate } from "@/lib/domain";
import type { Membership, Observation, ObservationUpdate, Report, StatusEvent, Project } from "@/lib/types";

async function assertStatus(statusId: string): Promise<void> {
  const { statuses } = await getSettings();
  if (!statuses.some((s) => s.id === statusId)) throw new UserError("Unknown status.");
}

/** When a project defines groups, every observation must be in one of them. */
function assertGroup(project: Project | undefined, groupId: string | null): void {
  const groups = project?.groups ?? [];
  if (groups.length === 0) return;
  if (!groupId || !groups.some((g) => g.id === groupId)) throw new UserError("Choose a group for this observation.");
}

async function liveReport(pid: string, rid: string): Promise<Report> {
  const report = (await reportDoc(pid, rid).get()).data() as Report | undefined;
  if (!report || report.deletedAt) throw new UserError("Report not found.");
  return report;
}

export interface NewObservationInput {
  title: string;
  description: string;
  statusId: string;
  groupId: string | null;
}

/**
 * Creates a shared observation originating in report `rid`. The origin-local
 * sequence is allocated from the report inside the same transaction, and the
 * observation joins the report with an initial status event on the visit date.
 */
export async function createObservation(pid: string, rid: string, input: NewObservationInput): Promise<string> {
  if (!input.title.trim()) throw new UserError("Observation title is required.");
  await assertStatus(input.statusId);
  const oid = newId();
  await db().runTransaction(async (tx) => {
    const reportRef = reportDoc(pid, rid);
    const report = (await tx.get(reportRef)).data() as Report | undefined;
    if (!report || report.deletedAt) throw new UserError("Report not found.");
    assertGroup((await tx.get(projectDoc(pid))).data() as Project | undefined, input.groupId);
    const last = await tx.get(membershipsCol(pid, rid).orderBy("order", "desc").limit(1));
    const order = last.empty ? 0 : (last.docs[0].data() as Membership).order + 1;

    const observation: Observation = {
      id: oid,
      projectId: pid,
      originReportId: rid,
      originLocalSeq: report.nextLocalSeq,
      title: input.title.trim().slice(0, 300),
      description: input.description.slice(0, 20000),
      originalDate: report.visitDate,
      groupId: input.groupId,
      deletedAt: null,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    const event: StatusEvent = {
      id: newId(),
      observationId: oid,
      statusId: input.statusId,
      date: report.visitDate,
      reportId: rid,
      createdAt: now(),
    };
    const membership: Membership = { observationId: oid, order, addedAt: now() };
    tx.update(reportRef, { nextLocalSeq: report.nextLocalSeq + 1, updatedAt: now() });
    tx.create(observationDoc(pid, oid), observation);
    tx.create(statusEventsCol(pid, oid).doc(event.id), event);
    tx.create(membershipsCol(pid, rid).doc(oid), membership);
  });
  await renumberReport(pid, rid);
  return oid;
}

export type ObservationPatch = Partial<Pick<Observation, "title" | "description" | "groupId" | "originalDate">>;

/**
 * Autosave target for shared observation content. Rejects stale versions.
 * The title, original description and date are the record made in the
 * originating report: from any later report (`inReportId`) they are locked,
 * and only updates and status changes may be added.
 */
export async function updateObservation(
  pid: string,
  oid: string,
  patch: ObservationPatch,
  expectedVersion: number,
  inReportId: string,
): Promise<number> {
  if (patch.title !== undefined && !patch.title.trim()) throw new UserError("Observation title is required.");
  if (patch.originalDate !== undefined && !isIsoDate(patch.originalDate)) throw new UserError("Invalid date.");
  const clean: ObservationPatch = {
    ...patch,
    title: patch.title?.slice(0, 300),
    description: patch.description?.slice(0, 20000),
  };
  let regroupedIn: string | null = null;
  const version = await db().runTransaction(async (tx) => {
    const ref = observationDoc(pid, oid);
    const obs = (await tx.get(ref)).data() as Observation | undefined;
    if (!obs || obs.deletedAt) throw new UserError("Observation not found.");
    if (obs.version !== expectedVersion) throw new ConflictError();
    if (clean.groupId !== undefined && (clean.groupId ?? null) !== (obs.groupId ?? null)) {
      assertGroup((await tx.get(projectDoc(pid))).data() as Project | undefined, clean.groupId ?? null);
      regroupedIn = obs.originReportId;
    }
    const touchesOriginal = clean.title !== undefined || clean.description !== undefined || clean.originalDate !== undefined;
    if (touchesOriginal && obs.originReportId !== inReportId) {
      throw new UserError("The original observation can only be edited in the report where it was created. Add an update instead.");
    }
    tx.update(ref, { ...clean, version: obs.version + 1, updatedAt: now() });
    return obs.version + 1;
  });
  if (regroupedIn) await renumberReport(pid, regroupedIn);
  return version;
}

/**
 * Records the observation's status as of this report's visit. One status event
 * per observation per report: changing it again in the same report edits that
 * event rather than adding noise to the history.
 */
export async function setStatusInReport(pid: string, oid: string, rid: string, statusId: string): Promise<void> {
  await assertStatus(statusId);
  const report = await liveReport(pid, rid);
  const existing = await statusEventsCol(pid, oid).where("reportId", "==", rid).limit(1).get();
  if (!existing.empty) {
    await existing.docs[0].ref.update({ statusId, date: report.visitDate });
    return;
  }
  const event: StatusEvent = { id: newId(), observationId: oid, statusId, date: report.visitDate, reportId: rid, createdAt: now() };
  await statusEventsCol(pid, oid).doc(event.id).create(event);
}

export async function listUpdates(pid: string, oid: string): Promise<ObservationUpdate[]> {
  const snap = await updatesCol(pid, oid).get();
  return snap.docs
    .map((d) => d.data() as ObservationUpdate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

/**
 * Adds the observation's update for this visit. Each report holds at most one
 * update per observation, and none in the report where the observation was
 * created (its description is the record there).
 */
export async function addUpdate(pid: string, oid: string, rid: string, text: string): Promise<string> {
  if (!text.trim()) throw new UserError("Update text is required.");
  const report = await liveReport(pid, rid);
  const id = newId();
  await db().runTransaction(async (tx) => {
    const obs = (await tx.get(observationDoc(pid, oid))).data() as Observation | undefined;
    if (!obs || obs.deletedAt) throw new UserError("Observation not found.");
    if (obs.originReportId === rid) {
      throw new UserError("Updates are added in later reports. In the report where it was created, edit the observation's description instead.");
    }
    const existing = await tx.get(updatesCol(pid, oid).where("reportId", "==", rid).limit(1));
    if (!existing.empty) throw new UserError("This observation already has an update for this visit. Edit that update instead.");
    const sameDay = await tx.get(updatesCol(pid, oid).where("date", "==", report.visitDate));
    const order = sameDay.docs.reduce((max, d) => Math.max(max, (d.data() as ObservationUpdate).order), -1) + 1;
    const update: ObservationUpdate = {
      id,
      observationId: oid,
      reportId: rid,
      date: report.visitDate,
      text: text.slice(0, 20000),
      order,
      createdAt: now(),
      updatedAt: now(),
    };
    tx.create(updatesCol(pid, oid).doc(id), update);
  });
  return id;
}

export async function editUpdate(pid: string, oid: string, updateId: string, text: string): Promise<void> {
  if (!text.trim()) throw new UserError("Update text is required.");
  await updatesCol(pid, oid).doc(updateId).update({ text: text.slice(0, 20000), updatedAt: now() });
}

export async function deleteUpdate(pid: string, oid: string, updateId: string): Promise<void> {
  await updatesCol(pid, oid).doc(updateId).delete();
}

/**
 * Removes a shared observation from the whole project (all reports). It is
 * soft-deleted: history, photos and public links are retained for recovery.
 */
export async function deleteObservation(pid: string, oid: string): Promise<void> {
  const obs = (await observationDoc(pid, oid).get()).data() as Observation | undefined;
  await observationDoc(pid, oid).update({ deletedAt: now(), updatedAt: now() });
  if (obs) await renumberReport(pid, obs.originReportId);
}

export async function listProjectObservations(pid: string): Promise<Observation[]> {
  const snap = await observationsCol(pid).where("deletedAt", "==", null).get();
  return snap.docs.map((d) => d.data() as Observation);
}
