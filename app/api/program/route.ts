import { NextResponse } from "next/server";
import { loadProgram } from "@/lib/program";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await loadProgram());
  } catch (e: any) {
    return NextResponse.json({ error: `Non riesco a leggere la scheda: ${e?.message ?? e}` }, { status: 500 });
  }
}
