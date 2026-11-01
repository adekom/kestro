import "server-only";
import { projectDoc, settingsDoc } from "../paths";
import { now, newId } from "../time";
import { UserError } from "../errors";
import { DEFAULT_POLICIES, effectivePolicies, isLocked, isPolicyName, isValidValue, NO_LOCKS, type PolicyValues } from "@/lib/policies";
import { DEFAULT_COLOR, PALETTE } from "@/lib/markup";
import { setDateFormat } from "@/lib/domain";
import type { OrgSettings, PdfSection, Project, StatusDef } from "@/lib/types";

// Generic defaults only — every firm configures its own identity after setup.
export const DEFAULT_SETTINGS: OrgSettings = {
  name: "Your organization",
  address: "",
  contactLine: "",
  logoPath: null,
  disclaimer: "",
  footerText: "",
  policies: DEFAULT_POLICIES,
  locks: NO_LOCKS,
  numberFormat: "dot",
  dateFormat: "us",
  pageSize: "LETTER",
  defaultReportPrefix: "Field Report ",
  ungroupedLabel: "General",
  photoAddedText: "Photo added.",
  photosAddedText: "Photos added.",
  revokeLinksOnRemove: false,
  markupDefaultColor: DEFAULT_COLOR,
  markupDefaultStroke: "m",
  markupPalette: PALETTE,
  pdfSectionOrder: ["attendance", "ongoingWork", "observations", "summary"],
  statuses: [
    // Pastel tones: soft enough for report pages, distinct as small dots.
    { id: "nonconforming", label: "Nonconforming", color: "#F2A0A0", order: 0 },
    { id: "observed", label: "Observed", color: "#C3C9D1", order: 1 },
    { id: "resolved", label: "Resolved", color: "#9FD3A8", order: 2 },
  ],
  resolvedStatusId: "resolved",
  defaultStatusId: "nonconforming",
  updatedAt: null,
};

/** Company values saved before settings were grouped under `policies`. */
function legacyPolicies(stored: Partial<OrgSettings>): Partial<PolicyValues> {
  const out: Partial<PolicyValues> = {};
  if (typeof stored.showSummaryDefault === "boolean") out.summary = stored.showSummaryDefault;
  if (typeof stored.includeWeather === "boolean") out.weather = stored.includeWeather;
  if (typeof stored.autoPhotoUpdate === "boolean") out.autoPhotoUpdate = stored.autoPhotoUpdate;
  const v = stored.fieldVisibility;
  if (v) Object.assign(out, { showAddress: v.address, showContact: v.contact, showAttendance: v.attendance, showOngoingWork: v.ongoingWork, showAuthor: v.author });
  return out;
}

export async function getSettings(): Promise<OrgSettings> {
  const snap = await settingsDoc().get();
  if (!snap.exists) return DEFAULT_SETTINGS;
  const stored = snap.data() as Partial<OrgSettings>;
  const merged: OrgSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    policies: { ...DEFAULT_POLICIES, ...legacyPolicies(stored), ...stored.policies },
    locks: { ...NO_LOCKS, ...stored.locks },
  };
  setDateFormat(merged.dateFormat); // one company per deployment: dates follow its setting
  if (!merged.statuses.some((x) => x.id === merged.defaultStatusId)) merged.defaultStatusId = [...merged.statuses].sort((x, y) => x.order - y.order)[0]?.id ?? "";
  return merged;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const MARKUP_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const PDF_SECTIONS: PdfSection[] = ["attendance", "ongoingWork", "observations", "summary"];

export type SettingsPatch = Partial<
  Omit<OrgSettings, "statuses" | "resolvedStatusId" | "defaultStatusId" | "updatedAt" | "logoPath" | "locks" | "policies" | "fieldVisibility" | "showSummaryDefault" | "includeWeather" | "autoPhotoUpdate">
>;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], what: string): T => {
  if (!allowed.includes(v as T)) throw new UserError(`Invalid ${what}.`);
  return v as T;
};
const text = (v: unknown, max: number) => String(v ?? "").slice(0, max);

