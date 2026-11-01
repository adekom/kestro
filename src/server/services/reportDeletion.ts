import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "../firebaseAdmin";
import { runTransaction } from "../transactions";
import { membershipsCol, observationsCol, projectDoc, reportDoc, reportsCol, statusEventsCol } from "../paths";
import { newId, now } from "../time";
import { ConflictError, UserError } from "../errors";
import { numberChanges, planReportDeletion, type DeletionPlan } from "@/lib/reportDeletion";
import { reportLabel, sortStatusEvents } from "@/lib/domain";
import type { Membership, Observation, Project, Report, StatusEvent } from "@/lib/types";
import { listProjectObservations } from "./observations";
import { renumberReport } from "./reportOrder";
import { ownNumbering, reportDisplayOrder } from "@/lib/reportOrder";

const MAX_DELETE_AT_ONCE = 10;
const MAX_WRITES = 450; // Firestore allows 500 writes per transaction

/** Reports deleted from the project. Their visit's history is hidden everywhere. */
export async function deletedReportIds(pid: string): Promise<Set<string>> {
  const snap = await reportsCol(pid).where("deletedAt", "!=", null).get();
  return new Set(snap.docs.map((d) => d.id));
}

type Getter = <T>(ref: FirebaseFirestore.Query<T> | FirebaseFirestore.DocumentReference<T>) => Promise<unknown>;

interface DeletionState {
  project: Project;
  live: Report[];
  targets: Report[];
  originating: Observation[];
  memberOf: Map<string, string[]>;
  plan: DeletionPlan;
}

/** Reads everything a deletion needs, inside a transaction or not, and plans it. */
async function loadState(pid: string, rids: string[], tx?: Transaction): Promise<DeletionState> {
  const ids = [...new Set(rids)];
  if (ids.length === 0) throw new UserError("Choose at least one field report.");
  if (ids.length > MAX_DELETE_AT_ONCE) throw new UserError(`Delete at most ${MAX_DELETE_AT_ONCE} field reports at a time.`);
  const get: Getter = (ref) => (tx ? tx.get(ref as never) : (ref as { get: () => Promise<unknown> }).get());

  const projectSnap = (await get(projectDoc(pid))) as FirebaseFirestore.DocumentSnapshot;
  const project = projectSnap.data() as Project | undefined;
  if (!project) throw new UserError("Project not found.");
  const liveSnap = (await get(reportsCol(pid).where("deletedAt", "==", null))) as FirebaseFirestore.QuerySnapshot;
  const live = liveSnap.docs.map((d) => d.data() as Report);
  if (live.length !== project.reportCount) throw new ConflictError("Report numbering is being updated. Please try again.");
  const targets = live.filter((r) => ids.includes(r.id));
  if (targets.length !== ids.length) throw new UserError("One of these field reports was already deleted.");

  const obsSnap = (await get(observationsCol(pid).where("originReportId", "in", ids))) as FirebaseFirestore.QuerySnapshot;
  const originating = obsSnap.docs.map((d) => d.data() as Observation).filter((o) => !o.deletedAt);
  const memberOf = new Map<string, string[]>();
  for (let i = 0; i < originating.length; i += 30) {
    const chunk = originating.slice(i, i + 30).map((o) => o.id);
    const snap = (await get(db().collectionGroup("memberships").where("observationId", "in", chunk))) as FirebaseFirestore.QuerySnapshot;
    for (const d of snap.docs) {
      const rid = d.ref.parent.parent!.id;
      const oid = d.get("observationId") as string;
      memberOf.set(oid, [...(memberOf.get(oid) ?? []), rid]);
    }
  }
  const plan = planReportDeletion(live, ids, originating, memberOf);
  return { project, live, targets, originating, memberOf, plan };
}

/** Final local numbers in reports that receive moved observations, as renumberReport will set them. */
async function simulateRenumbering(pid: string, state: DeletionState, observations: Observation[]): Promise<Map<string, number>> {
  const { project, plan } = state;
  const newSeq = new Map(state.live.map((r) => [r.id, r.sequence]));
  for (const r of plan.renumbered) newSeq.set(r.reportId, r.to);
  const moved = new Map(plan.reOriginated.map((m) => [m.observationId, m]));
  const obsById = new Map(observations.map((o) => [o.id, o]));
  const groupOrder = new Map(project.groups.map((g) => [g.id, g.order]));
  const out = new Map<string, number>();
  for (const rid of plan.nextLocalSeq.keys()) {
    const members = (await membershipsCol(pid, rid).get()).docs.map((d) => d.data() as Membership);
    const items = members.flatMap((m) => {
      const o = obsById.get(m.observationId);
      if (!o) return [];
      const mv = moved.get(o.id);
      const origin = mv ? mv.toReportId : o.originReportId;
      return [{ observationId: o.id, originReportId: origin, originLocalSeq: mv ? mv.localSeq : o.originLocalSeq, originSequence: newSeq.get(origin) ?? 0, groupId: o.groupId ?? null, order: m.order }];
    });
    for (const [oid, n] of ownNumbering(reportDisplayOrder(items, rid, groupOrder), rid)) out.set(oid, n);
  }
  return out;
}

