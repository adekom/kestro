import { describe, expect, it } from "vitest";
import { moveTarget, ownNumbering, reportDisplayOrder, type OrderItem } from "./reportOrder";

// Report 6 (r6) carries observations from report 5 (r5) and has its own.
const item = (id: string, origin: "r5" | "r6", local: number, groupId: string | null, order: number): OrderItem => ({
  observationId: id,
  originReportId: origin,
  originLocalSeq: local,
  originSequence: origin === "r5" ? 5 : 6,
  groupId,
  order,
});
const groups = new Map([["ext", 0], ["l1", 1]]);
const ids = (xs: OrderItem[]) => xs.map((x) => x.observationId);

describe("reportDisplayOrder", () => {
  it("orders by group, then earlier reports' observations, then this report's own", () => {
    const items = [
      item("own-l1", "r6", 1, "l1", 0),
      item("old-l1", "r5", 2, "l1", 1),
      item("own-ext", "r6", 2, "ext", 5),
      item("old-ext", "r5", 1, "ext", 9),
      item("own-none", "r6", 3, null, 2),
    ];
    expect(ids(reportDisplayOrder(items, "r6", groups))).toEqual(["old-ext", "own-ext", "old-l1", "own-l1", "own-none"]);
  });

  it("orders this report's own observations by the user's arrangement", () => {
    const items = [item("b", "r6", 1, "ext", 2), item("a", "r6", 2, "ext", 1)];
    expect(ids(reportDisplayOrder(items, "r6", groups))).toEqual(["a", "b"]);
  });
});

describe("ownNumbering", () => {
  it("numbers own observations down the report, so one added in an early group shifts the rest", () => {
    const before = [item("x", "r6", 1, "l1", 0), item("y", "r6", 2, "l1", 1)];
    const added = [...before, item("new", "r6", 3, "ext", 2)];
    const ordered = reportDisplayOrder(added, "r6", groups);
    expect(Object.fromEntries(ownNumbering(ordered, "r6"))).toEqual({ new: 1, x: 2, y: 3 });
  });

  it("ignores observations carried from earlier reports", () => {
    const ordered = reportDisplayOrder([item("old", "r5", 4, null, 0), item("mine", "r6", 7, null, 1)], "r6", groups);
    expect(Object.fromEntries(ownNumbering(ordered, "r6"))).toEqual({ mine: 1 });
  });
});

describe("moveTarget", () => {
  const ordered = reportDisplayOrder(
    [item("old", "r5", 1, "ext", 0), item("a", "r6", 1, "ext", 1), item("b", "r6", 2, "ext", 2), item("c", "r6", 3, "l1", 3)],
    "r6",
    groups,
  );
  it("swaps with the adjacent own observation in the same group", () => {
    expect(moveTarget(ordered, "r6", "b", -1)?.observationId).toBe("a");
    expect(moveTarget(ordered, "r6", "a", 1)?.observationId).toBe("b");
  });
  it("never moves above an earlier report's observation or across groups", () => {
    expect(moveTarget(ordered, "r6", "a", -1)).toBeNull();
    expect(moveTarget(ordered, "r6", "b", 1)).toBeNull();
    expect(moveTarget(ordered, "r6", "c", -1)).toBeNull();
  });
  it("does not move earlier reports' observations", () => {
    expect(moveTarget(ordered, "r6", "old", 1)).toBeNull();
  });
});
