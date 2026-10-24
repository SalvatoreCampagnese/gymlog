import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Magic link landing: the email template links here with a one-time token hash
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const dest = new URL("/", url.origin);
  if (token_hash) {
    const sb = await createClient();
    const { error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(dest);
  }
  const fail = new URL("/login", url.origin);
  fail.searchParams.set("error", "link");
  return NextResponse.redirect(fail);
}
