import "server-only";
import { createHash } from "crypto";
import { parseWorkbook } from "./parser";
import { readJsonCache, readWorkbook, writeJsonCache } from "./storage";
import type { ProgramFile } from "./types";

const PARSER_VERSION = "1";
let cache: { key: string; data: ProgramFile } | null = null;

export async function loadProgram(): Promise<ProgramFile> {
  const wb = await readWorkbook();
  if (cache && cache.key === wb.key) return cache.data;
  // parsing a big workbook takes seconds: keep the parsed JSON next to it
  const name = "program-" + createHash("sha1").update(PARSER_VERSION + wb.key).digest("hex").slice(0, 16);
  let data = await readJsonCache<ProgramFile>(name);
  if (!data) {
    data = await parseWorkbook(wb.buf, wb.source);
    data.uploadedAt = wb.uploadedAt;
    await writeJsonCache(name, data);
  }
  cache = { key: wb.key, data };
  return data;
}
