import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { attachmentsCol } from "@/server/paths";
import { getPhoto } from "@/server/services/photos";
import { readAttachmentImage, type AttachmentVariant } from "@/server/services/markup";
import type { PhotoAttachment } from "@/lib/types";

/**
 * Image for one use of a photo, for signed-in staff: marked-up when it has a
 * markup (?v=thumb|web), the photo without markup (?v=plain-web), or the
 * untouched original (?v=original).
 */
export async function GET(req: Request, ctx: { params: Promise<{ projectId: string; attachmentId: string }> }) {
  if (!(await getSessionUser())) return new NextResponse("Not signed in", { status: 401 });
  const { projectId, attachmentId } = await ctx.params;
  const v = new URL(req.url).searchParams.get("v");
  const variant: AttachmentVariant = v === "web" || v === "original" || v === "plain-web" ? v : "thumb";
  try {
    const attachment = (await attachmentsCol(projectId).doc(attachmentId).get()).data() as PhotoAttachment | undefined;
    if (!attachment) return new NextResponse("Not found", { status: 404 });
    const photo = await getPhoto(projectId, attachment.photoId);
    const { bytes, contentType } = await readAttachmentImage(attachment, photo, variant);
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      // URLs carry the markup version, so a cached copy is never stale.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    if (variant === "original") headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(photo.fileName)}"`;
    return new NextResponse(new Uint8Array(bytes), { headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
