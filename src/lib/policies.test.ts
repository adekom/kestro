import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES, effectiveValue, NO_LOCKS, projectChoice } from "./policies";

const org = (locked: boolean) => ({ policies: { ...DEFAULT_POLICIES, weather: false }, locks: { ...NO_LOCKS, weather: locked } });

describe("settings inheritance", () => {
  it("uses the project's choice when unlocked, the company value otherwise", () => {
    expect(effectiveValue(org(false), { overrides: {} }, "weather")).toBe(false);
    expect(effectiveValue(org(false), { overrides: { weather: true } }, "weather")).toBe(true);
    expect(effectiveValue(org(true), { overrides: { weather: true } }, "weather")).toBe(false);
    expect(projectChoice(org(true), { overrides: { weather: true } }, "weather")).toBeNull();
  });
});
