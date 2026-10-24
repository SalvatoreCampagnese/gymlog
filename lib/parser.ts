import ExcelJS from "exceljs";
import type { DietDay, Exercise, Program, ProgramFile, Week, Workout } from "./types";

type Grid = { get: (r: number, c: number) => string; maxRow: number; maxCol: number };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((t: any) => t.text).join("");
    if ("result" in o) return o.result === undefined || o.result === null ? "" : cellText(o.result);
    if ("text" in o) return String(o.text);
    if ("error" in o) return "";
  }
  return String(v);
}

function makeGrid(ws: ExcelJS.Worksheet): Grid {
  const map = new Map<string, string>();
  let maxRow = 0;
  let maxCol = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      // merged slave cells report the master's value: skip them
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
      const t = cellText(cell.value).replace(/\s+/g, " ").trim();
      if (!t) return;
      map.set(`${r}:${c}`, t);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    });
  });
  return { get: (r, c) => map.get(`${r}:${c}`) ?? "", maxRow, maxCol };
}

const norm = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const DAYS = ["LUNEDI", "MARTEDI", "MERCOLEDI", "GIOVEDI", "VENERDI", "SABATO", "DOMENICA"];

export function parseRest(raw: string): { sec: number; max?: number } {
  const s = raw.replace(/’|‘|`|´/g, "'").replace(/\s/g, "");
  const parts = s.split("/").filter(Boolean);
  const one = (p: string): number | null => {
    let m = p.match(/^(\d+)''$/) || p.match(/^(\d+)(?:sec|s|")$/i);
    if (m) return parseInt(m[1], 10);
    m = p.match(/^(\d+)'(\d+)?(?:'')?$/);
    if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
    m = p.match(/^(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      return n <= 5 ? n * 60 : n;
    }
    return null;
  };
  const vals = parts.map(one).filter((x): x is number => x !== null);
  if (!vals.length) return { sec: 90 };
  if (vals.length > 1) return { sec: Math.min(...vals), max: Math.max(...vals) };
  return { sec: vals[0] };
}

function toNum(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function inferDates(name: string, now = new Date()): { start: string | null; end: string | null } {
  const m = name.match(/(\d{1,2})[-.](\d{1,2})\s*_\s*(\d{1,2})[-.](\d{1,2})/);
  if (!m) return { start: null, end: null };
  const [d1, m1, d2, m2] = m.slice(1).map((x) => parseInt(x, 10));
  let year = now.getFullYear();
  const startCandidate = new Date(Date.UTC(year, m1 - 1, d1));
  // A program starting more than ~3 months in the future belongs to last year
  if (startCandidate.getTime() - now.getTime() > 1000 * 60 * 60 * 24 * 90) year -= 1;
  const endYear = m2 < m1 ? year + 1 : year;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${year}-${pad(m1)}-${pad(d1)}`, end: `${endYear}-${pad(m2)}-${pad(d2)}` };
}

type Block = { index: number; label: string; c0: number; c1: number };

function findBlocks(g: Grid): Block[] {
  for (let r = 1; r <= Math.min(g.maxRow, 40); r++) {
    const found: { c: number; label: string }[] = [];
    for (let c = 1; c <= g.maxCol; c++) {
      const t = g.get(r, c);
      if (/^SETTIMANA\s*\d+/i.test(t)) found.push({ c, label: t });
    }
    if (found.length) {
      return found.map((f, i) => ({
        index: i + 1,
        label: `Settimana ${i + 1}`,
        c0: f.c,
        c1: i + 1 < found.length ? found[i + 1].c - 1 : g.maxCol,
      }));
    }
  }
  return [];
}

function rowTexts(g: Grid, r: number, b: Block, from = b.c0): { c: number; t: string }[] {
  const out: { c: number; t: string }[] = [];
  for (let c = from; c <= b.c1; c++) {
    const t = g.get(r, c);
    if (t) out.push({ c, t });
  }
  return out;
}

