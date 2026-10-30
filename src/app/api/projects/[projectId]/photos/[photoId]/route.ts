import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { getPhoto, readPhotoFile, type PhotoVariant } from "@/server/services/photos";

/** Authorized image delivery for signed-in staff (files stay private in Storage). */
export async function GET(req: Request, ctx: { params: Promise<{ projectId: string; photoId: string }> }) {
  if (!(await getSessionUser())) return new NextResponse("Not signed in", { status: 401 });
  const { projectId, photoId } = await ctx.params;
  const v = new URL(req.url).searchParams.get("v");
  const variant: PhotoVariant = v === "original" || v === "web" ? v : "thumb";
  try {
    const photo = await getPhoto(projectId, photoId);
    const { bytes, contentType } = await readPhotoFile(photo, variant);
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    if (variant === "original") {
      headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(photo.fileName)}"`;
    }
    return new NextResponse(new Uint8Array(bytes), { headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
