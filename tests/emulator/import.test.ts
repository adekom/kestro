import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { resetEmulators } from "../support/fixtures";
import { createContact, getContact, listContacts } from "@/server/services/contacts";
import { getProject } from "@/server/services/projects";
import { listReports } from "@/server/services/reports";
import { buildReportView } from "@/server/services/reportView";
import { getProjectSettings } from "@/server/services/settings";
import { createProjectFromImport, finishImport, getImport, importPhoto, previewImport, undoImport } from "@/server/services/importer";
import { listAttachments } from "@/server/services/photos";
import { projectDoc } from "@/server/paths";
import { bucket } from "@/server/firebaseAdmin";
import type { ImportPlan } from "@/lib/archisnapper/plan";

beforeEach(resetEmulators);

const plan = (): ImportPlan => ({
  project: { name: "Sample Project", address: "1 Sample Ave", reportPrefix: "Field Report " },
  groups: ["Level 1", "Level 2"],
  statuses: [
    { name: "REQUIRES ATTENTION", observations: 1 },
    { name: "OBSERVED", observations: 1 },
    { name: "RESOLVED", observations: 1 },
  ],
  reports: [
    { sequence: 1, visitDate: "2026-07-14", visitTime: "19:45", ongoingWork: "Framing.", attendees: [{ contactKey: "pat@builder.example", present: true }], observations: ["1.1", "1.2"] },
    { sequence: 2, visitDate: "2026-07-28", visitTime: "19:30", ongoingWork: "Drywall.", attendees: [{ contactKey: "pat@builder.example", present: false }], observations: ["1.1", "1.2", "2.1"] },
  ],
  observations: [
    { number: "1.1", originSequence: 1, localSeq: 1, title: "Louvers", description: "Louvers observed.", group: "Level 1", originalDate: "2026-07-14", statuses: [{ sequence: 1, status: "REQUIRES ATTENTION" }, { sequence: 2, status: "REQUIRES ATTENTION" }], updates: [{ sequence: 2, date: "2026-07-28", text: "Duct rerouted." }] },
    { number: "1.2", originSequence: 1, localSeq: 2, title: "Stair", description: "Stair framing.", group: "Level 2", originalDate: "2026-07-14", statuses: [{ sequence: 1, status: "OBSERVED" }, { sequence: 2, status: "RESOLVED" }], updates: [{ sequence: 2, date: "2026-07-28", text: "Complete." }] },
    { number: "2.1", originSequence: 2, localSeq: 1, title: "Window", description: "Window installed.", group: "Level 2", originalDate: "2026-07-28", statuses: [{ sequence: 2, status: "OBSERVED" }], updates: [] },
  ],
  contacts: [{ key: "pat@builder.example", firstName: "Pat", lastName: "Builder", email: "pat@builder.example", phone: "(555) 010-0000", company: "Builder Co", role: "Superintendent" }],
  photos: [{ path: "a.jpg", number: "1.1", sequence: 2, caption: "ductwork", order: 0 }],
  duplicateFiles: 0,
  unmatchedFiles: [],
  issues: [{ level: "info", message: "Status history is taken from each report's printed status." }],
});
const statusMap = { "REQUIRES ATTENTION": { label: "Requires attention", color: "#F5C26B" }, OBSERVED: { statusId: "observed" }, RESOLVED: { statusId: "resolved" } };

