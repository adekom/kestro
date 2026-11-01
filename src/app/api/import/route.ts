import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, requireUser } from "@/server/auth";
import { UserError } from "@/server/errors";
import { createProjectFromImport, previewImport, type ContactMode, type StatusMapping } from "@/server/services/importer";
import type { ImportPlan } from "@/lib/archisnapper/plan";

/**
 * ArchiSnapper import: { action: "preview", projectName, emails } checks for
 * an existing project and contacts; { action: "create", plan, statusMap,
 * contactMode } creates the project and returns where each photo goes.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ error: (e as AuthError).message }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { action: "preview"; projectName: string; emails: string[] }
    | { action: "create"; plan: ImportPlan; statusMap: StatusMapping; contactMode: ContactMode }
    | null;
  try {
    if (body?.action === "preview") {
      return NextResponse.json(await previewImport(String(body.projectName ?? ""), Array.isArray(body.emails) ? body.emails.map(String) : []));
    }
    if (body?.action === "create") {
      const targets = await createProjectFromImport(body.plan, body.statusMap ?? {}, body.contactMode === "update" ? "update" : "keep", user.email);
      revalidatePath("/projects");
      return NextResponse.json(targets);
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (e) {
    if (!(e instanceof UserError)) console.error(e);
    return NextResponse.json({ error: e instanceof UserError ? e.message : "The import failed. Nothing was saved." }, { status: e instanceof UserError ? 400 : 500 });
  }
}
