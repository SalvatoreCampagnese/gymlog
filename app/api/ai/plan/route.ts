import { NextResponse } from "next/server";
import { aiJson } from "@/lib/openai";
import { GENERIC_FOODS } from "@/lib/generic-foods";
import { searchOFF } from "@/lib/off";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
type Known = { name: string; per100: Per100; source: string; grams?: number; qty?: string };

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    meals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          meal: { type: "string", description: "Uno dei pasti richiesti" },
          title: { type: "string", description: "Nome breve del piatto" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string", description: "Usa ESATTAMENTE il nome dell'elenco se l'alimento viene da lì" },
                grams: { type: "number" },
                kcal_100g: { type: "number" },
                protein_100g: { type: "number" },
                carbs_100g: { type: "number" },
                fat_100g: { type: "number" },
              },
              required: ["name", "grams", "kcal_100g", "protein_100g", "carbs_100g", "fat_100g"],
            },
          },
          how: { type: "string", description: "Preparazione in una frase" },
        },
        required: ["meal", "title", "items", "how"],
      },
    },
    note: { type: "string" },
  },
  required: ["meals", "note"],
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function findKnown(name: string, known: Known[]): Known | undefined {
  const n = norm(name);
  const words = n.split(" ").filter((w) => w.length > 2 && !["con", "di", "del", "della", "secca", "secco", "crudo", "cruda", "cotto", "cotta"].includes(w));
  return (
    known.find((k) => norm(k.name) === n) ||
    known.find((k) => norm(k.name).includes(n) || n.includes(norm(k.name))) ||
    // all meaningful words of the planned item appear in a known food (e.g. "pasta secca" -> "Pasta di semola (cruda)")
    (words.length ? known.find((k) => words.every((w) => norm(k.name).includes(w))) : undefined)
  );
}

// how big each meal is, relative to the others
const WEIGHT: Record<string, number> = { Colazione: 0.2, Spuntino: 0.1, Pranzo: 0.3, "Pre allenamento": 0.12, Cena: 0.3, Extra: 0.1 };

const sum = (items: any[]): Per100 =>
  items.reduce((a: Per100, i: any) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }), {
    kcal: 0, protein: 0, carbs: 0, fat: 0,
  });

const portion = (it: { per100: Per100 }, g: number) => ({
  grams: g,
  kcal: Math.round((it.per100.kcal * g) / 100),
  protein: Math.round((it.per100.protein * g) / 10) / 10,
  carbs: Math.round((it.per100.carbs * g) / 10) / 10,
  fat: Math.round((it.per100.fat * g) / 10) / 10,
});

