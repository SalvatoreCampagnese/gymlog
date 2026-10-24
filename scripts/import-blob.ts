/**
 * Copies the data of the old single-user GymLog (Vercel Blob) into a client account on Supabase.
 *
 *   npx tsx scripts/import-blob.ts --email tuo@indirizzo.it [--dry-run] [--keep-health-token]
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN        token of the old Blob store (Vercel > Storage > the store > .env.local)
 *   NEXT_PUBLIC_SUPABASE_URL     Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    service role key (bypasses RLS: keep it private)
 *   HEALTH_TOKEN                 optional, with --keep-health-token: the old Apple Health token,
 *                                so the existing iPhone shortcut keeps working after changing the domain
 *
 * The client must already exist (created by the trainer from the app). Their diary is replaced by the
 * imported one; the Excel files in Blob become their plan history, oldest first, newest active.
 */
import { list, get } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";
import { parseWorkbook } from "../lib/parser";

const PARSER_VERSION = "1"; // keep in sync with lib/program.ts

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = arg("--email")?.toLowerCase();
const dry = args.includes("--dry-run");
const keepToken = args.includes("--keep-health-token");

function need(name: string) {
  const v = process.env[name];
  if (!v) {
    console.error(`Manca la variabile ${name}`);
    process.exit(1);
  }
  return v;
}

async function readAll(pathname: string): Promise<Buffer | null> {
  const res = await get(pathname, { access: "private", useCache: false }).catch(() => null);
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

async function main() {
  if (!email) {
    console.error("Uso: npx tsx scripts/import-blob.ts --email cliente@email.it [--dry-run] [--keep-health-token]");
    process.exit(1);
  }
  need("BLOB_READ_WRITE_TOKEN");
  const sb = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: client, error } = await sb.from("profiles").select("id, role, trainer_id, first_name, last_name").eq("email", email).maybeSingle();
  if (error) throw error;
  if (!client) throw new Error(`Nessun utente con email ${email}: crealo prima dall'area del personal trainer`);
  if (client.role !== "client") throw new Error(`${email} non è un cliente`);
  console.log(`Cliente: ${client.first_name} ${client.last_name} (${client.id})`);

  // 1. diary
  const stateBuf = await readAll("state/state.json");
  if (!stateBuf) throw new Error("state/state.json non trovato nel Blob");
  const state = JSON.parse(stateBuf.toString("utf8"));
  delete state.pantry; // the fridge no longer exists
  state.updatedAt = new Date().toISOString();
  console.log(
    `Diario: ${state.sessions?.length ?? 0} allenamenti, ${Object.keys(state.food ?? {}).length} giorni di pasti, ` +
      `${Object.keys(state.weight ?? {}).length} pesate, ${Object.keys(state.health ?? {}).length} giorni Salute`
  );

  // 2. workbooks, oldest first so the newest ends up active
  const { blobs } = await list({ prefix: "sheets/" });
  const sheets = blobs.sort((a, b) => +new Date(a.uploadedAt) - +new Date(b.uploadedAt));
  console.log(`Schede nel Blob: ${sheets.length}`);

  if (dry) {
    console.log("--dry-run: nessuna modifica fatta.");
    return;
  }

  const { data: cur } = await sb.from("client_state").select("version").eq("client_id", client.id).maybeSingle();
  if (cur) {
    const { error: e } = await sb.from("client_state").update({ data: state, version: Number(cur.version) + 1, updated_at: state.updatedAt }).eq("client_id", client.id);
    if (e) throw e;
  } else {
    const { error: e } = await sb.from("client_state").insert({ client_id: client.id, data: state, version: 1 });
    if (e) throw e;
  }
  console.log("Diario importato.");

  for (const b of sheets) {
    const buf = await readAll(b.pathname);
    if (!buf) {
      console.warn(`  saltato ${b.pathname}: non leggibile`);
      continue;
    }
    const name = b.pathname.replace(/^sheets\/\d+-/, "");
    const uploadedAt = new Date(b.uploadedAt).toISOString();
    const parsed = await parseWorkbook(buf, name);
    parsed.uploadedAt = uploadedAt;
    const { error: e } = await sb.from("workbooks").insert({
      client_id: client.id,
      file_name: name,
      file: "\\x" + buf.toString("hex"),
      program_titles: parsed.programs.map((p) => p.title),
      parsed,
      parser_version: PARSER_VERSION,
      note: "Importata dalla versione precedente di GymLog",
      uploaded_by: client.trainer_id,
      uploaded_at: uploadedAt,
    });
    if (e) throw e;
    console.log(`  scheda importata: ${name} (${uploadedAt.slice(0, 10)})`);
  }

  if (keepToken) {
    const token = need("HEALTH_TOKEN");
    const { error: e } = await sb.from("profiles").update({ health_token: token }).eq("id", client.id);
    if (e) throw e;
    console.log("Chiave Apple Salute mantenuta: nel comando rapido basta cambiare il dominio.");
  }
  console.log("Fatto.");
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
