import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { errorResponse, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// The logged-in client's personal Shortcut URL (the token is not readable from the browser)
export async function GET(req: Request) {
  try {
    const { user, profile } = await requireUser();
    if (profile.role !== "client") return NextResponse.json({ url: null });
    const { data } = await createAdminClient().from("profiles").select("health_token").eq("id", user.id).single();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    return NextResponse.json({ url: data?.health_token ? `${origin}/api/health?token=${data.health_token}` : null });
  } catch (e) {
    return errorResponse(e);
  }
}
