import { NextResponse } from "next/server";
import { updateState } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/resolve";

export const dynamic = "force-dynamic";

// Receives Apple Health totals from an iOS Shortcut. Auth: ?token=<the client's personal health_token> (Shortcuts can't log in).
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
  const token = url.searchParams.get("token") ?? "";
  const admin = createAdminClient();
  const { data: owner } = /^[\w-]{20,}$/.test(token)
    ? await admin.from("profiles").select("id").eq("health_token", token).eq("role", "client").maybeSingle()
    : { data: null };
  if (!owner) return NextResponse.json({ error: "Token non valido" }, { status: 401 });
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
  const received: Record<string, unknown> = {};
  const rejected: string[] = [];

  // per metric: [field, max per day, how several values of the same day combine]
  const METRICS = [
    ["active", 8000, "sum"],
    ["resting", 5000, "sum"],
    ["steps", 120000, "sum"],
    ["exercise", 1440, "sum"],
    ["weight", 300, "last"],
  ] as const;
  type Day = { active?: number; resting?: number; steps?: number; exercise?: number; weight?: number };
  const days: Record<string, Day> = {};

  const multi = METRICS.some(([k]) => get(`${k}_dates`) !== undefined);
  if (multi) {
    // Simple shortcut: for each metric the list of values and the list of their dates
    // (Find Health Samples, last N days, grouped by day). Values are matched to dates by position.
    for (const [k, max, mode] of METRICS) {
      const vals = list(get(k));
      const dates = list(get(`${k}_dates`));
      if (!vals.length) continue;
      received[k] = vals.length;
      if (dates.length !== vals.length) {
        rejected.push(`${k}: ${vals.length} valori ma ${dates.length} date`);
        continue;
      }
      vals.forEach((raw, i) => {
        const day = dayOf(dates[i]);
        const v = num(raw);
        if (!day || v === undefined) return;
        const d = (days[day] ??= {});
        d[k] = mode === "sum" ? (d[k] ?? 0) + v : v;
      });
      for (const [day, d] of Object.entries(days)) {
        const v = d[k];
        if (v !== undefined && (v < 0 || v > max)) {
          rejected.push(`${k} ${day}`);
          delete d[k];
        }
      }
    }
  } else {
    // Old shortcut: one day (date, default today) with one total per metric
    const date = normDate(get("date"));
    const total = (v: unknown): number | undefined => {
      const parts = list(v).map(num).filter((x): x is number => x !== undefined);
      return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined;
    };
    const d: Day = {};
    for (const [k, max, mode] of METRICS) {
      const rv = get(k);
      if (rv === undefined) continue;
      received[k] = typeof rv === "string" ? rv.slice(0, 120) : rv;
      const raw = mode === "sum" ? total(rv) : num(list(rv)[0]);
      if (raw === undefined) continue;
      if (raw < 0 || raw > max) rejected.push(k);
      else d[k] = raw;
    }
    days[date] = d;
  }

  const now = new Date().toISOString();
  await updateState(admin, owner.id as string, (s) => {
    s.health ??= {};
    for (const [date, d] of Object.entries(days)) {
      const prev = { ...(s.health[date] ?? { updatedAt: "" }) };
      if ((prev.active ?? 0) > 8000) delete prev.active;
      if ((prev.resting ?? 0) > 5000) delete prev.resting;
      if ((prev.steps ?? 0) > 120000) delete prev.steps;
      if (d.active === undefined && d.resting === undefined && d.steps === undefined && d.exercise === undefined && d.weight === undefined) continue;
      s.health[date] = {
        ...prev,
        ...(d.active !== undefined ? { active: Math.round(d.active) } : {}),
        ...(d.resting !== undefined ? { resting: Math.round(d.resting) } : {}),
        ...(d.steps !== undefined ? { steps: Math.round(d.steps) } : {}),
        ...(d.exercise !== undefined ? { exerciseMin: Math.round(d.exercise) } : {}),
        updatedAt: now,
      };
      if (d.weight !== undefined && d.weight > 30 && d.weight < 300) s.weight[date] = Math.round(d.weight * 10) / 10;
    }
  });

  const round = (d: Day) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Math.round((v as number) * 10) / 10]));
  return NextResponse.json({
    ok: rejected.length === 0,
    giorni: Object.fromEntries(Object.entries(days).sort().map(([k, d]) => [k, round(d)])),
    ...(rejected.length ? { scartati: rejected, ricevuti: received } : {}),
  });
}

/** Shortcuts sends lists as JSON arrays or as text with one item per line. */
function list(v: unknown): string[] {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

const IT_MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
/** The calendar day of a sample's start date: ISO 8601 ("2026-10-25T00:00:00+01:00"), 25/10/2026 or "25 ott 2026". */
function dayOf(s: string): string | null {
  const t = (s ?? "").trim().toLowerCase();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\s+([a-zà-ù]{3})[a-zà-ù]*\.?\s+(\d{4})/);
  if (m && IT_MONTHS.includes(m[2])) return `${m[3]}-${String(IT_MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export const POST = handle;
export const GET = handle;
