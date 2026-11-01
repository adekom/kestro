import { describe, expect, it } from "vitest";
import { effectiveValue, NO_LOCKS, projectChoice } from "./policies";
import type { OrgSettings } from "./types";

const org = (locked: boolean) => ({ showSummaryDefault: true, includeWeather: false, autoPhotoUpdate: true, locks: { ...NO_LOCKS, weather: locked } }) as OrgSettings;

describe("settings inheritance", () => {
  it("uses the project's choice when unlocked, the company value otherwise", () => {
    expect(effectiveValue(org(false), { overrides: {} }, "weather")).toBe(false);
    expect(effectiveValue(org(false), { overrides: { weather: true } }, "weather")).toBe(true);
    expect(effectiveValue(org(true), { overrides: { weather: true } }, "weather")).toBe(false);
    expect(projectChoice(org(true), { overrides: { weather: true } }, "weather")).toBeNull();
  });
});
