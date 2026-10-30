import "server-only";
import { contactsCol, projectDoc, projectsCol } from "../paths";
import { newId, now } from "../time";
import { UserError } from "../errors";
import type { Contact, Group, Project } from "@/lib/types";

export async function listProjects(opts: { archived: boolean }): Promise<Project[]> {
  const snap = await projectsCol().where("archived", "==", opts.archived).get();
  return snap.docs.map((d) => d.data() as Project).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProject(pid: string): Promise<Project> {
  const snap = await projectDoc(pid).get();
  if (!snap.exists) throw new UserError("Project not found.");
  return snap.data() as Project;
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

export async function createProject(input: ProjectInput): Promise<string> {
  const id = newId();
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
    createdAt: now(),
    updatedAt: now(),
  };
  await projectDoc(id).create(project);
  return id;
}

export async function updateProject(pid: string, patch: Partial<ProjectInput>): Promise<void> {
  await projectDoc(pid).update({ ...clean(patch), updatedAt: now() });
}

export async function setProjectArchived(pid: string, archived: boolean): Promise<void> {
  await projectDoc(pid).update({ archived, updatedAt: now() });
}

export async function saveGroups(pid: string, names: Array<{ id?: string; name: string }>): Promise<void> {
  const groups: Group[] = names
    .map((g) => ({ id: g.id || newId(), name: g.name.trim().slice(0, 100) }))
    .filter((g) => g.name)
    .map((g, order) => ({ ...g, order }));
  await projectDoc(pid).update({ groups, updatedAt: now() });
}

export async function listContacts(pid: string): Promise<Contact[]> {
  const snap = await contactsCol(pid).get();
  return snap.docs.map((d) => d.data() as Contact).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveContact(pid: string, input: Omit<Contact, "id"> & { id?: string }): Promise<string> {
  if (!input.name.trim()) throw new UserError("Contact name is required.");
  const id = input.id || newId();
  const contact: Contact = {
    id,
    name: input.name.trim().slice(0, 200),
    company: input.company.slice(0, 200),
    role: input.role.slice(0, 200),
    email: input.email.slice(0, 200),
    phone: input.phone.slice(0, 100),
  };
  await contactsCol(pid).doc(id).set(contact);
  return id;
}

export async function deleteContact(pid: string, contactId: string): Promise<void> {
  await contactsCol(pid).doc(contactId).delete();
}
