import "server-only";
import { db } from "../firebaseAdmin";
import { projectDoc, projectsCol } from "../paths";
import { newId, now } from "../time";
import { UserError } from "../errors";
import { groupNameKey } from "@/lib/domain";
import { getContactsByIds } from "./contacts";
import { getSettings, normalizeStatuses, type StatusInput } from "./settings";
import type { Group, Project, ProjectContact, SummaryOverride } from "@/lib/types";

export async function listProjects(opts: { archived: boolean }): Promise<Project[]> {
  const snap = await projectsCol().where("archived", "==", opts.archived).get();
  return snap.docs.map((d) => normalize(d.data() as Project)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Fills fields added after a project was created. */
function normalize(p: Project): Project {
  return {
    ...p,
    contacts: p.contacts ?? [],
    contactIds: p.contactIds ?? [],
    summaryOverride: p.summaryOverride ?? "default",
    includeWeather: p.includeWeather ?? false,
  };
}

export async function getProject(pid: string): Promise<Project> {
  const snap = await projectDoc(pid).get();
  if (!snap.exists) throw new UserError("Project not found.");
  return normalize(snap.data() as Project);
}

export type ProjectInput = Pick<Project, "name" | "code" | "address" | "description" | "reportPrefix">;

function clean(input: Partial<ProjectInput>): Partial<ProjectInput> {
  const out: Partial<ProjectInput> = {};
  for (const k of ["name", "code", "address", "description", "reportPrefix"] as const) {
    if (input[k] !== undefined) out[k] = String(input[k]).slice(0, k === "description" ? 5000 : 300);
  }
  if (out.name !== undefined && !out.name.trim()) throw new UserError("Project name is required.");
  return out;
}

export async function createProject(input: ProjectInput, contacts: ProjectContact[] = []): Promise<string> {
  const id = newId();
  const entries = cleanEntries(contacts);
  const known = await getContactsByIds(entries.map((e) => e.contactId));
  if (entries.some((e) => !known.has(e.contactId))) throw new UserError("One of the selected contacts no longer exists.");
  const project: Project = {
    id,
    name: "",
    code: "",
    address: "",
    description: "",
    reportPrefix: "Field Report ",
    ...clean(input),
    groups: [],
    archived: false,
    reportCount: 0,
    summaryOverride: "default",
    includeWeather: false,
    contacts: entries,
    contactIds: entries.map((e) => e.contactId),
    createdAt: now(),
    updatedAt: now(),
  };
  await projectDoc(id).create(project);
  return id;
}

export async function updateProject(pid: string, patch: Partial<ProjectInput>): Promise<void> {
  await projectDoc(pid).update({ ...clean(patch), updatedAt: now() });
}

export interface ProjectOptions {
  summaryOverride?: SummaryOverride;
  includeWeather?: boolean;
}

/** Options that apply to every report in the project. */
export async function setProjectOptions(pid: string, options: ProjectOptions): Promise<void> {
  const patch: ProjectOptions = {};
  if (options.summaryOverride !== undefined) {
    if (!["default", "show", "hide"].includes(options.summaryOverride)) throw new UserError("Invalid summary option.");
    patch.summaryOverride = options.summaryOverride;
  }
  if (options.includeWeather !== undefined) patch.includeWeather = Boolean(options.includeWeather);
  await projectDoc(pid).update({ ...patch, updatedAt: now() });
}

/** Status IDs used by this project's observations (current and historical). */
async function statusesUsedInProject(pid: string): Promise<Set<string>> {
  const observations = await projectDoc(pid).collection("observations").get();
  const events = await Promise.all(observations.docs.map((d) => d.ref.collection("statusEvents").get()));
  return new Set(events.flatMap((snap) => snap.docs.map((d) => d.get("statusId") as string)));
}

/** Gives the project its own status list (start from the company's to keep history meaningful). */
export async function setProjectStatuses(pid: string, input: StatusInput, resolvedIndex: number): Promise<void> {
  const project = await getProject(pid);
  const current = project.statusOverride?.statuses ?? (await getSettings()).statuses;
  const used = await statusesUsedInProject(pid);
  const next = await normalizeStatuses(input, resolvedIndex, current, async (id) => used.has(id));
  await projectDoc(pid).update({ statusOverride: next, updatedAt: now() });
}

/** Returns the project to the company standard, if every status it uses still exists there. */
export async function useCompanyStatuses(pid: string): Promise<void> {
  const project = await getProject(pid);
  if (!project.statusOverride) return;
  const company = new Set((await getSettings()).statuses.map((s) => s.id));
  const used = await statusesUsedInProject(pid);
  const missing = project.statusOverride.statuses.filter((s) => used.has(s.id) && !company.has(s.id));
  if (missing.length) {
    throw new UserError(
      `This project uses ${missing.map((s) => `"${s.label}"`).join(", ")}, which the company standard doesn't have. Change those observations' status first.`,
    );
  }
  await projectDoc(pid).update({ statusOverride: null, updatedAt: now() });
}

export async function setProjectArchived(pid: string, archived: boolean): Promise<void> {
  await setProjectsArchived([pid], archived);
}

/** Archives (or restores) several projects at once. Archived projects stay available for restoring. */
export async function setProjectsArchived(pids: string[], archived: boolean): Promise<void> {
  const batch = db().batch();
  for (const pid of new Set(pids)) batch.update(projectDoc(pid), { archived, updatedAt: now() });
  await batch.commit();
}

export async function saveGroups(pid: string, names: Array<{ id?: string; name: string }>): Promise<void> {
  const groups: Group[] = names
    .map((g) => ({ id: g.id || newId(), name: g.name.trim().slice(0, 100) }))
    .filter((g) => g.name)
    .map((g, order) => ({ ...g, order }));
  const seen = new Set<string>();
  for (const g of groups) {
    const key = groupNameKey(g.name);
    if (seen.has(key)) throw new UserError(`There is more than one group named "${g.name}". Group names must be unique.`);
    seen.add(key);
  }
  await projectDoc(pid).update({ groups, updatedAt: now() });
}

// ---- Project contacts (references into the firm contact list) ----

/** Projects the given firm contact is listed on ("My projects"). */
export async function listProjectsForContact(contactId: string): Promise<Project[]> {
  const snap = await projectsCol().where("contactIds", "array-contains", contactId).get();
  return snap.docs.map((d) => normalize(d.data() as Project)).sort((a, b) => a.name.localeCompare(b.name));
}

function cleanEntries(entries: ProjectContact[]): ProjectContact[] {
  const seen = new Set<string>();
  return entries
    .filter((e) => e.contactId && !seen.has(e.contactId) && seen.add(e.contactId))
    .map((e) => ({ contactId: e.contactId, projectRole: String(e.projectRole ?? "").trim().slice(0, 100) }));
}

/** Adds contacts to a project (existing entries keep their role unless a new one is given). */
export async function addProjectContacts(pid: string, entries: ProjectContact[]): Promise<void> {
  const additions = cleanEntries(entries);
  const known = await getContactsByIds(additions.map((e) => e.contactId));
  if (additions.some((e) => !known.has(e.contactId))) throw new UserError("One of the selected contacts no longer exists.");
  await db().runTransaction(async (tx) => {
    const project = (await tx.get(projectDoc(pid))).data() as Project | undefined;
    if (!project) throw new UserError("Project not found.");
    const merged = new Map((project.contacts ?? []).map((e) => [e.contactId, e]));
    for (const e of additions) merged.set(e.contactId, { ...e, projectRole: e.projectRole || merged.get(e.contactId)?.projectRole || "" });
    const contacts = [...merged.values()];
    tx.update(projectDoc(pid), { contacts, contactIds: contacts.map((c) => c.contactId), updatedAt: now() });
  });
}

export async function setProjectContactRole(pid: string, contactId: string, projectRole: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const project = (await tx.get(projectDoc(pid))).data() as Project | undefined;
    if (!project) throw new UserError("Project not found.");
    const contacts = (project.contacts ?? []).map((c) =>
      c.contactId === contactId ? { ...c, projectRole: projectRole.trim().slice(0, 100) } : c,
    );
    tx.update(projectDoc(pid), { contacts, updatedAt: now() });
  });
}

/** Removes a contact from this project only; the firm contact is untouched. */
export async function removeProjectContacts(pid: string, contactIds: string[]): Promise<void> {
  const remove = new Set(contactIds);
  await db().runTransaction(async (tx) => {
    const project = (await tx.get(projectDoc(pid))).data() as Project | undefined;
    if (!project) throw new UserError("Project not found.");
    const contacts = (project.contacts ?? []).filter((c) => !remove.has(c.contactId));
    tx.update(projectDoc(pid), { contacts, contactIds: contacts.map((c) => c.contactId), updatedAt: now() });
  });
}
