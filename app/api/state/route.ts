import { NextResponse } from "next/server";
import { readState, updateState } from "@/lib/storage";
import { applyOp, type Op } from "@/lib/ops";
import { errorResponse, resolveClient } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { sb, clientId } = await resolveClient(req);
    const { state } = await readState(sb, clientId);
    return NextResponse.json(state);
  } catch (e) {
    return errorResponse(e);
  }
}

// Only the client writes their own diary
export async function POST(req: Request) {
  try {
    const { sb, clientId } = await resolveClient(req, { write: true });
    const body = (await req.json()) as { ops: Op[] };
    if (!Array.isArray(body?.ops)) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
    const state = await updateState(sb, clientId, (s) => body.ops.forEach((op) => applyOp(s, op)));
    return NextResponse.json(state);
  } catch (e) {
    return errorResponse(e, "Salvataggio non riuscito");
  }
}
