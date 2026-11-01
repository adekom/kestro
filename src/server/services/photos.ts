import "server-only";
import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { bucket, db } from "../firebaseAdmin";
import { attachmentsCol, observationDoc, photoSharesCol, photosCol, reportDoc, storagePaths } from "../paths";
import { newId, now } from "../time";
import { UserError } from "../errors";
import { notePhotoAdded } from "./observations";
import { getSettings } from "./settings";
import type { Observation, Photo, PhotoAttachment, PhotoShare, Report } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 25;

const WEB_MAX_PX = 2048;
const THUMB_MAX_PX = 480;

/** Accepted formats, detected from file content rather than the browser-supplied type. */
const FORMATS: Record<string, { ext: string; contentType: string }> = {
  jpeg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
};

/**
 * Stores an unmodified original plus a browser-optimized image and a compact
 * thumbnail, then attaches it to the observation within the given report.
 * HEIC/HEIF is rejected with guidance: the prebuilt sharp binaries do not
 * decode it (see docs/development.md for the conversion fallback).
 */
export async function uploadPhoto(
  pid: string,
  rid: string,
  oid: string,
  file: { name: string; bytes: Buffer },
  uploadedBy: string,
  options: AttachOptions = {},
): Promise<string> {
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new UserError(`${file.name} is larger than 40 MB.`);
  if (/\.(heic|heif)$/i.test(file.name)) {
    throw new UserError(`${file.name}: HEIC/HEIF is not supported yet. Export it as JPEG first.`);
  }
  let meta: sharp.Metadata;
  try {
    meta = await sharp(file.bytes).metadata();
  } catch {
    throw new UserError(`${file.name} is not a readable image.`);
  }
  const format = meta.format ? FORMATS[meta.format] : undefined;
  if (!format) throw new UserError(`${file.name}: only JPEG and PNG images are supported.`);

  const [report, obs] = await Promise.all([reportDoc(pid, rid).get(), observationDoc(pid, oid).get()]);
  if (!report.exists || (report.data() as Report).deletedAt) throw new UserError("Report not found.");
  if (!obs.exists || (obs.data() as Observation).deletedAt) throw new UserError("Observation not found.");

  // Derivatives are auto-rotated per EXIF; the original bytes are stored untouched.
  const oriented = sharp(file.bytes).rotate();
  // EXIF orientations 5–8 rotate by 90°, swapping the displayed dimensions.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  const web = await oriented.clone().resize(WEB_MAX_PX, WEB_MAX_PX, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const thumb = await oriented.clone().resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();

  const photoId = newId();
  const photo: Photo = {
    id: photoId,
    projectId: pid,
    fileName: file.name.slice(0, 255),
    contentType: format.contentType,
    sizeBytes: file.bytes.length,
    width,
    height,
    originalPath: storagePaths.original(pid, photoId, format.ext),
    webPath: storagePaths.web(pid, photoId),
    thumbPath: storagePaths.thumb(pid, photoId),
    uploadedBy,
    createdAt: now(),
  };
  const b = bucket();
  await Promise.all([
    b.file(photo.originalPath).save(file.bytes, { contentType: photo.contentType, resumable: false }),
    b.file(photo.webPath).save(web, { contentType: "image/jpeg", resumable: false }),
    b.file(photo.thumbPath).save(thumb, { contentType: "image/jpeg", resumable: false }),
  ]);
  // The photo record is written only after all files exist, so a failed
  // upload never leaves a library entry pointing at missing objects.
  await photosCol(pid).doc(photoId).create(photo);
  await attachPhoto(pid, photoId, oid, rid, options);
  return photoId;
}

export interface AttachOptions {
  caption?: string;
  /** Position among the observation's photos (default: after the others). */
  order?: number;
  /** Imports bring their own history: no automatic "Photo added." update. */
  quiet?: boolean;
}

/** Attaches a library photo to an observation from the given report onwards. */
export async function attachPhoto(pid: string, photoId: string, oid: string, rid: string, options: AttachOptions = {}): Promise<string> {
  const report = (await reportDoc(pid, rid).get()).data() as Report | undefined;
  if (!report || report.deletedAt) throw new UserError("Report not found.");
  if (!(await photosCol(pid).doc(photoId).get()).exists) throw new UserError("Photo not found.");
  const id = newId();
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(attachmentsCol(pid).where("observationId", "==", oid));
    const order = options.order ?? existing.docs.reduce((max, d) => Math.max(max, (d.data() as PhotoAttachment).order), -1) + 1;
    const attachment: PhotoAttachment = {
      id,
      photoId,
      observationId: oid,
      reportId: rid,
      date: report.visitDate,
      order,
      caption: (options.caption ?? "").slice(0, 500),
      shareToken: null,
      detachedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    tx.create(attachmentsCol(pid).doc(id), attachment);
  });
  if (!options.quiet) await notePhotoAdded(pid, oid, rid);
  return id;
}

export async function listAttachments(pid: string, oid: string): Promise<PhotoAttachment[]> {
  const snap = await attachmentsCol(pid).where("observationId", "==", oid).get();
  return snap.docs
    .map((d) => d.data() as PhotoAttachment)
    .filter((a) => !a.detachedAt)
    .sort((a, b) => a.order - b.order);
}

