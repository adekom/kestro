import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSessionUser, requireUser } from "@/server/auth";
import { bucket } from "@/server/firebaseAdmin";
import { storagePaths } from "@/server/paths";
import { getSettings, setLogoPath } from "@/server/services/settings";

/** Admin-only upload of the report header logo (normalized to PNG). */
export async function POST(req: Request) {
  try {
    await requireUser("admin");
  } catch {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Choose a JPEG or PNG logo under 5 MB." }, { status: 400 });
  }
  try {
    const png = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize(800, 300, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const path = storagePaths.logo("png");
    await bucket().file(path).save(png, { contentType: "image/png", resumable: false });
    await setLogoPath(path);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "That file is not a readable image." }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await requireUser("admin");
  } catch {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }
  await setLogoPath(null);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await getSessionUser())) return new NextResponse("Not signed in", { status: 401 });
  const { logoPath } = await getSettings();
  if (!logoPath) return new NextResponse("No logo", { status: 404 });
  const [bytes] = await bucket().file(logoPath).download();
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-cache" } });
}
