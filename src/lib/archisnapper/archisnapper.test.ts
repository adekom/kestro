import { describe, expect, it } from "vitest";
import { parseLongDate, parsePhotoFileName, parseReport, parseTime, slugify, type TextItem } from "./parse";
import { buildImportPlan, captionText, sameCaption } from "./plan";

// Synthetic reports laid out like an ArchiSnapper export (positions in points).
let page = 1;
const t = (y: number, x: number, text: string, size = 8.3): TextItem => ({ page, x, y, size, text });

function report(n: number, date: string, observations: Array<{ group: string; status: string[]; number: string; title: string; opened?: string; text: string[]; captions?: string[] }>): TextItem[] {
  page = 1;
  const items: TextItem[] = [
    t(659, 43, `Sample Project Ave - Field Report ${n}`, 12),
    t(638, 43, "Sample Project"),
    t(627, 43, "1 Sample Ave"),
    t(617, 43, "Seattle, WA 98134 (US)"),
    t(606, 43, `Report number: Sample Project-${n}`),
    t(596, 43, `Date: ${date} 07:45 PM`),
    t(572, 43, "Ongoing Work", 12),
    t(542, 43, "Framing and drywall."),
    t(518, 43, "Attendees", 12),
    t(493, 47, "Role and company name"),
    t(493, 209, "Name"),
    t(493, 296, "Contact information"),
    t(493, 518, "Present"),
    t(476, 47, "Superintendent"),
    t(466, 47, "[Builder Co]"),
    t(476, 209, "Pat Builder"),
    t(476, 296, "(555) 010-0000"),
    t(466, 296, "pat@builder.example"),
    t(476, 539, "✔"),
  ];
  page = 2;
  items.push(t(752, 44, "Observations", 12), t(717, 47, "Observation"), t(717, 152, "Description"));
  let y = 701;
  let group = "";
  for (const o of observations) {
    if (o.group !== group) {
      items.push(t(y, 47, o.group));
      group = o.group;
      y -= 18;
    }
    // Status words, optionally wrapping onto the number's line ("REQUIRES" / "ATTENTION 8.1").
    if (o.status.length === 2) {
      items.push(t(y, 48, o.status[0]));
      y -= 12;
      items.push(t(y, 47, o.status[1]), t(y, 99, o.number));
    } else items.push(t(y, 48, o.status[0]), t(y, 97, o.number));
    items.push(t(y - 12, 47, o.title), t(y - 24, 48, o.opened ?? date));
    o.text.forEach((line, i) => items.push(t(y + 1 - i * 19, 152, line)));
    (o.captions ?? []).forEach((c, i) => items.push(t(y - 140, 153 + i * 103.5, c, 7.5)));
    y -= 170;
  }
  page = 3;
  items.push(t(752, 43, "Observation summary", 12));
  y = 727;
  group = "";
  for (const o of observations) {
    if (o.group !== group) {
      items.push(t(y, 47, o.group));
      group = o.group;
      y -= 17;
    }
    items.push(t(y, 48, o.status.join(" ")), t(y, 143, o.number), t(y, 158, o.title));
    y -= 17;
  }
  return items;
}

const r1 = report(1, "July 14, 2026", [
  { group: "LEVEL 1", status: ["REQUIRES", "ATTENTION"], number: "1.1", title: "Louvers", text: ["Louvers observed at boiler room."], captions: ["louvers", "close up"] },
  { group: "LEVEL 2", status: ["OBSERVED"], number: "1.2", title: "Stair", text: ["Stair framing."], captions: ["stair"] },
]);
const r2 = report(2, "July 28, 2026", [
  { group: "LEVEL 1", status: ["REQUIRES", "ATTENTION"], number: "1.1", title: "Louvers", opened: "July 14, 2026", text: ["Louvers observed at boiler room.", "Update 07/28/26: Duct rerouted."], captions: ["louvers", "close up", "7/28 ductwork"] },
  { group: "LEVEL 2", status: ["RESOLVED"], number: "1.2", title: "Stair", opened: "July 14, 2026", text: ["Stair framing.", "Update 07/28/26: Complete."], captions: ["stair"] },
  { group: "LEVEL 2", status: ["OBSERVED"], number: "2.1", title: "Window", text: ["Window installed."], captions: [] },
]);

