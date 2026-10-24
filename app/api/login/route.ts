import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const pw = process.env.APP_PASSWORD;
  if (!pw || password !== pw) return NextResponse.json({ error: "Password errata" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await authToken(pw), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
