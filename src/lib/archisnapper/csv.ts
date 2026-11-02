// Reads ArchiSnapper's CSV export (reports.csv): one row per observation per
// report, with its status code, group, number, notes (description and
// updates), date opened and the links to its pictures in that report.
//
// The CSV doesn't include attendees, photo captions or status names (only
// codes). When the report PDFs are also in the export, those come from them.

import { parseNotes, type SourceObservation, type SourceReport } from "./parse";

export type CsvRecord = Record<string, string>;

/** RFC 4180 CSV (quoted fields may contain commas, quotes and line breaks). */
export function parseCsv(text: string): CsvRecord[] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (s[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

/** Whether the records look like an ArchiSnapper reports export. */
export const isArchiSnapperCsv = (records: CsvRecord[]) =>
  records.length > 0 && ["Unique ID", "Remark Number", "Remark Notes", "Remark Pictures"].every((k) => k in records[0]);

/** Picture ID from its link: ".../images/031/634/489/original/..." → "31634489". */
export function pictureId(url: string): string | null {
  const m = url.match(/images\/(\d+)\/(\d+)\/(\d+)\//);
  return m ? (m[1] + m[2] + m[3]).replace(/^0+/, "") : null;
}

/** Names for the status codes when no report PDF says what the firm called them. */
const CODE_NAMES: Record<string, string> = { ok: "OK", not_ok: "NOT OK", undefined: "NO STATUS" };

/** "2026/03/24-03:20" → ["2026-03-24", "03:20"]. */
function csvDateTime(s: string): [string, string] {
  const m = s.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})(?:-(\d{2}):(\d{2}))?/);
  return m ? [`${m[1]}-${m[2]}-${m[3]}`, m[4] ? `${m[4]}:${m[5]}` : ""] : ["", ""];
}

/**
 * Turns CSV rows into one report per "Unique ID" (e.g. "800 Maynard-17"), in
 * the same shape the PDF reader produces. `pdfs` (reports read from the PDFs,
 * if any) supply attendees, status names, captions and the printed order.
 */
export function reportsFromCsv(records: CsvRecord[], pdfs: SourceReport[] = []): SourceReport[] {
  const byReport = new Map<string, CsvRecord[]>();
  for (const r of records) {
    if (r["Archived"] === "true") continue;
    const id = r["Unique ID"];
    byReport.set(id, [...(byReport.get(id) ?? []), r]);
  }
  const reports: SourceReport[] = [];
  for (const [uid, rows] of byReport) {
    const sequence = Number(uid.match(/-(\d+)\s*$/)?.[1] ?? NaN);
    const pdf = pdfs.find((p) => p.sequence === sequence);
    const warnings: string[] = [];
    if (!Number.isFinite(sequence)) warnings.push(`The report number in “${uid}” couldn't be read.`);
    if (pdfs.length && !pdf) warnings.push("There's no PDF for this report, so its attendees and photo captions aren't imported.");
    const first = rows[0];
    const [headerDate, headerTime] = csvDateTime(first["Date"] ?? "");

    const observations: SourceObservation[] = rows.map((r) => {
      const number = r["Remark Number"].trim();
      const printed = pdf?.observations.find((o) => o.number === number);
      const code = (r["Remark Status"] || "undefined").trim();
      const { description, updates } = parseNotes(r["Remark Notes"] ?? "");
      return {
        number,
        status: printed?.status || CODE_NAMES[code] || code.toUpperCase(),
        title: (r["Remark"] ?? "").trim(),
        group: (r["Remark Category"] ?? "").trim() || null,
        originalDate: /^\d{4}-\d{2}-\d{2}$/.test(r["Remark Date"] ?? "") ? r["Remark Date"] : (printed?.originalDate ?? null),
        description,
        updates,
        captions: printed?.captions ?? [],
        photoIds: (r["Remark Pictures"] ?? "").split(/\s*\*{6}\s*/).map((u) => pictureId(u)).filter((x): x is string => Boolean(x)),
      };
    });
    // Printed order when there's a PDF (it follows the report's groups); CSV order otherwise.
    if (pdf) {
      const pos = new Map(pdf.observations.map((o, i) => [o.number, i]));
      observations.sort((a, b) => (pos.get(a.number) ?? 1e9) - (pos.get(b.number) ?? 1e9));
      const missing = pdf.observations.filter((o) => !observations.some((x) => x.number === o.number)).map((o) => o.number);
      if (missing.length) warnings.push(`The PDF shows observation${missing.length === 1 ? "" : "s"} ${missing.join(", ")}, which the CSV doesn't list.`);
    }

    reports.push({
      sequence,
      title: pdf?.title ?? `${first["Name"]} - Field Report ${sequence}`,
      projectName: (first["Name"] ?? "").trim(),
      address: [first["Adress line 1"], first["Adress line 2"], first["Address line 1"], first["Address line 2"]].filter((x) => x?.trim()).join(", "),
      headerDate,
      headerTime,
      ongoingWork: (first["Status"] ?? "").trim(),
      attendees: pdf?.attendees ?? [],
      observations,
      disclaimer: pdf?.disclaimer ?? "",
      warnings,
    });
  }
  return reports.sort((a, b) => a.sequence - b.sequence);
}
