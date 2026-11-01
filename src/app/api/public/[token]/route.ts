import { NextResponse } from "next/server";
import { resolveShare } from "@/server/services/photos";
import { readAttachmentImage } from "@/server/services/markup";
import { clientKey, rateLimited } from "@/server/rateLimit";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, max-age=300",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/**
 * Unauthenticated image delivery for a single shared photo. The token is
 * validated server-side on every request; it can only ever reach the one
 * attachment it maps to, never arbitrary Storage objects.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (rateLimited(clientKey(req))) return new NextResponse("Too many requests", { status: 429, headers: PRIVATE_HEADERS });
  const { token } = await ctx.params;
  const shared = await resolveShare(token);
  if (!shared) return new NextResponse("Not found", { status: 404, headers: PRIVATE_HEADERS });
  const v = new URL(req.url).searchParams.get("v");
  const original = v === "original";
  try {
    const { bytes, contentType } = await readAttachmentImage(shared.attachment, shared.photo, original ? "original" : v === "plain" ? "plain-web" : "web");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": contentType,
        ...(original && { "Content-Disposition": `attachment; filename="${encodeURIComponent(shared.photo.fileName)}"` }),
      },
    });
  } catch {
    return new NextResponse("Image unavailable", { status: 404, headers: PRIVATE_HEADERS });
  }
}
