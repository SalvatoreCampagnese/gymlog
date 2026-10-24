import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Behind the app password (middleware): gives the logged-in user the Shortcut URL.
export async function GET(req: Request) {
  const token = process.env.HEALTH_TOKEN;
  if (!token) return NextResponse.json({ url: null });
  const origin = new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/api/health?token=${token}` });
}
