// Photo markup (spec §7.1): vector shapes stored separately from the photo.
//
// Coordinates are fractions (0–1) of the photo's width and height, so shapes
// land in the same place at any display size. Stroke widths and text sizes
// are fractions of the photo's diagonal, so "M" looks equally heavy on a
// thumbnail and the full image. Geometry is produced as SVG path strings,
// which the editor draws as <path> and the browser rasterizer draws with
// Canvas Path2D — the same shapes either way.

export type Size = "s" | "m" | "l";

interface Base {
  id: string;
  stroke: string;
  strokeWidth: Size;
}
export interface BoxShape extends Base {
  kind: "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string | null;
}
export interface LineShape extends Base {
  kind: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface CloudShape extends Base {
  kind: "cloud";
  points: Array<{ x: number; y: number }>;
  fill: string | null;
}
export interface TextShape extends Base {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill: string | null;
  fontColor: string;
  fontSize: Size;
}
export type Shape = BoxShape | LineShape | CloudShape | TextShape;

/** Shapes in drawing order (later ones are on top). */
export interface Markup {
  shapes: Shape[];
}

export const MAX_SHAPES = 200;
export const DEFAULT_COLOR = "#E5352B"; // red, the usual site-markup colour
export const PALETTE = ["#E5352B", "#F59E0B", "#FACC15", "#16A34A", "#2563EB", "#167D8D", "#111111", "#FFFFFF"];

const STROKE: Record<Size, number> = { s: 0.0025, m: 0.005, l: 0.009 };
const FONT: Record<Size, number> = { s: 0.018, m: 0.026, l: 0.038 };

const diagonal = (w: number, h: number) => Math.hypot(w, h);
export const strokePx = (size: Size, w: number, h: number) => Math.max(1, STROKE[size] * diagonal(w, h));
export const fontPx = (size: Size, w: number, h: number) => Math.max(8, FONT[size] * diagonal(w, h));

// ---- Validation (shapes arrive from the browser) ----

const HEX = /^#[0-9a-fA-F]{6}$/;
const SIZES = new Set<Size>(["s", "m", "l"]);
const isUnit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= -0.05 && n <= 1.05;
const isColor = (c: unknown) => typeof c === "string" && HEX.test(c);
const isFill = (c: unknown) => c === null || isColor(c);

/** Returns the markup if well-formed, otherwise a message describing the problem. */
export function validateMarkup(input: unknown): Markup | string {
  const shapes = (input as Markup | null)?.shapes;
  if (!Array.isArray(shapes)) return "Markup is missing its shapes.";
  if (shapes.length > MAX_SHAPES) return `A photo can have at most ${MAX_SHAPES} markups.`;
  const ids = new Set<string>();
  for (const s of shapes as Shape[]) {
    if (!s || typeof s.id !== "string" || !s.id || ids.has(s.id)) return "A markup has a missing or duplicate ID.";
    ids.add(s.id);
    if (!isColor(s.stroke) || !SIZES.has(s.strokeWidth)) return "A markup has an invalid colour or thickness.";
    switch (s.kind) {
      case "rect":
      case "ellipse":
      case "text":
        if (![s.x, s.y, s.w, s.h].every(isUnit) || s.w <= 0 || s.h <= 0 || !isFill(s.fill)) return "A box markup has invalid geometry.";
        if (s.kind === "text" && (typeof s.text !== "string" || s.text.length > 2000 || !isColor(s.fontColor) || !SIZES.has(s.fontSize))) {
          return "A text markup is invalid.";
        }
        break;
      case "line":
      case "arrow":
        if (![s.x1, s.y1, s.x2, s.y2].every(isUnit)) return "A line markup has invalid geometry.";
        break;
      case "cloud":
        if (!Array.isArray(s.points) || s.points.length < 3 || s.points.length > 200 || !s.points.every((p) => isUnit(p?.x) && isUnit(p?.y)) || !isFill(s.fill)) {
          return "A cloud markup has invalid geometry.";
        }
        break;
      default:
        return "Unknown markup type.";
    }
  }
  return { shapes: shapes as Shape[] };
}

// ---- Geometry as SVG path strings (pixel space of a w × h image) ----

const n = (v: number) => Math.round(v * 100) / 100;

export function boxPath(kind: "rect" | "ellipse", x: number, y: number, bw: number, bh: number): string {
  if (kind === "rect") return `M${n(x)} ${n(y)}H${n(x + bw)}V${n(y + bh)}H${n(x)}Z`;
  const rx = bw / 2;
  const ry = bh / 2;
  const cx = x + rx;
  return `M${n(cx - rx)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(y + ry)}Z`;
}

export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
}

