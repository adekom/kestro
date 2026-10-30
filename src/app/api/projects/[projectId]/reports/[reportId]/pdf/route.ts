import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { buildReportView } from "@/server/services/reportView";
import { renderReportPdf, reportPdfFilename } from "@/server/pdf/renderReport";

/**
 * Preview (?download=0, inline) and export (?download=1, attachment) share
 * this single rendering path. Nothing is stored: each PDF reflects the report
 * content at the moment of export.
 */
export async function GET(req: Request, ctx: { params: Promise<{ projectId: string; reportId: string }> }) {
  if (!(await getSessionUser())) return new NextResponse("Not signed in", { status: 401 });
  const { projectId, reportId } = await ctx.params;
  const download = new URL(req.url).searchParams.get("download") === "1";
  const baseUrl = process.env.KESTRO_PUBLIC_BASE_URL || new URL(req.url).origin;
  try {
    const view = await buildReportView(projectId, reportId);
    const pdf = await renderReportPdf(view, baseUrl);
    const filename = reportPdfFilename(view);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("PDF generation failed", e);
    return new NextResponse("The PDF could not be generated. Please try again.", { status: 500 });
  }
}
