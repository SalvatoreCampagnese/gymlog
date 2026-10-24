import type { DietDay, Exercise, Program, ProgramFile, Session, Week } from "./types";

export function todayISO(d = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(d);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((+new Date(a + "T12:00:00Z") - +new Date(b + "T12:00:00Z")) / 86400000);
}

/** 1 = Monday ... 7 = Sunday */
export function dow(iso: string): number {
  const d = new Date(iso + "T12:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - dow(iso));
}

const DAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAY_NAMES[dow(iso) - 1]} ${d} ${MONTHS[m - 1]}`;
}
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

export const usable = (p: Program) => p.weeks.some((w) => w.workouts.length);

/** Which program and week apply on a given date. */
export function resolveDate(pf: ProgramFile, date: string): { program: Program; week: Week; upcoming: boolean } | null {
  const list = pf.programs.filter((p) => usable(p) && p.startDate).sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
  if (!list.length) {
    const p = pf.programs.find(usable);
    return p ? { program: p, week: p.weeks[0], upcoming: false } : null;
  }
  // A program starting within the next 7 days takes over once the previous one has ended
  for (const p of list) {
    const until = diffDays(p.startDate!, date);
    if (until > 0 && until <= 7) {
      const prev = list.filter((x) => x.startDate! < p.startDate!).pop();
      if (!prev || !prev.endDate || prev.endDate < date) return { program: p, week: p.weeks[0], upcoming: true };
    }
  }
  let chosen = list[0];
  for (const p of list) if (p.startDate! <= date) chosen = p;
  const idx = Math.max(0, Math.floor(diffDays(date, chosen.startDate!) / 7));
  const week = chosen.weeks[Math.min(idx, chosen.weeks.length - 1)];
  return { program: chosen, week, upcoming: chosen.startDate! > date };
}

export function dietFor(week: Week | undefined, date: string): DietDay | undefined {
  return week?.diet.find((d) => d.dow === dow(date));
}

/** Next workout to do this week: the first key not yet done since Monday. */
export function nextWorkoutKey(week: Week, sessions: Session[], programId: string, date: string): string {
  const mon = mondayOf(date);
  const done = new Set(
    sessions
      .filter((s) => s.programId === programId && s.week === week.index && s.finishedAt && s.date >= mon)
      .map((s) => s.workout)
  );
  return week.workouts.find((w) => !done.has(w.key))?.key ?? week.workouts[0]?.key ?? "A";
}

export function sessionsFor(sessions: Session[], programId: string, week: number) {
  return sessions.filter((s) => s.programId === programId && s.week === week);
}

/** Last logged sets for an exercise (same program, earlier or same week). */
export function lastSetsFor(sessions: Session[], programId: string, exerciseId: string, exerciseName: string, beforeId?: string) {
  const sorted = [...sessions].filter((s) => s.id !== beforeId).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const s of sorted) {
    const ex =
      (s.programId === programId && s.exercises.find((e) => e.exerciseId === exerciseId)) ||
      s.exercises.find((e) => normName(e.name) === normName(exerciseName));
    if (ex && ex.sets.some((x) => x.done)) return { session: s, sets: ex.sets.filter((x) => x.done) };
  }
  return null;
}

export const normName = (s: string) => s.toUpperCase().replace(/-\s*DROP SET\s*-?/g, "").replace(/[^A-Z0-9°]+/g, " ").trim();

export function fmtSec(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, Math.round(s)) % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function cleanLoad(v: string): string {
  const t = (v || "").trim();
  if (/^p\.?\s*c\.?$/i.test(t)) return "corpo libero";
  return t;
}

export function loadUnit(v: string): string {
  const t = (v || "").trim();
  if (!t || /^p\.?\s*c/i.test(t)) return "";
  return /\d$/.test(t) ? " kg" : "";
}

export function prettyName(s: string): string {
  const lower = s.toLowerCase().replace(/\s+-\s+/g, " – ").replace(/ - /g, " – ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function sentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if (t !== t.toUpperCase()) return t;
  const l = t.toLowerCase();
  return l.replace(/(^\s*|[.!?]\s+|\)\s+)([a-zà-ù])/g, (_m, a, b) => a + b.toUpperCase());
}

export function targetText(e: Exercise) {
  const reps = e.reps.every((r) => r === e.reps[0]) ? e.reps[0] : e.reps.join("/");
  const loads = e.loads.filter(Boolean);
  const load = !loads.length ? "" : loads.every((l) => l === loads[0]) ? cleanLoad(loads[0]) + loadUnit(loads[0]) : loads.map(cleanLoad).join("/") + loadUnit(loads[0]);
  return { sets: `${e.sets} × ${reps.toLowerCase()}`, load };
}


/** Reps written as a duration ("1'30", "45''", "45\"", "60 sec", "1 min") -> seconds; otherwise null. */
export function durationSec(raw: string): number | null {
  const t = (raw || "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, "").replace(/”|“/g, '"');
  let m = t.match(/^(\d+)'(\d{1,2})?(?:''|")?$/);
  if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  m = t.match(/^(\d+)(?:''|"|s|sec|secondi)$/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/^(\d+)(?:min|minuti|minuto|m)$/);
  if (m) return parseInt(m[1], 10) * 60;
  return null;
}

/** 90 -> "1'30", 45 -> "45''" */
export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}'${s ? String(s).padStart(2, "0") : ""}` : `${s}''`;
}

/** weight as shown: scale reading + correction, rounded to 0.1 kg */
export function shownWeight(kg: number, offset?: number): number {
  return Math.round((kg + (offset ?? 0)) * 10) / 10;
}
