"use server";

// Server actions are the only write path from the UI. Each one validates the
// session and role on the server; disabled buttons in the UI are cosmetic.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { db } from "@/server/firebaseAdmin";
import { toResult } from "@/server/errors";
import * as projects from "@/server/services/projects";
import * as reports from "@/server/services/reports";
import * as reportDeletion from "@/server/services/reportDeletion";
import * as reportOrder from "@/server/services/reportOrder";
import * as observations from "@/server/services/observations";
import * as photos from "@/server/services/photos";
import * as settings from "@/server/services/settings";
import * as users from "@/server/services/users";
import * as contacts from "@/server/services/contacts";
import { getObservationDetail } from "@/server/services/reportView";
import type { ProjectContact, Role, StatusDef } from "@/lib/types";

const reportPath = (pid: string, rid: string) => `/projects/${pid}/reports/${rid}`;

// ---- Projects ----

export async function createProjectAction(input: projects.ProjectInput, contacts: ProjectContact[] = []) {
  return toResult(async () => {
    await requireUser();
    const id = await projects.createProject(input, contacts);
    revalidatePath("/projects");
    return id;
  });
}

export async function updateProjectAction(pid: string, patch: Partial<projects.ProjectInput>) {
  return toResult(async () => {
    await requireUser();
    await projects.updateProject(pid, patch);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

export async function setProjectArchivedAction(pid: string, archived: boolean) {
  return setProjectsArchivedAction([pid], archived);
}

export async function setProjectsArchivedAction(pids: string[], archived: boolean) {
  return toResult(async () => {
    await requireUser();
    await projects.setProjectsArchived(pids.slice(0, 400), archived);
    revalidatePath("/projects", "layout");
  });
}

export async function setProjectOptionsAction(pid: string, options: projects.ProjectOptions) {
  return toResult(async () => {
    await requireUser();
    await projects.setProjectOptions(pid, options);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

export async function saveGroupsAction(pid: string, groups: Array<{ id?: string; name: string }>) {
  return toResult(async () => {
    await requireUser();
    await projects.saveGroups(pid, groups);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

// ---- Contacts (firm-wide) and project contacts ----

export async function createContactAction(input: contacts.ContactInput, addToProjectId?: string, projectRole = "") {
  return toResult(async () => {
    await requireUser();
    const contact = await contacts.createContact(input);
    if (addToProjectId) await projects.addProjectContacts(addToProjectId, [{ contactId: contact.id, projectRole }]);
    revalidatePath("/contacts");
    if (addToProjectId) revalidatePath(`/projects/${addToProjectId}`, "layout");
    return contact;
  });
}

export async function updateContactAction(id: string, input: contacts.ContactInput) {
  return toResult(async () => {
    await requireUser();
    await contacts.updateContact(id, input);
    revalidatePath("/", "layout");
  });
}

export async function addProjectContactsAction(pid: string, entries: ProjectContact[]) {
  return toResult(async () => {
    await requireUser();
    await projects.addProjectContacts(pid, entries);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

export async function setProjectContactRoleAction(pid: string, contactId: string, projectRole: string) {
  return toResult(async () => {
    await requireUser();
    await projects.setProjectContactRole(pid, contactId, projectRole);
  });
}

export async function removeProjectContactsAction(pid: string, contactIds: string[]) {
  return toResult(async () => {
    await requireUser();
    await projects.removeProjectContacts(pid, contactIds);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

// ---- Reports ----

export async function carryForwardCandidatesAction(pid: string, sourceRid: string) {
  return toResult(async () => {
    await requireUser();
    const { resolvedStatusId } = await settings.getSettings();
    return reports.carryForwardCandidates(pid, sourceRid, resolvedStatusId);
  });
}

export async function createReportAction(pid: string, input: reports.CreateReportInput) {
  return toResult(async () => {
    await requireUser();
    const rid = await reports.createReport(pid, input);
    revalidatePath(`/projects/${pid}`);
    return rid;
  });
}

export async function updateReportInfoAction(pid: string, rid: string, patch: reports.ReportInfoPatch, version: number) {
  return toResult(async () => {
    await requireUser();
    const next = await reports.updateReportInfo(pid, rid, patch, version);
    if (patch.visitDate) revalidatePath(`/projects/${pid}`, "layout");
    return next;
  });
}

export async function addMembershipsAction(pid: string, rid: string, observationIds: string[]) {
  return toResult(async () => {
    await requireUser();
    await reports.addMemberships(pid, rid, observationIds);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function removeMembershipAction(pid: string, rid: string, oid: string) {
  return toResult(async () => {
    await requireUser();
    await reports.removeMembership(pid, rid, oid);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function reorderMembershipsAction(pid: string, rid: string, orderedIds: string[]) {
  return toResult(async () => {
    await requireUser();
    await reports.reorderMemberships(pid, rid, orderedIds);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function previewReportDeletionAction(pid: string, rids: string[]) {
  return toResult(async () => {
    await requireUser();
    return reportDeletion.previewReportDeletion(pid, rids);
  });
}

/** Editors and admins may delete field reports (spec: recoverable only from backups). */
export async function deleteReportsAction(pid: string, rids: string[]) {
  return toResult(async () => {
    const user = await requireUser();
    await reportDeletion.deleteReports(pid, rids, user.email);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

// ---- Observations ----

export async function createObservationAction(pid: string, rid: string, input: observations.NewObservationInput) {
  return toResult(async () => {
    await requireUser();
    const oid = await observations.createObservation(pid, rid, input);
    revalidatePath(reportPath(pid, rid), "layout");
    return oid;
  });
}

export async function updateObservationAction(
  pid: string,
  oid: string,
  patch: observations.ObservationPatch,
  version: number,
  inReportId: string,
) {
  return toResult(async () => {
    await requireUser();
    return observations.updateObservation(pid, oid, patch, version, inReportId);
  });
}

export async function moveObservationAction(pid: string, rid: string, oid: string, direction: -1 | 1) {
  return toResult(async () => {
    await requireUser();
    await reportOrder.moveObservation(pid, rid, oid, direction === -1 ? -1 : 1);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

export async function deleteObservationAction(pid: string, rid: string, oid: string) {
  return toResult(async () => {
    await requireUser();
    await observations.deleteObservation(pid, oid);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

export async function setStatusAction(pid: string, rid: string, oid: string, statusId: string) {
  return toResult(async () => {
    await requireUser();
    await observations.setStatusInReport(pid, oid, rid, statusId);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function addUpdateAction(pid: string, rid: string, oid: string, text: string) {
  return toResult(async () => {
    await requireUser();
    await observations.addUpdate(pid, oid, rid, text);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function editUpdateAction(pid: string, rid: string, oid: string, updateId: string, text: string) {
  return toResult(async () => {
    await requireUser();
    await observations.editUpdate(pid, oid, updateId, text);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function deleteUpdateAction(pid: string, rid: string, oid: string, updateId: string) {
  return toResult(async () => {
    await requireUser();
    await observations.deleteUpdate(pid, oid, updateId);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

// ---- Photos ----

export async function attachPhotoAction(pid: string, rid: string, oid: string, photoId: string) {
  return toResult(async () => {
    await requireUser();
    await photos.attachPhoto(pid, photoId, oid, rid);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function detachPhotoAction(pid: string, rid: string, attachmentId: string) {
  return toResult(async () => {
    await requireUser();
    await photos.detachPhoto(pid, attachmentId);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function updateCaptionAction(pid: string, attachmentId: string, caption: string) {
  return toResult(async () => {
    await requireUser();
    await photos.updateCaption(pid, attachmentId, caption);
  });
}

export async function reorderAttachmentsAction(pid: string, rid: string, orderedIds: string[]) {
  return toResult(async () => {
    await requireUser();
    await photos.reorderAttachments(pid, orderedIds);
    revalidatePath(reportPath(pid, rid), "layout");
  });
}

export async function shareLinkAction(pid: string, attachmentId: string) {
  return toResult(async () => {
    await requireUser();
    const token = await photos.ensureShareToken(pid, attachmentId);
    return `${(process.env.KESTRO_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}/p/${token}`;
  });
}

/** Admins only: the link stops working, including in PDFs already sent. */
export async function revokeShareAction(pid: string, attachmentId: string) {
  return toResult(async () => {
    await requireUser("admin");
    await photos.revokeShare(pid, attachmentId);
    revalidatePath(`/projects/${pid}`, "layout");
  });
}

// ---- Administration ----

export async function addUserAction(email: string, role: Role, names: users.StaffNames) {
  return toResult(async () => {
    await requireUser("admin");
    if (role !== "admin" && role !== "editor") throw new Error("Invalid role");
    await users.addUser(email, role, names);
    revalidatePath("/contacts");
    revalidatePath("/settings/users");
  });
}

export async function updateUserAction(email: string, patch: { role?: Role; enabled?: boolean }) {
  return toResult(async () => {
    await requireUser("admin");
    await users.updateUser(email, patch);
    revalidatePath("/settings/users");
  });
}

export async function updateSettingsAction(patch: settings.SettingsPatch) {
  return toResult(async () => {
    await requireUser("admin");
    await settings.updateSettings(patch);
    revalidatePath("/", "layout");
  });
}

export async function saveStatusesAction(
  statuses: Array<Omit<StatusDef, "id" | "order"> & { id?: string }>,
  resolvedIndex: number,
) {
  return toResult(async () => {
    await requireUser("admin");
    await settings.saveStatuses(statuses, resolvedIndex, async (statusId) => {
      const used = await db().collectionGroup("statusEvents").where("statusId", "==", statusId).limit(1).get();
      return !used.empty;
    });
    revalidatePath("/", "layout");
  });
}

// ---- Data for slide-in editors ----

/** Observation editor data; without a report, edits go to its most recent report. */
export async function getObservationDetailAction(pid: string, oid: string, rid: string | null) {
  return toResult(async () => {
    await requireUser();
    return getObservationDetail(pid, oid, rid);
  });
}

export async function getPhotoLibraryAction(pid: string) {
  return toResult(async () => {
    await requireUser();
    return photos.listLibrary(pid);
  });
}
