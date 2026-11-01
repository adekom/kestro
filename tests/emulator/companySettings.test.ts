import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { resetEmulators } from "../support/fixtures";
import { createProject, getProject, saveGroups, setProjectOptions, setProjectStatuses } from "@/server/services/projects";
import { carryForwardCandidates, createReport } from "@/server/services/reports";
import { addUpdate, createObservation, listUpdates, setStatusInReport } from "@/server/services/observations";
import { detachPhoto, ensureShareToken, listAttachments, resolveShare, uploadPhoto } from "@/server/services/photos";
import { getProjectSettings, getSettings, saveStatuses, setCompanyPolicy, updateSettings } from "@/server/services/settings";
import { buildReportView } from "@/server/services/reportView";
import { renderReportPdf } from "@/server/pdf/renderReport";

beforeEach(resetEmulators);

const newProject = () => createProject({ name: "P", code: "", address: "", description: "", reportPrefix: "Report " });
const report = (pid: string, visitDate: string, sourceReportId: string | null = null, observationIds: string[] = []) =>
  createReport(pid, { visitDate, visitTime: "", authorName: "T", sourceReportId, observationIds });
const obs = (pid: string, rid: string, title = "Crack", groupId: string | null = null) =>
  createObservation(pid, rid, { title, description: "", statusId: "nonconforming", groupId });
const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).png().toBuffer();

describe("company-only settings", () => {
  it("validates what admins save", async () => {
    await expect(updateSettings({ numberFormat: "roman" as never })).rejects.toThrow(/number format/);
    await expect(updateSettings({ pdfSectionOrder: ["attendance"] })).rejects.toThrow(/section order/);
    await expect(updateSettings({ markupPalette: [] })).rejects.toThrow(/palette/);
    await expect(updateSettings({ photoAddedText: "  " })).rejects.toThrow(/empty/);
    await updateSettings({ numberFormat: "dash", pageSize: "A4", markupPalette: ["#e5352b", "#00000080"] });
    expect(await getSettings()).toMatchObject({ numberFormat: "dash", pageSize: "A4", markupPalette: ["#E5352B", "#00000080"] });
  });

  it("numbers observations in the chosen format", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const a = await obs(pid, r1, "A");
    await obs(pid, r1, "B");
    const r2 = await report(pid, "2026-07-28", r1, [a]);
    await obs(pid, r2, "C");
    await updateSettings({ numberFormat: "running" });
    expect((await buildReportView(pid, r2)).observations.map((o) => o.number)).toEqual(["1", "3"]);
    await updateSettings({ numberFormat: "dash" });
    expect((await buildReportView(pid, r2)).observations.map((o) => o.number)).toEqual(["1-1", "2-1"]);
  });

  it("gives new projects the company's report label and renders A4 PDFs in the chosen section order", async () => {
    await updateSettings({ defaultReportPrefix: "Site Visit ", pageSize: "A4", pdfSectionOrder: ["observations", "summary", "attendance", "ongoingWork"] });
    const pid = await createProject({ name: "Q", code: "", address: "", description: "" } as never);
    expect((await getProject(pid)).reportPrefix).toBe("Site Visit ");
    const rid = await report(pid, "2026-07-14");
    await obs(pid, rid);
    const pdf = await renderReportPdf(await buildReportView(pid, rid), "https://reports.example.org");
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
  });

  it("uses the company's automatic update wording", async () => {
    await updateSettings({ photoAddedText: "Photo taken.", photosAddedText: "Photos taken." });
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await obs(pid, r1);
    const r2 = await report(pid, "2026-07-28", r1, [oid]);
    await uploadPhoto(pid, r2, oid, { name: "a.png", bytes: await png() }, "t");
    expect((await listUpdates(pid, oid)).map((u) => u.text)).toEqual(["Photo taken."]);
    await uploadPhoto(pid, r2, oid, { name: "b.png", bytes: await png() }, "t");
    expect((await listUpdates(pid, oid)).map((u) => u.text)).toEqual(["Photos taken."]);
  });

  it("can stop a photo's public link working when it's removed", async () => {
    const pid = await newProject();
    const rid = await report(pid, "2026-07-14");
    const oid = await obs(pid, rid);
    await uploadPhoto(pid, rid, oid, { name: "a.png", bytes: await png() }, "t");
    await uploadPhoto(pid, rid, oid, { name: "b.png", bytes: await png() }, "t");
    const [first, second] = await listAttachments(pid, oid);
    const kept = await ensureShareToken(pid, first.id);
    await detachPhoto(pid, first.id);
    expect(await resolveShare(kept)).not.toBeNull(); // default: links keep working
    await updateSettings({ revokeLinksOnRemove: true });
    const revoked = await ensureShareToken(pid, second.id);
    await detachPhoto(pid, second.id);
    expect(await resolveShare(revoked)).toBeNull();
  });
});

describe("company and project behaviour settings", () => {
  it("allows several updates per visit when the setting is on", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await obs(pid, r1);
    const r2 = await report(pid, "2026-07-28", r1, [oid]);
    await addUpdate(pid, oid, r2, "First");
    await expect(addUpdate(pid, oid, r2, "Second")).rejects.toThrow(/already has an update/);
    await setProjectOptions(pid, { multipleUpdates: true });
    await addUpdate(pid, oid, r2, "Second");
    expect((await listUpdates(pid, oid)).map((u) => u.text)).toEqual(["First", "Second"]);
  });

  it("makes groups optional when the setting is off", async () => {
    const pid = await newProject();
    await saveGroups(pid, [{ name: "Roof" }]);
    const rid = await report(pid, "2026-07-14");
    await expect(obs(pid, rid)).rejects.toThrow(/Choose a group/);
    await setCompanyPolicy("requireGroup", false);
    await obs(pid, rid);
    await expect(obs(pid, rid, "X", "not-a-group")).rejects.toThrow(/project's groups/);
  });

  it("can include resolved observations when carrying forward", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await obs(pid, r1);
    await setStatusInReport(pid, oid, r1, "resolved");
    expect((await carryForwardCandidates(pid, r1, "resolved")).fromSource[0].preselected).toBe(false);
    expect((await carryForwardCandidates(pid, r1, "resolved", true)).fromSource[0].preselected).toBe(true);
    await setProjectOptions(pid, { carryResolved: true });
    expect((await getProjectSettings(pid)).policies.carryResolved).toBe(true);
  });

  it("remembers the default status for the company and for a project", async () => {
    const company = await getSettings();
    await saveStatuses(company.statuses, 2, async () => false, 1);
    expect((await getSettings()).defaultStatusId).toBe(company.statuses[1].id);
    const pid = await newProject();
    await setProjectStatuses(pid, company.statuses, 2, 2);
    expect((await getProjectSettings(pid)).defaultStatusId).toBe(company.statuses[2].id);
  });

  it("applies PDF photo size and caption choices", async () => {
    const pid = await newProject();
    const rid = await report(pid, "2026-07-14");
    const oid = await obs(pid, rid);
    await uploadPhoto(pid, rid, oid, { name: "a.png", bytes: await png() }, "t");
    await setProjectOptions(pid, { photoSize: "l", photoCaption: "date" });
    await expect(setProjectOptions(pid, { photoSize: "huge" })).rejects.toThrow(/Invalid/);
    const view = await buildReportView(pid, rid);
    expect(view.settings.policies).toMatchObject({ photoSize: "l", photoCaption: "date" });
    const pdf = await renderReportPdf(view, "https://reports.example.org");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
