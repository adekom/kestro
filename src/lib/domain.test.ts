import { describe, expect, it } from "vitest";
import { applicableToReport, formatLongDate, formatShortDate, groupNameKey, isIsoDate, observationNumber, preselectForCarryForward, reportLabel, runningOffsets, slug, sortAttendance, statusOn } from "./domain";
import type { StatusEvent } from "./types";

const ev = (statusId: string, date: string, createdAt = `${date}T12:00:00Z`, id = `${statusId}-${date}`): StatusEvent => ({
  id,
  observationId: "o1",
  statusId,
  date,
  reportId: null,
  createdAt,
});

describe("observationNumber", () => {
  it("uses the originating report's current sequence", () => {
    const seq = new Map([["r18", 18]]);
    expect(observationNumber({ originReportId: "r18", originLocalSeq: 3 }, seq)).toBe("18.3");
  });

  it("follows the origin report when it is renumbered", () => {
    const after = new Map([["r18", 17]]); // report 17 deleted; r18 now displays as 17
    expect(observationNumber({ originReportId: "r18", originLocalSeq: 3 }, after)).toBe("17.3");
  });

  it("flags an unknown origin rather than inventing a number", () => {
    expect(observationNumber({ originReportId: "gone", originLocalSeq: 2 }, new Map())).toBe("?.2");
  });
});

describe("statusOn", () => {
  const events = [ev("open", "2026-07-14"), ev("resolved", "2026-08-11"), ev("in-progress", "2026-07-28")];

  it("returns the status effective on the date, not the newest", () => {
    expect(statusOn(events, "2026-07-28")).toBe("in-progress");
    expect(statusOn(events, "2026-08-01")).toBe("in-progress");
    expect(statusOn(events, "2026-08-11")).toBe("resolved");
  });

  it("returns null before any status was recorded", () => {
    expect(statusOn(events, "2026-07-01")).toBeNull();
  });

  it("breaks same-day ties by creation time", () => {
    const sameDay = [ev("resolved", "2026-07-14", "2026-07-14T15:00:00Z"), ev("open", "2026-07-14", "2026-07-14T09:00:00Z")];
    expect(statusOn(sameDay, "2026-07-14")).toBe("resolved");
  });
});

describe("preselectForCarryForward", () => {
  it("excludes observations resolved as of the source visit", () => {
    expect(preselectForCarryForward([ev("resolved", "2026-07-28")], "2026-07-28", "resolved")).toBe(false);
  });

  it("includes observations with any other status", () => {
    expect(preselectForCarryForward([ev("open", "2026-07-28")], "2026-07-28", "resolved")).toBe(true);
  });

  it("ignores status changes after the source visit", () => {
    const events = [ev("open", "2026-07-28"), ev("resolved", "2026-08-11")];
    expect(preselectForCarryForward(events, "2026-07-28", "resolved")).toBe(true);
  });

  it("depends on the resolved ID, not the label", () => {
    // Re-designating which status is resolved changes future preselection only.
    expect(preselectForCarryForward([ev("closed", "2026-07-28")], "2026-07-28", "closed")).toBe(false);
  });
});

describe("applicableToReport", () => {
  it("keeps items on or before the visit and items recorded in the report", () => {
    const items = [
      { id: "a", date: "2026-07-14", reportId: "r16" },
      { id: "b", date: "2026-07-28", reportId: "r17" },
      { id: "c", date: "2026-08-11", reportId: "r18" },
    ];
    expect(applicableToReport(items, { id: "r17", visitDate: "2026-07-28" }).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("groupNameKey", () => {
  it("treats names differing only in case or spacing as the same", () => {
    expect(groupNameKey("  Level  0 ")).toBe(groupNameKey("level 0"));
    expect(groupNameKey("Roof")).not.toBe(groupNameKey("Roofs"));
  });
});

describe("formatting helpers", () => {
  it("builds report labels", () => expect(reportLabel("Field Report ", 17)).toBe("Field Report 17"));
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-07-14")).toBe(true);
    expect(isIsoDate("2026-13-45")).toBe(false);
    expect(isIsoDate("14/07/2026")).toBe(false);
  });
  it("makes safe filename slugs", () => expect(slug("800 Main St. / Phase 2")).toBe("800-Main-St-Phase-2"));
});

describe("company formats", () => {
  it("writes dates in each format", () => {
    expect(formatLongDate("2026-07-14", "us")).toBe("July 14, 2026");
    expect(formatLongDate("2026-07-14", "intl")).toBe("14 July 2026");
    expect(formatLongDate("2026-07-14", "iso")).toBe("2026-07-14");
    expect(formatShortDate("2026-07-28", "us")).toBe("07/28/26");
    expect(formatShortDate("2026-07-28", "intl")).toBe("28/07/26");
    expect(formatShortDate("2026-07-28", "iso")).toBe("2026-07-28");
  });
  it("writes observation numbers in each format", () => {
    const seq = new Map([["r1", 1], ["r2", 2], ["r3", 3]]);
    const o = { originReportId: "r3", originLocalSeq: 2 };
    expect(observationNumber(o, seq, { format: "dot" })).toBe("3.2");
    expect(observationNumber(o, seq, { format: "dash" })).toBe("3-2");
    // Two observations from report 1, none from report 2, so report 3's second is number 4.
    const offsets = runningOffsets([{ originReportId: "r1" }, { originReportId: "r1" }, { originReportId: "r3" }, { originReportId: "r3" }], seq);
    expect(observationNumber(o, seq, { format: "running", offsets })).toBe("4");
    expect(observationNumber({ originReportId: "r1", originLocalSeq: 1 }, seq, { format: "running", offsets })).toBe("1");
  });
});

describe("attendance order", () => {
  const people = [
    { company: "Build Co", firstName: "Zoe" },
    { company: "", firstName: "Al" },
    { company: "Acme", firstName: "Sam" },
    { company: "build co", firstName: "Ann" },
  ];
  it("sorts by company, then first name, with no company last", () => {
    expect(sortAttendance(people, "company", (p) => p).map((p) => p.firstName)).toEqual(["Sam", "Ann", "Zoe", "Al"]);
  });
  it("keeps the order added when chosen", () => {
    expect(sortAttendance(people, "added", (p) => p)).toBe(people);
  });
});
