"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BringToFront,
  Circle,
  Cloud,
  Crop as CropIcon,
  Minus,
  MousePointer2,
  Redo2,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  bounds,
  CENTERED,
  DEFAULT_COLOR,
  fontPx,
  PALETTE,
  shapePaths,
  strokePx,
  translate,
  wrapText,
  type Crop,
  type Shape,
  type Size,
  type TextShape,
} from "@/lib/markup";

/*
 * Full-screen markup editor for one use of a photo. Shapes are drawn as SVG
 * over the photo; Save renders the photo plus shapes to a canvas in the
 * browser (same paths and fonts as on screen) and uploads that copy with the
 * shapes. The original photo is never changed. The view is the square crop
 * the app shows; the crop tool slides the photo within it.
 */

type Tool = "select" | "crop" | "rect" | "ellipse" | "line" | "arrow" | "cloud" | "text";
interface Style {
  stroke: string;
  strokeWidth: Size;
  fill: string | null;
  fontColor: string;
  fontSize: Size;
}
type Drag =
  | { kind: "draw"; start: { x: number; y: number } }
  | { kind: "move"; id: string; start: { x: number; y: number }; before: Shape[] }
  | { kind: "handle"; id: string; handle: number; before: Shape[] }
  | { kind: "crop"; startX: number; startY: number; from: Crop };

const TOOLS: Array<{ tool: Tool; label: string; Icon: LucideIcon }> = [
  { tool: "select", label: "Select (Esc)", Icon: MousePointer2 },
  { tool: "crop", label: "Move photo within crop", Icon: CropIcon },
  { tool: "rect", label: "Rectangle", Icon: Square },
  { tool: "ellipse", label: "Ellipse", Icon: Circle },
  { tool: "line", label: "Line", Icon: Minus },
  { tool: "arrow", label: "Arrow", Icon: ArrowUpRight },
  { tool: "cloud", label: "Cloud", Icon: Cloud },
  { tool: "text", label: "Text box", Icon: Type },
];
const MIN = 0.01;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const newId = () => crypto.randomUUID();
const LINE_HEIGHT = 1.25;
const TEXT_PAD = 0.4; // in font sizes

