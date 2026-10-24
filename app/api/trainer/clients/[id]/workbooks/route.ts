import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/parser";
import { PARSER_VERSION } from "@/lib/program";
import { errorResponse, requireTrainer, trainerClient } from "@/lib/session";
import { toBytea } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Upload a new version of the client's Excel: it becomes the active plan, older ones stay in the history
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTrainer();
    const { id } = await params;
    await trainerClient(ctx, id);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Nessun file ricevuto" }, { status: 400 });
    if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "Serve un file .xlsx" }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File troppo grande (max 15 MB)" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = await parseWorkbook(buf, file.name);
    } catch (e: any) {
      return NextResponse.json({ error: `Il file non si apre come Excel: ${e?.message ?? e}` }, { status: 400 });
    }
    const withWorkouts = parsed.programs.filter((p) => p.weeks.some((w) => w.workouts.length));
    if (!withWorkouts.length) return NextResponse.json({ error: "Nel file non trovo nessuna scheda con allenamenti" }, { status: 400 });
    const note = String(form.get("note") ?? "").trim().slice(0, 200) || null;
    const uploadedAt = new Date().toISOString();
    parsed.uploadedAt = uploadedAt;
    const { data, error } = await ctx.sb
      .from("workbooks")
      .insert({
        client_id: id,
        file_name: file.name.slice(-120),
        file: toBytea(buf),
        program_titles: parsed.programs.map((p) => p.title),
        parsed,
        parser_version: PARSER_VERSION,
        note,
        uploaded_by: ctx.user.id,
        uploaded_at: uploadedAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, programs: parsed.programs.map((p) => p.title) });
  } catch (e) {
    return errorResponse(e);
  }
}
