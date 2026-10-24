import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { errorResponse, requireTrainer, trainerClient } from "@/lib/session";

export const dynamic = "force-dynamic";

// The trainer sets a new password for a client (e.g. forgotten)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTrainer();
    const client = await trainerClient(ctx, (await params).id);
    const { password } = await req.json().catch(() => ({ password: "" }));
    if (String(password ?? "").length < 8) return NextResponse.json({ error: "Almeno 8 caratteri" }, { status: 400 });
    const { error } = await createAdminClient().auth.admin.updateUserById(client.id, { password: String(password) });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
