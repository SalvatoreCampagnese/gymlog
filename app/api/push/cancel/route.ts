import { NextResponse } from "next/server";
import { setActiveTimer } from "@/lib/push";
import { errorResponse, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { user } = await requireUser();
    await setActiveTimer(user.id, null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
