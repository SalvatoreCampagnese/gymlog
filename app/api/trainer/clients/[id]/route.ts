import { NextResponse } from "next/server";
import { errorResponse, requireTrainer, trainerClient } from "@/lib/session";
import { listWorkbooks } from "@/lib/storage";
import { cleanName, num } from "@/lib/trainer";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireTrainer();
    const { id } = await params;
    const client = await trainerClient(ctx, id);
    const workbooks = await listWorkbooks(ctx.sb, id);
    return NextResponse.json({ client, workbooks });
  } catch (e) {
    return errorResponse(e);
  }
}

// Personal details (email and password have their own flows)
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireTrainer();
    const { id } = await params;
    await trainerClient(ctx, id);
    const b = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if ("first_name" in b) patch.first_name = cleanName(b.first_name);
    if ("last_name" in b) patch.last_name = cleanName(b.last_name);
    if ("height_cm" in b) patch.height_cm = num(b.height_cm, 100, 250);
    if ("start_weight_kg" in b) patch.start_weight_kg = num(b.start_weight_kg, 30, 300);
    if (patch.first_name === "" || patch.last_name === "") return NextResponse.json({ error: "Nome e cognome non possono essere vuoti" }, { status: 400 });
    const { error } = await ctx.sb.from("profiles").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