function parseWorkouts(g: Grid, b: Block): Workout[] {
  const starts: { r: number; key: string; title: string }[] = [];
  for (let r = 1; r <= g.maxRow; r++) {
    for (let c = b.c0; c <= Math.min(b.c1, b.c0 + 6); c++) {
      const t = g.get(r, c);
      const m = t.match(/^ALLENAMENTO\s+([A-Z])\b/i);
      if (m) {
        starts.push({ r, key: m[1].toUpperCase(), title: t });
        break;
      }
    }
  }
  const workouts: Workout[] = [];
  starts.forEach((s, i) => {
    const limit = i + 1 < starts.length ? starts[i + 1].r - 1 : g.maxRow;
    let header = -1;
    for (let r = s.r + 1; r <= limit; r++) {
      if (norm(g.get(r, b.c0)) === "ESERCIZIO") {
        header = r;
        break;
      }
    }
    if (header < 0) return;

    let focus = "";
    for (let r = s.r + 1; r < header && !focus; r++) {
      for (const { t } of rowTexts(g, r, b)) {
        const n = norm(t);
        if (n.startsWith("REPORT") || n === "RISCALDAMENTO" || n === "ALLENANTI") continue;
        focus = t;
        break;
      }
    }

    // Column map from header labels
    const labels = rowTexts(g, header, b).map(({ c, t }) => ({ c, n: norm(t) }));
    const restCol = labels.find((l) => l.n === "RECUPERO")?.c ?? -1;
    const tempoCol = labels.find((l) => l.n.replace(/\s/g, "").startsWith("C-P-E-P"))?.c ?? -1;
    const bufferCol = labels.find((l) => l.n === "BUFFER")?.c ?? -1;
    const serie = labels.filter((l) => l.n === "SERIE").map((l) => l.c);
    const reps = labels.filter((l) => l.n === "RIPETIZIONI").map((l) => l.c);
    const carico = labels.filter((l) => l.n === "CARICO").map((l) => l.c);
    const warmRepsCol = labels.find((l) => l.n === "REPS")?.c ?? -1;

    const workSerie = serie.filter((c) => c < restCol).pop() ?? -1;
    const warmSerie = serie.filter((c) => c < workSerie)[0] ?? -1;
    const reportSerie = serie.find((c) => c > restCol) ?? -1;
    const workReps = reps.find((c) => c > workSerie && c < restCol) ?? -1;
    const workLoad = carico.find((c) => c > workReps && c < restCol) ?? -1;
    const warmLoad = carico.find((c) => c > warmSerie && c < workSerie) ?? -1;
    const reportReps = reps.find((c) => c > reportSerie) ?? -1;
    const reportLoad = carico.find((c) => c > reportReps) ?? -1;

    const range = (a: number, z: number) => {
      const out: number[] = [];
      if (a < 0 || z < a) return out;
      for (let c = a; c <= z; c++) out.push(c);
      return out;
    };
    const repsCols = range(workReps, workLoad - 1);
    const loadCols = range(workLoad, restCol - 1);
    const repRepsCols = range(reportReps, reportLoad - 1);
    const repLoadCols = reportLoad > 0 ? range(reportLoad, reportLoad + Math.max(repRepsCols.length, 3) - 1) : [];

    const exercises: Exercise[] = [];
    const volume: string[] = [];
    const cardio: string[] = [];
    let cardioRow = -1;

    for (let r = header + 1; r <= limit; r++) {
      const name = g.get(r, b.c0);
      const n = norm(name);
      if (n.startsWith("CARDIO")) {
        cardioRow = r;
        break;
      }
      if (n.startsWith("GESTIONE")) break;
      if (!name) continue;
      if (/^\d+$/.test(n)) {
        rowTexts(g, r, b, b.c0 + 1).forEach(({ t }) => t && volume.push(t));
        continue;
      }
      const setsN = parseInt(g.get(r, workSerie) || "0", 10) || 0;
      let repsArr = repsCols.map((c) => g.get(r, c)).filter(Boolean);
      let loadsArr = loadCols.map((c) => g.get(r, c)).filter(Boolean);
      if (!setsN && !repsArr.length) continue;
      const sets = setsN || repsArr.length || 1;
      const expand = (arr: string[]): string[] => {
        if (arr.length === 1 && sets > 1) {
          const parts = arr[0].split(/\s*-+\s*/);
          if (parts.length === sets && sets >= 3 && parts.every(Boolean)) return parts;
          return Array(sets).fill(arr[0]);
        }
        const out = arr.slice(0, sets);
        while (out.length < sets) out.push(out[out.length - 1] ?? "");
        return out;
      };
      repsArr = expand(repsArr);
      loadsArr = loadsArr.length ? expand(loadsArr) : Array(sets).fill("");
      repsArr = repsArr.map((x) => x.replace(/--+/g, "-"));
      // optional %1RM row just above the exercise (older sheets)
      let loadPct: string[] | undefined;
      for (const rr of [r - 2, r - 1]) {
        const pc = loadCols.map((c) => g.get(rr, c)).filter((x) => /%$/.test(x));
        if (pc.length) loadPct = pc.slice(0, sets);
      }
      const restRaw = g.get(r, restCol);
      const rest = parseRest(restRaw);
      const warm =
        warmSerie > 0 && g.get(r, warmSerie)
          ? { sets: g.get(r, warmSerie), reps: g.get(r, warmRepsCol), load: g.get(r, warmLoad) }
          : undefined;
      exercises.push({
        id: `${s.key}-${r}`,
        row: r,
        name: name.replace(/\s+-\s*$/, "").trim(),
        warmup: warm,
        sets,
        reps: repsArr,
        loads: loadsArr,
        loadPct,
        rest: restRaw,
        restSec: rest.sec,
        restMaxSec: rest.max,
        tempo: g.get(r, tempoCol),
        buffer: g.get(r, bufferCol),
        report: { setsCol: reportSerie, repsCols: repRepsCols, loadsCols: repLoadCols },
      });
    }

    if (cardioRow > 0) {
      for (let r = cardioRow; r <= Math.min(cardioRow + 3, limit); r++) {
        const parts = rowTexts(g, r, b)
          .map(({ t }) => t)
          .filter((t) => norm(t) !== "CARDIO");
        if (parts.length) cardio.push(parts.join(" "));
        if (r > cardioRow && norm(g.get(r, b.c0)) && !norm(g.get(r, b.c0)).startsWith("CARDIO")) break;
      }
    }

    workouts.push({ key: s.key, title: s.title, focus, exercises, cardio, volume });
  });
  return workouts;
}

