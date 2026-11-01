// Settings that exist at both levels (company and project).
//
// The company sets a value for each and can lock it. A project inherits the
// company value unless it chooses its own, which it can do only while the
// company setting is unlocked. Locked settings always use the company value.

import type { OrgSettings, Project } from "./types";

/** Yes/no settings. Observation statuses follow the same rules with their own editor. */
export const BOOL_POLICIES = ["summary", "weather", "autoPhotoUpdate"] as const;
export type BoolPolicy = (typeof BOOL_POLICIES)[number];
export type PolicyKey = BoolPolicy | "statuses";
export type PolicyLocks = Record<PolicyKey, boolean>;

export const NO_LOCKS: PolicyLocks = { summary: false, weather: false, autoPhotoUpdate: false, statuses: false };

export const POLICY_LABELS: Record<BoolPolicy, string> = {
  summary: "Include summary of all observations at bottom of PDF Export",
  weather: "Include Weather in Report",
  autoPhotoUpdate: "Automatically add update when photos are added to observation",
};

/** The company's own value for a setting. */
export function companyValue(org: OrgSettings, key: BoolPolicy): boolean {
  return key === "summary" ? org.showSummaryDefault : key === "weather" ? org.includeWeather : org.autoPhotoUpdate;
}

export const isLocked = (org: Pick<OrgSettings, "locks">, key: PolicyKey) => Boolean(org.locks?.[key]);

/** The project's own choice, if it has one that applies (null = inherits the company value). */
export function projectChoice(org: OrgSettings, project: Pick<Project, "overrides">, key: BoolPolicy): boolean | null {
  if (isLocked(org, key)) return null;
  const v = project.overrides?.[key];
  return typeof v === "boolean" ? v : null;
}

/** The value in effect for a project. */
export function effectiveValue(org: OrgSettings, project: Pick<Project, "overrides">, key: BoolPolicy): boolean {
  return projectChoice(org, project, key) ?? companyValue(org, key);
}
