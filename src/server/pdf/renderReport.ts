import "server-only";
import PDFDocument from "pdfkit";
import { bucket } from "../firebaseAdmin";
import { ensureShareToken } from "../services/photos";
import { readAttachmentImage } from "../services/markup";
import type { ReportView, ObservationInReport } from "../services/reportView";
import { formatLongDate, reportLabel, slug } from "@/lib/domain";
import type { StatusDef } from "@/lib/types";

// Single configurable template (spec §9). Text is real PDF text (selectable);
// only photo thumbnails are images, each linked to the public photo viewer.

const PAGE = { width: 612, height: 792 }; // US Letter, points
const M = { top: 50, bottom: 60, left: 50, right: 50 };
const CONTENT_W = PAGE.width - M.left - M.right;
const META_W = 100;
const BODY_X = M.left + META_W + 12;
const BODY_W = PAGE.width - M.right - BODY_X;
const THUMB = { w: 124, h: 93, gap: 10, captionH: 24 }; // three per row in the body column

const INK = "#222222";
const MUTED = "#666666";
const RULE = "#BBBBBB";

export function reportPdfFilename(view: ReportView): string {
  const p = view.project;
  return `${slug(p.code || p.name)}_${view.report.visitDate}_Report-${view.report.sequence}.pdf`;
}

export async function renderReportPdf(view: ReportView, publicBaseUrl: string): Promise<Buffer> {
  const { settings, project, report } = view;
  const doc = new PDFDocument({
    size: "LETTER",
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
  const heading = (text: string, minFollowing = 60) => {
    ensureSpace(24 + minFollowing); // never leave a heading orphaned at a page bottom
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(text, M.left, doc.y, { width: CONTENT_W });
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
  if (settings.fieldVisibility.address && settings.address) doc.text(settings.address, { width: CONTENT_W, align: "right" });
  if (settings.fieldVisibility.contact && settings.contactLine) doc.text(settings.contactLine, { width: CONTENT_W, align: "right" });
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
    settings.fieldVisibility.author && report.authorName && `Prepared by ${report.authorName}`,
    project.includeWeather && report.weather?.trim() && `Weather: ${report.weather.trim()}`,
  ].filter(Boolean);
  if (facts.length) doc.text(facts.join("  ·  "));
  doc.moveDown(0.8);

  // ---- General information ----
  if (settings.fieldVisibility.ongoingWork && report.ongoingWork.trim()) {
    heading("Ongoing work", 30);
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(report.ongoingWork.trim(), M.left, doc.y, { width: CONTENT_W });
    doc.moveDown(0.8);
  }
  if (settings.fieldVisibility.attendance && report.attendees.length) {
    heading("Attendance", 30);
    for (const a of report.attendees) {
      ensureSpace(14);
      const y = doc.y;
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(a.name, M.left, y, { width: 200 });
      doc.fillColor(MUTED).text(a.company, M.left + 210, y, { width: 220 });
      doc.fillColor(INK).text(a.present ? "Present" : "Absent", M.left + 440, y, { width: CONTENT_W - 440 });
      doc.y = Math.max(doc.y, y + 13);
    }
    doc.moveDown(0.8);
  }

  // ---- Optional summary ----
  const showSummary = project.summaryOverride === "default" ? settings.showSummaryDefault : project.summaryOverride === "show";
  if (showSummary && view.observations.length) {
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

  // ---- Observations, optionally grouped ----
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
    if (rest.length) sections.push({ title: "General", items: rest });
  } else {
    sections.push({ title: null, items: view.observations });
  }
  if (!view.observations.length) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text("No observations in this report.", M.left, doc.y);
  }

  for (const section of sections) {
    if (section.title) heading(section.title, 80);
    for (const o of section.items) {
      await renderObservation(o);
    }
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

  async function renderObservation(o: ObservationInReport) {
    ensureSpace(70);
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
    for (const u of o.updates) {
      doc.moveDown(0.3);
      ensureSpace(26);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(formatLongDate(u.date), BODY_X, doc.y, { width: BODY_W });
      doc.font("Helvetica").fontSize(10).fillColor(INK).text(u.text.trim(), BODY_X, doc.y, { width: BODY_W });
    }
    if (currentPage() === startPage) doc.y = Math.max(doc.y, leftEnd);

    // Photos: thumbnails in rows, each kept with its caption and linked to the viewer.
    const perRow = Math.max(1, Math.floor((BODY_W + THUMB.gap) / (THUMB.w + THUMB.gap)));
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
        if (a.caption) {
          doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(a.caption, x, y + THUMB.h + 3, {
            width: THUMB.w,
            height: THUMB.captionH - 3,
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
  doc.rect(x, y + 1.5, 7, 7).fillColor(status?.color ?? "#999999").fill();
  doc.font("Helvetica").fontSize(9).fillColor(INK).text(label, x + 11, y, { width: width - 11 });
}

