import { describe, expect, it } from "vitest";
import { isArchiSnapperCsv, parseCsv, pictureId, reportsFromCsv } from "./csv";
import { matchUpdate, parseNotes, parsePhotoFileName, type SourceReport } from "./parse";
import { alignPhotos, buildImportPlan } from "./plan";

const HEAD = "Name,Adress line 1,Adress line 2,Unique ID,Date,Status,Remark,Remark Status,Remark Category,Remark Number,Remark Notes,Remark Pictures,Remark Date,Archived";
const url = (id: string) => `https://example.org/checklist_pictures/images/0${id.slice(0, 2)}/${id.slice(2, 5)}/${id.slice(5)}/original/x.jpg?1`;
const row = (cells: string[]) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
const csv = [
  HEAD,
  row(["Sample", "1 Sample Ave", "Seattle, WA", "Sample-1", "2026/07/14-19:45", "Framing.", "Louvers", "not_ok", "LEVEL 1", "1.1", "Louvers observed.\r\n1. Seal opening.", url("31634489"), "2026-07-14", "false"]),
  row(["Sample", "1 Sample Ave", "Seattle, WA", "Sample-2", "2026/07/28-19:30", "Drywall, \"phase 2\".", "Louvers", "ok", "LEVEL 1", "1.1", "Louvers observed.\r\n1. Seal opening.  ******  Update 07/28/26: Sealed.", `${url("31634490")}  ******  ${url("31634491")}`, "2026-07-14", "false"]),
].join("\r\n");
const files = [
  "observation_1-1_level-1__2026-07-14-20-00-00-0200_31634489_.jpg",
  "observation_2-_level-1_louvers_2026-07-28-20-00-00-0200_31634490_.jpg",
  "observation_2-_level-1_7-28-sealed_2026-07-28-20-00-01-0200_31634491_.jpg",
].map((f) => parsePhotoFileName(f)!);

describe("reading the ArchiSnapper CSV", () => {
  it("parses quoted fields with commas, quotes and line breaks", () => {
    const records = parseCsv(csv);
    expect(isArchiSnapperCsv(records)).toBe(true);
    expect(records).toHaveLength(2);
    expect(records[1]["Status"]).toBe('Drywall, "phase 2".');
    expect(records[0]["Remark Notes"]).toBe("Louvers observed.\r\n1. Seal opening.");
    expect(pictureId(url("31634489"))).toBe("31634489");
  });

  it("splits notes into the description and updates", () => {
    expect(parseNotes("Seen.\r 1. First.\r   \r 2. Second.  ******  Update 6/16/26: No update.  ******  12/2/25 Update: Removed.  ******  Done.")).toEqual({
      description: "Seen.\n1. First.\n\n2. Second.",
      updates: [
        { date: "2026-06-16", text: "No update." },
        { date: "2025-12-02", text: "Removed." },
        { date: "", text: "Done." },
      ],
    });
    expect(matchUpdate("Updated 06/30/2026: Awaiting.")).toEqual({ date: "2026-06-30", text: "Awaiting." });
    expect(matchUpdate("Opening provided.")).toBeNull();
  });

  it("builds reports, using the PDFs for status names, captions and attendees", () => {
    const pdf: SourceReport = {
      sequence: 2, title: "Sample - Field Report 2", projectName: "Sample", address: "", headerDate: "2026-07-28", headerTime: "19:30", ongoingWork: "",
      attendees: [{ role: "Superintendent", company: "Builder Co", name: "Pat Builder", phone: "", email: "pat@builder.example", present: true }],
      observations: [{ number: "1.1", status: "RESOLVED", title: "Louvers", group: "LEVEL 1", originalDate: "2026-07-14", description: "", updates: [], captions: ["louvers", "7/28 sealed"] }],
      disclaimer: "", warnings: [],
    };
    const reports = reportsFromCsv(parseCsv(csv), [pdf]);
    expect(reports.map((r) => [r.sequence, r.headerDate, r.headerTime, r.ongoingWork, r.address])).toEqual([
      [1, "2026-07-14", "19:45", "Framing.", "1 Sample Ave, Seattle, WA"],
      [2, "2026-07-28", "19:30", 'Drywall, "phase 2".', "1 Sample Ave, Seattle, WA"],
    ]);
    expect(reports[0].observations[0]).toMatchObject({ number: "1.1", status: "NOT OK", group: "LEVEL 1", photoIds: ["31634489"] });
    expect(reports[1].observations[0]).toMatchObject({ status: "RESOLVED", updates: [{ date: "2026-07-28", text: "Sealed." }], photoIds: ["31634490", "31634491"] });
    expect(reports[1].attendees).toHaveLength(1);
    expect(reports[0].warnings).toEqual(["There's no PDF for this report, so its attendees and photo captions aren't imported."]);

    // Each photo once: report 2 repeats report 1's (now captioned) and adds one.
    const plan = buildImportPlan(reports, files);
    expect(plan.photos.map((p) => [p.sequence, p.caption, p.order])).toEqual([
      [1, "louvers", 0],
      [2, "sealed", 1],
    ]);
    expect(plan.duplicateFiles).toBe(1);
    expect(plan.unmatchedFiles).toEqual([]);
  });

  it("lines photo lists up in order, with missing captions matching any", () => {
    expect([...alignPhotos(["a", "b"], ["a", "b", "c"])]).toEqual([[0, 0], [1, 1]]);
    expect([...alignPhotos(["a", "", "c"], ["a", "x", "c"])]).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect([...alignPhotos(["a", "b", "c"], ["c"])]).toEqual([[0, 2]]);
  });
});
