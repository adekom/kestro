import { beforeEach, describe, expect, it } from "vitest";
import { resetEmulators } from "../support/fixtures";
import { createProject, getProject, setProjectStatuses, useCompanyStatuses } from "@/server/services/projects";
import { createReport } from "@/server/services/reports";
import { createObservation, setStatusInReport } from "@/server/services/observations";
import { getProjectSettings, getSettings } from "@/server/services/settings";

beforeEach(resetEmulators);

async function setup() {
  const pid = await createProject({ name: "P", code: "", address: "", description: "", reportPrefix: "Report " });
  const rid = await createReport(pid, { visitDate: "2026-07-14", visitTime: "", authorName: "T", sourceReportId: null, observationIds: [] });
  const company = await getSettings();
  const resolvedIndex = company.statuses.findIndex((s) => s.id === company.resolvedStatusId);
  return { pid, rid, company, resolvedIndex };
}

describe("project observation statuses", () => {
  it("uses the company standard until customized", async () => {
    const { pid, company } = await setup();
    expect((await getProject(pid)).statusOverride ?? null).toBeNull();
    expect((await getProjectSettings(pid)).statuses).toEqual(company.statuses);
  });

  it("starts a custom list from the company values, keeping their IDs", async () => {
    const { pid, company, resolvedIndex } = await setup();
    await setProjectStatuses(pid, company.statuses, resolvedIndex);
    const effective = await getProjectSettings(pid);
    expect(effective.statuses.map((s) => s.id)).toEqual(company.statuses.map((s) => s.id));
    expect(effective.resolvedStatusId).toBe(company.resolvedStatusId);
  });

  it("validates observation statuses against the project's own list", async () => {
    const { pid, rid, company, resolvedIndex } = await setup();
    await setProjectStatuses(pid, [...company.statuses, { label: "On hold", color: "#CCCCCC" }], resolvedIndex);
    const onHold = (await getProjectSettings(pid)).statuses.find((s) => s.label === "On hold")!;
    const oid = await createObservation(pid, rid, { title: "Crack", description: "", statusId: onHold.id, groupId: null });

    // Other projects keep the company list.
    const other = await createProject({ name: "Q", code: "", address: "", description: "", reportPrefix: "Report " });
    const otherReport = await createReport(other, { visitDate: "2026-07-14", visitTime: "", authorName: "T", sourceReportId: null, observationIds: [] });
    await expect(createObservation(other, otherReport, { title: "X", description: "", statusId: onHold.id, groupId: null })).rejects.toThrow();

    // A status in use can't be removed from the project's list…
    await expect(setProjectStatuses(pid, company.statuses, resolvedIndex)).rejects.toThrow();
    // …and the project can't go back to the company standard while it's used.
    await expect(useCompanyStatuses(pid)).rejects.toThrow(/On hold/);

    await setStatusInReport(pid, oid, rid, company.statuses[0].id);
    await setProjectStatuses(pid, company.statuses, resolvedIndex);
    await useCompanyStatuses(pid);
    expect((await getProject(pid)).statusOverride ?? null).toBeNull();
  });
});
