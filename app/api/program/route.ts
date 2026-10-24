import { NextResponse } from "next/server";
import { loadProgram } from "@/lib/program";
import { errorResponse, resolveClient } from "@/lib/session";

export const dynamic = "force-dynamic";

// The active plan of the logged-in client (or ?client=<id> for their trainer)
export async function GET(req: Request) {
  try {
    const { sb, clientId } = await resolveClient(req);
    return NextResponse.json(await loadProgram(sb, clientId));
  } catch (e) {
    return errorResponse(e, "Non riesco a leggere la scheda");
  }
}
