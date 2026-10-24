import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { PROFILE_COLS, errorResponse, requireTrainer, type Profile } from "@/lib/session";
import { cleanName, num, sendMagicLink } from "@/lib/trainer";
import { updateState } from "@/lib/storage";
import { todayISO } from "@/lib/resolve";

export const dynamic = "force-dynamic";

// The trainer's clients, with their last activity and current plan
export async function GET() {
  try {
    const { sb, user } = await requireTrainer();
    const { data: clients, error } = await sb
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("trainer_id", user.id)
      .eq("role", "client")
      .order("last_name")
      .returns<Profile[]>();
    if (error) throw new Error(error.message);
    const ids = (clients ?? []).map((c) => c.id);
    const [states, books] = ids.length
      ? await Promise.all([
          sb.from("client_state").select("client_id, updated_at, version").in("client_id", ids),
          sb.from("workbooks").select("client_id, file_name, uploaded_at").in("client_id", ids).order("uploaded_at", { ascending: false }),
        ])
      : [{ data: [] as any[] }, { data: [] as any[] }];
    const out = (clients ?? []).map((c) => {
      const st = states.data?.find((s: any) => s.client_id === c.id);
      const wb = books.data?.find((b: any) => b.client_id === c.id);
      return {
        ...c,
        lastActivity: st && Number(st.version) > 0 ? st.updated_at : null,
        plan: wb ? { file_name: wb.file_name, uploaded_at: wb.uploaded_at } : null,
      };
    });
    return NextResponse.json({ clients: out });
  } catch (e) {
    return errorResponse(e);
  }
}

// New client: account with the password chosen by the trainer + magic link email
export async function POST(req: Request) {
  try {
    const { user } = await requireTrainer();
    const b = await req.json().catch(() => ({}));
    const first_name = cleanName(b.first_name);
    const last_name = cleanName(b.last_name);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const height_cm = num(b.height_cm, 100, 250);
    const weight_kg = num(b.weight_kg, 30, 300);
    const errors: string[] = [];
    if (!first_name) errors.push("il nome");
    if (!last_name) errors.push("il cognome");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("un'email valida");
    if (password.length < 8) errors.push("una password di almeno 8 caratteri");
    if (b.height_cm && height_cm === null) errors.push("un'altezza tra 100 e 250 cm");
    if (b.weight_kg && weight_kg === null) errors.push("un peso tra 30 e 300 kg");
    if (errors.length) return NextResponse.json({ error: `Serve ${errors.join(", ")}.` }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, height_cm, start_weight_kg: weight_kg },
      app_metadata: { trainer_id: user.id }, // read by the handle_new_user trigger
    });
    if (error || !data.user) {
      const dup = /already|registered|exists/i.test(error?.message ?? "");
      return NextResponse.json(
        { error: dup ? "Esiste già un account con questa email." : `Non riesco a creare l'account: ${error?.message}` },
        { status: dup ? 409 : 500 }
      );
    }
    // starting weight also goes into the diary, so the weight chart starts from it
    if (weight_kg) await updateState(admin, data.user.id, (s) => void (s.weight[todayISO()] = weight_kg)).catch(() => {});
    const mailError = await sendMagicLink(req, email);
    return NextResponse.json({ id: data.user.id, emailSent: !mailError, emailError: mailError });
  } catch (e) {
    return errorResponse(e);
  }
}
