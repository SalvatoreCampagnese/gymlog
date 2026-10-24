import "server-only";
import ExcelJS from "exceljs";
import type { AppState, ProgramFile, Session } from "./types";
import { parseWorkbook } from "./parser";

/**
 * Fills the "REPORT DA COMPILARE" columns of the trainer's workbook with the
 * reps/loads actually performed, using the latest session of each
 * (program, week, workout).
 */
export async function exportWithReport(
  buf: Buffer,
  state: AppState,
  onlyProgram?: string
): Promise<{ out: Buffer; filled: number }> {
  const parsed: ProgramFile = await parseWorkbook(buf);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);

  // latest session per program/week/workout
  const latest = new Map<string, Session>();
  for (const s of state.sessions) {
    if (onlyProgram && s.programId !== onlyProgram) continue;
    const k = `${s.programId}|${s.week}|${s.workout}`;
    const prev = latest.get(k);
    if (!prev || prev.startedAt < s.startedAt) latest.set(k, s);
  }

  let filled = 0;
  for (const s of latest.values()) {
    const prog = parsed.programs.find((p) => p.id === s.programId);
    const ws = wb.getWorksheet(s.programId);
    if (!prog || !ws) continue;
    const week = prog.weeks.find((w) => w.index === s.week);
    const wo = week?.workouts.find((w) => w.key === s.workout);
    if (!wo) continue;
    for (const log of s.exercises) {
      const ex = wo.exercises.find((e) => e.id === log.exerciseId);
      if (!ex || ex.report.setsCol < 0) continue;
      const done = log.sets.filter((x) => x.done);
      if (!done.length) continue;
      const row = ex.row;
      ws.getCell(row, ex.report.setsCol).value = done.length;
      writeSpread(ws, row, ex.report.repsCols, done.map((d) => numOrText(d.reps)));
      writeSpread(ws, row, ex.report.loadsCols, done.map((d) => numOrText(d.load)));
      filled++;
    }
  }
  const out = Buffer.from(await wb.xlsx.writeBuffer());
  return { out, filled };
}

function numOrText(v: string): string | number {
  const t = (v ?? "").trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : v ?? "";
}

// Report columns may be one merged cell (e.g. W:Y) or one cell per set.
function writeSpread(ws: ExcelJS.Worksheet, row: number, cols: number[], values: (string | number)[]) {
  if (!cols.length) return;
  const masters: string[] = [];
  for (const c of cols) {
    const cell = ws.getCell(row, c);
    const addr = cell.isMerged && cell.master ? cell.master.address : cell.address;
    if (!masters.includes(addr)) masters.push(addr);
  }
  if (masters.length >= values.length) {
    values.forEach((v, i) => (ws.getCell(masters[i]).value = v));
  } else {
    // fewer cells than sets: put everything into the first cell
    ws.getCell(masters[0]).value = values.join(" - ");
    for (let i = 1; i < masters.length; i++) ws.getCell(masters[i]).value = null;
  }
}
