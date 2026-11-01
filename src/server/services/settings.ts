import "server-only";
import { projectDoc, settingsDoc } from "../paths";
import { now, newId } from "../time";
import { UserError } from "../errors";
import type { OrgSettings, Project, StatusDef } from "@/lib/types";

// Generic defaults only — every firm configures its own identity after setup.
export const DEFAULT_SETTINGS: OrgSettings = {
  name: "Your organization",
  address: "",
  contactLine: "",
  logoPath: null,
  disclaimer: "",
  footerText: "",
  showSummaryDefault: true,
  fieldVisibility: { address: true, contact: true, attendance: true, ongoingWork: true, author: true },
  statuses: [
    // Pastel tones: soft enough for report pages, distinct as small dots.
    { id: "nonconforming", label: "Nonconforming", color: "#F2A0A0", order: 0 },
    { id: "observed", label: "Observed", color: "#C3C9D1", order: 1 },
    { id: "resolved", label: "Resolved", color: "#9FD3A8", order: 2 },
  ],
  resolvedStatusId: "resolved",
  updatedAt: null,
};

export async function getSettings(): Promise<OrgSettings> {
  const snap = await settingsDoc().get();
  return snap.exists ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<OrgSettings>) } : DEFAULT_SETTINGS;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export type SettingsPatch = Partial<Omit<OrgSettings, "statuses" | "resolvedStatusId" | "updatedAt" | "logoPath">>;

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  await settingsDoc().set({ ...(await getSettings()), ...patch, updatedAt: now() });
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
): Promise<{ statuses: StatusDef[]; resolvedStatusId: string }> {
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
  return { statuses, resolvedStatusId: statuses[resolvedIndex].id };
}

export async function saveStatuses(input: StatusInput, resolvedIndex: number, isReferenced: (statusId: string) => Promise<boolean>): Promise<void> {
  const current = await getSettings();
  const next = await normalizeStatuses(input, resolvedIndex, current.statuses, isReferenced);
  await settingsDoc().set({ ...current, ...next, updatedAt: now() });
}

/** Organization settings with the project's own statuses when it has them. */
export async function getProjectSettings(pid: string): Promise<OrgSettings> {
  const [settings, snap] = await Promise.all([getSettings(), projectDoc(pid).get()]);
  const override = (snap.data() as Project | undefined)?.statusOverride;
  return override ? { ...settings, statuses: override.statuses, resolvedStatusId: override.resolvedStatusId } : settings;
}

export async function setLogoPath(logoPath: string | null): Promise<void> {
  await settingsDoc().set({ ...(await getSettings()), logoPath, updatedAt: now() });
}
