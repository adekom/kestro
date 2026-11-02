import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { bucket, db } from "../firebaseAdmin";
import { contactsCol, membershipsCol, observationsCol, projectDoc, projectsCol, reportDoc, statusEventsCol, updatesCol } from "../paths";
import { newId, now } from "../time";
import { UserError } from "../errors";
import { createContact, findContactByEmail, getContact, updateContact } from "./contacts";
import { getSettings } from "./settings";
import { uploadPhoto } from "./photos";
import type { ImportPlan, PlanIssue } from "@/lib/archisnapper/plan";
import type { Attendee, Contact, Group, Membership, Observation, ObservationUpdate, Project, ProjectContact, Report, StatusDef, StatusEvent } from "@/lib/types";

/**
 * Creating a project from an ArchiSnapper export (spec §11). The browser reads
 * the export and sends a reviewed plan; this writes the project, reports,
 * observations, updates, status history and attendance in one go, then takes
 * the photos one at a time. Every import has a record (its batch ID) with the
 * log, what it created, and contact details it replaced, so it can be undone.
 */

const importsCol = () => db().collection("imports");

/** What each status in the export becomes: an existing status, or a new one for this project. */
export type StatusMapping = Record<string, { statusId: string } | { label: string; color: string }>;
/** External contacts already in Kestro (matched by email): update them from the import, or keep them as they are. Kestro users are never changed. */
export type ContactMode = "update" | "keep";

export interface ImportRecord {
  id: string;
  projectId: string;
  source: "archisnapper";
  state: "creating" | "photos" | "done" | "undone";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  counts: { reports: number; observations: number; updates: number; statusEvents: number; photosPlanned: number; photosImported: number; contactsCreated: number; contactsUpdated: number };
  issues: PlanIssue[];
  /** For undo: contacts this import created, and the earlier details of contacts it updated. */
  createdContactIds: string[];
  updatedContacts: Array<{ id: string; before: Pick<Contact, "firstName" | "lastName" | "phone" | "company" | "title" | "email" | "defaultRole"> }>;
}

/** Where each photo in the plan goes, for the uploads that follow. */
export interface ImportTargets {
  batchId: string;
  projectId: string;
  observations: Record<string, string>;
  reports: Record<number, string>;
}

const LIMITS = { reports: 500, observations: 5000, updates: 50000, photos: 20000, contacts: 500 };
const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ImportPreview {
  projectNameTaken: boolean;
  /** Contacts in the export that already exist in Kestro, with their current details. */
  existing: Array<{ key: string; contact: Contact }>;
}

/** Before importing: is the project name in use, and which people already exist? */
export async function previewImport(projectName: string, emails: string[]): Promise<ImportPreview> {
  const [projects, matches] = await Promise.all([
    projectsCol().where("name", "==", projectName.trim()).limit(1).get(),
    Promise.all([...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, LIMITS.contacts).map(async (e) => ({ key: e, contact: await findContactByEmail(e) }))),
  ]);
  const existing: ImportPreview["existing"] = [];
  for (const m of matches) if (m.contact) existing.push({ key: m.key, contact: await getContact(m.contact.id) });
  return { projectNameTaken: !projects.empty, existing };
}

