// The order observations appear in a field report, and how a report numbers
// its own observations. Pure; shared by the report page, the PDF, the
// deletion preview and the server.
//
// Order: by group (the project's group order; ungrouped last), then within
// each group the observations carried from earlier reports (by number), then
// this report's own observations in the order the user arranged them.
// A report's own observations are numbered 1..n down the report in that order,
// so adding one early in the report shifts the later ones up (6.1 → 6.2).

export interface OrderItem {
  observationId: string;
  originReportId: string;
  originLocalSeq: number;
  /** Current display sequence of the origin report. */
  originSequence: number;
  groupId: string | null;
  /** Position set by the user (membership order) within this report. */
  order: number;
}

const UNGROUPED = Number.MAX_SAFE_INTEGER;

export function reportDisplayOrder<T extends OrderItem>(items: T[], reportId: string, groupOrder: ReadonlyMap<string, number>): T[] {
  const groupRank = (i: T) => (i.groupId != null && groupOrder.has(i.groupId) ? groupOrder.get(i.groupId)! : UNGROUPED);
  const own = (i: T) => i.originReportId === reportId;
  return [...items].sort(
    (a, b) =>
      groupRank(a) - groupRank(b) ||
      Number(own(a)) - Number(own(b)) ||
      (own(a)
        ? a.order - b.order || a.originLocalSeq - b.originLocalSeq
        : a.originSequence - b.originSequence || a.originLocalSeq - b.originLocalSeq) ||
      a.observationId.localeCompare(b.observationId),
  );
}

/** Local numbers (1..n) for the report's own observations, in display order. */
export function ownNumbering(ordered: OrderItem[], reportId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of ordered) if (i.originReportId === reportId) out.set(i.observationId, out.size + 1);
  return out;
}

/**
 * The neighbour an own observation swaps with when moved up or down: the
 * adjacent own observation in the same group. Null at either end, so an own
 * observation never moves above an earlier report's observations.
 */
export function moveTarget(ordered: OrderItem[], reportId: string, observationId: string, direction: -1 | 1): OrderItem | null {
  const me = ordered.find((i) => i.observationId === observationId);
  if (!me || me.originReportId !== reportId) return null;
  const block = ordered.filter((i) => i.originReportId === reportId && (i.groupId ?? null) === (me.groupId ?? null));
  return block[block.indexOf(me) + direction] ?? null;
}