describe("reading ArchiSnapper reports", () => {
  it("reads dates, times and file names", () => {
    expect(parseLongDate("March 23, 2026")).toBe("2026-03-23");
    expect(parseTime("07:45 PM")).toBe("19:45");
    expect(parseTime("12:05 AM")).toBe("00:05");
    expect(parsePhotoFileName("Pictures/observation_5-7_level-0_louvers_2026-02-11-17-17-53-0100_33250278_.jpg")).toMatchObject({
      report: 5,
      number: "5.7",
      groupSlug: "level-0",
      captionSlug: "louvers",
      date: "2026-02-11",
    });
    expect(parsePhotoFileName("observation_12-_level-0_5-19-louvers_2026-05-19-22-34-16-0200_35468951_.JPEG")).toMatchObject({ report: 12, number: null, captionSlug: "5-19-louvers" });
    expect(parsePhotoFileName("notes.txt")).toBeNull();
  });

  it("reads the header, attendees, observations, updates and captions", () => {
    const r = parseReport(r2);
    expect(r).toMatchObject({ sequence: 2, projectName: "Sample Project", address: "1 Sample Ave, Seattle, WA 98134 (US)", headerDate: "2026-07-28", headerTime: "19:45", ongoingWork: "Framing and drywall." });
    expect(r.attendees).toEqual([{ role: "Superintendent", company: "Builder Co", name: "Pat Builder", phone: "(555) 010-0000", email: "pat@builder.example", present: true }]);
    expect(r.observations.map((o) => [o.number, o.status, o.group, o.title])).toEqual([
      ["1.1", "REQUIRES ATTENTION", "LEVEL 1", "Louvers"],
      ["1.2", "RESOLVED", "LEVEL 2", "Stair"],
      ["2.1", "OBSERVED", "LEVEL 2", "Window"],
    ]);
    expect(r.observations[0]).toMatchObject({
      originalDate: "2026-07-14",
      description: "Louvers observed at boiler room.",
      updates: [{ date: "2026-07-28", text: "Duct rerouted." }],
      captions: ["louvers", "close up", "7/28 ductwork"],
    });
    expect(r.warnings).toEqual([]);
  });
});

describe("planning an ArchiSnapper import", () => {
  const files = [
    "observation_1-1_level-1_louvers_2026-07-14-20-00-00-0200_1_.jpg",
    "observation_1-1_level-1_close-up_2026-07-14-20-00-05-0200_2_.jpg",
    "observation_1-2_level-2_stair_2026-07-14-20-01-00-0200_3_.jpg",
    // Report 2 repeats earlier photos without the number, and adds one.
    "observation_2-_level-1_louvers_2026-07-28-20-00-00-0200_4_.jpg",
    "observation_2-_level-1_close-up_2026-07-28-20-00-01-0200_5_.jpg",
    "observation_2-_level-1_7-28-ductwork_2026-07-28-20-00-02-0200_6_.jpg",
    "observation_2-_level-2_stair_2026-07-28-20-00-03-0200_7_.jpg",
    "observation_2-_level-2__2026-07-28-20-00-04-0200_8_.jpg",
  ].map((f) => parsePhotoFileName(f)!);
  const plan = buildImportPlan([parseReport(r2), parseReport(r1)], files);

  it("builds the project, groups, statuses and reports", () => {
    expect(plan.project).toEqual({ name: "Sample Project", address: "1 Sample Ave, Seattle, WA 98134 (US)", reportPrefix: "Field Report " });
    expect(plan.groups).toEqual(["Level 1", "Level 2"]);
    expect(plan.statuses).toEqual([
      { name: "REQUIRES ATTENTION", observations: 1 },
      { name: "OBSERVED", observations: 1 },
      { name: "RESOLVED", observations: 1 },
    ]);
    expect(plan.reports.map((r) => [r.sequence, r.visitDate, r.observations])).toEqual([
      [1, "2026-07-14", ["1.1", "1.2"]],
      [2, "2026-07-28", ["1.1", "1.2", "2.1"]],
    ]);
    expect(plan.contacts).toEqual([{ key: "pat@builder.example", firstName: "Pat", lastName: "Builder", email: "pat@builder.example", phone: "(555) 010-0000", company: "Builder Co", role: "Superintendent" }]);
  });

  it("keeps each observation's origin, status in each report and updates once", () => {
    const louvers = plan.observations.find((o) => o.number === "1.1")!;
    expect(louvers).toMatchObject({ originSequence: 1, localSeq: 1, group: "Level 1", originalDate: "2026-07-14" });
    expect(louvers.updates).toEqual([{ sequence: 2, date: "2026-07-28", text: "Duct rerouted." }]);
    expect(plan.observations.find((o) => o.number === "1.2")!.statuses).toEqual([
      { sequence: 1, status: "OBSERVED" },
      { sequence: 2, status: "RESOLVED" },
    ]);
  });

  it("uploads each photo once, from the report where it first appears, and flags what can't be linked", () => {
    expect(plan.photos.map((p) => [p.number, p.sequence, p.caption, p.order])).toEqual([
      ["1.1", 1, "louvers", 0],
      ["1.1", 1, "close up", 1],
      ["1.2", 1, "stair", 0],
      ["1.1", 2, "ductwork", 2],
    ]);
    expect(plan.duplicateFiles).toBe(3);
    expect(plan.unmatchedFiles).toEqual(["observation_2-_level-2__2026-07-28-20-00-04-0200_8_.jpg"]);
    expect(plan.issues.some((i) => i.level === "warning" && /couldn't be matched/.test(i.message))).toBe(true);
  });

  it("matches captions the way file names write them", () => {
    expect(slugify("5/19 louvers @ Boiler Room")).toBe("5-19-louvers-boiler-room");
    expect(sameCaption("5-5-current-measurement-is-4-10-", slugify(`5/5 current measurement is 4'10"`))).toBe(true);
    expect(sameCaption("5-5-strongback-wall-bottom-plate-anchors-missing-", slugify("5/5 strongback wall. bottom plate anchors missing, A34 clips missing"))).toBe(true);
    expect(sameCaption("stair", "stairs")).toBe(false);
    expect(captionText("5/19 louvers")).toBe("louvers");
  });
});
