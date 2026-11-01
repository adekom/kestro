// Pure domain rules, shared by server code, PDF rendering and tests.
import type { IsoDate, Observation, Report, StatusEvent, DateFormat, NumberFormat } from "./types";

/** Display label for a report, e.g. "Field Report 17". */
export function reportLabel(prefix: string, sequence: number): string {
  return `${prefix}${sequence}`;
}

/**
 * Observation display number: the originating report's CURRENT sequence plus
 * the origin-local sequence (e.g. 18.3). Computed at read time from stable
 * IDs, so renumbering reports never rewrites observation documents.
 */
/** A contact's role on a project: the project's own, else their default role. */
export const roleOnProject = (pc: { projectRole: string } | undefined, contact: { defaultRole?: string } | undefined) =>
  pc?.projectRole || contact?.defaultRole || "";

export function observationNumber(
  obs: Pick<Observation, "originReportId" | "originLocalSeq">,
  reportSequenceById: ReadonlyMap<string, number>,
  numbering: Numbering = { format: "dot" },
): string {
  const seq = reportSequenceById.get(obs.originReportId);
  if (numbering.format === "running") {
    const offset = numbering.offsets?.get(obs.originReportId);
    return offset === undefined ? `?${obs.originLocalSeq}` : String(offset + obs.originLocalSeq);
  }
  const sep = numbering.format === "dash" ? "-" : ".";
  return `${seq ?? "?"}${sep}${obs.originLocalSeq}`;
}

/** How observation numbers are written; running numbers need each report's offset (see runningOffsets). */
export interface Numbering {
  format: NumberFormat;
  offsets?: ReadonlyMap<string, number>;
}

/**
 * For running numbers (1, 2, 3… across the project): how many observations
 * were created in reports before each report, in report order.
 */
export function runningOffsets(
  observations: Array<Pick<Observation, "originReportId">>,
  reportSequenceById: ReadonlyMap<string, number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of observations) counts.set(o.originReportId, (counts.get(o.originReportId) ?? 0) + 1);
  const out = new Map<string, number>();
  let total = 0;
  for (const [rid] of [...reportSequenceById].sort((a, b) => a[1] - b[1])) {
    out.set(rid, total);
    total += counts.get(rid) ?? 0;
  }
  return out;
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

export function contactName(c: { firstName: string; lastName: string }): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

/** Comparison key for contact emails (uniqueness is case-insensitive). */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

// The company's date format. Kestro serves one company per deployment, so a
// single process-wide value is enough: the server sets it whenever settings
// are read, and the app layout sets it in the browser before rendering pages.
let dateFormat: DateFormat = "us";
export function setDateFormat(f: DateFormat | undefined): void {
  if (f === "us" || f === "intl" || f === "iso") dateFormat = f;
}

/** Long display date: "July 14, 2026", "14 July 2026" or "2026-07-14", per the company setting. */
export function formatLongDate(iso: IsoDate, format: DateFormat = dateFormat): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  if (format === "iso") return iso.slice(0, 10);
  return d.toLocaleDateString(format === "intl" ? "en-GB" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Compact date: "07/28/26", "28/07/26" or "2026-07-28", per the company setting. */
export function formatShortDate(iso: IsoDate, format: DateFormat = dateFormat): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  if (format === "iso") return `${y}-${m}-${d.slice(0, 2)}`;
  return format === "intl" ? `${d.slice(0, 2)}/${m}/${y.slice(2)}` : `${m}/${d.slice(0, 2)}/${y.slice(2)}`;
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