function parseDiet(g: Grid, b: Block): DietDay[] {
  const out: DietDay[] = [];
  let headerRow = -1;
  for (let r = 1; r <= g.maxRow; r++) {
    const d = norm(g.get(r, b.c0));
    const idx = DAYS.indexOf(d);
    if (idx < 0) continue;
    if (headerRow < 0) {
      for (let h = r - 1; h >= Math.max(1, r - 4); h--) {
        if (rowTexts(g, h, b).some(({ t }) => norm(t) === "CALORIE")) {
          headerRow = h;
          break;
        }
      }
      if (headerRow < 0) continue;
    }
    const labels = rowTexts(g, headerRow, b).map(({ c, t }) => ({ c, n: norm(t) }));
    const col = (k: string) => labels.find((l) => l.n.startsWith(k))?.c ?? -1;
    const cK = col("CALORIE"), cP = col("PROTEINE"), cC = col("CARBOIDRATI"), cF = col("GRASSI");
    const cW = col("H20") > 0 ? col("H20") : col("H2O"), cD = col("DATI");
    out.push({
      day: DAYS[idx].charAt(0) + DAYS[idx].slice(1).toLowerCase().replace(/i$/, "ì"),
      dow: idx + 1,
      kcal: toNum(g.get(r, cK)),
      protein: toNum(g.get(r, cP)),
      carbs: toNum(g.get(r, cC)),
      fat: toNum(g.get(r, cF)),
      water: cW > 0 ? g.get(r, cW) : "",
      note: cD > 0 ? g.get(r, cD) : "",
    });
    if (out.length === 7) break;
  }
  return out;
}