export async function createProjectFromImport(plan: ImportPlan, statusMap: StatusMapping, contactMode: ContactMode, user: string): Promise<ImportTargets> {
  if (!plan?.project?.name?.trim()) throw new UserError("The import has no project name.");
  if (plan.reports.length === 0) throw new UserError("The import has no reports.");
  if (plan.reports.length > LIMITS.reports || plan.observations.length > LIMITS.observations || plan.photos.length > LIMITS.photos || plan.contacts.length > LIMITS.contacts) {
    throw new UserError("This export is larger than Kestro can import at once.");
  }
  const updatesCount = plan.observations.reduce((n, o) => n + o.updates.length, 0);
  if (updatesCount > LIMITS.updates) throw new UserError("This export has too many updates to import at once.");

  // ---- Statuses: map to the company's, adding new ones as this project's own list when needed.
  const company = await getSettings();
  const statuses: StatusDef[] = [...company.statuses].sort((a, b) => a.order - b.order);
  const statusIdOf = new Map<string, string>();
  for (const { name } of plan.statuses) {
    const target = statusMap[name];
    if (!target) throw new UserError(`Choose what "${name}" becomes.`);
    if ("statusId" in target) {
      if (!statuses.some((s) => s.id === target.statusId)) throw new UserError(`The status chosen for "${name}" doesn't exist.`);
      statusIdOf.set(name, target.statusId);
    } else {
      const label = target.label.trim().slice(0, 60);
      if (!label || !HEX.test(target.color)) throw new UserError(`Give the new status for "${name}" a name and a colour.`);
      const existing = statuses.find((s) => s.label.toLowerCase() === label.toLowerCase());
      if (existing) statusIdOf.set(name, existing.id);
      else {
        const id = newId();
        statuses.push({ id, label, color: target.color.toUpperCase(), order: statuses.length });
        statusIdOf.set(name, id);
      }
    }
  }
  const ownStatuses = statuses.length > company.statuses.length;
  if (ownStatuses && company.locks.statuses) throw new UserError("Observation statuses are locked by the company, so new statuses can't be added. Map every status to an existing one.");

  // ---- Contacts: match by email; create new ones; update existing ones only if asked.
  const batchId = newId();
  const pid = newId();
  const contactIdOf = new Map<string, string>();
  const createdContactIds: string[] = [];
  const updatedContacts: ImportRecord["updatedContacts"] = [];
  const roleOf = new Map<string, string>();
  for (const c of plan.contacts) {
    roleOf.set(c.key, c.role);
    if (!c.email) continue;
    const existing = await findContactByEmail(c.email);
    if (!existing) {
      const created = await createContact({ firstName: c.firstName || c.email, lastName: c.lastName, company: c.company, title: "", email: c.email, phone: c.phone, defaultRole: "" });
      createdContactIds.push(created.id);
      contactIdOf.set(c.key, created.id);
      continue;
    }
    contactIdOf.set(c.key, existing.id);
    // Kestro users are never changed by an import, only external contacts.
    if (contactMode === "update" && !existing.userEmail) {
      const current = await getContact(existing.id);
      const next = { ...current, firstName: c.firstName || current.firstName, lastName: c.lastName || current.lastName, phone: c.phone || current.phone, company: c.company || current.company };
      if (next.firstName !== current.firstName || next.lastName !== current.lastName || next.phone !== current.phone || (!current.userEmail && next.company !== current.company)) {
        updatedContacts.push({ id: current.id, before: { firstName: current.firstName, lastName: current.lastName, phone: current.phone, company: current.company, title: current.title, email: current.email, defaultRole: current.defaultRole } });
        await updateContact(current.id, next);
      }
    }
  }

  const record: ImportRecord = {
    id: batchId,
    projectId: pid,
    source: "archisnapper",
    state: "creating",
    createdBy: user,
    createdAt: now(),
    updatedAt: now(),
    counts: { reports: plan.reports.length, observations: plan.observations.length, updates: updatesCount, statusEvents: 0, photosPlanned: plan.photos.length, photosImported: 0, contactsCreated: createdContactIds.length, contactsUpdated: updatedContacts.length },
    issues: plan.issues.slice(0, 2000),
    createdContactIds,
    updatedContacts,
  };
  await importsCol().doc(batchId).create(record);

  try {
    // ---- Project and reports. Display numbers are the report order (1, 2, 3…).
    const groups: Group[] = plan.groups.map((name, order) => ({ id: newId(), name: name.slice(0, 100), order }));
    const groupIdOf = new Map(groups.map((g) => [g.name, g.id]));
    const reports = [...plan.reports].sort((a, b) => a.sequence - b.sequence);
    const reportIdOf = new Map(reports.map((r) => [r.sequence, newId()]));
    const visitOf = new Map(reports.map((r) => [r.sequence, r.visitDate]));
    const projectContacts: ProjectContact[] = [...contactIdOf].map(([key, contactId]) => ({ contactId, projectRole: (roleOf.get(key) ?? "").slice(0, 100) }));
    const contactInfo = new Map(plan.contacts.map((c) => [c.key, c]));

    const project: Project = {
      id: pid,
      name: plan.project.name.trim().slice(0, 300),
      code: "",
      address: plan.project.address.slice(0, 300),
      description: "",
      reportPrefix: (plan.project.reportPrefix || company.defaultReportPrefix).slice(0, 100),
      groups,
      archived: false,
      reportCount: reports.length,
      overrides: {},
      statusOverride: ownStatuses ? { statuses, resolvedStatusId: company.resolvedStatusId, defaultStatusId: company.defaultStatusId } : null,
      contacts: projectContacts,
      contactIds: projectContacts.map((c) => c.contactId),
      createdAt: now(),
      updatedAt: now(),
      importBatchId: batchId,
    };

    const writer = db().bulkWriter();
    writer.create(projectDoc(pid), project);
    const localMax = new Map<number, number>();
    for (const o of plan.observations) localMax.set(o.originSequence, Math.max(localMax.get(o.originSequence) ?? 0, o.localSeq));
    reports.forEach((r, i) => {
      const attendees: Attendee[] = r.attendees.map((a) => {
        const info = contactInfo.get(a.contactKey);
        return {
          id: newId(),
          contactId: contactIdOf.get(a.contactKey) ?? null,
          name: info ? `${info.firstName} ${info.lastName}`.trim() : "",
          company: info?.company ?? "",
          present: a.present,
        };
      });
      const report: Report = {
        id: reportIdOf.get(r.sequence)!,
        projectId: pid,
        sequence: i + 1,
        visitDate: r.visitDate,
        visitTime: r.visitTime.slice(0, 20),
        authorName: "",
        ongoingWork: r.ongoingWork.slice(0, 20000),
        attendees,
        nextLocalSeq: (localMax.get(r.sequence) ?? 0) + 1,
        sourceReportId: i > 0 ? reportIdOf.get(reports[i - 1].sequence)! : null,
        deletedAt: null,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
      };
      writer.create(reportDoc(pid, report.id), report);
    });

    // ---- Observations, memberships, status history and updates.
    const obsIdOf = new Map(plan.observations.map((o) => [o.number, newId()]));
    let statusEvents = 0;
    for (const o of plan.observations) {
      const oid = obsIdOf.get(o.number)!;
      const originRid = reportIdOf.get(o.originSequence);
      if (!originRid) throw new UserError(`Observation ${o.number}'s report isn't in the import.`);
      const obs: Observation = {
        id: oid,
        projectId: pid,
        originReportId: originRid,
        originLocalSeq: o.localSeq,
        title: o.title.slice(0, 300) || `Observation ${o.number}`,
        description: o.description.slice(0, 20000),
        originalDate: o.originalDate || visitOf.get(o.originSequence)!,
        groupId: (o.group && groupIdOf.get(o.group)) || null,
        deletedAt: null,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
      };
      writer.create(observationsCol(pid).doc(oid), obs);
      // A status event wherever the printed status changes (dated to that report's visit).
      let last: string | null = null;
      for (const s of [...o.statuses].sort((a, b) => a.sequence - b.sequence)) {
        const statusId = statusIdOf.get(s.status);
        if (!statusId || statusId === last) continue;
        last = statusId;
        const ev: StatusEvent = { id: newId(), observationId: oid, statusId, date: visitOf.get(s.sequence)!, reportId: reportIdOf.get(s.sequence)!, createdAt: now() };
        writer.create(statusEventsCol(pid, oid).doc(ev.id), ev);
        statusEvents++;
      }
      const perReport = new Map<number, number>();
      for (const u of o.updates) {
        const rid = reportIdOf.get(u.sequence);
        if (!rid) continue;
        const order = perReport.get(u.sequence) ?? 0;
        perReport.set(u.sequence, order + 1);
        const update: ObservationUpdate = { id: newId(), observationId: oid, reportId: rid, date: visitOf.get(u.sequence)!, text: u.text.slice(0, 20000), order, createdAt: now(), updatedAt: now() };
        writer.create(updatesCol(pid, oid).doc(update.id), update);
      }
    }
    for (const r of reports) {
      const rid = reportIdOf.get(r.sequence)!;
      r.observations.forEach((number, order) => {
        const oid = obsIdOf.get(number);
        if (!oid) return;
        const m: Membership = { observationId: oid, order, addedAt: now() };
        writer.create(membershipsCol(pid, rid).doc(oid), m);
      });
    }
    await writer.close();
    await importsCol().doc(batchId).update({ state: "photos", "counts.statusEvents": statusEvents, updatedAt: now() });

    return { batchId, projectId: pid, observations: Object.fromEntries(obsIdOf), reports: Object.fromEntries(reportIdOf) };
  } catch (e) {
    // Leave nothing half-made behind.
    await undoImport(batchId).catch(() => undefined);
    throw e;
  }
}

