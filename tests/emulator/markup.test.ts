import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { resetEmulators } from "../support/fixtures";
import { createProject } from "@/server/services/projects";
import { createReport } from "@/server/services/reports";
import { createObservation } from "@/server/services/observations";
import { attachPhoto, deletePhoto, ensureShareToken, getPhoto, listAttachments, readPhotoFile, resolveShare, uploadPhoto } from "@/server/services/photos";
import { readAttachmentImage, saveMarkup } from "@/server/services/markup";
import { buildReportView } from "@/server/services/reportView";
import { renderReportPdf } from "@/server/pdf/renderReport";
import { bucket } from "@/server/firebaseAdmin";
import type { Shape } from "@/lib/markup";

beforeEach(resetEmulators);

const box: Shape = { id: "s1", kind: "rect", x: 0.1, y: 0.1, w: 0.3, h: 0.3, stroke: "#E5352B", strokeWidth: "m", fill: null };
const png = (w: number, h: number, color: string) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();

async function setup() {
  const pid = await createProject({ name: "P", code: "", address: "", description: "", reportPrefix: "Report " });
  const r1 = await createReport(pid, { visitDate: "2026-07-14", visitTime: "", authorName: "T", sourceReportId: null, observationIds: [] });
  const oid = await createObservation(pid, r1, { title: "Crack", description: "", statusId: "nonconforming", groupId: null });
  const original = await png(1200, 900, "#888888");
  const photoId = await uploadPhoto(pid, r1, oid, { name: "site.png", bytes: original }, "t");
  const [attachment] = await listAttachments(pid, oid);
  return { pid, r1, oid, original, photoId, attachment };
}

describe("photo markup", () => {
  it("stores marked-up copies and never changes the original", async () => {
    const { pid, r1, original, photoId, attachment } = await setup();
    const rendered = await png(1200, 900, "#FF0000");
    expect(await saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, rendered)).toBe(1);

    const photo = await getPhoto(pid, photoId);
    expect((await readPhotoFile(photo, "original")).bytes.equals(original)).toBe(true);
    const [saved] = await listAttachments(pid, (await listAttachments(pid, attachment.observationId))[0].observationId);
    expect(saved.markup?.shapes).toEqual([box]);
    // Thumbnails and the viewer use the marked-up copy; "original" and "plain-web" don't.
    const marked = await readAttachmentImage(saved, photo, "thumb");
    const plain = await readPhotoFile(photo, "thumb");
    expect(marked.bytes.equals(plain.bytes)).toBe(false);
    const { dominant } = await sharp(marked.bytes).stats();
    expect(dominant.r).toBeGreaterThan(200);
    expect((await readAttachmentImage(saved, photo, "original")).bytes.equals(original)).toBe(true);
  });

  it("is edited only from the report where the photo was attached", async () => {
    const { pid, r1, oid, attachment } = await setup();
    const r2 = await createReport(pid, { visitDate: "2026-07-28", visitTime: "", authorName: "T", sourceReportId: r1, observationIds: [oid] });
    await expect(saveMarkup(pid, attachment.id, r2, { shapes: [box] }, 0, await png(1200, 900, "#f00"))).rejects.toThrow(/where the photo was attached/);
  });

  it("rejects invalid shapes, a missing image and an image of the wrong proportions", async () => {
    const { pid, r1, attachment } = await setup();
    await expect(saveMarkup(pid, attachment.id, r1, { shapes: [{ ...box, stroke: "red" }] }, 0, await png(1200, 900, "#f00"))).rejects.toThrow(/colour/);
    await expect(saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, null)).rejects.toThrow(/missing/);
    await expect(saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, await png(900, 900, "#f00"))).rejects.toThrow(/proportions/);
  });

  it("detects a concurrent save and keeps no stray files", async () => {
    const { pid, r1, attachment } = await setup();
    await saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, await png(1200, 900, "#f00"));
    await expect(saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, await png(1200, 900, "#0f0"))).rejects.toThrow(/Someone else/);
    const [files] = await bucket().getFiles({ prefix: `projects/${pid}/photos/${attachment.photoId}/markup/` });
    expect(files.map((f) => f.name).sort()).toEqual([
      `projects/${pid}/photos/${attachment.photoId}/markup/${attachment.id}-1-thumb.jpg`,
      `projects/${pid}/photos/${attachment.photoId}/markup/${attachment.id}-1-web.jpg`,
    ]);
  });

  it("replaces old copies on each save and removes them when cleared", async () => {
    const { pid, r1, attachment } = await setup();
    await saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, await png(1200, 900, "#f00"));
    await saveMarkup(pid, attachment.id, r1, { shapes: [box, { ...box, id: "s2", x: 0.5 }] }, 1, await png(1200, 900, "#00f"));
    let [files] = await bucket().getFiles({ prefix: `projects/${pid}/photos/${attachment.photoId}/markup/` });
    expect(files.every((f) => f.name.includes(`${attachment.id}-2-`))).toBe(true);

    await saveMarkup(pid, attachment.id, r1, { shapes: [] }, 2, null);
    [files] = await bucket().getFiles({ prefix: `projects/${pid}/photos/${attachment.photoId}/markup/` });
    expect(files).toHaveLength(0);
    const [cleared] = await listAttachments(pid, attachment.observationId);
    expect(cleared.markup ?? null).toBeNull();
    expect(cleared.markupImages ?? null).toBeNull();
  });

  it("saves a crop position without shapes, and clears it when centered", async () => {
    const { pid, r1, oid, attachment } = await setup();
    await saveMarkup(pid, attachment.id, r1, { shapes: [], crop: { x: 0, y: 0.5 } }, 0, null);
    let [saved] = await listAttachments(pid, oid);
    expect(saved.markup).toEqual({ shapes: [], crop: { x: 0, y: 0.5 } });
    expect(saved.markupImages ?? null).toBeNull();
    await saveMarkup(pid, attachment.id, r1, { shapes: [], crop: { x: 0.5, y: 0.5 } }, 1, null);
    [saved] = await listAttachments(pid, oid);
    expect(saved.markup ?? null).toBeNull();
  });

  it("keeps markups separate when the same photo is used twice", async () => {
    const { pid, r1, photoId, attachment } = await setup();
    const other = await createObservation(pid, r1, { title: "Other", description: "", statusId: "nonconforming", groupId: null });
    const second = await attachPhoto(pid, photoId, other, r1);
    await saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, await png(1200, 900, "#f00"));
    const [secondAtt] = await listAttachments(pid, other);
    expect(secondAtt.id).toBe(second);
    expect(secondAtt.markup ?? null).toBeNull();
  });

  it("puts the marked-up thumbnail in the PDF", async () => {
    const { pid, r1, attachment } = await setup();
    await saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, await png(1200, 900, "#f00"));
    const pdf = await renderReportPdf(await buildReportView(pid, r1), "https://reports.example.org");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.toString("latin1")).toMatch(/\/Subtype \/Image/);
  });
});

