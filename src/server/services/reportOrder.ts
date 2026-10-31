import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "../firebaseAdmin";
import { membershipsCol, observationsCol, projectDoc, reportDoc, reportsCol } from "../paths";
import { now } from "../time";
import { UserError } from "../errors";
import { moveTarget, ownNumbering, reportDisplayOrder, type OrderItem } from "@/lib/reportOrder";
import type { Membership, Observation, Project, Report } from "@/lib/types";

/** Everything needed to order one report, read inside a transaction. */
async function readOrder(tx: Transaction, pid: string, rid: string) {
  const [project, report, liveReports, memberships, own] = await Promise.all([
    tx.get(projectDoc(pid)).then((s) => s.data() as Project | undefined),
    tx.get(reportDoc(pid, rid)).then((s) => s.data() as Report | undefined),
    tx.get(reportsCol(pid).where("deletedAt", "==", null)),
    tx.get(membershipsCol(pid, rid)),
    tx.get(observationsCol(pid).where("originReportId", "==", rid)),
  ]);
  if (!project || !report || report.deletedAt) return null;
  const seq = new Map(liveReports.docs.map((d) => [d.id, (d.data() as Report).sequence]));
  const memberIds = memberships.docs.map((d) => d.id);
  const memberObs = memberIds.length ? await tx.getAll(...memberIds.map((id) => observationsCol(pid).doc(id))) : [];
  const orderOf = new Map(memberships.docs.map((d) => [d.id, (d.data() as Membership).order]));
  const items: Array<OrderItem & { obs: Observation }> = memberObs.flatMap((s) => {
    const o = s.data() as Observation | undefined;
    if (!o || o.deletedAt) return [];
    return [{ observationId: o.id, originReportId: o.originReportId, originLocalSeq: o.originLocalSeq, originSequence: seq.get(o.originReportId) ?? 0, groupId: o.groupId ?? null, order: orderOf.get(o.id) ?? 0, obs: o }];
  });
  const groupOrder = new Map(project.groups.map((g) => [g.id, g.order]));
  // Own observations removed from this report keep a number after the ones shown.
  const ownOutside = own.docs
    .map((d) => d.data() as Observation)
    .filter((o) => !o.deletedAt && !orderOf.has(o.id))
    .sort((a, b) => a.originLocalSeq - b.originLocalSeq);
  return { report, items, groupOrder, ownOutside };
}

/** Writes 1..n numbers for the report's own observations in display order. */
function writeNumbers(tx: Transaction, pid: string, rid: string, state: NonNullable<Awaited<ReturnType<typeof readOrder>>>) {
  const ordered = reportDisplayOrder(state.items, rid, state.groupOrder);
  const numbers = ownNumbering(ordered, rid);
  for (const o of state.ownOutside) numbers.set(o.id, numbers.size + 1);
  const byId = new Map([...state.items.map((i) => [i.observationId, i.obs] as const), ...state.ownOutside.map((o) => [o.id, o] as const)]);
  for (const [oid, n] of numbers) {
    const o = byId.get(oid)!;
    if (o.originLocalSeq !== n) tx.update(observationsCol(pid).doc(oid), { originLocalSeq: n, updatedAt: now() });
  }
  if (state.report.nextLocalSeq !== numbers.size + 1) tx.update(reportDoc(pid, rid), { nextLocalSeq: numbers.size + 1 });
}

/**
 * Renumbers a report's own observations to follow their order in the report.
 * Called after anything that changes that order: adding, moving, regrouping,
 * removing or deleting observations.
 */
export async function renumberReport(pid: string, rid: string): Promise<void> {
  await db().runTransaction(
    async (tx) => {
      const state = await readOrder(tx, pid, rid);
      if (state) writeNumbers(tx, pid, rid, state);
    },
    { maxAttempts: 15 },
  );
}

/**
 * Moves one of this report's own observations up or down within its group.
 * It can't pass observations carried from earlier reports, which always come first.
 */
export async function moveObservation(pid: string, rid: string, oid: string, direction: -1 | 1): Promise<void> {
  await db().runTransaction(
    async (tx) => {
      const state = await readOrder(tx, pid, rid);
      if (!state) throw new UserError("Report not found.");
      const me = state.items.find((i) => i.observationId === oid);
      if (!me) throw new UserError("Observation not found in this report.");
      if (me.originReportId !== rid) throw new UserError("Only observations created in this report can be reordered.");
      const ordered = reportDisplayOrder(state.items, rid, state.groupOrder);
      const other = moveTarget(ordered, rid, oid, direction);
      if (!other) return;
      // Swap positions (forcing distinct values if they were ever equal).
      const [a, b] = [me.order, other.order];
      const [na, nb] = a === b ? (direction < 0 ? [a - 1, b] : [a + 1, b]) : [b, a];
      tx.update(membershipsCol(pid, rid).doc(me.observationId), { order: na });
      tx.update(membershipsCol(pid, rid).doc(other.observationId), { order: nb });
      me.order = na;
      other.order = nb;
      writeNumbers(tx, pid, rid, state);
    },
    { maxAttempts: 15 },
  );
}
