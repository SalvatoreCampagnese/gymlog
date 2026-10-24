import { NextResponse } from "next/server";
import { errorResponse, requireTrainer, trainerClient } from "@/lib/session";
import { workbookFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; wid: string }> };

// Original file as uploaded
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireTrainer();
    const { id, wid } = await params;
    await trainerClient(ctx, id);
    const f = await workbookFile(ctx.sb, id, wid);
    if (!f) return NextResponse.json({ error: "File non trovato" }, { status: 404 });
    return new Response(new Uint8Array(f.buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${f.name.replace(/[^\w.\- ]+/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireTrainer();
    const { id, wid } = await params;
    await trainerClient(ctx, id);
    const { error } = await ctx.sb.from("workbooks").delete().eq("id", wid).eq("client_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
