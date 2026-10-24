import { NextResponse } from "next/server";
import { errorResponse, requireTrainer, trainerClient } from "@/lib/session";
import { sendMagicLink } from "@/lib/trainer";

export const dynamic = "force-dynamic";

// Sends the login link again
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTrainer();
    const client = await trainerClient(ctx, (await params).id);
    const err = await sendMagicLink(req, client.email);
    if (err) return NextResponse.json({ error: `Email non inviata: ${err}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
