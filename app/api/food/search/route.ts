import { NextResponse } from "next/server";
import { searchOFF } from "@/lib/off";
import { searchGeneric } from "@/lib/generic-foods";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ generic: [], products: [] });
  const generic = searchGeneric(q);
  const { hits, errors } = await searchOFF(q);
  if (errors.length) console.error("OFF search failed", q, errors);
  return NextResponse.json({
    generic,
    products: hits,
    ...(errors.length ? { warning: "Open Food Facts adesso non risponde.", detail: errors.join("; ") } : {}),
  });
}