export interface DeletionPreview {
  deleting: string[];
  renumbered: Array<{ from: string; to: string }>;
  observationChanges: Array<{ from: string; to: string; title: string }>;
  removedObservations: Array<{ number: string; title: string }>;
}

/** What deleting these reports would do. Changes nothing. */
export async function previewReportDeletion(pid: string, rids: string[]): Promise<DeletionPreview> {
  const [state, observations] = await Promise.all([loadState(pid, rids), listProjectObservations(pid)]);
  const { project, live, targets, plan } = state;
  const label = (n: number) => reportLabel(project.reportPrefix, n);
  const titleById = new Map(observations.map((o) => [o.id, o.title]));
  const changes = numberChanges(plan, live, observations, await simulateRenumbering(pid, state, observations));
  return {
    deleting: [...targets].sort((a, b) => a.sequence - b.sequence).map((r) => label(r.sequence)),
    renumbered: plan.renumbered.map((r) => ({ from: label(r.from), to: label(r.to) })),
    observationChanges: changes.flatMap((c) => (c.to ? [{ from: c.from, to: c.to, title: titleById.get(c.observationId) ?? "" }] : [])),
    removedObservations: changes.flatMap((c) => (c.to ? [] : [{ number: c.from, title: titleById.get(c.observationId) ?? "" }])),
  };
}

/**
 * Deletes field reports and renumbers the rest without gaps, in one
 * transaction: nobody ever sees half-renumbered reports, and concurrent
 * report creation or deletion retries instead of colliding.
 *
 * Deleted reports are kept, marked deleted (no restore in the app). Their
 * visit's updates, status changes and photos are hidden everywhere.
 * Observations that started in a deleted report move to the earliest
 * remaining report that includes them (dated to that visit, keeping their
 * latest status); those found only in deleted reports are removed with them.
 */
export async function deleteReports(pid: string, rids: string[], deletedBy: string): Promise<void> {
  let receivers: string[] = [];
  await runTransaction(
    async (tx) => {
      const { live, targets, originating, plan } = await loadState(pid, rids, tx);
      receivers = [...plan.nextLocalSeq.keys()];
      const byId = new Map(live.map((r) => [r.id, r]));
      const deleting = new Set(targets.map((r) => r.id));

      // Status history of moved observations (reads must precede writes).
      const moved = plan.reOriginated;
      const eventSnaps = await Promise.all(moved.map((m) => tx.get(statusEventsCol(pid, m.observationId))));

      const writes = targets.length + plan.renumbered.length + plan.nextLocalSeq.size + moved.length * 2 + plan.removed.length + 1;
      if (writes > MAX_WRITES) throw new UserError("This deletion affects too many records to apply at once. Delete fewer reports at a time.");

      const at = now();
      for (const r of targets) {
        tx.update(reportDoc(pid, r.id), { deletedAt: at, deletedBy, deletedSequence: r.sequence, updatedAt: at });
      }
      // One write per remaining report, combining its new number and counter.
      const reportPatches = new Map<string, Record<string, unknown>>();
      for (const r of plan.renumbered) reportPatches.set(r.reportId, { sequence: r.to });
      for (const [rid, next] of plan.nextLocalSeq) reportPatches.set(rid, { ...reportPatches.get(rid), nextLocalSeq: next });
      for (const [rid, patch] of reportPatches) tx.update(reportDoc(pid, rid), { ...patch, updatedAt: at });

      const obsById = new Map(originating.map((o) => [o.id, o]));
      moved.forEach((m, i) => {
        const target = byId.get(m.toReportId)!;
        const o = obsById.get(m.observationId)!;
        tx.update(observationsCol(pid).doc(m.observationId), {
          originReportId: m.toReportId,
          originLocalSeq: m.localSeq,
          originalDate: target.visitDate,
          version: o.version + 1,
          updatedAt: at,
        });
        // Its first status was recorded in the deleted visit, which is now hidden.
        // Record the latest status in the new origin report unless it has one.
        const events = eventSnaps[i].docs.map((d) => d.data() as StatusEvent);
        const visible = events.filter((e) => !e.reportId || !deleting.has(e.reportId));
        const hasOwn = visible.some((e) => e.reportId === m.toReportId || e.date <= target.visitDate);
        const latest = sortStatusEvents(events).at(-1);
        if (!hasOwn && latest) {
          const event: StatusEvent = { id: newId(), observationId: m.observationId, statusId: latest.statusId, date: target.visitDate, reportId: m.toReportId, createdAt: at };
          tx.create(statusEventsCol(pid, m.observationId).doc(event.id), event);
        }
      });
      for (const oid of plan.removed) {
        tx.update(observationsCol(pid).doc(oid), { deletedAt: at, deletedWithReportId: obsById.get(oid)!.originReportId, updatedAt: at });
      }
      tx.update(projectDoc(pid), { reportCount: plan.remainingCount, updatedAt: at });
    },
  );
  // Moved observations take their place in the receiving reports' numbering.
  for (const rid of receivers) await renumberReport(pid, rid);
}
