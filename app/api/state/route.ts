import { NextResponse } from "next/server";
import { readState, updateState } from "@/lib/storage";
import { applyOp, type Op } from "@/lib/ops";

export const dynamic = "force-dynamic";

export async function GET() {
  const { state } = await readState();
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { ops: Op[] };
  if (!Array.isArray(body?.ops)) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  try {
    const state = await updateState((s) => body.ops.forEach((op) => applyOp(s, op)));
    return NextResponse.json(state);
  } catch (e: any) {
    return NextResponse.json({ error: `Salvataggio non riuscito: ${e?.message ?? e}` }, { status: 500 });
  }
}
