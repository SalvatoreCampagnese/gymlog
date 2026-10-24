import { NextResponse } from "next/server";
import { setActiveTimer } from "@/lib/push";
export const dynamic = "force-dynamic";
export async function POST() {
  await setActiveTimer(null);
  return NextResponse.json({ ok: true });
}
