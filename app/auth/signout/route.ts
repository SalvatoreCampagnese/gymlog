import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROLE_COOKIE } from "@/lib/supabase/env";

export async function POST(req: Request) {
  const sb = await createClient();
  await sb.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.delete(ROLE_COOKIE);
  return res;
}
