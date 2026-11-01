import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { ConflictError, UserError } from "@/server/errors";
import { saveMarkup } from "@/server/services/markup";

/**
 * Saves a photo's markup: the shapes (JSON) plus the browser-rendered copy
 * with the markup drawn in. Multipart because the image is binary.
 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string; attachmentId: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { projectId, attachmentId } = await ctx.params;
  try {
    const form = await req.formData();
    const markup = JSON.parse(String(form.get("markup") ?? "null"));
    const reportId = String(form.get("reportId") ?? "");
    const expectedVersion = Number(form.get("expectedVersion") ?? 0);
    const file = form.get("image");
    const image = file instanceof File ? Buffer.from(await file.arrayBuffer()) : null;
    const version = await saveMarkup(projectId, attachmentId, reportId, markup, expectedVersion, image);
    revalidatePath(`/projects/${projectId}`, "layout");
    return NextResponse.json({ version });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message, conflict: true }, { status: 409 });
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "The markup could not be read." }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "The markup could not be saved. Please try again." }, { status: 500 });
  }
}
