import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, requireUser } from "@/server/auth";
import { UserError } from "@/server/errors";
import { finishImport, getImport, importedPhotoPaths, importPhoto, undoImport } from "@/server/services/importer";

/**
 * One import batch. Multipart POST with a file adds a photo; JSON
 * { action: "finish", failures } records the end; { action: "undo" } removes
 * everything the import created. GET returns the import log (with
 * ?photos=1, the paths of the photos already imported, for resuming).
 */
export async function POST(req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ error: (e as AuthError).message }, { status: 401 });
  }
  const { batchId } = await ctx.params;
  try {
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No photo was sent." }, { status: 400 });
      const photoId = await importPhoto(
        batchId,
        {
          path: String(form.get("path") ?? ""),
          observationId: String(form.get("observationId") ?? ""),
          reportId: String(form.get("reportId") ?? ""),
          caption: String(form.get("caption") ?? ""),
          order: Number(form.get("order") ?? 0) || 0,
        },
        { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
        user.email,
      );
      return NextResponse.json({ photoId });
    }
    const body = (await req.json().catch(() => null)) as { action: "finish"; failures?: string[] } | { action: "undo" } | null;
    if (body?.action === "finish") {
      const record = await finishImport(batchId, Array.isArray(body.failures) ? body.failures.map(String) : []);
      revalidatePath("/projects", "layout");
      return NextResponse.json(record);
    }
    if (body?.action === "undo") {
      await undoImport(batchId);
      revalidatePath("/", "layout");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (e) {
    if (!(e instanceof UserError)) console.error(e);
    return NextResponse.json({ error: e instanceof UserError ? e.message : "That didn't work. Please try again." }, { status: e instanceof UserError ? 400 : 500 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  try {
    await requireUser();
    const { batchId } = await ctx.params;
    if (new URL(req.url).searchParams.get("photos")) return NextResponse.json({ paths: await importedPhotoPaths(batchId) });
    return NextResponse.json(await getImport(batchId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Not found." }, { status: 404 });
  }
}