function fontFamily(): string {
  return typeof document === "undefined" ? "sans-serif" : getComputedStyle(document.body).fontFamily || "sans-serif";
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textLines(s: TextShape, w: number, h: number): { lines: string[]; size: number; pad: number } {
  const size = fontPx(s.fontSize, w, h);
  const pad = size * TEXT_PAD;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (measureCtx) measureCtx.font = `${size}px ${fontFamily()}`;
  const lines = wrapText(s.text, Math.max(1, s.w * w - pad * 2), (t) => measureCtx?.measureText(t).width ?? t.length * size * 0.55);
  return { lines, size, pad };
}

/** Draws photo + shapes onto a canvas: the saved marked-up copy. */
async function rasterize(img: HTMLImageElement, shapes: Shape[]): Promise<Blob> {
  await document.fonts.ready;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const s of shapes) {
    for (const part of shapePaths(s, w, h)) {
      const path = new Path2D(part.d);
      if (part.fill) {
        ctx.fillStyle = part.fill;
        ctx.fill(path);
      }
      if (part.stroke && part.strokeWidth > 0) {
        ctx.strokeStyle = part.stroke;
        ctx.lineWidth = part.strokeWidth;
        ctx.stroke(path);
      }
    }
    if (s.kind === "text") {
      const { lines, size, pad } = textLines(s, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(s.x * w, s.y * h, s.w * w, s.h * h);
      ctx.clip();
      ctx.fillStyle = s.fontColor;
      ctx.font = `${size}px ${fontFamily()}`;
      ctx.textBaseline = "top";
      lines.forEach((line, i) => ctx.fillText(line, s.x * w + pad, s.y * h + pad + i * size * LINE_HEIGHT));
      ctx.restore();
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/jpeg", 0.92));
}

export function MarkupEditor({
  imageUrl,
  initial,
  initialCrop,
  onSave,
  onCancel,
}: {
  /** The photo without markup (same proportions as the original). */
  imageUrl: string;
  initial: Shape[];
  initialCrop: Crop | null;
  /** Receives the shapes, the crop (null when centered) and the rendered copy (null when there are no shapes). */
  onSave: (shapes: Shape[], crop: Crop | null, rendered: Blob | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [shapes, setShapes] = useState<Shape[]>(initial);
  const [past, setPast] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>({ stroke: DEFAULT_COLOR, strokeWidth: "m", fill: null, fontColor: DEFAULT_COLOR, fontSize: "m" });
  const [crop, setCrop] = useState<Crop>(initialCrop ?? CENTERED);
  const viewRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [cloudPts, setCloudPts] = useState<Array<{ x: number; y: number }>>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const cropMoved = crop.x !== (initialCrop ?? CENTERED).x || crop.y !== (initialCrop ?? CENTERED).y;
  const dirty = past.length > 0 || cropMoved;

  // The square view is as large as the space allows.
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const fit = () => setSide(Math.floor(Math.min(el.clientWidth, el.clientHeight)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size?.w ?? 1;
  const H = size?.h ?? 1;
  const selectedShape = shapes.find((s) => s.id === selected) ?? null;

  const commit = useCallback(
    (next: Shape[], before: Shape[] = shapes) => {
      setPast((p) => [...p, before]);
      setFuture([]);
      setShapes(next);
    },
    [shapes],
  );
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [shapes, ...f]);
      setShapes(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, [shapes]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, shapes]);
      setShapes(f[0]);
      return f.slice(1);
    });
  }, [shapes]);
  const remove = useCallback(() => {
    if (!selected) return;
    commit(shapes.filter((s) => s.id !== selected));
    setSelected(null);
  }, [selected, shapes, commit]);
  const reorder = (toFront: boolean) => {
    if (!selectedShape) return;
    const rest = shapes.filter((s) => s.id !== selected);
    commit(toFront ? [...rest, selectedShape] : [selectedShape, ...rest]);
  };

  const finishCloud = useCallback(() => {
    if (cloudPts.length >= 3) {
      const shape: Shape = { id: newId(), kind: "cloud", points: cloudPts, stroke: style.stroke, strokeWidth: style.strokeWidth, fill: style.fill };
      commit([...shapes, shape]);
      setSelected(shape.id);
    }
    setCloudPts([]);
  }, [cloudPts, style, shapes, commit]);

  // Keyboard: undo/redo, delete, finish/cancel a cloud.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingText || (e.target as HTMLElement).closest("input, textarea")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        remove();
      } else if (e.key === "Enter" && cloudPts.length) {
        e.preventDefault();
        finishCloud();
      } else if (e.key === "Escape" && (tool !== "select" || cloudPts.length || selected)) {
        // Escape goes back to the select tool, then clears the selection, rather than closing the editor.
        e.preventDefault();
        setCloudPts([]);
        if (tool !== "select") setTool("select");
        else setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, remove, finishCloud, selected, cloudPts.length, editingText, tool]);

  const point = (e: React.PointerEvent | React.MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  // ---- Pointer handling ----
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !size) return;
    const p = point(e);
    if (tool === "select") {
      setSelected(null);
      return;
    }
    if (tool === "crop") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { kind: "crop", startX: e.clientX, startY: e.clientY, from: crop };
      return;
    }
    if (tool === "cloud") {
      // A double-click ends the cloud (handled below); don't add its second click as a corner.
      if (e.detail >= 2) return;
      setCloudPts((pts) => [...pts, p]);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "draw", start: p };
  };

  const onShapeDown = (e: React.PointerEvent, s: Shape) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    setSelected(s.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "move", id: s.id, start: point(e), before: shapes };
  };

  const onHandleDown = (e: React.PointerEvent, s: Shape, handle: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "handle", id: s.id, handle, before: shapes };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!size) return;
    const p = point(e);
    setCursor(p);
    const d = drag.current;
    if (!d) return;
    if (d.kind === "crop") {
      // Pixels the photo extends past the square: dragging by that much goes edge to edge.
      const overflow = side * (ratio - 1);
      if (overflow <= 0) return;
      if (W >= H) setCrop({ x: clamp(d.from.x - (e.clientX - d.startX) / overflow), y: 0.5 });
      else setCrop({ x: 0.5, y: clamp(d.from.y - (e.clientY - d.startY) / overflow) });
    } else if (d.kind === "draw") {
      const { start } = d;
      const base = { id: "draft", stroke: style.stroke, strokeWidth: style.strokeWidth };
      if (tool === "line" || tool === "arrow") {
        setDraft({ ...base, kind: tool, x1: start.x, y1: start.y, x2: p.x, y2: p.y });
      } else if (tool === "rect" || tool === "ellipse" || tool === "text") {
        const box = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
        setDraft(
          tool === "text"
            ? { ...base, kind: "text", ...box, text: "", fill: style.fill, fontColor: style.fontColor, fontSize: style.fontSize }
            : { ...base, kind: tool, ...box, fill: style.fill },
        );
      }
    } else if (d.kind === "move") {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      setShapes(d.before.map((s) => (s.id === d.id ? translate(s, dx, dy) : s)));
    } else if (d.kind === "handle") {
      setShapes(d.before.map((s) => (s.id === d.id ? resize(s, d.handle, p) : s)));
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === "crop") return;
    if (d.kind === "draw") {
      const shape = draft;
      setDraft(null);
      if (!shape) return;
      const b = bounds(shape);
      const big = shape.kind === "line" || shape.kind === "arrow" ? Math.hypot(b.w, b.h) > MIN : b.w > MIN && b.h > MIN;
      if (!big) return;
      const real = { ...shape, id: newId() };
      commit([...shapes, real]);
      setSelected(real.id);
      if (real.kind === "text") setEditingText(real.id);
    } else if (shapes !== d.before) {
      commit(shapes, d.before);
    }
  };

  // With a shape selected, style changes apply to it only; otherwise they set the style of new shapes.
  const shown: Style = selectedShape
    ? {
        stroke: selectedShape.stroke,
        strokeWidth: selectedShape.strokeWidth,
        fill: "fill" in selectedShape ? selectedShape.fill : style.fill,
        fontColor: selectedShape.kind === "text" ? selectedShape.fontColor : style.fontColor,
        fontSize: selectedShape.kind === "text" ? selectedShape.fontSize : style.fontSize,
      }
    : style;
  const applyStyle = (patch: Partial<Style>) => {
    if (!selectedShape) {
      setStyle((s) => ({ ...s, ...patch }));
      return;
    }
    const next = { ...selectedShape } as Shape & Partial<Style>;
    if (patch.stroke !== undefined) next.stroke = patch.stroke;
    if (patch.strokeWidth !== undefined) next.strokeWidth = patch.strokeWidth;
    if (patch.fill !== undefined && "fill" in next) next.fill = patch.fill;
    if (next.kind === "text") {
      if (patch.fontColor !== undefined) next.fontColor = patch.fontColor;
      if (patch.fontSize !== undefined) next.fontSize = patch.fontSize;
    }
    commit(shapes.map((s) => (s.id === selectedShape.id ? (next as Shape) : s)));
  };

  const save = async () => {
    if (!imgRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const rendered = shapes.length ? await rasterize(imgRef.current, shapes) : null;
      const failure = await onSave(shapes, crop.x === CENTERED.x && crop.y === CENTERED.y ? null : crop, rendered);
      if (failure) setError(failure);
    } catch {
      setError("The markup could not be rendered. Please try again.");
    }
    setSaving(false);
  };

  const cancel = () => {
    if (dirty && !window.confirm("Discard your markup changes?")) return;
    onCancel();
  };

  const kindForStyles: Tool | Shape["kind"] = selectedShape?.kind ?? tool;
  const fillable = kindForStyles !== "line" && kindForStyles !== "arrow";
  const isText = kindForStyles === "text";
  // How much longer the photo's long side is than the square.
  const ratio = W >= H ? W / H : H / W;
  const layer = !size || !side
    ? { left: 0, top: 0, width: side, height: side }
    : W >= H
      ? { left: -side * (ratio - 1) * crop.x, top: 0, width: side * ratio, height: side }
      : { left: 0, top: -side * (ratio - 1) * crop.y, width: side, height: side * ratio };
  const strokeW = useMemo(() => (size ? strokePx("m", W, H) : 2), [size, W, H]);

  return (
    <div className="flex h-[calc(90vh-8rem)] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1">
        {TOOLS.map(({ tool: t, label, Icon }) => (
          <button
            key={t}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={tool === t}
            onClick={() => {
              setTool(t);
              setCloudPts([]);
              if (t !== "select") setSelected(null);
            }}
            className={`rounded-md border p-2 ${tool === t ? "border-primary bg-primary-subtle text-primary-hover" : "border-transparent hover:bg-surface-muted"}`}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </button>
        ))}
        <span className="mx-2 h-6 w-px bg-border" aria-hidden />
        <IconButton label="Undo (Ctrl+Z)" Icon={Undo2} disabled={!past.length} onClick={undo} />
        <IconButton label="Redo (Ctrl+Y)" Icon={Redo2} disabled={!future.length} onClick={redo} />
        <IconButton label="Bring to front" Icon={BringToFront} disabled={!selectedShape} onClick={() => reorder(true)} />
        <IconButton label="Send to back" Icon={SendToBack} disabled={!selectedShape} onClick={() => reorder(false)} />
        <IconButton label="Delete (Del)" Icon={Trash2} disabled={!selectedShape} onClick={remove} />
        {tool === "cloud" && (
          <span className="ml-3 text-xs text-text-muted">
            Click to add corners; double-click or press Enter to close{cloudPts.length >= 3 ? "" : ` (${3 - cloudPts.length} more needed)`}.
          </span>
        )}
      </div>

      {/* Styles: a dashed outline shows they apply to the selected markup. */}
      <div
        className={`flex flex-wrap items-start gap-3 self-start rounded-md p-1.5 text-xs outline-2 outline-dashed ${selectedShape ? "outline-primary" : "outline-transparent"}`}
        title={selectedShape ? "Changes apply to the selected markup" : "Style for new markups"}
      >
        <StyleGroup label="Stroke">
          <ColorChoice label="Stroke" value={shown.stroke} onChange={(c) => applyStyle({ stroke: c! })} />
          <span className="h-6 w-px bg-border" aria-hidden />
          <WidthChoice value={shown.strokeWidth} onChange={(v) => applyStyle({ strokeWidth: v })} />
        </StyleGroup>
        <StyleGroup label="Fill" disabled={!fillable}>
          <ColorChoice label="Fill" value={shown.fill} allowNone onChange={(c) => applyStyle({ fill: c })} />
        </StyleGroup>
        {isText && (
          <StyleGroup label="Text">
            <ColorChoice label="Text" value={shown.fontColor} onChange={(c) => applyStyle({ fontColor: c! })} />
            <SizeChoice label="Text size" value={shown.fontSize} onChange={(v) => applyStyle({ fontSize: v })} />
          </StyleGroup>
        )}
      </div>

      {/* Canvas */}
      <div ref={viewRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
        <div className="relative overflow-hidden" style={{ width: side, height: side }}>
        <div className="absolute" style={layer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            className="block h-full w-full select-none"
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {size && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className={`absolute inset-0 h-full w-full ${tool === "select" ? "cursor-default" : tool === "crop" ? "cursor-move" : "cursor-crosshair"}`}
              onPointerDown={onBackgroundDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onDoubleClick={() => tool === "cloud" && finishCloud()}
            >
              <rect width={W} height={H} fill="transparent" />
              {shapes.map((s) => (
                <ShapeView
                  key={s.id}
                  shape={s}
                  w={W}
                  h={H}
                  hidden={editingText === s.id}
                  onPointerDown={tool === "select" ? (e) => onShapeDown(e, s) : undefined}
                  onDoubleClick={() => s.kind === "text" && tool === "select" && setEditingText(s.id)}
                />
              ))}
              {draft && <ShapeView shape={draft} w={W} h={H} />}
              {cloudPts.length > 0 && (
                <polyline
                  points={[...cloudPts, ...(cursor ? [cursor] : [])].map((p) => `${p.x * W},${p.y * H}`).join(" ")}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={strokeW}
                  strokeDasharray={`${strokeW * 2} ${strokeW * 2}`}
                />
              )}
              {selectedShape && tool === "select" && !editingText && (
                <Handles shape={selectedShape} w={W} h={H} onDown={(e, i) => onHandleDown(e, selectedShape, i)} />
              )}
            </svg>
          )}
          {size && editingText && (
            <TextInput
              shape={shapes.find((s) => s.id === editingText) as TextShape}
              w={W}
              h={H}
              displayScale={(svgRef.current?.getBoundingClientRect().width ?? W) / W}
              onDone={(text) => {
                const s = shapes.find((x) => x.id === editingText) as TextShape | undefined;
                setEditingText(null);
                if (!s) return;
                if (!text.trim()) commit(shapes.filter((x) => x.id !== s.id));
                else if (text !== s.text) commit(shapes.map((x) => (x.id === s.id ? { ...s, text } : x)));
              }}
            />
          )}
        </div>
        </div>
      </div>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={saving || !size} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" disabled={saving} onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}

/** New geometry when handle \`i\` is dragged to \`p\`. */
function resize(s: Shape, i: number, p: { x: number; y: number }): Shape {
  switch (s.kind) {
    case "line":
    case "arrow":
      return i === 0 ? { ...s, x1: p.x, y1: p.y } : { ...s, x2: p.x, y2: p.y };
    case "cloud":
      return { ...s, points: s.points.map((pt, k) => (k === i ? p : pt)) };
    default: {
      // Corners 0..3: top-left, top-right, bottom-right, bottom-left; the opposite corner stays put.
      const corners = [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y },
        { x: s.x + s.w, y: s.y + s.h },
        { x: s.x, y: s.y + s.h },
      ];
      const anchor = corners[(i + 2) % 4];
      const x = Math.min(anchor.x, p.x);
      const y = Math.min(anchor.y, p.y);
      return { ...s, x, y, w: Math.max(MIN, Math.abs(p.x - anchor.x)), h: Math.max(MIN, Math.abs(p.y - anchor.y)) };
    }
  }
}

function ShapeView({
  shape: s,
  w,
  h,
  hidden,
  onPointerDown,
  onDoubleClick,
}: {
  shape: Shape;
  w: number;
  h: number;
  hidden?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDoubleClick?: () => void;
}) {
  const parts = shapePaths(s, w, h);
  const hit = Math.max(strokePx("l", w, h) * 3, 12);
  return (
    <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} style={{ cursor: onPointerDown ? "move" : undefined }} opacity={hidden ? 0.35 : 1}>
      {parts.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {/* Wide invisible outline so thin shapes are easy to click. */}
      <path d={parts[0].d} fill={"fill" in s && s.fill ? "transparent" : "none"} stroke="transparent" strokeWidth={hit} pointerEvents="all" />
      {s.kind === "text" && !hidden && <TextBody shape={s} w={w} h={h} />}
    </g>
  );
}

function TextBody({ shape: s, w, h }: { shape: TextShape; w: number; h: number }) {
  const { lines, size, pad } = textLines(s, w, h);
  const id = `clip-${s.id}`;
  return (
    <>
      <clipPath id={id}>
        <rect x={s.x * w} y={s.y * h} width={s.w * w} height={s.h * h} />
      </clipPath>
      <text clipPath={`url(#${id})`} fill={s.fontColor} fontSize={size} fontFamily={fontFamily()} dominantBaseline="text-before-edge">
        {lines.map((line, i) => (
          <tspan key={i} x={s.x * w + pad} y={s.y * h + pad + i * size * LINE_HEIGHT}>{line || " "}</tspan>
        ))}
      </text>
    </>
  );
}

/** Drag handles: line ends, cloud corners, or box corners (TL, TR, BR, BL). */
function handlePoints(s: Shape): Array<{ x: number; y: number }> {
  switch (s.kind) {
    case "line":
    case "arrow":
      return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
    case "cloud":
      return s.points;
    default:
      return [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }];
  }
}

function Handles({ shape: s, w, h, onDown }: { shape: Shape; w: number; h: number; onDown: (e: React.PointerEvent, i: number) => void }) {
  const r = Math.max(Math.hypot(w, h) * 0.006, 5);
  const pts = handlePoints(s);
  const b = bounds(s);
  return (
    <g>
      <rect x={b.x * w} y={b.y * h} width={b.w * w} height={b.h * h} fill="none" stroke="#167D8D" strokeWidth={r / 3} strokeDasharray={`${r} ${r}`} pointerEvents="none" />
      {pts.map((p, i) => (
        <rect
          key={i}
          x={p.x * w - r}
          y={p.y * h - r}
          width={r * 2}
          height={r * 2}
          fill="#FFFFFF"
          stroke="#167D8D"
          strokeWidth={r / 3}
          style={{ cursor: "nwse-resize" }}
          onPointerDown={(e) => onDown(e, i)}
        />
      ))}
    </g>
  );
}

function TextInput({ shape: s, w, h, displayScale, onDone }: { shape: TextShape; w: number; h: number; displayScale: number; onDone: (text: string) => void }) {
  const [value, setValue] = useState(s.text);
  const size = fontPx(s.fontSize, w, h) * displayScale;
  return (
    <textarea
      autoFocus
      aria-label="Markup text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onDone(value);
        }
      }}
      className="absolute resize-none border border-dashed border-primary bg-white/80 outline-none"
      style={{
        left: `${s.x * 100}%`,
        top: `${s.y * 100}%`,
        width: `${s.w * 100}%`,
        height: `${s.h * 100}%`,
        fontSize: size,
        lineHeight: LINE_HEIGHT,
        padding: size * TEXT_PAD,
        color: s.fontColor,
        fontFamily: "inherit",
      }}
    />
  );
}