export async function POST(req: Request) {
  const body = (await req.json()) as {
    remaining: Per100;
    meals: string[];
    pantry: Known[];
    favorites: Known[];
    preferences?: string;
    guidelines?: string[];
  };
  if (!body?.meals?.length) return NextResponse.json({ error: "Nessun pasto da organizzare" }, { status: 400 });

  const generic: Known[] = GENERIC_FOODS.map((g) => ({ name: g.name, per100: g.per100, source: "tabelle" }));
  const pantry = (body.pantry ?? []).filter((p) => p.per100).slice(0, 80);
  const favorites = (body.favorites ?? []).slice(0, 40);
  const known: Known[] = [...pantry.map((p) => ({ ...p, source: "frigo" })), ...favorites.map((f) => ({ ...f, source: "preferiti" })), ...generic];

  const list = (arr: Known[]) =>
    arr.map((k) => `- ${k.name}${k.qty ? ` (${k.qty})` : ""}: ${k.per100.kcal} kcal, P${k.per100.protein} C${k.per100.carbs} G${k.per100.fat} per 100 g`).join("\n");

  // split what is left today between the chosen meals
  const totalW = body.meals.reduce((a, m) => a + (WEIGHT[m] ?? 0.2), 0);
  const targets = body.meals.map((m) => {
    const f = (WEIGHT[m] ?? 0.2) / totalW;
    const r = body.remaining;
    return { meal: m, kcal: r.kcal * f, protein: r.protein * f, carbs: r.carbs * f, fat: r.fat * f };
  });
  const many = body.meals.length > 1;

  // one request per meal, in parallel: much faster than one big plan, and each stays on its own target
  const planOne = async (t: (typeof targets)[number]) => {
    const out = await aiJson<{ meals: any[]; note: string }>({
      name: "plan",
      schema,
      effort: "low",
      system:
        "Sei un nutrizionista sportivo italiano. Componi pasti semplici e realistici, da cucina di casa, rispettando i macro. Rispondi solo con il JSON richiesto.",
      content: [
        {
          type: "text",
          text: [
            `Organizza un solo pasto: ${t.meal}. Restituisci un unico elemento in "meals" con meal = "${t.meal}".`,
            many ? `Oggi organizzo anche: ${body.meals.filter((m) => m !== t.meal).join(", ")}, con richieste separate. Per non ripetere gli stessi alimenti in ogni pasto, dell'inventario usa al massimo 1 o 2 alimenti adatti a ${t.meal.toLowerCase()} e al massimo un terzo della quantità disponibile.` : "",
            `Macro di questo pasto: ${Math.round(t.kcal)} kcal, proteine ${Math.round(t.protein)} g, carboidrati ${Math.round(t.carbs)} g, grassi ${Math.round(t.fat)} g. Stai entro ±5% sulle kcal e privilegia le proteine.`,
            t.meal === "Colazione" ? "È una colazione: alimenti da colazione italiana o proteica." : "",
            pantry.length ? `Alimenti che ho in casa (usa per primi quelli adatti a questo pasto, senza superare le quantità; non forzare abbinamenti strani come carne a colazione):\n${list(pantry)}` : "Non ho un inventario della dispensa.",
            favorites.length ? `Alimenti che mangio spesso:\n${list(favorites)}` : "",
            "Se manca qualcosa usa alimenti comuni italiani. Indica i grammi a crudo per pasta, riso, carne e pesce. Porzioni troppo piccole sono l'errore più comune: controlla la somma delle kcal.",
            body.guidelines?.length ? `Linee guida del mio personal: ${body.guidelines.join(" ")}` : "",
            body.preferences ? `Preferenze per oggi: ${body.preferences}` : "",
            "Lascia note vuoto.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    const m = out.meals[0];
    return { target: t, title: m?.title ?? t.meal, how: m?.how ?? "", raw: (m?.items ?? []) as any[], note: out.note };
  };

  const results = await Promise.allSettled(targets.map(planOne));
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!ok.length) {
    const e = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    return NextResponse.json({ error: e?.reason?.message || "Non riesco a organizzare i pasti" }, { status: 502 });
  }

  try {
    // items not in my lists: look them up on Open Food Facts (best effort, short timeout)
    const unknown = Array.from(new Set(ok.flatMap((m) => m.raw.map((i) => i.name as string)).filter((n) => !findKnown(n, known))));
    const offHits = await Promise.all(
      unknown.slice(0, 10).map((n) =>
        Promise.race([
          searchOFF(n).then((r) => r.hits[0]).catch(() => undefined),
          new Promise<undefined>((r) => setTimeout(() => r(undefined), 5000)),
        ]).then((h) => (h ? ({ name: n, per100: h.per100, source: "Open Food Facts" } as Known) : undefined))
      )
    );
    offHits.forEach((h) => h && known.push(h));

    const meals = ok.map(({ target, title, how, raw }) => {
      // macros from the food database when known (fridge, my foods, base tables); AI estimate only as fallback
      let items = raw.map((it) => {
        const k = findKnown(it.name, known);
        const per100: Per100 = k ? k.per100 : { kcal: Math.round(it.kcal_100g), protein: it.protein_100g, carbs: it.carbs_100g, fat: it.fat_100g };
        return { name: k?.name ?? it.name, per100, source: k ? k.source : "stima AI", ...portion({ per100 }, Math.max(0, Math.round(it.grams))) };
      });
      // the model is often off on calories: scale portions so the meal lands on its share
      const kcal = sum(items).kcal;
      if (kcal > 0 && target.kcal > 0 && Math.abs(kcal - target.kcal) / target.kcal > 0.08) {
        const f = Math.min(1.8, Math.max(0.6, target.kcal / kcal));
        items = items.map((it) => ({ ...it, ...portion(it, Math.max(5, Math.round((it.grams * f) / 5) * 5)) }));
      }
      return { meal: target.meal, title, how, items, total: sum(items) };
    });
    const failed = targets.filter((t) => !ok.some((o) => o.target.meal === t.meal)).map((t) => t.meal);
    const note = failed.length ? `Non sono riuscito a organizzare: ${failed.join(", ")}. Riprova con Rigenera.` : "";
    return NextResponse.json({ meals, note });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Non riesco a organizzare i pasti" }, { status: 502 });
  }
}
