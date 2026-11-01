import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { resetEmulators } from "../support/fixtures";
import { createProject, getProject, setProjectOptions, setProjectStatuses, setSettingLock } from "@/server/services/projects";
import { createReport } from "@/server/services/reports";
import { createObservation, editUpdate, listUpdates, deleteUpdate } from "@/server/services/observations";
import { attachPhoto, uploadPhoto } from "@/server/services/photos";
import { getProjectSettings, getSettings, updateSettings } from "@/server/services/settings";
import { projectDoc } from "@/server/paths";

beforeEach(resetEmulators);

const newProject = (name = "P") => createProject({ name, code: "", address: "", description: "", reportPrefix: "Report " });
const report = (pid: string, visitDate: string, sourceReportId: string | null = null, observationIds: string[] = []) =>
  createReport(pid, { visitDate, visitTime: "", authorName: "T", sourceReportId, observationIds });
const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).png().toBuffer();

describe("company and project settings", () => {
  it("projects inherit company values until they choose their own", async () => {
    const pid = await newProject();
    expect((await getProjectSettings(pid)).autoPhotoUpdate).toBe(true);
    await updateSettings({ autoPhotoUpdate: false, includeWeather: true });
    expect(await getProjectSettings(pid)).toMatchObject({ autoPhotoUpdate: false, includeWeather: true });
    await setProjectOptions(pid, { autoPhotoUpdate: true });
    expect((await getProjectSettings(pid)).autoPhotoUpdate).toBe(true);
    await setProjectOptions(pid, { autoPhotoUpdate: null });
    expect((await getProjectSettings(pid)).autoPhotoUpdate).toBe(false);
  });

  it("carries over choices saved before company settings existed", async () => {
    const pid = await newProject();
    await projectDoc(pid).update({ overrides: null, summaryOverride: "hide", includeWeather: true });
    expect((await getProject(pid)).overrides).toEqual({ summary: false, weather: true });
    expect(await getProjectSettings(pid)).toMatchObject({ showSummaryDefault: false, includeWeather: true });
  });

  it("locking uses the company value everywhere and blocks project choices", async () => {
    const pid = await newProject();
    await setProjectOptions(pid, { summary: false, weather: true });
    await setSettingLock("summary", true);
    expect((await getSettings()).locks.summary).toBe(true);
    expect((await getProject(pid)).overrides).toEqual({ weather: true });
    expect((await getProjectSettings(pid)).showSummaryDefault).toBe(true);
    await expect(setProjectOptions(pid, { summary: false })).rejects.toThrow(/locked/);
    await setSettingLock("summary", false);
    await setProjectOptions(pid, { summary: false });
    expect((await getProjectSettings(pid)).showSummaryDefault).toBe(false);
  });

  it("locking statuses returns projects to the company list, unless they use project-only statuses", async () => {
    const company = await getSettings();
    const resolvedIndex = company.statuses.findIndex((s) => s.id === company.resolvedStatusId);
    const a = await newProject("Alpha");
    const b = await newProject("Bravo");
    await setProjectStatuses(a, company.statuses.map((s) => ({ ...s, label: `${s.label}!` })), resolvedIndex);
    await setProjectStatuses(b, [...company.statuses, { label: "On hold", color: "#CCCCCC" }], resolvedIndex);
    const onHold = (await getProjectSettings(b)).statuses.find((s) => s.label === "On hold")!;
    const r = await report(b, "2026-07-14");
    await createObservation(b, r, { title: "X", description: "", statusId: onHold.id, groupId: null });

    await expect(setSettingLock("statuses", true)).rejects.toThrow(/Bravo/);
    expect((await getSettings()).locks.statuses).toBe(false);

    // Without the project-only status in use, the lock applies and clears overrides.
    await projectDoc(b).update({ statusOverride: null });
    await setSettingLock("statuses", true);
    expect((await getProject(a)).statusOverride ?? null).toBeNull();
    expect((await getProjectSettings(a)).statuses).toEqual(company.statuses);
    await expect(setProjectStatuses(a, company.statuses, resolvedIndex)).rejects.toThrow(/locked/);
  });
});

describe("automatic update when photos are added", () => {
  async function carried() {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const oid = await createObservation(pid, r1, { title: "Crack", description: "", statusId: "nonconforming", groupId: null });
    const r2 = await report(pid, "2026-07-28", r1, [oid]);
    return { pid, r1, r2, oid };
  }
  const textsIn = async (pid: string, oid: string, rid: string) => (await listUpdates(pid, oid)).filter((u) => u.reportId === rid).map((u) => u.text);

  it("adds “Photo added.”, then “Photos added.” with the next photo", async () => {
    const { pid, r2, oid } = await carried();
    const photo = await uploadPhoto(pid, r2, oid, { name: "a.png", bytes: await png() }, "t");
    expect(await textsIn(pid, oid, r2)).toEqual(["Photo added."]);
    await uploadPhoto(pid, r2, oid, { name: "b.png", bytes: await png() }, "t");
    expect(await textsIn(pid, oid, r2)).toEqual(["Photos added."]);
    // Reusing a library photo counts too, and doesn't add a second update.
    const other = await createObservation(pid, r2, { title: "New", description: "", statusId: "nonconforming", groupId: null });
    await attachPhoto(pid, photo, other, r2);
    expect(await listUpdates(pid, other)).toEqual([]); // created in this report: no updates there
  });

  it("leaves an edited update alone, and adds one again after it is deleted", async () => {
    const { pid, r2, oid } = await carried();
    await uploadPhoto(pid, r2, oid, { name: "a.png", bytes: await png() }, "t");
    const [u] = await listUpdates(pid, oid);
    await editUpdate(pid, oid, u.id, "Crack sealed.");
    await uploadPhoto(pid, r2, oid, { name: "b.png", bytes: await png() }, "t");
    expect(await textsIn(pid, oid, r2)).toEqual(["Crack sealed."]);
    await deleteUpdate(pid, oid, u.id);
    await uploadPhoto(pid, r2, oid, { name: "c.png", bytes: await png() }, "t");
    expect(await textsIn(pid, oid, r2)).toEqual(["Photo added."]);
  });

  it("does nothing when the setting is off", async () => {
    const { pid, r2, oid } = await carried();
    await setProjectOptions(pid, { autoPhotoUpdate: false });
    await uploadPhoto(pid, r2, oid, { name: "a.png", bytes: await png() }, "t");
    expect(await textsIn(pid, oid, r2)).toEqual([]);
  });
});
