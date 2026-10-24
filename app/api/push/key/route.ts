import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
}