export async function getPhoto(pid: string, photoId: string): Promise<Photo> {
  const snap = await photosCol(pid).doc(photoId).get();
  if (!snap.exists) throw new UserError("Photo not found.");
  return snap.data() as Photo;
}

export async function listLibrary(pid: string): Promise<Photo[]> {
  const snap = await photosCol(pid).get();
  return snap.docs.map((d) => d.data() as Photo).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateCaption(pid: string, attachmentId: string, caption: string): Promise<void> {
  await attachmentsCol(pid).doc(attachmentId).update({ caption: caption.slice(0, 500), updatedAt: now() });
}

/**
 * Detaches a photo from an observation. The file stays in the project library.
 * Existing public links keep working (they appear in exported PDFs) unless the
 * company has chosen to revoke them on removal.
 */
export async function detachPhoto(pid: string, attachmentId: string): Promise<void> {
  // Optionally (company setting) the public link stops working too.
  if ((await getSettings()).revokeLinksOnRemove) await revokeShare(pid, attachmentId);
  await attachmentsCol(pid).doc(attachmentId).update({ detachedAt: now(), updatedAt: now() });
}

/**
 * Deletes a photo from the project: it is removed from every observation that
 * uses it, its public links stop working, and its files (original, derived
 * and marked-up copies) are deleted. Not reversible.
 */
export async function deletePhoto(pid: string, photoId: string): Promise<void> {
  const uses = await attachmentsCol(pid).where("photoId", "==", photoId).get();
  await db().runTransaction(async (tx) => {
    const photoRef = photosCol(pid).doc(photoId);
    if (!(await tx.get(photoRef)).exists) throw new UserError("Photo not found.");
    for (const d of uses.docs) {
      const a = d.data() as PhotoAttachment;
      if (a.shareToken) tx.update(photoSharesCol().doc(hashToken(a.shareToken)), { revokedAt: now() });
      tx.update(d.ref, { detachedAt: a.detachedAt ?? now(), shareToken: null, markupImages: null, updatedAt: now() });
    }
    tx.delete(photoRef);
  });
  await bucket().deleteFiles({ prefix: `projects/${pid}/photos/${photoId}/` }).catch(() => undefined);
}

export async function reorderAttachments(pid: string, orderedIds: string[]): Promise<void> {
  const batch = db().batch();
  orderedIds.slice(0, 450).forEach((id, order) => batch.update(attachmentsCol(pid).doc(id), { order }));
  await batch.commit();
}

export type PhotoVariant = "thumb" | "web" | "original";

export async function readPhotoFile(photo: Photo, variant: PhotoVariant): Promise<{ bytes: Buffer; contentType: string }> {
  const path = variant === "original" ? photo.originalPath : variant === "web" ? photo.webPath : photo.thumbPath;
  try {
    const [bytes] = await bucket().file(path).download();
    return { bytes, contentType: variant === "original" ? photo.contentType : "image/jpeg" };
  } catch {
    throw new UserError("The image file is missing.");
  }
}

// ---- Public photo shares (spec §8) ----

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Returns the attachment's current share token, creating one if needed. */
export async function ensureShareToken(pid: string, attachmentId: string): Promise<string> {
  return db().runTransaction(async (tx) => {
    const ref = attachmentsCol(pid).doc(attachmentId);
    const attachment = (await tx.get(ref)).data() as PhotoAttachment | undefined;
    if (!attachment) throw new UserError("Photo attachment not found.");
    if (attachment.shareToken) return attachment.shareToken;
    const token = randomBytes(24).toString("base64url"); // 192 bits
    const share: PhotoShare = {
      tokenHash: hashToken(token),
      projectId: pid,
      attachmentId,
      photoId: attachment.photoId,
      revokedAt: null,
      createdAt: now(),
    };
    tx.create(photoSharesCol().doc(share.tokenHash), share);
    tx.update(ref, { shareToken: token, updatedAt: now() });
    return token;
  });
}

/** Revokes the attachment's public link. A later export issues a new one. */
export async function revokeShare(pid: string, attachmentId: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = attachmentsCol(pid).doc(attachmentId);
    const attachment = (await tx.get(ref)).data() as PhotoAttachment | undefined;
    if (!attachment?.shareToken) return;
    tx.update(photoSharesCol().doc(hashToken(attachment.shareToken)), { revokedAt: now() });
    tx.update(ref, { shareToken: null, updatedAt: now() });
  });
}

/** Resolves a public token to exactly one photo attachment, or null if unknown/revoked. */
export async function resolveShare(token: string): Promise<{ photo: Photo; attachment: PhotoAttachment } | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const share = (await photoSharesCol().doc(hashToken(token)).get()).data() as PhotoShare | undefined;
  if (!share || share.revokedAt) return null;
  const [photoSnap, attachmentSnap] = await Promise.all([
    photosCol(share.projectId).doc(share.photoId).get(),
    attachmentsCol(share.projectId).doc(share.attachmentId).get(),
  ]);
  if (!photoSnap.exists || !attachmentSnap.exists) return null;
  return { photo: photoSnap.data() as Photo, attachment: attachmentSnap.data() as PhotoAttachment };
}