async function liveImport(batchId: string): Promise<ImportRecord> {
  const record = (await importsCol().doc(batchId).get()).data() as ImportRecord | undefined;
  if (!record || record.state === "undone") throw new UserError("This import no longer exists.");
  return record;
}

/** Adds one photo from the export to its observation, in the report where it first appeared. */
export async function importPhoto(
  batchId: string,
  target: { observationId: string; reportId: string; caption: string; order: number },
  file: { name: string; bytes: Buffer },
  user: string,
): Promise<string> {
  const record = await liveImport(batchId);
  const photoId = await uploadPhoto(record.projectId, target.reportId, target.observationId, file, user, { caption: target.caption, order: target.order, quiet: true });
  await importsCol().doc(batchId).update({ "counts.photosImported": FieldValue.increment(1), updatedAt: now() });
  return photoId;
}

/** Records the end of an import, with any photos that failed. */
export async function finishImport(batchId: string, failures: string[]): Promise<ImportRecord> {
  const record = await liveImport(batchId);
  const issues = [...record.issues, ...failures.slice(0, 1000).map((message) => ({ level: "warning" as const, message }))];
  await importsCol().doc(batchId).update({ state: "done", issues, updatedAt: now() });
  return { ...record, state: "done", issues };
}

export async function getImport(batchId: string): Promise<ImportRecord> {
  return liveImport(batchId);
}

/**
 * Undoes an import: deletes the project it created (with its photos), the
 * contacts it created that no other project uses, and restores the details of
 * contacts it updated.
 */
export async function undoImport(batchId: string): Promise<void> {
  const ref = importsCol().doc(batchId);
  const record = (await ref.get()).data() as ImportRecord | undefined;
  if (!record || record.state === "undone") return;
  const pid = record.projectId;
  await db().recursiveDelete(projectDoc(pid));
  await bucket().deleteFiles({ prefix: `projects/${pid}/` }).catch(() => undefined);
  for (const id of record.createdContactIds) {
    const elsewhere = await projectsCol().where("contactIds", "array-contains", id).limit(1).get();
    if (elsewhere.empty) await contactsCol().doc(id).delete();
  }
  for (const u of record.updatedContacts) {
    const current = (await contactsCol().doc(u.id).get()).data() as Contact | undefined;
    if (current) await updateContact(u.id, { ...u.before, email: current.email }).catch(() => undefined);
  }
  await ref.update({ state: "undone", updatedAt: now() });
}
