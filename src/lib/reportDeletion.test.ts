import { describe, expect, it } from "vitest";
import { numberChanges, planReportDeletion, type PlanObservation, type PlanReport } from "./reportDeletion";

// A realistic project: reports numbered 1–20 with no gaps.
const reports: PlanReport[] = Array.from({ length: 20 }, (_, i) => ({ id: `r${i + 1}`, sequence: i + 1, nextLocalSeq: 4 }));
const obs = (id: string, origin: number, local: number): PlanObservation => ({ id, originReportId: `r${origin}`, originLocalSeq: local });

describe("planReportDeletion", () => {
  it("closes the gap: deleting 17 of 17–20 leaves 17–19", () => {
    const plan = planReportDeletion(reports, ["r17"], [], new Map());
    expect(plan.renumbered).toEqual([
      { reportId: "r18", from: 18, to: 17 },
      { reportId: "r19", from: 19, to: 18 },
      { reportId: "r20", from: 20, to: 19 },
    ]);
    expect(plan.remainingCount).toBe(19);
  });

  it("renumbers nothing when the newest report is deleted", () => {
    expect(planReportDeletion(reports, ["r20"], [], new Map()).renumbered).toEqual([]);
  });

  it("handles several deletions at once without gaps or duplicates", () => {
    const plan = planReportDeletion(reports, ["r17", "r19"], [], new Map());
    expect(plan.renumbered).toEqual([
      { reportId: "r18", from: 18, to: 17 },
      { reportId: "r20", from: 20, to: 18 },
    ]);
  });

  it("moves observations carried into a later report there, and removes the rest", () => {
    const originating = [obs("a", 17, 1), obs("b", 17, 2), obs("c", 17, 3)];
    const memberOf = new Map([
      ["a", ["r17", "r18", "r19"]],
      ["b", ["r17"]],
      ["c", ["r17", "r19"]],
    ]);
    const plan = planReportDeletion(reports, ["r17"], originating, memberOf);
    // Earliest remaining report that includes each one, next free local numbers there.
    expect(plan.reOriginated).toEqual([
      { observationId: "a", toReportId: "r18", localSeq: 4 },
      { observationId: "c", toReportId: "r19", localSeq: 4 },
    ]);
    expect(plan.removed).toEqual(["b"]);
    expect(plan.nextLocalSeq).toEqual(new Map([["r18", 5], ["r19", 5]]));
  });

  it("lists every observation number that changes", () => {
    const all = [obs("x", 16, 1), obs("a", 17, 1), obs("b", 17, 2), obs("y", 18, 3), obs("z", 20, 1)];
    const memberOf = new Map([["a", ["r17", "r18"]], ["b", ["r17"]]]);
    const plan = planReportDeletion(reports, ["r17"], all.filter((o) => o.originReportId === "r17"), memberOf);
    expect(numberChanges(plan, reports, all)).toEqual([
      { observationId: "a", from: "17.1", to: "17.4" }, // moved into old 18, now numbered 17
      { observationId: "b", from: "17.2", to: null },
      { observationId: "y", from: "18.3", to: "17.3" },
      { observationId: "z", from: "20.1", to: "19.1" },
    ]);
  });
});
