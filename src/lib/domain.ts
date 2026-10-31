// Pure domain rules, shared by server code, PDF rendering and tests.
import type { IsoDate, Observation, Report, StatusEvent } from "./types";

/** Display label for a report, e.g. "Field Report 17". */
export function reportLabel(prefix: string, sequence: number): string {
  return `${prefix}${sequence}`;
}

/**
 * Observation display number: the originating report's CURRENT sequence plus
 * the origin-local sequence (e.g. 18.3). Computed at read time from stable
 * IDs, so renumbering reports never rewrites observation documents.
 */
export function observationNumber(
  obs: Pick<Observation, "originReportId" | "originLocalSeq">,
  reportSequenceById: ReadonlyMap<string, number>,
): string {
  const seq = reportSequenceById.get(obs.originReportId);
  return seq === undefined ? `?.${obs.originLocalSeq}` : `${seq}.${obs.originLocalSeq}`;
}

/** Order status events deterministically: by effective date, then creation time, then ID. */
export function sortStatusEvents<T extends Pick<StatusEvent, "date" | "createdAt" | "id">>(events: T[]): T[] {
  return [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** The status in effect on `date` (inclusive), or null if none was recorded yet. */
export function statusOn(events: StatusEvent[], date: IsoDate): string | null {
  let current: string | null = null;
  for (const e of sortStatusEvents(events)) {
    if (e.date > date) break;
    current = e.statusId;
  }
  return current;
}

/** Carry-forward default: preselect when the status as of the source visit is not resolved. */
export function preselectForCarryForward(
  eventsAsOfSource: StatusEvent[],
  sourceVisitDate: IsoDate,
  resolvedStatusId: string,
): boolean {
  return statusOn(eventsAsOfSource, sourceVisitDate) !== resolvedStatusId;
}

/** Items applicable to a report: dated on or before the visit, or explicitly attached in it. */
export function applicableToReport<T extends { date: IsoDate; reportId: string | null }>(
  items: T[],
  report: Pick<Report, "id" | "visitDate">,
): T[] {
  return items.filter((i) => i.date <= report.visitDate || i.reportId === report.id);
}

/** Comparison key for group names: unique ignoring case and surrounding/repeated spaces. */
export function groupNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Safe filename fragment. */
export function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, 60) || "project";
}
