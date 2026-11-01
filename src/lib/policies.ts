// Settings that exist at both levels (company and project).
//
// The company sets a value for each and can lock it. A project inherits the
// company value unless it chooses its own, which it can do only while the
// company setting is unlocked. Locked settings always use the company value.

import type { Project } from "./types";

interface BoolDef {
  kind: "bool";
  label: string;
  section: PolicySection;
  default: boolean;
}
interface ChoiceDef {
  kind: "choice";
  label: string;
  section: PolicySection;
  default: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}
export type PolicyDef = BoolDef | ChoiceDef;
export type PolicySection = "pdf" | "observations";

export const POLICY_SECTIONS: Record<PolicySection, string> = {
  pdf: "Field reports and PDF",
  observations: "Observations and updates",
};

const bool = (section: PolicySection, label: string, def: boolean): BoolDef => ({ kind: "bool", section, label, default: def });

export const POLICIES = {
  summary: bool("pdf", "Include summary of all observations at bottom of PDF Export", true),
  weather: bool("pdf", "Include Weather in Report", false),
  showAddress: bool("pdf", "Show company address in PDF", true),
  showContact: bool("pdf", "Show company contact line in PDF", true),
  showAttendance: bool("pdf", "Show attendance in PDF", true),
  showOngoingWork: bool("pdf", "Show ongoing work in PDF", true),
  showAuthor: bool("pdf", "Show report author in PDF", true),
  photoSize: {
    kind: "choice",
    section: "pdf",
    label: "Photo size in PDF",
    default: "m",
    options: [
      { value: "s", label: "Small" },
      { value: "m", label: "Medium" },
      { value: "l", label: "Large" },
    ],
  } as ChoiceDef,
  photoCaption: {
    kind: "choice",
    section: "pdf",
    label: "Under each photo, show",
    default: "both",
    options: [
      { value: "both", label: "Date and caption" },
      { value: "date", label: "Date only" },
      { value: "caption", label: "Caption only" },
    ],
  } as ChoiceDef,
  autoPhotoUpdate: bool("observations", "When a photo is added to an observation, automatically add an update if there isn't one already.", true),
  multipleUpdates: bool("observations", "Allow more than one update per observation in each report", false),
  carryResolved: bool("observations", "When carrying observations into a new report, include resolved ones by default", false),
  requireGroup: bool("observations", "When a project has observation groups, every observation must be in one", true),
} satisfies Record<string, PolicyDef>;

export type PolicyName = keyof typeof POLICIES;
export const POLICY_NAMES = Object.keys(POLICIES) as PolicyName[];
export type PolicyValue = boolean | string;
export type PolicyValues = { [K in PolicyName]: (typeof POLICIES)[K] extends BoolDef ? boolean : string };

/** Settings that can be locked: every policy, plus observation statuses (which have their own editor). */
export type PolicyKey = PolicyName | "statuses";
export type PolicyLocks = Record<PolicyKey, boolean>;
export const NO_LOCKS = Object.fromEntries([...POLICY_NAMES, "statuses"].map((k) => [k, false])) as PolicyLocks;
export const DEFAULT_POLICIES = Object.fromEntries(POLICY_NAMES.map((k) => [k, POLICIES[k].default])) as PolicyValues;

export const isPolicyName = (k: string): k is PolicyName => Object.hasOwn(POLICIES, k);

/** True when `value` is allowed for the setting. */
export function isValidValue(key: PolicyName, value: unknown): value is PolicyValue {
  const def: PolicyDef = POLICIES[key];
  return def.kind === "bool" ? typeof value === "boolean" : def.options.some((o) => o.value === value);
}

/** How a value reads in the UI ("Yes", "Medium", …). */
export function valueLabel(key: PolicyName, value: PolicyValue): string {
  const def: PolicyDef = POLICIES[key];
  if (def.kind === "bool") return value ? "Yes" : "No";
  return def.options.find((o) => o.value === value)?.label ?? String(value);
}

interface CompanyPolicies {
  policies: PolicyValues;
  locks: PolicyLocks;
}

export const isLocked = (org: Pick<CompanyPolicies, "locks">, key: PolicyKey) => Boolean(org.locks?.[key]);

/** The company's own value for a setting. */
export const companyValue = <K extends PolicyName>(org: CompanyPolicies, key: K): PolicyValues[K] => org.policies[key];

/** The project's own choice, if it has one that applies (null = inherits the company value). */
export function projectChoice<K extends PolicyName>(org: CompanyPolicies, project: Pick<Project, "overrides">, key: K): PolicyValues[K] | null {
  if (isLocked(org, key)) return null;
  const v = project.overrides?.[key];
  return v !== undefined && isValidValue(key, v) ? (v as PolicyValues[K]) : null;
}

/** The value in effect for a project. */
export function effectiveValue<K extends PolicyName>(org: CompanyPolicies, project: Pick<Project, "overrides">, key: K): PolicyValues[K] {
  return projectChoice(org, project, key) ?? companyValue(org, key);
}

/** Every value in effect for a project. */
export function effectivePolicies(org: CompanyPolicies, project: Pick<Project, "overrides">): PolicyValues {
  return Object.fromEntries(POLICY_NAMES.map((k) => [k, effectiveValue(org, project, k)])) as PolicyValues;
}