/** Filled triangle at (x2, y2), scaled with the stroke width. */
export function arrowHeadPath(x1: number, y1: number, x2: number, y2: number, stroke: number): string {
  const len = Math.max(stroke * 4.5, 8);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  const a = { x: x2 - len * Math.cos(angle - spread), y: y2 - len * Math.sin(angle - spread) };
  const b = { x: x2 - len * Math.cos(angle + spread), y: y2 - len * Math.sin(angle + spread) };
  return `M${n(x2)} ${n(y2)}L${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}Z`;
}

/** Line shortened so the stroke ends under the arrowhead instead of poking through its tip. */
export function arrowShaft(x1: number, y1: number, x2: number, y2: number, stroke: number) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cut = Math.min(Math.max(stroke * 3, 6), len);
  return { x2: x2 - ((x2 - x1) / len) * cut, y2: y2 - ((y2 - y1) / len) * cut };
}

/**
 * Closed polygon outlined with outward-bulging scallops (a revision cloud).
 * `arc` is the target scallop length in pixels.
 */
export function cloudPath(points: Array<{ x: number; y: number }>, arc: number): string {
  if (points.length < 2) return "";
  // Orientation decides which side is "outward" for the bulges.
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  const sweep = area > 0 ? 1 : 0;
  let d = `M${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const count = Math.max(1, Math.round(len / Math.max(arc, 1)));
    for (let k = 1; k <= count; k++) {
      const x = p.x + ((q.x - p.x) * k) / count;
      const y = p.y + ((q.y - p.y) * k) / count;
      const r = len / count / 2;
      d += `A${n(r)} ${n(r)} 0 0 ${sweep} ${n(x)} ${n(y)}`;
    }
  }
  return `${d}Z`;
}

export interface PathPart {
  d: string;
  stroke: string | null;
  strokeWidth: number;
  fill: string | null;
}

/** Drawable paths for a shape in a w × h pixel space (text body is drawn separately). */
export function shapePaths(s: Shape, w: number, h: number): PathPart[] {
  const sw = strokePx(s.strokeWidth, w, h);
  switch (s.kind) {
    case "rect":
    case "ellipse":
      return [{ d: boxPath(s.kind, s.x * w, s.y * h, s.w * w, s.h * h), stroke: s.stroke, strokeWidth: sw, fill: s.fill }];
    case "text":
      return [{ d: boxPath("rect", s.x * w, s.y * h, s.w * w, s.h * h), stroke: s.stroke, strokeWidth: sw, fill: s.fill }];
    case "line":
      return [{ d: linePath(s.x1 * w, s.y1 * h, s.x2 * w, s.y2 * h), stroke: s.stroke, strokeWidth: sw, fill: null }];
    case "arrow": {
      const [x1, y1, x2, y2] = [s.x1 * w, s.y1 * h, s.x2 * w, s.y2 * h];
      const shaft = arrowShaft(x1, y1, x2, y2, sw);
      return [
        { d: linePath(x1, y1, shaft.x2, shaft.y2), stroke: s.stroke, strokeWidth: sw, fill: null },
        { d: arrowHeadPath(x1, y1, x2, y2, sw), stroke: null, strokeWidth: 0, fill: s.stroke },
      ];
    }
    case "cloud":
      return [{ d: cloudPath(s.points.map((p) => ({ x: p.x * w, y: p.y * h })), Math.max(sw * 5, diagonal(w, h) * 0.022)), stroke: s.stroke, strokeWidth: sw, fill: s.fill }];
  }
}

/** Word-wraps text to a width using the caller's text measurer (canvas measureText). */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Axis-aligned bounds of a shape, in fractions. */
export function bounds(s: Shape): { x: number; y: number; w: number; h: number } {
  switch (s.kind) {
    case "line":
    case "arrow":
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case "cloud": {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    default:
      return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
}

/** The shape moved by (dx, dy) fractions. */
export function translate<S extends Shape>(s: S, dx: number, dy: number): S {
  switch (s.kind) {
    case "line":
    case "arrow":
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    case "cloud":
      return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    default:
      return { ...s, x: (s as BoxShape).x + dx, y: (s as BoxShape).y + dy };
  }
}
