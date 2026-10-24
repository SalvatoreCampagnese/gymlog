import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/parser";
import { saveWorkbook } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nessun file ricevuto" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "Serve un file .xlsx" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseWorkbook(buf, file.name);
  } catch (e: any) {
    return NextResponse.json({ error: `Il file non si apre come Excel: ${e?.message ?? e}` }, { status: 400 });
  }
  const withWorkouts = parsed.programs.filter((p) => p.weeks.some((w) => w.workouts.length));
  if (!withWorkouts.length)
    return NextResponse.json({ error: "Nel file non trovo nessuna scheda con allenamenti" }, { status: 400 });
  await saveWorkbook(file.name, buf);
  return NextResponse.json({ ok: true, programs: parsed.programs.map((p) => p.id) });
}
