import "server-only";
import PDFDocument from "pdfkit";
import { bucket } from "../firebaseAdmin";
import { ensureShareToken } from "../services/photos";
import { readAttachmentImage } from "../services/markup";
import type { ReportView, ObservationInReport } from "../services/reportView";
import { formatLongDate, formatShortDate, reportLabel, slug, sortAttendance, statusOn } from "@/lib/domain";
import type { StatusDef } from "@/lib/types";

// Single configurable template (spec §9). Text is real PDF text (selectable);
// only photo thumbnails are images, each linked to the public photo viewer.

const PAGES = { LETTER: { width: 612, height: 792 }, A4: { width: 595.28, height: 841.89 } }; // points
const M = { top: 50, bottom: 60, left: 50, right: 50 };
const META_W = 100;
const THUMB_GAP = 10;
/** Photos per row in the body column, by the "photo size in PDF" setting. */
const PER_ROW: Record<string, number> = { s: 4, m: 3, l: 2 };

const INK = "#222222";
const MUTED = "#666666";
const RULE = "#BBBBBB";

export function reportPdfFilename(view: ReportView): string {
  const p = view.project;
  return `${slug(p.code || p.name)}_${view.report.visitDate}_Report-${view.report.sequence}.pdf`;
}

export async function renderReportPdf(view: ReportView, publicBaseUrl: string): Promise<Buffer> {
  const { settings, project, report } = view;
  const show = settings.policies; // the project's settings in effect
  const PAGE = PAGES[settings.pageSize] ?? PAGES.LETTER;
  const CONTENT_W = PAGE.width - M.left - M.right;
  const BODY_X = M.left + META_W + 12;
  const BODY_W = PAGE.width - M.right - BODY_X;
  const perRow = PER_ROW[show.photoSize] ?? 3;
  // Updates sit to the right of their timeline dots.
  const DOT_R = 3.5;
  const UPDATE_X = BODY_X + 14;
  const UPDATE_W = BODY_W - 14;
  const updateDate = (iso: string) => formatLongDate(iso);
  const thumbW = Math.floor((BODY_W - THUMB_GAP * (perRow - 1)) / perRow);
  const THUMB = { w: thumbW, h: thumbW, gap: THUMB_GAP, captionH: show.photoCaption === "both" ? 32 : 22 };
  const doc = new PDFDocument({
    size: settings.pageSize ?? "LETTER",
    margins: M,
    bufferPages: true,
    info: {
      Title: `${project.name} — ${reportLabel(project.reportPrefix, report.sequence)}`,
      Author: settings.name,
      Creator: "kestro",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const statuses = new Map<string, StatusDef>(settings.statuses.map((s) => [s.id, s]));
  const bottom = () => PAGE.height - M.bottom;
  const ensureSpace = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const rule = () => {
    doc.moveTo(M.left, doc.y).lineTo(PAGE.width - M.right, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.moveDown(0.6);
  };
  const pageBody = PAGE.height - M.top - M.bottom;
  const heading = (text: string, minFollowing = 60, size = 12) => {
    ensureSpace(size * 2 + minFollowing); // never leave a heading orphaned at a page bottom
    doc.font("Helvetica-Bold").fontSize(size).fillColor(INK).text(text, M.left, doc.y, { width: CONTENT_W });
    doc.moveDown(0.3);
  };

  // ---- Organization header ----
  const headerTop = doc.y;
  let logoBottom = headerTop;
  if (settings.logoPath) {
    try {
      const [logo] = await bucket().file(settings.logoPath).download();
      doc.image(logo, M.left, headerTop, { fit: [160, 56] });
      logoBottom = headerTop + 56;
    } catch {
      // A missing logo must not prevent the report from rendering.
    }
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(settings.name, M.left, headerTop, { width: CONTENT_W, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  if (show.showAddress && settings.address) doc.text(settings.address, { width: CONTENT_W, align: "right" });
  if (show.showContact && settings.contactLine) doc.text(settings.contactLine, { width: CONTENT_W, align: "right" });
  doc.y = Math.max(doc.y, logoBottom) + 10;
  rule();

  // ---- Title block ----
  doc.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(project.name, M.left, doc.y, { width: CONTENT_W });
  doc.font("Helvetica").fontSize(12).text(
    `${reportLabel(project.reportPrefix, report.sequence)}  ·  ${formatLongDate(report.visitDate)}${report.visitTime ? `  ${report.visitTime}` : ""}`,
  );
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  const facts = [
    project.code && `Project no. ${project.code}`,
    project.address,
    show.showAuthor && report.authorName && `Prepared by ${report.authorName}`,
    show.weather && report.weather?.trim() && `Weather: ${report.weather.trim()}`,
  ].filter(Boolean);
  if (facts.length) doc.text(facts.join("  ·  "));
  doc.moveDown(0.8);

  // ---- Sections, in the company's chosen order ----
  const renderOngoingWork = () => {
  if (show.showOngoingWork && report.ongoingWork.trim()) {
    heading("Ongoing work", 30);
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(report.ongoingWork.trim(), M.left, doc.y, { width: CONTENT_W });
    doc.moveDown(0.8);
  }
  };
  const renderAttendance = () => {
  if (show.showAttendance && report.attendees.length) {
    heading("Attendance", 30);
    const who = (a: { id: string; name: string; company: string }) => view.attendees[a.id] ?? { name: a.name, firstName: a.name, company: a.company, role: "" };
    const col = { company: 165, role: 315, present: CONTENT_W - 50 };
    for (const a of sortAttendance(report.attendees, show.attendanceOrder, who)) {
      const p = who(a);
      ensureSpace(14);
      const y = doc.y;
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(p.name, M.left, y, { width: col.company - 10 });
      const yName = doc.y;
      doc.fillColor(MUTED).text(p.company, M.left + col.company, y, { width: col.role - col.company - 10 });
      const yCompany = doc.y;
      doc.text(p.role, M.left + col.role, y, { width: col.present - col.role - 10 });
      const yRole = doc.y;
      doc.fillColor(INK).text(a.present ? "Present" : "Absent", M.left + col.present, y, { width: CONTENT_W - col.present });
      doc.y = Math.max(yName, yCompany, yRole, y + 13);
    }
    doc.moveDown(0.8);
  }
  };
  const renderSummary = () => {
  if (show.summary && view.observations.length) {
    heading("Summary of observations", 30);
    for (const o of view.observations) {
      ensureSpace(14);
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(o.number, M.left, y, { width: 50 });
      doc.font("Helvetica").text(o.observation.title, M.left + 55, y, { width: CONTENT_W - 180 });
      const yEnd = doc.y;
      statusChip(doc, statuses.get(o.statusId ?? ""), PAGE.width - M.right - 115, y, 115);
      doc.y = Math.max(yEnd, y + 13);
    }
    doc.moveDown(0.8);
  }
  };
  const renderObservations = async () => {
  rule();
  const groups = [...project.groups].sort((a, b) => a.order - b.order);
  const sections: Array<{ title: string | null; items: ObservationInReport[] }> = [];
  const byGroup = (gid: string | null) => view.observations.filter((o) => (o.observation.groupId ?? null) === gid);
  const grouped = groups.length > 0 && view.observations.some((o) => o.observation.groupId);
  if (grouped) {
    for (const g of groups) {
      const items = byGroup(g.id);
      if (items.length) sections.push({ title: g.name, items });
    }
    const known = new Set(groups.map((g) => g.id));
    const rest = view.observations.filter((o) => !o.observation.groupId || !known.has(o.observation.groupId));
    if (rest.length) sections.push({ title: settings.ungroupedLabel, items: rest });
  } else {
    sections.push({ title: null, items: view.observations });
  }
  if (!view.observations.length) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text("No observations in this report.", M.left, doc.y);
  }

  for (const section of sections) {
    if (section.title) {
      doc.moveDown(1);
      // Keep the heading with its first observation.
      heading(section.title, Math.min(measureObservation(section.items[0]), pageBody - 60), 14);
    }
    for (const o of section.items) {
      await renderObservation(o);
    }
  }
  };

  for (const section of settings.pdfSectionOrder) {
    if (section === "ongoingWork") renderOngoingWork();
    else if (section === "attendance") renderAttendance();
    else if (section === "summary") renderSummary();
    else await renderObservations();
  }

  // ---- Disclaimer ----
  if (settings.disclaimer.trim()) {
    doc.moveDown(0.5);
    ensureSpace(40);
    rule();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(settings.disclaimer.trim(), M.left, doc.y, { width: CONTENT_W });
  }

  // ---- Footer and page numbers on every page ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // allow writing inside the bottom margin without paging
    const y = PAGE.height - M.bottom + 22;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    const left = [settings.footerText, `${project.name} — ${reportLabel(project.reportPrefix, report.sequence)}`]
      .filter(Boolean)
      .join("  ·  ");
    doc.text(left, M.left, y, { width: CONTENT_W - 80, lineBreak: false, ellipsis: true });
    doc.text(`Page ${i + 1} of ${range.count}`, PAGE.width - M.right - 80, y, { width: 80, align: "right", lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  return done;

  /** Estimated height of an observation as rendered below (with a little to spare). */
  function measureObservation(o: ObservationInReport): number {
    const line = (size: number, n: number) => size * 1.16 * n; // moveDown(n) at a font size
    doc.font("Helvetica-Bold").fontSize(11);
    let right = 4 + doc.heightOfString(o.observation.title, { width: BODY_W });
    if (o.observation.description.trim()) {
      doc.font("Helvetica").fontSize(10);
      right += line(10, 0.2) + doc.heightOfString(o.observation.description.trim(), { width: BODY_W });
    }
    for (const u of o.updates) {
      doc.font("Helvetica-Bold").fontSize(9);
      right += line(10, 0.5) + doc.heightOfString(updateDate(u.date), { width: UPDATE_W });
      doc.font("Helvetica").fontSize(10);
      right += doc.heightOfString(u.text.trim(), { width: UPDATE_W });
    }
    const left = 4 + 14 + 14 + 12; // number, status, opened date
    const rows = Math.ceil(o.attachments.length / perRow);
    const photos = rows * (line(10, 0.4) + THUMB.h + THUMB.captionH);
    return (Math.max(left, right) + photos + line(10, 1)) * 1.05;
  }

  async function renderObservation(o: ObservationInReport) {
    // Start on a new page rather than split, unless it's longer than a page anyway.
    const need = measureObservation(o);
    if (doc.y + need > bottom() && need <= pageBody) doc.addPage();
    else ensureSpace(70);
    const top = doc.y + 4;
    // Left column: number, status, original date.
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(o.number, M.left, top, { width: META_W });
    statusChip(doc, statuses.get(o.statusId ?? ""), M.left, doc.y + 2, META_W);
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`Opened ${formatLongDate(o.observation.originalDate)}`, M.left, doc.y + 4, { width: META_W });
    const leftEnd = doc.y;
    const startPage = currentPage();

    // Right column: title, description, dated history.
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(o.observation.title, BODY_X, top, { width: BODY_W });
    if (o.observation.description.trim()) {
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor(INK).text(o.observation.description.trim(), BODY_X, doc.y, { width: BODY_W });
    }
    const dots: Array<{ page: number; y: number; color: string | undefined }> = [];
    for (const u of o.updates) {
      doc.moveDown(0.5);
      ensureSpace(26);
      const y = doc.y;
      dots.push({ page: currentPage(), y: y + 4.5, color: statuses.get(statusOn(o.statusEvents, u.date) ?? "")?.color });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(updateDate(u.date), UPDATE_X, y, { width: UPDATE_W });
      doc.font("Helvetica").fontSize(10).fillColor(INK).text(u.text.trim(), UPDATE_X, doc.y, { width: UPDATE_W });
    }
    // Lines first, then dots on top; only between dots on the same page.
    const here = currentPage();
    const dotX = BODY_X + DOT_R + 1;
    dots.forEach((d, i) => {
      const next = dots[i + 1];
      if (!next || next.page !== d.page) return;
      doc.switchToPage(d.page);
      doc.moveTo(dotX, d.y + DOT_R).lineTo(dotX, next.y - DOT_R).lineWidth(1).strokeColor(RULE).stroke();
    });
    for (const d of dots) {
      doc.switchToPage(d.page);
      doc.circle(dotX, d.y, DOT_R).lineWidth(0.6).fillAndStroke(d.color ?? "#FFFFFF", RULE);
    }
    doc.switchToPage(here);
    if (currentPage() === startPage) doc.y = Math.max(doc.y, leftEnd);

    // Photos: thumbnails in rows, each kept with its caption and linked to the viewer.
    for (let i = 0; i < o.attachments.length; i += perRow) {
      const row = o.attachments.slice(i, i + perRow);
      doc.moveDown(0.4);
      ensureSpace(THUMB.h + THUMB.captionH);
      const y = doc.y;
      for (const [j, a] of row.entries()) {
        const x = BODY_X + j * (THUMB.w + THUMB.gap);
        try {
          const { bytes } = await readAttachmentImage(a, a.photo, "thumb");
          doc.image(bytes, x, y, { fit: [THUMB.w, THUMB.h], align: "center", valign: "center" });
          const token = await ensureShareToken(project.id, a.id);
          doc.link(x, y, THUMB.w, THUMB.h, `${publicBaseUrl.replace(/\/$/, "")}/p/${token}`);
        } catch {
          doc.rect(x, y, THUMB.w, THUMB.h).lineWidth(0.5).strokeColor(RULE).stroke();
          doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text("Image unavailable", x, y + THUMB.h / 2 - 4, { width: THUMB.w, align: "center" });
        }
        let textY = y + THUMB.h + 3;
        if (show.photoCaption !== "caption") {
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text(formatShortDate(a.date), x, textY, { width: THUMB.w, lineBreak: false });
          textY += 10;
        }
        if (show.photoCaption !== "date" && a.caption) {
          doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(a.caption, x, textY, {
            width: THUMB.w,
            height: y + THUMB.h + THUMB.captionH - textY,
            ellipsis: true,
          });
        }
      }
      doc.y = y + THUMB.h + THUMB.captionH;
    }

    doc.moveDown(0.6);
    doc.moveTo(M.left, doc.y).lineTo(PAGE.width - M.right, doc.y).lineWidth(0.25).strokeColor(RULE).stroke();
    doc.moveDown(0.4);
  }

  function currentPage() {
    const r = doc.bufferedPageRange();
    return r.start + r.count - 1;
  }
}

function statusChip(doc: PDFKit.PDFDocument, status: StatusDef | undefined, x: number, y: number, width: number) {
  const label = status?.label ?? "No status";
  doc.circle(x + 3.5, y + 5, 3.5).fillColor(status?.color ?? "#999999").fill();
  doc.font("Helvetica").fontSize(9).fillColor(INK).text(label, x + 11, y, { width: width - 11 });
}

