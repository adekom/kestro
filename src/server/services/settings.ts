import "server-only";
import { settingsDoc } from "../paths";
import { now, newId } from "../time";
import { UserError } from "../errors";
import type { OrgSettings, StatusDef } from "@/lib/types";

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
    { id: "open", label: "Open", color: "#C2410C", order: 0 },
    { id: "in-progress", label: "In progress", color: "#2563EB", order: 1 },
    { id: "resolved", label: "Resolved", color: "#15803D", order: 2 },
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
export async function saveStatuses(
  input: Array<Omit<StatusDef, "id" | "order"> & { id?: string }>,
  resolvedIndex: number,
  isReferenced: (statusId: string) => Promise<boolean>,
): Promise<void> {
  if (input.length === 0) throw new UserError("At least one status is required.");
  if (resolvedIndex < 0 || resolvedIndex >= input.length) throw new UserError("Choose exactly one resolved status.");
  const statuses: StatusDef[] = input.map((s, order) => {
    const label = s.label.trim();
    if (!label) throw new UserError("Status names cannot be empty.");
    if (!HEX.test(s.color)) throw new UserError(`"${label}" needs a #RRGGBB color.`);
    return { id: s.id || newId(), label, color: s.color.toUpperCase(), order };
  });
  const current = await getSettings();
  const keptIds = new Set(statuses.map((s) => s.id));
  for (const removed of current.statuses.filter((s) => !keptIds.has(s.id))) {
    if (await isReferenced(removed.id)) {
      throw new UserError(`"${removed.label}" is still used by observations. Reassign them before removing it.`);
    }
  }
  await settingsDoc().set({ ...current, statuses, resolvedStatusId: statuses[resolvedIndex].id, updatedAt: now() });
}

export async function setLogoPath(logoPath: string | null): Promise<void> {
  await settingsDoc().set({ ...(await getSettings()), logoPath, updatedAt: now() });
}
