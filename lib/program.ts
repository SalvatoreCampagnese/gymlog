import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseWorkbook } from "./parser";
import { latestWorkbook, workbookFile } from "./storage";
import { createAdminClient } from "./supabase/server";
import type { ProgramFile } from "./types";

export const PARSER_VERSION = "1";
const memo = new Map<string, ProgramFile>(); // workbook id -> parsed

export const emptyProgram = (): ProgramFile => ({ athlete: "", source: "", uploadedAt: null, programs: [] });

/** The client's active plan (newest workbook), parsed. Empty when the trainer has not uploaded one yet. */
export async function loadProgram(sb: SupabaseClient, clientId: string): Promise<ProgramFile> {
  const wb = await latestWorkbook(sb, clientId);
  if (!wb) return emptyProgram();
  const hit = memo.get(wb.id);
  if (hit) return hit;
  let data = wb.parser_version === PARSER_VERSION ? (wb.parsed as ProgramFile | null) : null;
  if (!data) {
    // parsed JSON missing or from an older parser: parse again and keep it (service role: clients can't write workbooks)
    const file = await workbookFile(sb, clientId, wb.id);
    if (!file) return emptyProgram();
    data = await parseWorkbook(file.buf, file.name);
    data.uploadedAt = wb.uploaded_at;
    await createAdminClient().from("workbooks").update({ parsed: data, parser_version: PARSER_VERSION }).eq("id", wb.id);
  }
  data.uploadedAt = wb.uploaded_at;
  memo.set(wb.id, data);
  return data;
}
