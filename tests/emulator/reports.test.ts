import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { resetEmulators } from "../support/fixtures";
import { createProject, getProject, saveGroups, setProjectOptions } from "@/server/services/projects";
import { carryForwardCandidates, createReport, getMemberships, getReport, listReports, updateReportInfo } from "@/server/services/reports";
import { addUpdate, createObservation, deleteUpdate, setStatusInReport, updateObservation } from "@/server/services/observations";
import { buildReportView, getObservationDetail } from "@/server/services/reportView";
import { ensureShareToken, listAttachments, readPhotoFile, resolveShare, revokeShare, uploadPhoto, getPhoto } from "@/server/services/photos";
import { renderReportPdf } from "@/server/pdf/renderReport";
import { saveStatuses, getSettings } from "@/server/services/settings";
import { db } from "@/server/firebaseAdmin";

beforeEach(resetEmulators);

const newProject = () => createProject({ name: "Test Project", code: "T-1", address: "1 Test St", description: "", reportPrefix: "Report " });
const report = (pid: string, visitDate: string, sourceReportId: string | null = null, observationIds: string[] = []) =>
  createReport(pid, { visitDate, visitTime: "", authorName: "Tester", sourceReportId, observationIds });

describe("report sequence allocation", () => {
  it("numbers reports consecutively within a project only", async () => {
    const a = await newProject();
    const b = await newProject();
    await report(a, "2026-07-14");
    await report(a, "2026-07-28");
    await report(b, "2026-07-30");
    expect((await listReports(a)).map((r) => r.sequence)).toEqual([1, 2]);
    expect((await listReports(b)).map((r) => r.sequence)).toEqual([1]);
  });

  it("never allocates duplicate numbers under concurrent creation", async () => {
    const pid = await newProject();
    await Promise.all(Array.from({ length: 6 }, (_, i) => report(pid, `2026-07-${10 + i}`)));
    expect((await listReports(pid)).map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("observation numbering and carry-forward", () => {
  it("numbers observations by origin report and local sequence", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    await createObservation(pid, r1, { title: "First", description: "", statusId: "nonconforming", groupId: null });
    await createObservation(pid, r1, { title: "Second", description: "", statusId: "nonconforming", groupId: null });
    const view = await buildReportView(pid, r1);
    expect(view.observations.map((o) => o.number)).toEqual(["1.1", "1.2"]);
  });

  it("preselects unresolved observations and excludes resolved ones by default", async () => {
    const pid = await newProject();
    const r16 = await report(pid, "2026-07-14");
    const open = await createObservation(pid, r16, { title: "Open item", description: "", statusId: "nonconforming", groupId: null });
    const done = await createObservation(pid, r16, { title: "Done item", description: "", statusId: "resolved", groupId: null });

    const { fromSource } = await carryForwardCandidates(pid, r16, "resolved");
    const pre = Object.fromEntries(fromSource.map((c) => [c.observationId, c.preselected]));
    expect(pre).toEqual({ [open]: true, [done]: false });

    // A resolved observation stays in its own report.
    expect((await getMemberships(pid, r16)).map((m) => m.observationId)).toContain(done);
  });

  it("allows manually carrying a resolved observation forward and recovering older ones", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const done = await createObservation(pid, r1, { title: "Done", description: "", statusId: "resolved", groupId: null });
    const r2 = await report(pid, "2026-07-28", r1, []);
    const { older } = await carryForwardCandidates(pid, r2, "resolved");
    expect(older.map((c) => c.observationId)).toContain(done);
    const r3 = await report(pid, "2026-08-11", r2, [done]);
    expect((await getMemberships(pid, r3)).map((m) => m.observationId)).toEqual([done]);
  });

  it("shows each report only the history effective on its visit date", async () => {
    const pid = await newProject();
    const r16 = await report(pid, "2026-07-14");
    const oid = await createObservation(pid, r16, { title: "Leak", description: "Water at sill", statusId: "nonconforming", groupId: null });
    const r17 = await report(pid, "2026-07-28", r16, [oid]);
    await addUpdate(pid, oid, r17, "Sealant applied");
    await setStatusInReport(pid, oid, r17, "resolved");

    const old = await buildReportView(pid, r16);
    const cur = await buildReportView(pid, r17);
    expect(old.observations[0].statusId).toBe("nonconforming");
    expect(old.observations[0].updates).toHaveLength(0);
    expect(cur.observations[0].statusId).toBe("resolved");
    expect(cur.observations[0].updates.map((u) => u.text)).toEqual(["Sealant applied"]);
    // Observation keeps its origin number in the later report.
    expect(cur.observations[0].number).toBe("1.1");
  });

  it("does not store the observation twice when carried forward", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await createObservation(pid, r1, { title: "Shared", description: "", statusId: "nonconforming", groupId: null });
    await report(pid, "2026-07-28", r1, [oid]);
    const all = await db().collection(`projects/${pid}/observations`).get();
    expect(all.size).toBe(1);
  });
});

describe("project report options", () => {
  it("stores the PDF summary choice and weather recording on the project; reports keep their weather", async () => {
    const pid = await newProject();
    expect(await getProject(pid)).toMatchObject({ summaryOverride: "default", includeWeather: false });
    await setProjectOptions(pid, { summaryOverride: "hide", includeWeather: true });
    expect(await getProject(pid)).toMatchObject({ summaryOverride: "hide", includeWeather: true });
    await expect(setProjectOptions(pid, { summaryOverride: "sometimes" as never })).rejects.toThrow(/Invalid/);

    const rid = await report(pid, "2026-07-14");
    await updateReportInfo(pid, rid, { weather: "Overcast, 58°F" }, 1);
    expect((await getReport(pid, rid)).weather).toBe("Overcast, 58°F");
    const pdf = await renderReportPdf(await buildReportView(pid, rid), "https://reports.example.org");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("updates", () => {
  it("allows one update per observation per visit, again after it is deleted", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await createObservation(pid, r1, { title: "Leak", description: "", statusId: "nonconforming", groupId: null });
    // Not in the report where it was created: the description is the record there.
    await expect(addUpdate(pid, oid, r1, "Too early")).rejects.toThrow(/later reports/);
    const r2 = await report(pid, "2026-07-28", r1, [oid]);
    const first = await addUpdate(pid, oid, r2, "Sealant applied");
    await expect(addUpdate(pid, oid, r2, "Second note")).rejects.toThrow(/already has an update/);
    await deleteUpdate(pid, oid, first);
    await expect(addUpdate(pid, oid, r2, "Replacement")).resolves.toBeTruthy();
    // Another visit can have its own update.
    const r3 = await report(pid, "2026-08-11", r2, [oid]);
    await expect(addUpdate(pid, oid, r3, "Later")).resolves.toBeTruthy();
  });
});

describe("observation editor data", () => {
  it("records edits in the given report, or else the latest report that includes the observation", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await createObservation(pid, r1, { title: "Leak", description: "", statusId: "nonconforming", groupId: null });
    const r2 = await report(pid, "2026-07-28", r1, [oid]);
    await report(pid, "2026-08-11", r2, []); // later report without it

    const latest = await getObservationDetail(pid, oid, null);
    expect(latest.report.id).toBe(r2);
    expect(latest.reportLabel).toBe("Report 2 · July 28, 2026");
    expect((await getObservationDetail(pid, oid, r1)).report.id).toBe(r1);
  });
});

describe("original observation record", () => {
  it("can be edited only in its originating report; later reports add updates", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await createObservation(pid, r1, { title: "Leak", description: "Water at sill", statusId: "nonconforming", groupId: null });
    const r2 = await report(pid, "2026-07-28", r1, [oid]);

    const v2 = await updateObservation(pid, oid, { description: "Water at sill and jamb" }, 1, r1);
    await expect(updateObservation(pid, oid, { description: "Changed later" }, v2, r2)).rejects.toThrow(/originating|created/);
    await expect(updateObservation(pid, oid, { title: "Renamed later" }, v2, r2)).rejects.toThrow();
    // Presentation (group) can still change from a later report.
    await expect(updateObservation(pid, oid, { groupId: null }, v2, r2)).resolves.toBe(v2 + 1);
  });
});

describe("observation groups", () => {
  it("rejects duplicate group names regardless of case and spacing", async () => {
    const pid = await newProject();
    await expect(saveGroups(pid, [{ name: "Roof" }, { name: " roof " }])).rejects.toThrow(/unique/);
    expect((await getProject(pid)).groups).toEqual([]);
    await saveGroups(pid, [{ name: "Roof" }, { name: "Level 0" }]);
    expect((await getProject(pid)).groups.map((g) => g.name)).toEqual(["Roof", "Level 0"]);
  });
});

describe("status catalog", () => {
  it("keeps history when a status is renamed and refuses to delete one in use", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    await createObservation(pid, r1, { title: "A", description: "", statusId: "observed", groupId: null });
    const used = async (id: string) =>
      !(await db().collectionGroup("statusEvents").where("statusId", "==", id).limit(1).get()).empty;

    await saveStatuses(
      [
        { id: "nonconforming", label: "Open", color: "#C2410C" },
        { id: "observed", label: "Monitoring", color: "#7C3AED" },
        { id: "resolved", label: "Closed", color: "#15803D" },
      ],
      2,
      used,
    );
    const view = await buildReportView(pid, r1);
    expect(view.observations[0].statusId).toBe("observed");
    expect(view.settings.statuses.find((s) => s.id === "observed")?.label).toBe("Monitoring");

    await expect(
      saveStatuses([{ id: "nonconforming", label: "Open", color: "#C2410C" }, { id: "resolved", label: "Closed", color: "#15803D" }], 1, used),
    ).rejects.toThrow(/still used/);
    expect((await getSettings()).statuses).toHaveLength(3);
  });
});

describe("photos, public links and PDF", () => {
  async function setup() {
    const pid = await newProject();
    const rid = await report(pid, "2026-07-14");
    const oid = await createObservation(pid, rid, { title: "Cracked tile", description: "Lobby floor", statusId: "nonconforming", groupId: null });
    const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#888888" } }).png().toBuffer();
    const photoId = await uploadPhoto(pid, rid, oid, { name: "IMG_0001.png", bytes: png }, "tester@example.com");
    return { pid, rid, oid, png, photoId };
  }

  it("keeps the original bytes unchanged and creates derivatives", async () => {
    const { pid, png, photoId } = await setup();
    const photo = await getPhoto(pid, photoId);
    expect((await readPhotoFile(photo, "original")).bytes.equals(png)).toBe(true);
    const thumb = await sharp((await readPhotoFile(photo, "thumb")).bytes).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(480);
  });

  it("rejects non-image uploads", async () => {
    const { pid, rid, oid } = await setup();
    await expect(uploadPhoto(pid, rid, oid, { name: "x.jpg", bytes: Buffer.from("not an image") }, "t")).rejects.toThrow(/not a readable image/);
  });

  it("resolves a valid share token and refuses a revoked one", async () => {
    const { pid, oid } = await setup();
    const [attachment] = await listAttachments(pid, oid);
    const token = await ensureShareToken(pid, attachment.id);
    expect(await ensureShareToken(pid, attachment.id)).toBe(token); // stable link
    expect((await resolveShare(token))?.attachment.id).toBe(attachment.id);
    await revokeShare(pid, attachment.id);
    expect(await resolveShare(token)).toBeNull();
    expect(await resolveShare("x".repeat(32))).toBeNull();
  });

  it("renders a PDF with linked thumbnails", async () => {
    const { pid, rid } = await setup();
    const pdf = await renderReportPdf(await buildReportView(pid, rid), "https://reports.example.org");
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF")).toBe(true);
    expect(raw).toMatch(/\/Subtype \/Link/);
    expect(raw).toMatch(/https:\/\/reports\.example\.org\/p\/[A-Za-z0-9_-]{32}/);
  });

  it("does not show photos attached in later reports in earlier ones", async () => {
    const { pid, rid, oid, png } = await setup();
    const later = await report(pid, "2026-07-28", rid, [oid]);
    await uploadPhoto(pid, later, oid, { name: "later.png", bytes: png }, "t");
    expect((await buildReportView(pid, rid)).observations[0].attachments).toHaveLength(1);
    expect((await buildReportView(pid, later)).observations[0].attachments).toHaveLength(2);
  });
});
