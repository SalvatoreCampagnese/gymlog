import { NextResponse } from "next/server";
import { updateState } from "@/lib/storage";
import { todayISO } from "@/lib/resolve";

export const dynamic = "force-dynamic";

// Receives Apple Health totals from an iOS Shortcut. Auth: ?token=HEALTH_TOKEN (Shortcuts can't log in).
// Accepts JSON body or query params: date, active, resting, steps, exercise, weight.
// Values may arrive as "523,4 kcal" or "8.120 passi": parse them loosely.
function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return undefined;
  // "8.120" (it thousands) vs "81.6" (decimal): a dot followed by exactly 3 digits and no comma = thousands
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(/\.(?=.*[.,])/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function normDate(v: unknown): string {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return todayISO();
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const token = process.env.HEALTH_TOKEN;
  if (!token || url.searchParams.get("token") !== token)
    return NextResponse.json({ error: "Token non valido" }, { status: 401 });
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    const text = await req.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = Object.fromEntries(new URLSearchParams(text));
    }
  }
  const get = (k: string) => body[k] ?? url.searchParams.get(k) ?? undefined;
  const date = normDate(get("date"));
  // drop impossible values (e.g. a whole list of samples turned into one number by Shortcuts)
  const inRange = (v: number | undefined, max: number) => (v !== undefined && v >= 0 && v <= max ? v : undefined);
  const rejected: string[] = [];
  // Shortcuts may send a list (one value per sample/hour) as an array or as newline-separated text: sum it
  const total = (v: unknown): number | undefined => {
    if (Array.isArray(v)) {
      const parts = v.map(num).filter((x): x is number => x !== undefined);
      return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined;
    }
    if (typeof v === "string" && /\n/.test(v.trim())) return total(v.trim().split(/\r?\n/));
    return num(v);
  };
  const received: Record<string, unknown> = {};
  const pick = (k: string, max: number, sum = true) => {
    const rv = get(k);
    const raw = sum ? total(rv) : num(Array.isArray(rv) ? rv[0] : rv);
    if (rv !== undefined) received[k] = typeof rv === "string" ? rv.slice(0, 120) : rv;
    const v = inRange(raw, max);
    if (raw !== undefined && v === undefined) rejected.push(k);
    return v;
  };
  const active = pick("active", 8000);
  const resting = pick("resting", 5000);
  const steps = pick("steps", 120000);
  const exerciseMin = pick("exercise", 1440);
  const weight = pick("weight", 300, false);
  await updateState((s) => {
    s.health ??= {};
    const prev = { ...(s.health[date] ?? { updatedAt: "" }) };
    // clean up values saved before the range check existed
    if ((prev.active ?? 0) > 8000) delete prev.active;
    if ((prev.resting ?? 0) > 5000) delete prev.resting;
    if ((prev.steps ?? 0) > 120000) delete prev.steps;
    s.health[date] = {
      ...prev,
      ...(active !== undefined ? { active: Math.round(active) } : {}),
      ...(resting !== undefined ? { resting: Math.round(resting) } : {}),
      ...(steps !== undefined ? { steps: Math.round(steps) } : {}),
      ...(exerciseMin !== undefined ? { exerciseMin: Math.round(exerciseMin) } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (weight !== undefined && weight > 30 && weight < 300) s.weight[date] = Math.round(weight * 10) / 10;
  });
  return NextResponse.json({
    ok: rejected.length === 0,
    date,
    active,
    resting,
    steps,
    exercise: exerciseMin,
    weight,
    ...(rejected.length ? { scartati: rejected, motivo: "valori impossibili: ogni campo deve usare il proprio Valore", ricevuti: received } : {}),
  });
}

export const POST = handle;
export const GET = handle;
