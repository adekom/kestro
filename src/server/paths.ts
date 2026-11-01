import "server-only";
import { db } from "./firebaseAdmin";

// Firestore layout (spec §10). Every path segment is a stable ID.
export const settingsDoc = () => db().doc("settings/organization");
export const bootstrapDoc = () => db().doc("settings/bootstrap");
export const usersCol = () => db().collection("users");
/** Firm-wide contact list (staff and external people). */
export const contactsCol = () => db().collection("contacts");
export const projectsCol = () => db().collection("projects");
export const projectDoc = (pid: string) => projectsCol().doc(pid);
export const reportsCol = (pid: string) => projectDoc(pid).collection("reports");
export const reportDoc = (pid: string, rid: string) => reportsCol(pid).doc(rid);
export const membershipsCol = (pid: string, rid: string) => reportDoc(pid, rid).collection("memberships");
export const observationsCol = (pid: string) => projectDoc(pid).collection("observations");
export const observationDoc = (pid: string, oid: string) => observationsCol(pid).doc(oid);
export const updatesCol = (pid: string, oid: string) => observationDoc(pid, oid).collection("updates");
export const statusEventsCol = (pid: string, oid: string) => observationDoc(pid, oid).collection("statusEvents");
export const photosCol = (pid: string) => projectDoc(pid).collection("photos");
export const attachmentsCol = (pid: string) => projectDoc(pid).collection("photoAttachments");
/** Top-level so an unauthenticated token lookup is a single keyed read. */
export const photoSharesCol = () => db().collection("photoShares");

export const storagePaths = {
  original: (pid: string, photoId: string, ext: string) => `projects/${pid}/photos/${photoId}/original.${ext}`,
  web: (pid: string, photoId: string) => `projects/${pid}/photos/${photoId}/web.jpg`,
  thumb: (pid: string, photoId: string) => `projects/${pid}/photos/${photoId}/thumb.jpg`,
  logo: (ext: string) => `organization/logo.${ext}`,
  markup: (pid: string, photoId: string, attachmentId: string, version: number, variant: "web" | "thumb") =>
    `projects/${pid}/photos/${photoId}/markup/${attachmentId}-${version}-${variant}.jpg`,
};
