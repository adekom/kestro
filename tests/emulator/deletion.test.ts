import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { resetEmulators } from "../support/fixtures";
import { createProject } from "@/server/services/projects";
import { createReport, getMemberships, listReports } from "@/server/services/reports";
import { addUpdate, createObservation, setStatusInReport } from "@/server/services/observations";
import { buildReportView } from "@/server/services/reportView";
import { deleteReports, previewReportDeletion } from "@/server/services/reportDeletion";
import { ensureShareToken, listAttachments, resolveShare, uploadPhoto } from "@/server/services/photos";
import { observationRows } from "@/server/services/tables";

beforeEach(resetEmulators);

const newProject = (name = "P") => createProject({ name, code: "", address: "", description: "", reportPrefix: "Report " });
const report = (pid: string, date: string, source: string | null = null, ids: string[] = []) =>
  createReport(pid, { visitDate: date, visitTime: "", authorName: "T", sourceReportId: source, observationIds: ids });
const obs = (pid: string, rid: string, title: string, statusId = "nonconforming") =>
  createObservation(pid, rid, { title, description: `${title} description`, statusId, groupId: null });
const numbers = async (pid: string, rid: string) => (await buildReportView(pid, rid)).observations.map((o) => `${o.number} ${o.observation.title}`);
const sequences = async (pid: string) => (await listReports(pid)).map((r) => r.sequence);

describe("field report deletion and renumbering", () => {
  it("delete 17 after making 18: 18 becomes 17, its observations follow, references stay intact", async () => {
    const pid = await newProject();
    const r16 = await report(pid, "2026-07-14");
    const a = await obs(pid, r16, "A"); // 1.1 → origin stays
    const r17 = await report(pid, "2026-07-28", r16, [a]);
    const r18 = await report(pid, "2026-08-11", r17, [a]);
    const b = await obs(pid, r18, "B"); // 3.1 → becomes 2.1
    await addUpdate(pid, a, r18, "Fixed");
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#777" } }).png().toBuffer();
    await uploadPhoto(pid, r18, b, { name: "b.png", bytes: png }, "t");
    const [att] = await listAttachments(pid, b);
    const token = await ensureShareToken(pid, att.id);

    await deleteReports(pid, [r17], "t@example.com");

    expect(await sequences(pid)).toEqual([1, 2]);
    expect((await listReports(pid)).map((r) => r.id)).toEqual([r16, r18]);
    expect(await numbers(pid, r18)).toEqual(["1.1 A", "2.1 B"]);
    // Earlier report, update history and the public photo link are unaffected.
    expect(await numbers(pid, r16)).toEqual(["1.1 A"]);
    expect((await buildReportView(pid, r18)).observations[0].updates.map((u) => u.text)).toEqual(["Fixed"]);
    expect((await resolveShare(token))?.attachment.id).toBe(att.id);
  });

  it("deleting a middle report shifts every later number with no gaps or duplicates; other projects untouched", async () => {
    const pid = await newProject("Main");
    const other = await newProject("Other");
    const rids: string[] = [];
    for (let i = 0; i < 5; i++) rids.push(await report(pid, `2026-07-${10 + i}`, rids.at(-1) ?? null));
    const late = await obs(pid, rids[4], "Late"); // 5.1
    await report(other, "2026-07-01");
    await report(other, "2026-07-02");

    await deleteReports(pid, [rids[1]], "t");
    expect(await sequences(pid)).toEqual([1, 2, 3, 4]);
    expect(await numbers(pid, rids[4])).toEqual(["4.1 Late"]);
    expect(await sequences(other)).toEqual([1, 2]);
    expect(late).toBeTruthy();

    // A new report takes the next number after the renumbered set.
    await report(pid, "2026-08-01", rids[4]);
    expect(await sequences(pid)).toEqual([1, 2, 3, 4, 5]);
  });

  it("previewing a deletion changes nothing and reports what would change", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const r2 = await report(pid, "2026-07-28", r1);
    const r3 = await report(pid, "2026-08-11", r2);
    await obs(pid, r3, "Third");
    const before = await listReports(pid);

    const preview = await previewReportDeletion(pid, [r2]);
    expect(preview.deleting).toEqual(["Report 2"]);
    expect(preview.renumbered).toEqual([{ from: "Report 3", to: "Report 2" }]);
    expect(preview.observationChanges).toEqual([{ from: "3.1", to: "2.1", title: "Third" }]);
    expect(await listReports(pid)).toEqual(before);
  });

  it("moves observations carried into later reports and removes those only in the deleted report", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const r2 = await report(pid, "2026-07-28", r1);
    const kept = await obs(pid, r2, "Carried", "observed"); // 2.1
    const lost = await obs(pid, r2, "Only here"); // 2.2
    const r3 = await report(pid, "2026-08-11", r2, [kept]);
    await obs(pid, r3, "Native"); // 3.1

    const preview = await previewReportDeletion(pid, [r2]);
    expect(preview.removedObservations).toEqual([{ number: "2.2", title: "Only here" }]);

    await deleteReports(pid, [r2], "t");
    // Old report 3 is now 2. The moved observation joins its numbering in report order:
    // it was listed first (carried in at creation), so it becomes 2.1 and Native shifts to 2.2.
    expect(await numbers(pid, r3)).toEqual(["2.1 Carried", "2.2 Native"]);
    const view = await buildReportView(pid, r3);
    const carried = view.observations.find((o) => o.observation.id === kept)!;
    expect(carried.observation.originalDate).toBe("2026-08-11");
    expect(carried.statusId).toBe("observed"); // keeps its latest status
    expect((await observationRows(pid)).map((r) => r.title).sort()).toEqual(["Carried", "Native"]);
    expect(lost).toBeTruthy();
  });

  it("hides updates and status changes recorded during a deleted visit", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    const a = await obs(pid, r1, "A");
    const r2 = await report(pid, "2026-07-28", r1, [a]);
    await addUpdate(pid, a, r2, "Recorded in the mistaken report");
    await setStatusInReport(pid, a, r2, "resolved");
    const r3 = await report(pid, "2026-08-11", r1, [a]);

    expect((await buildReportView(pid, r3)).observations[0].statusId).toBe("resolved");
    await deleteReports(pid, [r2], "t");
    const after = (await buildReportView(pid, r3)).observations[0];
    expect(after.updates).toEqual([]);
    expect(after.statusId).toBe("nonconforming");
    expect((await observationRows(pid))[0].statusId).toBe("nonconforming");
  });

  it("stays consistent when reports are created and deleted at the same moment", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-01");
    const r2 = await report(pid, "2026-07-02", r1);
    await report(pid, "2026-07-03", r2);
    await Promise.all([deleteReports(pid, [r2], "t"), report(pid, "2026-07-04"), report(pid, "2026-07-05")]);
    const seq = await sequences(pid);
    expect(seq).toEqual(seq.map((_, i) => i + 1)); // 1..n, no gaps or duplicates
    expect(seq).toHaveLength(4);
  });

  it("refuses to delete a report twice", async () => {
    const pid = await newProject();
    const r1 = await report(pid, "2026-07-14");
    await deleteReports(pid, [r1], "t");
    await expect(deleteReports(pid, [r1], "t")).rejects.toThrow(/already deleted/);
    expect(await getMemberships(pid, r1)).toEqual([]);
  });
});