/** Checks company settings before saving (they arrive from the browser). */
function cleanPatch(patch: SettingsPatch): SettingsPatch {
  const out: SettingsPatch = {};
  for (const k of ["name", "address", "contactLine", "disclaimer", "footerText"] as const) if (patch[k] !== undefined) out[k] = text(patch[k], k === "disclaimer" ? 10000 : 500);
  if (patch.numberFormat !== undefined) out.numberFormat = oneOf(patch.numberFormat, ["dot", "dash", "running"] as const, "number format");
  if (patch.dateFormat !== undefined) out.dateFormat = oneOf(patch.dateFormat, ["us", "intl", "iso"] as const, "date format");
  if (patch.pageSize !== undefined) out.pageSize = oneOf(patch.pageSize, ["LETTER", "A4"] as const, "page size");
  if (patch.defaultReportPrefix !== undefined) out.defaultReportPrefix = text(patch.defaultReportPrefix, 100);
  for (const k of ["ungroupedLabel", "photoAddedText", "photosAddedText"] as const) {
    if (patch[k] === undefined) continue;
    const v = text(patch[k], 200).trim();
    if (!v) throw new UserError("This text can't be empty.");
    out[k] = v;
  }
  if (patch.revokeLinksOnRemove !== undefined) out.revokeLinksOnRemove = Boolean(patch.revokeLinksOnRemove);
  if (patch.markupDefaultColor !== undefined) {
    if (!MARKUP_COLOR.test(patch.markupDefaultColor)) throw new UserError("Invalid markup colour.");
    out.markupDefaultColor = patch.markupDefaultColor.toUpperCase();
  }
  if (patch.markupDefaultStroke !== undefined) out.markupDefaultStroke = oneOf(patch.markupDefaultStroke, ["s", "m", "l"] as const, "stroke width");
  if (patch.markupPalette !== undefined) {
    const list = Array.isArray(patch.markupPalette) ? patch.markupPalette : [];
    if (list.length < 1 || list.length > 16 || !list.every((c) => typeof c === "string" && MARKUP_COLOR.test(c))) throw new UserError("The palette needs 1 to 16 colours.");
    out.markupPalette = list.map((c) => c.toUpperCase());
  }
  if (patch.pdfSectionOrder !== undefined) {
    const order = patch.pdfSectionOrder;
    if (!Array.isArray(order) || order.length !== PDF_SECTIONS.length || !PDF_SECTIONS.every((x) => order.includes(x))) throw new UserError("Invalid section order.");
    out.pdfSectionOrder = [...order];
  }
  return out;
}

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  const current = await getSettings();
  await settingsDoc().set({ ...current, ...cleanPatch(patch), updatedAt: now() });
}

/** Sets the company value of a setting projects inherit. */
export async function setCompanyPolicy(key: string, value: unknown): Promise<void> {
  if (!isPolicyName(key) || !isValidValue(key, value)) throw new UserError("Invalid setting.");
  const current = await getSettings();
  await settingsDoc().set({ ...current, policies: { ...current.policies, [key]: value }, updatedAt: now() });
}

/**
 * Replaces the status catalog. Statuses keep stable IDs; new ones get UUIDs.
 * `isReferenced` reports whether a removed status is still used by any
 * observation history, in which case removal is refused (spec §5.2).
 */
export type StatusInput = Array<Omit<StatusDef, "id" | "order"> & { id?: string }>;

/** Validates a status list; new statuses get IDs. Refuses removing statuses still in use. */
export async function normalizeStatuses(
  input: StatusInput,
  resolvedIndex: number,
  current: StatusDef[],
  isReferenced: (statusId: string) => Promise<boolean>,
  defaultIndex = 0,
): Promise<{ statuses: StatusDef[]; resolvedStatusId: string; defaultStatusId: string }> {
  if (input.length === 0) throw new UserError("At least one status is required.");
  if (resolvedIndex < 0 || resolvedIndex >= input.length) throw new UserError("Choose exactly one resolved status.");
  const statuses: StatusDef[] = input.map((s, order) => {
    const label = s.label.trim();
    if (!label) throw new UserError("Status names cannot be empty.");
    if (!HEX.test(s.color)) throw new UserError(`"${label}" needs a #RRGGBB color.`);
    return { id: s.id || newId(), label, color: s.color.toUpperCase(), order };
  });
  const keptIds = new Set(statuses.map((s) => s.id));
  for (const removed of current.filter((s) => !keptIds.has(s.id))) {
    if (await isReferenced(removed.id)) {
      throw new UserError(`"${removed.label}" is still used by observations. Reassign them before removing it.`);
    }
  }
  const def = statuses[defaultIndex] ?? statuses[0];
  return { statuses, resolvedStatusId: statuses[resolvedIndex].id, defaultStatusId: def.id };
}

export async function saveStatuses(
  input: StatusInput,
  resolvedIndex: number,
  isReferenced: (statusId: string) => Promise<boolean>,
  defaultIndex = 0,
): Promise<void> {
  const current = await getSettings();
  const next = await normalizeStatuses(input, resolvedIndex, current.statuses, isReferenced, defaultIndex);
  await settingsDoc().set({ ...current, ...next, updatedAt: now() });
}

/**
 * Settings in effect for a project: company settings with the project's own
 * choices applied where the company hasn't locked them.
 */
export async function getProjectSettings(pid: string): Promise<OrgSettings> {
  const [settings, snap] = await Promise.all([getSettings(), projectDoc(pid).get()]);
  const project = snap.data() as Project | undefined;
  if (!project) return settings;
  const custom = !isLocked(settings, "statuses") ? project.statusOverride : null;
  const statuses = custom
    ? {
        statuses: custom.statuses,
        resolvedStatusId: custom.resolvedStatusId,
        defaultStatusId: custom.statuses.some((x) => x.id === custom.defaultStatusId) ? custom.defaultStatusId! : custom.statuses[0]?.id ?? "",
      }
    : {};
  return { ...settings, policies: effectivePolicies(settings, { overrides: projectOverrides(project) }), ...statuses };
}

/** A project's own choices, including ones saved before overrides existed. */
export function projectOverrides(p: Project): Project["overrides"] {
  if (p.overrides) return p.overrides;
  const legacy: Project["overrides"] = {};
  if (p.summaryOverride === "show" || p.summaryOverride === "hide") legacy.summary = p.summaryOverride === "show";
  if (p.includeWeather) legacy.weather = true;
  return legacy;
}

export async function setLogoPath(logoPath: string | null): Promise<void> {
  await settingsDoc().set({ ...(await getSettings()), logoPath, updatedAt: now() });
}
