import { beforeEach, describe, expect, it } from "vitest";
import { resetEmulators } from "../support/fixtures";
import { createProject, getProject, saveGroups } from "@/server/services/projects";
import { createReport, removeMembership } from "@/server/services/reports";
import { createObservation, updateObservation } from "@/server/services/observations";
import { buildReportView } from "@/server/services/reportView";
import { moveObservation } from "@/server/services/reportOrder";

beforeEach(resetEmulators);

async function setup() {
  const pid = await createProject({ name: "P", code: "", address: "", description: "", reportPrefix: "Report " });
  await saveGroups(pid, [{ name: "Exterior" }, { name: "Level 1" }]);
  const [ext, l1] = (await getProject(pid)).groups;
  const r1 = await createReport(pid, { visitDate: "2026-07-14", visitTime: "", authorName: "T", sourceReportId: null, observationIds: [] });
  const obs = (rid: string, title: string, groupId: string | null) =>
    createObservation(pid, rid, { title, description: "", statusId: "nonconforming", groupId });
  return { pid, ext: ext.id, l1: l1.id, r1, obs };
}
const listing = async (pid: string, rid: string) => (await buildReportView(pid, rid)).observations.map((o) => `${o.number} ${o.observation.title}`);

describe("observation numbering follows the report's order", () => {
  it("a new observation in an earlier group takes its place and later ones shift", async () => {
    const { pid, ext, l1, r1, obs } = await setup();
    await obs(r1, "Level 1 item", l1);
    await obs(r1, "Another L1", l1);
    expect(await listing(pid, r1)).toEqual(["1.1 Level 1 item", "1.2 Another L1"]);
    await obs(r1, "Exterior item", ext);
    expect(await listing(pid, r1)).toEqual(["1.1 Exterior item", "1.2 Level 1 item", "1.3 Another L1"]);
  });

  it("observations carried from earlier reports come first and keep their numbers", async () => {
    const { pid, ext, r1, obs } = await setup();
    const old = await obs(r1, "Old", ext);
    const r2 = await createReport(pid, { visitDate: "2026-07-28", visitTime: "", authorName: "T", sourceReportId: r1, observationIds: [old] });
    await obs(r2, "New", ext);
    expect(await listing(pid, r2)).toEqual(["1.1 Old", "2.1 New"]);
  });

  it("moving up or down renumbers, within the group and never above earlier reports' observations", async () => {
    const { pid, ext, l1, r1, obs } = await setup();
    const old = await obs(r1, "Old", ext);
    const r2 = await createReport(pid, { visitDate: "2026-07-28", visitTime: "", authorName: "T", sourceReportId: r1, observationIds: [old] });
    const a = await obs(r2, "A", ext);
    const b = await obs(r2, "B", ext);
    await obs(r2, "C", l1);
    expect(await listing(pid, r2)).toEqual(["1.1 Old", "2.1 A", "2.2 B", "2.3 C"]);

    await moveObservation(pid, r2, b, -1);
    expect(await listing(pid, r2)).toEqual(["1.1 Old", "2.1 B", "2.2 A", "2.3 C"]);
    await moveObservation(pid, r2, b, -1); // already first among this report's: no change
    await moveObservation(pid, r2, a, 1); // last in its group: no change
    expect(await listing(pid, r2)).toEqual(["1.1 Old", "2.1 B", "2.2 A", "2.3 C"]);
    await expect(moveObservation(pid, r2, old, 1)).rejects.toThrow(/created in this report/);
  });

  it("changing an observation's group or removing it renumbers its report", async () => {
    const { pid, ext, l1, r1, obs } = await setup();
    const x = await obs(r1, "X", l1);
    await obs(r1, "Y", l1);
    await updateObservation(pid, x, { groupId: null }, 1, r1); // ungrouped goes last
    expect(await listing(pid, r1)).toEqual(["1.1 Y", "1.2 X"]);
    const z = await obs(r1, "Z", ext);
    expect(await listing(pid, r1)).toEqual(["1.1 Z", "1.2 Y", "1.3 X"]);
    await removeMembership(pid, r1, z);
    expect(await listing(pid, r1)).toEqual(["1.1 Y", "1.2 X"]);
  });
});