function IconButton({ label, Icon, disabled, onClick }: { label: string; Icon: LucideIcon; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="rounded-md p-2 hover:bg-surface-muted disabled:opacity-30">
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

function ColorChoice({ label, value, allowNone, onChange }: { label: string; value: string | null; allowNone?: boolean; onChange: (c: string | null) => void }) {
  const [hex, setHex] = useState(value ?? "");
  useEffect(() => setHex(value ?? ""), [value]);
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`${label} colour`}>
      {allowNone && (
        <button
          type="button"
          title="None"
          aria-label="No fill"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={`h-6 w-6 rounded border bg-[linear-gradient(135deg,transparent_45%,#E5352B_45%,#E5352B_55%,transparent_55%)] ${value === null ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}
        />
      )}
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={c}
          aria-pressed={value?.toUpperCase() === c}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded border border-black/15 ${value?.toUpperCase() === c ? "ring-2 ring-primary ring-offset-1" : ""}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        aria-label={`${label} hex colour`}
        className="input w-24 py-1 font-mono text-xs"
        value={hex}
        placeholder={allowNone ? "none" : "#RRGGBB"}
        onChange={(e) => setHex(e.target.value)}
        onBlur={() => {
          if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toUpperCase());
          else setHex(value ?? "");
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}

function SizeChoice({ label, value, onChange }: { label: string; value: Size; onChange: (v: Size) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 font-medium text-text-muted">{label}</span>
      {(["s", "m", "l"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`h-7 w-7 rounded border text-xs font-semibold uppercase ${value === v ? "border-primary bg-primary-subtle text-primary-hover" : "border-border hover:bg-surface-muted"}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function StyleGroup({ label, disabled, children }: { label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <fieldset disabled={disabled} className={`rounded-md border border-border px-2.5 pt-1 pb-2 ${disabled ? "opacity-40" : ""}`}>
      <legend className="px-1 font-medium text-text-muted">{label}</legend>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </fieldset>
  );
}

const WIDTHS: Array<{ v: Size; label: string; px: number }> = [
  { v: "s", label: "Thin", px: 1.5 },
  { v: "m", label: "Medium", px: 3 },
  { v: "l", label: "Thick", px: 5 },
];

function WidthChoice({ value, onChange }: { value: Size; onChange: (v: Size) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Stroke width">
      {WIDTHS.map(({ v, label, px }) => (
        <button
          key={v}
          type="button"
          title={label}
          aria-label={`${label} stroke`}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`h-6 w-6 rounded border border-black/15 bg-white text-text ${value === v ? "ring-2 ring-primary ring-offset-1" : ""}`}
        >
          <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
            <line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth={px} strokeLinecap="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}
