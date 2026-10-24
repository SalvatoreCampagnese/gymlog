import { readWorkbook, readState } from "@/lib/storage";
import { exportWithReport } from "@/lib/export";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const program = new URL(req.url).searchParams.get("program") ?? undefined;
  const [wb, { state }] = await Promise.all([readWorkbook(), readState()]);
  const { out } = await exportWithReport(wb.buf, state, program);
  const base = wb.source.replace(/\.xlsx$/i, "");
  const name = `${base}_report${program ? "_" + program : ""}.xlsx`;
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
