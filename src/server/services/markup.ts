import "server-only";
import sharp from "sharp";
import { bucket, db } from "../firebaseAdmin";
import { attachmentsCol, photosCol, reportDoc, storagePaths } from "../paths";
import { now } from "../time";
import { ConflictError, UserError } from "../errors";
import { readPhotoFile } from "./photos";
import { CENTERED, validateMarkup, type Crop, type Markup } from "@/lib/markup";
import type { Photo, PhotoAttachment, Report } from "@/lib/types";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const WEB_MAX_PX = 2048;
const THUMB_MAX_PX = 480;

/**
 * Saves the markup for one use of a photo (an attachment). Allowed only from
 * the report where the photo was attached. `image` is the browser-rendered
 * copy with the markup drawn in (the whole photo); it is cut to the square
 * crop and stored as web and thumbnail versions for the app, the PDF and the
 * public viewer. The original photo is never touched. Saving no shapes and a
 * centered crop removes the markup.
 */
export async function saveMarkup(
  pid: string,
  attachmentId: string,
  inReportId: string,
  input: unknown,
  expectedVersion: number,
  image: Buffer | null,
): Promise<number> {
  const markup = validateMarkup(input);
  if (typeof markup === "string") throw new UserError(markup);

  const [attSnap, reportSnap] = await Promise.all([attachmentsCol(pid).doc(attachmentId).get(), reportDoc(pid, inReportId).get()]);
  const attachment = attSnap.data() as PhotoAttachment | undefined;
  const report = reportSnap.data() as Report | undefined;
  if (!attachment || attachment.detachedAt) throw new UserError("Photo not found.");
  if (!report || report.deletedAt) throw new UserError("Report not found.");
  if (attachment.reportId !== inReportId) {
    throw new UserError("Markups can be edited only in the report where the photo was attached.");
  }
  const photo = (await photosCol(pid).doc(attachment.photoId).get()).data() as Photo | undefined;
  if (!photo) throw new UserError("Photo not found.");

  const version = (attachment.markupVersion ?? 0) + 1;
  let images: { web: string; thumb: string } | null = null;
  if (markup.shapes.length > 0) {
    if (!image || image.length === 0) throw new UserError("The marked-up image is missing.");
    if (image.length > MAX_IMAGE_BYTES) throw new UserError("The marked-up image is too large.");
    let meta: sharp.Metadata;
    try {
      meta = await sharp(image).metadata();
    } catch {
      throw new UserError("The marked-up image could not be read.");
    }
    if (meta.format !== "jpeg" && meta.format !== "png") throw new UserError("The marked-up image must be JPEG or PNG.");
    // Must be this photo's shape, so marked-up and original line up.
    const ratio = (meta.width ?? 0) / Math.max(1, meta.height ?? 0);
    if (!photo.width || Math.abs(ratio - photo.width / photo.height) > 0.02 * (photo.width / photo.height)) {
      throw new UserError("The marked-up image doesn't match the photo's proportions.");
    }
    const square = await squareCrop(image, markup.crop);
    const web = await sharp(square).resize(WEB_MAX_PX, WEB_MAX_PX, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const thumb = await sharp(square).resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    images = {
      web: storagePaths.markup(pid, photo.id, attachmentId, version, "web"),
      thumb: storagePaths.markup(pid, photo.id, attachmentId, version, "thumb"),
    };
    await Promise.all([
      bucket().file(images.web).save(web, { contentType: "image/jpeg", resumable: false }),
      bucket().file(images.thumb).save(thumb, { contentType: "image/jpeg", resumable: false }),
    ]);
  }

  // Record it only if nobody else saved meanwhile.
  const previous = await db().runTransaction(async (tx) => {
    const ref = attachmentsCol(pid).doc(attachmentId);
    const current = (await tx.get(ref)).data() as PhotoAttachment | undefined;
    if (!current) throw new UserError("Photo not found.");
    if ((current.markupVersion ?? 0) !== expectedVersion) throw new ConflictError("Someone else changed this markup. Reopen the photo to see their changes.");
    tx.update(ref, { markup: markup.shapes.length || markup.crop ? markup : null, markupImages: images, markupVersion: version, updatedAt: now() });
    return current.markupImages ?? null;
  }).catch(async (e) => {
    // Don't leave unused files behind when the save is refused.
    if (images) await Promise.all([bucket().file(images.web).delete(), bucket().file(images.thumb).delete()]).catch(() => undefined);
    throw e;
  });
  if (previous) await Promise.all([bucket().file(previous.web).delete(), bucket().file(previous.thumb).delete()]).catch(() => undefined);
  return version;
}

export type AttachmentVariant = "thumb" | "web" | "original" | "plain-web" | "plain-square";

/**
 * Cuts an image to a square at a crop position (object-position fractions,
 * centered by default). Square images are returned unchanged.
 */
export async function squareCrop(bytes: Buffer, crop: Crop = CENTERED): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(bytes).metadata();
  if (!width || !height || width === height) return bytes;
  const side = Math.min(width, height);
  const left = Math.round((width - side) * crop.x);
  const top = Math.round((height - side) * crop.y);
  return sharp(bytes).extract({ left, top, width: side, height: side }).jpeg({ quality: 85 }).toBuffer();
}

/**
 * Image for one use of a photo. Everything except "original" and
 * "plain-web" is square, cut at the attachment's crop:
 * - thumb, web: with the markup drawn in when there is one
 * - plain-square: without the markup
 * - plain-web: the whole photo without markup (the markup editor's crop tool)
 * - original: the untouched uploaded file
 */
export async function readAttachmentImage(
  attachment: Pick<PhotoAttachment, "markupImages" | "markup">,
  photo: Photo,
  variant: AttachmentVariant,
): Promise<{ bytes: Buffer; contentType: string }> {
  const crop = attachment.markup?.crop ?? CENTERED;
  const marked = attachment.markupImages;
  if (marked && (variant === "thumb" || variant === "web")) {
    try {
      const [bytes] = await bucket().file(variant === "thumb" ? marked.thumb : marked.web).download();
      // Copies saved before markups were square are cut on the way out.
      return { bytes: await squareCrop(bytes, crop), contentType: "image/jpeg" };
    } catch {
      // Fall back to the plain photo if the marked-up copy is missing.
    }
  }
  if (variant === "original" || variant === "plain-web") return readPhotoFile(photo, variant === "plain-web" ? "web" : "original");
  const plain = await readPhotoFile(photo, variant === "thumb" ? "thumb" : "web");
  return { bytes: await squareCrop(plain.bytes, crop), contentType: "image/jpeg" };
}

export type { Markup };
