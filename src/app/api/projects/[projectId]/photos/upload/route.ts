import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/server/auth";
import { UserError } from "@/server/errors";
import { MAX_FILES_PER_UPLOAD, uploadPhoto } from "@/server/services/photos";

/** Batch upload into an observation; each file also joins the project library. */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ error: (e as AuthError).message }, { status: 401 });
  }
  const { projectId } = await ctx.params;
  const form = await req.formData();
  const reportId = String(form.get("reportId") ?? "");
  const observationId = String(form.get("observationId") ?? "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!reportId || !observationId || files.length === 0) {
    return NextResponse.json({ error: "Choose at least one image." }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES_PER_UPLOAD} images at a time.` }, { status: 400 });
  }

  // Files are processed independently so one bad image doesn't block the rest.
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];
  for (const f of files) {
    try {
      await uploadPhoto(projectId, reportId, observationId, { name: f.name, bytes: Buffer.from(await f.arrayBuffer()) }, user.email);
      results.push({ name: f.name, ok: true });
    } catch (e) {
      if (!(e instanceof UserError)) console.error(e);
      results.push({ name: f.name, ok: false, error: e instanceof UserError ? e.message : `${f.name} could not be uploaded.` });
    }
  }
  return NextResponse.json({ results });
}
