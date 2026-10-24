import { NextResponse } from "next/server";
import { barcodeOFF } from "@/lib/off";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const hit = await barcodeOFF(code);
    if (!hit) return NextResponse.json({ error: "Prodotto non trovato su Open Food Facts" }, { status: 404 });
    return NextResponse.json(hit);
  } catch {
    return NextResponse.json({ error: "Open Food Facts non risponde, riprova tra poco" }, { status: 502 });
  }
}
