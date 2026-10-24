"use client";
import { useMemo, useState } from "react";
import { useStore, uid } from "@/lib/client/store";
import { Sheet } from "./Sheet";
import { MacroLine, MEALS } from "./AddFood";
import type { DietDay, FoodEntry, PantryItem } from "@/lib/types";
import type { Op } from "@/lib/ops";

type PlanItem = { name: string; grams: number; per100: { kcal: number; protein: number; carbs: number; fat: number }; source: string; kcal: number; protein: number; carbs: number; fat: number };
type PlanMeal = { meal: string; title: string; how: string; items: PlanItem[]; total: { kcal: number; protein: number; carbs: number; fat: number } };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export function MealPlanner({
  date,
  target,
  eaten,
  loggedMeals,
  guidelines,
  onClose,
}: {
  date: string;
  target?: DietDay;
  eaten: { kcal: number; protein: number; carbs: number; fat: number };
  loggedMeals: string[];
  guidelines: string[];
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const planMeals = MEALS.filter((m) => m !== "Extra");
  const [chosen, setChosen] = useState<string[]>(() => {
    const free = planMeals.filter((m) => !loggedMeals.includes(m));
    return free.length ? free : ["Cena"];
  });
  const [prefs, setPrefs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ meals: PlanMeal[]; note: string } | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [planFor, setPlanFor] = useState<number>(0);

  const remaining = useMemo(() => {
    const t = { kcal: target?.kcal ?? 0, protein: target?.protein ?? 0, carbs: target?.carbs ?? 0, fat: target?.fat ?? 0 };
    return {
      kcal: Math.max(0, t.kcal - eaten.kcal),
      protein: Math.max(0, t.protein - eaten.protein),
      carbs: Math.max(0, t.carbs - eaten.carbs),
      fat: Math.max(0, t.fat - eaten.fat),
    };
  }, [target, eaten]);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setAdded([]);
    try {
      const pantry = (state.pantry ?? []).map((p) => ({ name: p.name, qty: p.qty || (p.grams ? `${p.grams} g` : ""), per100: p.per100, grams: p.grams }));
      const favorites = [...state.savedFoods]
        .sort((a, b) => b.uses - a.uses)
        .slice(0, 30)
        .map((f) => ({ name: f.name, per100: f.per100 }));
      const r = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remaining, meals: chosen, pantry, favorites, preferences: prefs, guidelines }),
      });
      const text = await r.text();
      let j: any;
      try {
        j = JSON.parse(text);
      } catch {
        throw new Error(
          r.status === 504 || /timeout|timed out/i.test(text)
            ? "Il server ci ha messo troppo. Riprova, oppure scegli meno pasti alla volta."
            : `Il server ha risposto in modo inatteso (${r.status}). Riprova tra poco.`
        );
      }
      if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
      setPlan(j);
      setPlanFor(remaining.kcal);
    } catch (e: any) {
      setErr(e.message || "Non riesco a organizzare i pasti");
    } finally {
      setBusy(false);
    }
  };

  const addMeal = (m: PlanMeal) => {
    const now = new Date().toISOString();
    const meal = MEALS.includes(m.meal) ? m.meal : chosen[0];
    const ops: Op[] = m.items.map((it) => ({
      type: "addFood",
      date,
      entry: {
        id: uid(),
        meal,
        name: it.name,
        grams: it.grams,
        kcal: it.kcal,
        protein: it.protein,
        carbs: it.carbs,
        fat: it.fat,
        per100: it.per100,
        source: "ai",
        at: now,
      } as FoodEntry,
    }));
    // use up what was taken from the fridge
    const pantry = state.pantry ?? [];
    const changed: PantryItem[] = [];
    for (const it of m.items) {
      if (it.source !== "frigo") continue;
      const p = pantry.find((x) => norm(x.name) === norm(it.name));
      if (!p || !p.grams) continue;
      const left = Math.round(p.grams - it.grams);
      if (left <= 0) ops.push({ type: "deletePantry", id: p.id });
      else changed.push({ ...p, grams: left, qty: `circa ${left} g`, updatedAt: now });
    }
    if (changed.length) ops.push({ type: "upsertPantry", items: changed });
    dispatch(...ops);
    setAdded((a) => [...a, m.meal + m.title]);
  };

  const total = plan?.meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.total.kcal, protein: a.protein + m.total.protein, carbs: a.carbs + m.total.carbs, fat: a.fat + m.total.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <Sheet onClose={onClose} head={<h2 style={{ marginTop: 6 }}>Organizza i pasti</h2>}>
      {!target ? <p className="notice small">Per oggi non trovo i macro nella scheda: userò stime generiche.</p> : null}
      <div className="card flat stack" style={{ gap: 6, padding: 12 }}>
        <p className="muted small">Ti mancano per oggi</p>
        <p>
          <span className="num" style={{ fontSize: 26 }}>{Math.round(remaining.kcal)}</span> <span className="muted">kcal</span>
        </p>
        <span className="small food-row" style={{ padding: 0, border: 0, cursor: "default" }}>
          <span className="m"><MacroLine m={remaining} /></span>
        </span>
      </div>

      {!plan ? (
        <>
          <div className="stack" style={{ gap: 8 }}>
            <p className="muted small">Quali pasti organizzo?</p>
            <div className="row wrap" style={{ gap: 8 }}>
              {planMeals.map((m) => (
                <button
                  key={m}
                  className="chip chip-btn"
                  aria-pressed={chosen.includes(m)}
                  onClick={() => setChosen(chosen.includes(m) ? chosen.filter((x) => x !== m) : [...chosen, m])}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <input className="input" placeholder="Preferenze, es. cena veloce, niente pesce" value={prefs} onChange={(e) => setPrefs(e.target.value)} />
          <p className="faint small">
            {(state.pantry ?? []).length
              ? `Uso prima quello che hai in casa (${(state.pantry ?? []).length} alimenti nel Frigo), poi i tuoi alimenti abituali. I valori nutrizionali vengono dal database alimenti.`
              : "Il Frigo è vuoto: userò i tuoi alimenti abituali e quelli comuni. Fotografa il frigo per piani basati su quello che hai."}
          </p>
          <button className="btn primary big block" disabled={busy || !chosen.length || remaining.kcal < 50} onClick={run}>
            {busy ? `Preparo ${chosen.length > 1 ? `${chosen.length} pasti` : "il pasto"}…` : "Organizza"}
          </button>
          {remaining.kcal < 50 && target ? <p className="muted small">Hai già raggiunto le calorie di oggi.</p> : null}
          {err ? <p className="err">{err}</p> : null}
        </>
      ) : (
        <>
          {plan.meals.map((m) => {
            const isAdded = added.includes(m.meal + m.title);
            return (
              <section key={m.meal + m.title} className="card stack" style={{ gap: 8, background: "var(--bg)" }}>
                <div className="row between">
                  <div>
                    <p className="muted tiny">{m.meal}</p>
                    <h3>{m.title}</h3>
                  </div>
                  <span className="num" style={{ fontSize: 20 }}>{Math.round(m.total.kcal)} kcal</span>
                </div>
                <div>
                  {m.items.map((it, i) => (
                    <div key={i} className="plan-item">
                      <span>{it.name} <span className="muted">{it.grams} g</span></span>
                      <span className="small">{it.kcal} kcal</span>
                      <span className="faint tiny" style={{ gridColumn: "1 / -1" }}>
                        {it.source === "frigo" ? "dal tuo frigo" : it.source === "preferiti" ? "tra i tuoi alimenti" : it.source === "tabelle" ? "tabelle nutrizionali" : it.source === "Open Food Facts" ? "Open Food Facts" : "valori stimati"}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="small food-row" style={{ padding: 0, border: 0, cursor: "default" }}>
                  <span className="m"><MacroLine m={m.total} /></span>
                </span>
                {m.how ? <p className="faint small">{m.how}</p> : null}
                <button className={`btn ${isAdded ? "ghost" : "go"} block`} disabled={isAdded} onClick={() => addMeal(m)}>
                  {isAdded ? `Aggiunto a ${m.meal.toLowerCase()}` : `Aggiungi a ${m.meal.toLowerCase()}`}
                </button>
              </section>
            );
          })}
          {total ? (
            <p className="muted small">
              Totale piano: <b style={{ color: "var(--text)" }}>{Math.round(total.kcal)} kcal</b> su {Math.round(planFor)} che ti mancavano.
            </p>
          ) : null}
          {plan.note ? <p className="faint small">{plan.note}</p> : null}
          <div className="row">
            <button className="btn ghost grow" onClick={() => setPlan(null)}>Cambia richiesta</button>
            <button className="btn grow" disabled={busy} onClick={run}>{busy ? "Rigenero…" : "Rigenera"}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