function parseSectionLines(g: Grid, b: Block, title: RegExp, stop: RegExp): string[] {
  let start = -1;
  for (let r = 1; r <= g.maxRow; r++) {
    if (title.test(norm(g.get(r, b.c0)))) {
      start = r;
      break;
    }
  }
  if (start < 0) return [];
  const lines: string[] = [];
  for (let r = start + 1; r <= Math.min(g.maxRow, start + 40); r++) {
    const t = g.get(r, b.c0);
    if (t && stop.test(norm(t))) break;
    if (t) lines.push(t);
  }
  return lines;
}

function parseSupplements(g: Grid, b: Block) {
  const meals = /^(COLAZIONE|SPUNTINO|PRANZO|MERENDA|CENA|PRE-NANNA|PRE NANNA|INTRA|POST)/;
  let start = -1;
  for (let r = 1; r <= g.maxRow; r++) {
    if (norm(g.get(r, b.c0)).startsWith("CONSIGLI INTEGRAZIONE")) {
      start = r;
      break;
    }
  }
  if (start < 0) return [];
  const out: { meal: string; text: string }[] = [];
  for (let r = start + 1; r <= Math.min(g.maxRow, start + 30); r++) {
    const t = g.get(r, b.c0);
    if (t && /^N\.B/.test(norm(t))) break;
    if (t && meals.test(norm(t))) {
      const txt: string[] = [];
      for (let rr = r; rr <= r + 2; rr++) {
        rowTexts(g, rr, b, b.c0 + 1).forEach(({ t: x }) => txt.push(x));
      }
      out.push({ meal: t, text: txt.join(" ").trim() });
    }
  }
  return out;
}

export async function parseWorkbook(buf: ArrayBuffer | Buffer, source = "bundled"): Promise<ProgramFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const programs: Program[] = [];
  let athlete = "";
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== "visible") return;
    const g = makeGrid(ws);
    const { start, end } = inferDates(ws.name);
    const notes: string[] = [];
    for (let r = 1; r <= 6; r++) {
      const t = g.get(r, 1);
      if (!t) continue;
      const n = norm(t);
      if (r === 1 && /^[A-Z ]+$/.test(n) && n.split(" ").length <= 4 && !n.includes("SETTIMANE")) {
        athlete = athlete || t;
        continue;
      }
      if (n === "NOTA BENE" || n.startsWith("BREVE DESCRIZIONE") || n.startsWith("SETTIMANA")) continue;
      notes.push(t);
    }
    const blocks = findBlocks(g);
    const weeks: Week[] = blocks.map((b) => ({
      index: b.index,
      label: b.label,
      workouts: parseWorkouts(g, b),
      diet: parseDiet(g, b),
    }));
    // focus (SPINTA/TIRATA) is usually written only in week 1
    weeks.forEach((w) =>
      w.workouts.forEach((wo) => {
        if (!wo.focus) wo.focus = weeks[0]?.workouts.find((x) => x.key === wo.key)?.focus ?? "";
      })
    );
    const b0 = blocks[0];
    programs.push({
      id: ws.name,
      title: start && end ? `${fmt(start)} – ${fmt(end)}` : ws.name,
      startDate: start,
      endDate: end,
      notes,
      weeks,
      guidelines: b0 ? parseSectionLines(g, b0, /^CONSIGLI E LINEE GUIDA/, /^(CONSIGLI INTEGRAZIONE|SERIE ALLENANTI)/) : [],
      supplements: b0 ? parseSupplements(g, b0) : [],
    });
  });
  return { athlete: titleCase(athlete), source, uploadedAt: null, programs };
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
function fmt(iso: string) {
  const [, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return `${d} ${MONTHS[m - 1]}`;
}