describe("importing an ArchiSnapper export", () => {
  it("creates the project with reports, numbering, statuses, updates and attendance", async () => {
    const t = await createProjectFromImport(plan(), statusMap, "keep", "t");
    const project = await getProject(t.projectId);
    expect(project).toMatchObject({ name: "Sample Project", address: "1 Sample Ave", reportCount: 2, importBatchId: t.batchId });
    expect(project.groups.map((g) => g.name)).toEqual(["Level 1", "Level 2"]);
    // A new status was needed, so the project has its own list (company's plus the new one).
    const settings = await getProjectSettings(t.projectId);
    expect(settings.statuses.map((s) => s.label)).toEqual(["Nonconforming", "Observed", "Resolved", "Requires attention"]);

    const reports = await listReports(t.projectId);
    expect(reports.map((r) => [r.sequence, r.visitDate, r.visitTime])).toEqual([[1, "2026-07-14", "19:45"], [2, "2026-07-28", "19:30"]]);
    const view = await buildReportView(t.projectId, t.reports[2]);
    expect(view.observations.map((o) => o.number)).toEqual(["1.1", "1.2", "2.1"]);
    const byNumber = Object.fromEntries(view.observations.map((o) => [o.number, o]));
    expect(settings.statuses.find((s) => s.id === byNumber["1.1"].statusId)?.label).toBe("Requires attention");
    expect(byNumber["1.2"].statusId).toBe("resolved");
    expect(byNumber["1.2"].updates.map((u) => u.text)).toEqual(["Complete."]);
    // Report 1 doesn't show what happened later.
    const first = await buildReportView(t.projectId, t.reports[1]);
    expect(first.observations.find((o) => o.number === "1.2")!.statusId).toBe("observed");
    expect(first.observations.find((o) => o.number === "1.2")!.updates).toEqual([]);

    expect(view.report.attendees).toMatchObject([{ name: "Pat Builder", company: "Builder Co", present: false }]);
    expect(project.contacts).toMatchObject([{ projectRole: "Superintendent" }]);
  });

  it("adds photos to the report where they first appeared, without automatic updates", async () => {
    const t = await createProjectFromImport(plan(), statusMap, "keep", "t");
    const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).jpeg().toBuffer();
    await importPhoto(t.batchId, { observationId: t.observations["1.1"], reportId: t.reports[2], caption: "ductwork", order: 0 }, { name: "a.jpg", bytes }, "t");
    const [a] = await listAttachments(t.projectId, t.observations["1.1"]);
    expect(a).toMatchObject({ reportId: t.reports[2], caption: "ductwork", date: "2026-07-28" });
    const view = await buildReportView(t.projectId, t.reports[2]);
    expect(view.observations.find((o) => o.number === "1.1")!.updates.map((u) => u.text)).toEqual(["Duct rerouted."]);
    const record = await finishImport(t.batchId, ["b.jpg: not readable"]);
    expect(record.counts).toMatchObject({ reports: 2, observations: 3, updates: 2, photosPlanned: 1, photosImported: 1, contactsCreated: 1 });
    expect(record.issues.at(-1)).toEqual({ level: "warning", message: "b.jpg: not readable" });
  });

  it("matches contacts by email and updates them only when asked; undo puts everything back", async () => {
    const existing = await createContact({ firstName: "Patricia", lastName: "B", company: "Old Co", title: "PM", email: "PAT@builder.example", phone: "", defaultRole: "" });
    const preview = await previewImport("Sample Project", ["pat@builder.example", "new@example.com"]);
    expect(preview.projectNameTaken).toBe(false);
    expect(preview.existing.map((e) => e.contact.id)).toEqual([existing.id]);

    const kept = await createProjectFromImport(plan(), statusMap, "keep", "t");
    expect((await getContact(existing.id)).company).toBe("Old Co");
    expect((await getProject(kept.projectId)).contactIds).toEqual([existing.id]);
    expect((await previewImport("Sample Project", [])).projectNameTaken).toBe(true);

    const updated = await createProjectFromImport(plan(), statusMap, "update", "t");
    expect(await getContact(existing.id)).toMatchObject({ firstName: "Pat", lastName: "Builder", company: "Builder Co", title: "PM" });

    await undoImport(updated.batchId);
    expect((await projectDoc(updated.projectId).get()).exists).toBe(false);
    expect(await getContact(existing.id)).toMatchObject({ firstName: "Patricia", company: "Old Co" });
    await expect(getImport(updated.batchId)).rejects.toThrow(/no longer exists/);
    // The first import's project is untouched.
    expect((await getProject(kept.projectId)).name).toBe("Sample Project");
  });

  it("never changes Kestro users, even when asked to update contacts", async () => {
    const { addUser } = await import("@/server/services/users");
    await addUser("pat@builder.example", "editor", { firstName: "Patricia", lastName: "Staff" });
    await createProjectFromImport(plan(), statusMap, "update", "t");
    const staff = (await listContacts()).find((c) => c.email === "pat@builder.example")!;
    expect(staff).toMatchObject({ firstName: "Patricia", lastName: "Staff", phone: "" });
  });

  it("undo deletes contacts it created (unless another project uses them) and the photos", async () => {
    const t = await createProjectFromImport(plan(), statusMap, "keep", "t");
    const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).jpeg().toBuffer();
    await importPhoto(t.batchId, { observationId: t.observations["1.1"], reportId: t.reports[1], caption: "", order: 0 }, { name: "a.jpg", bytes }, "t");
    expect((await listContacts()).map((c) => c.email)).toContain("pat@builder.example");
    await undoImport(t.batchId);
    expect((await listContacts()).map((c) => c.email)).not.toContain("pat@builder.example");
    const [files] = await bucket().getFiles({ prefix: `projects/${t.projectId}/` });
    expect(files).toHaveLength(0);
  });

  it("refuses to add statuses when the company has locked them", async () => {
    const { setSettingLock } = await import("@/server/services/projects");
    await setSettingLock("statuses", true);
    await expect(createProjectFromImport(plan(), statusMap, "keep", "t")).rejects.toThrow(/locked/);
    await createProjectFromImport(plan(), { ...statusMap, "REQUIRES ATTENTION": { statusId: "nonconforming" } }, "keep", "t");
  });
});
