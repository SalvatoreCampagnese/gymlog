import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyState, type AppState } from "./types";

// ---------- bytea helpers (PostgREST sends bytea as "\x<hex>") ----------

export const toBytea = (buf: Buffer) => "\\x" + buf.toString("hex");
export function fromBytea(v: unknown): Buffer {
  const s = String(v ?? "");
  return Buffer.from(s.startsWith("\\x") ? s.slice(2) : s, "hex");
}

// ---------- Client diary (sessions, food, weight, health...) ----------

export async function readState(sb: SupabaseClient, clientId: string): Promise<{ state: AppState; version: number | null }> {
  const { data, error } = await sb.from("client_state").select("data, version").eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { state: emptyState(), version: null };
  return { state: { ...emptyState(), ...(data.data as Partial<AppState>) }, version: Number(data.version) };
}

/** Read-modify-write with optimistic locking on the version column. */
export async function updateState(sb: SupabaseClient, clientId: string, mutate: (s: AppState) => void): Promise<AppState> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, version } = await readState(sb, clientId);
    mutate(state);
    state.updatedAt = new Date().toISOString();
    if (version === null) {
      const { error } = await sb.from("client_state").insert({ client_id: clientId, data: state, version: 1 });
      if (!error) return state;
    } else {
      const { data, error } = await sb
        .from("client_state")
        .update({ data: state, version: version + 1, updated_at: state.updatedAt })
        .eq("client_id", clientId)
        .eq("version", version)
        .select("version");
      if (error) throw new Error(error.message);
      if (data?.length) return state;
    }
    await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
  }
  throw new Error("Salvataggio in conflitto, riprova");
}

// ---------- Workbooks (the trainer's Excel files, newest = active) ----------

export type WorkbookMeta = {
  id: string;
  file_name: string;
  size_bytes: number;
  program_titles: string[];
  note: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};
const META_COLS = "id, file_name, size_bytes, program_titles, note, uploaded_at, uploaded_by";

export async function listWorkbooks(sb: SupabaseClient, clientId: string): Promise<WorkbookMeta[]> {
  const { data, error } = await sb.from("workbooks").select(META_COLS).eq("client_id", clientId).order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkbookMeta[];
}

export async function latestWorkbook(sb: SupabaseClient, clientId: string) {
  const { data, error } = await sb
    .from("workbooks")
    .select(META_COLS + ", parsed, parser_version")
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as (WorkbookMeta & { parsed: unknown; parser_version: string | null }) | null;
}

/** The file itself. Without an id: the newest one. */
export async function workbookFile(sb: SupabaseClient, clientId: string, id?: string) {
  let q = sb.from("workbooks").select("id, file_name, file, uploaded_at").eq("client_id", clientId);
  q = id ? q.eq("id", id) : q.order("uploaded_at", { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id as string, name: data.file_name as string, uploadedAt: data.uploaded_at as string, buf: fromBytea(data.file) };
}
