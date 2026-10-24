import { readState, workbookFile } from "@/lib/storage";
import { exportWithReport } from "@/lib/export";
import { errorResponse, resolveClient } from "@/lib/session";

export const dynamic = "force-dynamic";

// The trainer's Excel with the REPORT columns filled from the client's logs (client, or trainer with ?client=)
export async function GET(req: Request) {
  try {
    const { sb, clientId } = await resolveClient(req);
    const url = new URL(req.url);
    const program = url.searchParams.get("program") ?? undefined;
    const [file, { state }] = await Promise.all([workbookFile(sb, clientId, url.searchParams.get("workbook") ?? undefined), readState(sb, clientId)]);
    if (!file) return Response.json({ error: "Nessuna scheda caricata" }, { status: 404 });
    const { out } = await exportWithReport(file.buf, state, program);
    const base = file.name.replace(/\.xlsx$/i, "").replace(/[^\w.\- ]+/g, "_");
    const name = `${base}_report${program ? "_" + program : ""}.xlsx`;
    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
