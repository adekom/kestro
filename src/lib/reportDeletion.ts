// Planning for field report deletion with gap-free renumbering (spec §4.1).
// Pure: the confirmation preview and the server transaction both use it, so
// what the user is shown is exactly what happens.
//
// Identity never changes: reports and observations keep their UUIDs. Only the
// derived display numbers move. An observation's number is its originating
// report's current sequence plus its origin-local sequence (e.g. 18.3).

export interface PlanReport {
  id: string;
  sequence: number;
  nextLocalSeq: number;
}

export interface PlanObservation {
  id: string;
  originReportId: string;
  originLocalSeq: number;
}

export interface DeletionPlan {
  /** Remaining reports whose display number changes. */
  renumbered: Array<{ reportId: string; from: number; to: number }>;
  /** Observations that started in a deleted report but live on in a later one. */
  reOriginated: Array<{ observationId: string; toReportId: string; localSeq: number }>;
  /** Observations that existed only in deleted reports; removed with them. */
  removed: string[];
  /** New next-local-sequence counters for reports that received observations. */
  nextLocalSeq: Map<string, number>;
  remainingCount: number;
}

/**
 * @param reports    the project's live reports
 * @param deleteIds  reports to delete
 * @param originating live observations whose origin report is being deleted
 * @param memberOf   observation ID → IDs of every report that includes it
 */
export function planReportDeletion(
  reports: PlanReport[],
  deleteIds: string[],
  originating: PlanObservation[],
  memberOf: ReadonlyMap<string, readonly string[]>,
): DeletionPlan {
  const deleting = new Set(deleteIds);
  const remaining = reports.filter((r) => !deleting.has(r.id)).sort((a, b) => a.sequence - b.sequence);
  const newSeq = new Map(remaining.map((r, i) => [r.id, i + 1]));
  const renumbered = remaining.flatMap((r) =>
    newSeq.get(r.id) !== r.sequence ? [{ reportId: r.id, from: r.sequence, to: newSeq.get(r.id)! }] : [],
  );

  const counters = new Map(remaining.map((r) => [r.id, r.nextLocalSeq]));
  const oldSeq = new Map(reports.map((r) => [r.id, r.sequence]));
  const reOriginated: DeletionPlan["reOriginated"] = [];
  const removed: string[] = [];
  // Stable order: by former number, so 17.1 is placed before 17.2.
  const ordered = [...originating].sort(
    (a, b) => (oldSeq.get(a.originReportId) ?? 0) - (oldSeq.get(b.originReportId) ?? 0) || a.originLocalSeq - b.originLocalSeq,
  );
  for (const o of ordered) {
    const keepers = (memberOf.get(o.id) ?? []).filter((rid) => newSeq.has(rid));
    if (keepers.length === 0) {
      removed.push(o.id);
      continue;
    }
    // The earliest remaining report that includes it becomes its new origin.
    const target = keepers.reduce((best, rid) => (newSeq.get(rid)! < newSeq.get(best)! ? rid : best));
    const localSeq = counters.get(target)!;
    counters.set(target, localSeq + 1);
    reOriginated.push({ observationId: o.id, toReportId: target, localSeq });
  }
  const nextLocalSeq = new Map([...new Set(reOriginated.map((r) => r.toReportId))].map((rid) => [rid, counters.get(rid)!]));
  return { renumbered, reOriginated, removed, nextLocalSeq, remainingCount: remaining.length };
}

/**
 * Observation display numbers before and after a plan, for every observation
 * whose number changes (or that is removed).
 */
export function numberChanges(
  plan: DeletionPlan,
  reports: PlanReport[],
  observations: PlanObservation[],
): Array<{ observationId: string; from: string; to: string | null }> {
  const oldSeq = new Map(reports.map((r) => [r.id, r.sequence]));
  const newSeq = new Map(oldSeq);
  for (const r of plan.renumbered) newSeq.set(r.reportId, r.to);
  const moved = new Map(plan.reOriginated.map((r) => [r.observationId, r]));
  const removed = new Set(plan.removed);
  return observations.flatMap((o): Array<{ observationId: string; from: string; to: string | null }> => {
    const from = `${oldSeq.get(o.originReportId)}.${o.originLocalSeq}`;
    if (removed.has(o.id)) return [{ observationId: o.id, from, to: null }];
    const m = moved.get(o.id);
    const to = m ? `${newSeq.get(m.toReportId)}.${m.localSeq}` : `${newSeq.get(o.originReportId)}.${o.originLocalSeq}`;
    return to === from ? [] : [{ observationId: o.id, from, to }];
  });
}
