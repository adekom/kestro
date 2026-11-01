import { describe, expect, it } from "vitest";
import { bounds, cloudPath, cropPosition, fontPx, shapePaths, strokePx, translate, validateMarkup, wrapText, type Shape } from "./markup";

const rect: Shape = { id: "r", kind: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.4, stroke: "#E5352B", strokeWidth: "m", fill: null };
const arrow: Shape = { id: "a", kind: "arrow", x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, stroke: "#E5352B", strokeWidth: "l" };
const cloud: Shape = { id: "c", kind: "cloud", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.3, y: 0.4 }], stroke: "#E5352B", strokeWidth: "s", fill: "#FACC15" };
const text: Shape = { id: "t", kind: "text", x: 0.6, y: 0.6, w: 0.3, h: 0.1, text: "Seal here", stroke: "#111111", strokeWidth: "s", fill: "#FFFFFF", fontColor: "#111111", fontSize: "m" };

describe("validateMarkup", () => {
  it("accepts every shape type", () => {
    expect(validateMarkup({ shapes: [rect, arrow, cloud, text] })).toEqual({ shapes: [rect, arrow, cloud, text] });
  });
  it("rejects bad colours, sizes, geometry and duplicate IDs", () => {
    expect(validateMarkup({ shapes: [{ ...rect, stroke: "red" }] })).toMatch(/colour/);
    expect(validateMarkup({ shapes: [{ ...rect, strokeWidth: "xl" }] })).toMatch(/thickness/);
    expect(validateMarkup({ shapes: [{ ...rect, w: -0.1 }] })).toMatch(/geometry/);
    expect(validateMarkup({ shapes: [{ ...cloud, points: cloud.points.slice(0, 2) }] })).toMatch(/cloud/);
    expect(validateMarkup({ shapes: [rect, rect] })).toMatch(/duplicate/);
    expect(validateMarkup({ shapes: [{ ...rect, kind: "star" }] })).toMatch(/Unknown/);
    expect(validateMarkup(null)).toMatch(/missing/);
  });
});

describe("scale", () => {
  it("sizes strokes and text relative to the image, so they look the same at any size", () => {
    expect(strokePx("m", 2000, 1500) / strokePx("m", 400, 300)).toBeCloseTo(5);
    expect(fontPx("l", 2000, 1500)).toBeGreaterThan(fontPx("m", 2000, 1500));
  });
});

describe("paths", () => {
  it("places shapes by fraction of the image", () => {
    expect(shapePaths(rect, 1000, 500)[0].d).toBe("M100 100H400V300H100Z");
    expect(shapePaths(rect, 200, 100)[0].d).toBe("M20 20H80V60H20Z");
  });
  it("draws an arrow as a shaft plus a filled head", () => {
    const parts = shapePaths(arrow, 1000, 1000);
    expect(parts).toHaveLength(2);
    expect(parts[1].fill).toBe("#E5352B");
  });
  it("draws a closed scalloped cloud", () => {
    const d = cloudPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 20);
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/A/g) ?? []).length).toBeGreaterThan(10);
  });
});

describe("helpers", () => {
  it("wraps text to a width", () => {
    expect(wrapText("one two three four", 9, (s) => s.length)).toEqual(["one two", "three", "four"]);
    expect(wrapText("a\nb", 100, (s) => s.length)).toEqual(["a", "b"]);
  });
  it("moves and measures shapes", () => {
    expect(bounds(translate(cloud, 0.1, 0))).toMatchObject({ x: 0.2, y: 0.1 });
    expect(translate(arrow, 0, 0.1)).toMatchObject({ y1: 0.2, y2: 0.6 });
  });
});

describe("crop position", () => {
  it("keeps an off-center crop, drops a centered one and rejects out-of-range values", () => {
    expect(validateMarkup({ shapes: [], crop: { x: 0.2, y: 0.5 } })).toEqual({ shapes: [], crop: { x: 0.2, y: 0.5 } });
    expect(validateMarkup({ shapes: [], crop: { x: 0.5, y: 0.5 } })).toEqual({ shapes: [] });
    expect(validateMarkup({ shapes: [], crop: null })).toEqual({ shapes: [] });
    expect(validateMarkup({ shapes: [], crop: { x: 1.2, y: 0.5 } })).toMatch(/crop/);
    expect(validateMarkup({ shapes: [], crop: { x: "0", y: 0.5 } })).toMatch(/crop/);
  });
  it("becomes a CSS object-position", () => {
    expect(cropPosition({ crop: { x: 0, y: 0.5 } })).toBe("0% 50%");
    expect(cropPosition(null)).toBe("50% 50%");
  });
});