describe("square images", () => {
  const dims = async (b: Buffer) => {
    const m = await sharp(b).metadata();
    return [m.width, m.height];
  };

  it("serves square images everywhere except the original and the editor's whole photo", async () => {
    const { pid, r1, photoId, attachment } = await setup(); // 1200 × 900 photo
    const photo = await getPhoto(pid, photoId);
    let [a] = await listAttachments(pid, attachment.observationId);
    expect(await dims((await readAttachmentImage(a, photo, "thumb")).bytes)).toEqual([360, 360]);
    expect(await dims((await readAttachmentImage(a, photo, "web")).bytes)).toEqual([900, 900]);
    expect(await dims((await readAttachmentImage(a, photo, "plain-square")).bytes)).toEqual([900, 900]);
    expect(await dims((await readAttachmentImage(a, photo, "plain-web")).bytes)).toEqual([1200, 900]);
    expect(await dims((await readAttachmentImage(a, photo, "original")).bytes)).toEqual([1200, 900]);

    // A marked-up copy is stored square, cut at the crop.
    const left = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#0000FF" } })
      .composite([{ input: await png(300, 900, "#FF0000"), left: 0, top: 0 }])
      .png()
      .toBuffer();
    await saveMarkup(pid, attachment.id, r1, { shapes: [box], crop: { x: 0, y: 0.5 } }, 0, left);
    [a] = await listAttachments(pid, attachment.observationId);
    const web = (await readAttachmentImage(a, photo, "web")).bytes;
    expect(await dims(web)).toEqual([900, 900]);
    // Cropped from the left edge, so the red strip is in view.
    const { data } = await sharp(web).extract({ left: 10, top: 450, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200);
    expect(data[2]).toBeLessThan(80);
  });

  it("crops photos without markup at the saved crop position", async () => {
    const { pid, r1, photoId, attachment } = await setup();
    await saveMarkup(pid, attachment.id, r1, { shapes: [], crop: { x: 1, y: 0.5 } }, 0, null);
    const [a] = await listAttachments(pid, attachment.observationId);
    const thumb = (await readAttachmentImage(a, await getPhoto(pid, photoId), "thumb")).bytes;
    expect(await dims(thumb)).toEqual([360, 360]);
  });
});

describe("deleting a photo from the project", () => {
  it("removes it from every observation, revokes its links and deletes its files", async () => {
    const { pid, r1, photoId, attachment } = await setup();
    const other = await createObservation(pid, r1, { title: "Other", description: "", statusId: "nonconforming", groupId: null });
    await attachPhoto(pid, photoId, other, r1);
    await saveMarkup(pid, attachment.id, r1, { shapes: [box] }, 0, await png(1200, 900, "#f00"));
    const token = await ensureShareToken(pid, attachment.id);

    await deletePhoto(pid, photoId);
    await expect(getPhoto(pid, photoId)).rejects.toThrow(/not found/i);
    expect(await listAttachments(pid, attachment.observationId)).toEqual([]);
    expect(await listAttachments(pid, other)).toEqual([]);
    expect(await resolveShare(token)).toBeNull();
    const [files] = await bucket().getFiles({ prefix: `projects/${pid}/photos/${photoId}/` });
    expect(files).toHaveLength(0);
    expect((await buildReportView(pid, r1)).observations.every((o) => o.attachments.length === 0)).toBe(true);
  });
});
