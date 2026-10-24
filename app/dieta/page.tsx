"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/client/store";
import { sumEntries, useDay, useToday } from "@/lib/client/hooks";
import { addDays, dietFor, longDate, mondayOf, resolveDate, sentence } from "@/lib/resolve";
import { KcalHero, MacroBars } from "@/components/Macros";
import { AddFood, MacroCard, MacroLine, MEALS } from "@/components/AddFood";
import { Sheet } from "@/components/Sheet";
import { MealPlanner } from "@/components/MealPlanner";
import type { FoodEntry } from "@/lib/types";

export default function Dieta() {
  const { program, state, dispatch } = useStore();
  const today = useToday();
  const [date, setDate] = useState<string | null>(null);
  const d = date ?? today;
  const { target, entries, eaten, resolved } = useDay(d);
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [planning, setPlanning] = useState(false);

  const mon = mondayOf(d);
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(mon, i);
      const r = program ? resolveDate(program, iso) : null;
      const t = r ? dietFor(r.week, iso) : undefined;
      const e = sumEntries(state.food[iso] ?? []);
      return {
        iso, target: t?.kcal ?? 0, eaten: e.kcal, has: (state.food[iso] ?? []).length > 0,
        tm: { protein: t?.protein ?? 0, carbs: t?.carbs ?? 0, fat: t?.fat ?? 0 },
        em: { protein: e.protein, carbs: e.carbs, fat: e.fat },
      };
    });
  }, [mon, program, state.food]);

  const balance = useMemo(() => {
    const past = days.filter((x) => x.iso < today && x.has);
    const t = past.reduce((a, x) => a + x.target, 0);
    const e = past.reduce((a, x) => a + x.eaten, 0);
    const weekTarget = days.reduce((a, x) => a + x.target, 0);
    // macros for the whole week (Monday to Sunday) against what is already logged, today included
    const sum = (k: "protein" | "carbs" | "fat", f: "tm" | "em") => days.reduce((a, x) => a + x[f][k], 0);
    const macroTarget = { day: "SETTIMANA", dow: 0, kcal: weekTarget, protein: Math.round(sum("protein", "tm")), carbs: Math.round(sum("carbs", "tm")), fat: Math.round(sum("fat", "tm")), water: "", note: "" };
    const macroEaten = { kcal: days.reduce((a, x) => a + x.eaten, 0), protein: sum("protein", "em"), carbs: sum("carbs", "em"), fat: sum("fat", "em") };
    return { t, e, n: past.length, weekTarget, weekEaten: macroEaten.kcal, macroTarget, macroEaten };
  }, [days, today]);

  // weekly calorie deficit: from Monday, burned (Apple Watch active + resting) minus eaten, day by day
  const deficit = useMemo(() => {
    let burned = 0, ate = 0, n = 0, noFood = 0;
    for (const x of days) {
      if (x.iso > today) continue;
      const h = state.health?.[x.iso];
      const b = (h?.active ?? 0) + (h?.resting ?? 0);
      if (!b) continue;
      burned += b;
      ate += x.eaten;
      n++;
      if (!x.has) noFood++;
    }
    return { burned, ate, n, noFood, value: Math.round(burned - ate) };
  }, [days, state.health, today]);

  const byMeal = MEALS.map((m) => ({ meal: m, items: entries.filter((e) => e.meal === m) })).filter((x) => x.items.length);
  const other = entries.filter((e) => !MEALS.includes(e.meal));
  if (other.length) byMeal.push({ meal: "Altro", items: other });

  return (
    <main className="shell stack-lg">
      <header className="page-head">
        <div>
          <h1 style={{ textTransform: "capitalize" }}>{d === today ? "Oggi" : longDate(d)}</h1>
          <p className="sub">
            {resolved ? `Settimana ${resolved.week.index} della scheda ${resolved.program.title}` : ""}
          </p>
        </div>
        <div className="row">
          <button className="btn sm ghost" onClick={() => setDate(addDays(d, -7))} aria-label="Settimana precedente">‹</button>
          <button className="btn sm ghost" onClick={() => setDate(addDays(d, 7))} aria-label="Settimana successiva">›</button>
        </div>
      </header>

      {deficit.n ? (
        <section className="card deficit">
          <div>
            <p className="muted small">{deficit.value >= 0 ? "Deficit" : "Surplus"} calorico della settimana</p>
            <p className="faint tiny">
              {deficit.n === 1 ? "1 giorno" : `${deficit.n} giorni`} da lunedì: {Math.round(deficit.burned).toLocaleString("it-IT")} bruciate, {Math.round(deficit.ate).toLocaleString("it-IT")} mangiate
              {deficit.noFood ? ` (${deficit.noFood === 1 ? "1 giorno" : `${deficit.noFood} giorni`} senza pasti registrati)` : ""}
            </p>
          </div>
          <span className={`num ${deficit.value >= 0 ? "good" : "bad"}`}>
            {deficit.value >= 0 ? "−" : "+"}{Math.abs(deficit.value).toLocaleString("it-IT")}
            <span className="muted small"> kcal</span>
          </span>
        </section>
      ) : null}

      <div className="week-grid" role="group" aria-label="Giorni della settimana">
        {days.map((x, i) => (
          <button key={x.iso} className={`d ${x.iso === today ? "today" : ""}`} aria-pressed={x.iso === d} onClick={() => setDate(x.iso)}>
            {["L", "M", "M", "G", "V", "S", "D"][i]} {Number(x.iso.slice(8))}
            <div className="v">{x.has ? Math.round(x.eaten) : "–"}</div>
            <div className="faint" style={{ fontSize: 11 }}>{x.target || ""}</div>
          </button>
        ))}
      </div>

      <section className="card stack">
        <KcalHero target={target} eaten={eaten} />
        <MacroBars target={target} eaten={eaten} />
        {target?.note ? <p className="faint small">{sentence(target.note)}</p> : null}
        {state.health?.[d]?.active !== undefined ? (
          <p className="small muted">
            Apple Watch: <b style={{ color: "var(--text)" }}>{state.health[d].active}</b> kcal attive
            {state.health[d].resting !== undefined ? `, ${(state.health[d].active ?? 0) + (state.health[d].resting ?? 0)} totali bruciate` : ""}
            {Math.round(eaten.kcal) ? `, bilancio ${Math.round(eaten.kcal - ((state.health[d].active ?? 0) + (state.health[d].resting ?? 0))) > 0 ? "+" : ""}${Math.round(eaten.kcal - ((state.health[d].active ?? 0) + (state.health[d].resting ?? 0)))} kcal` : ""}
          </p>
        ) : null}
      </section>

      <div className="row">
        <button className="btn primary big grow" onClick={() => setAdding("")}>Aggiungi alimento</button>
        <button className="btn big" style={{ fontSize: 17 }} onClick={() => setPlanning(true)}>Organizza i pasti</button>
      </div>

      {byMeal.length ? (
        byMeal.map(({ meal, items }) => {
          const s = sumEntries(items);
          return (
            <section key={meal} className="card">
              <div className="meal-head">
                <h3>{meal}</h3>
                <span className="muted small">{Math.round(s.kcal)} kcal</span>
              </div>
              {items.map((e) => (
                <button key={e.id} className="food-row" onClick={() => setEditing(e)}>
                  <span>{e.name}<span className="muted">{e.grams ? `, ${e.grams} g` : ""}</span></span>
                  <span className="k">{Math.round(e.kcal)}</span>
                  <span className="m"><MacroLine m={e} /></span>
                </button>
              ))}
              <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setAdding(meal)}>Aggiungi a {meal.toLowerCase()}</button>
            </section>
          );
        })
      ) : (
        <p className="empty">Nessun alimento registrato {d === today ? "oggi" : "in questo giorno"}. Aggiungi il primo pasto con la ricerca, il barcode o una foto.</p>
      )}

      {balance.n ? (
        <section className="card stack">
          <h3>Bilancio della settimana</h3>
          <p className="muted small">
            Conta il bilancio settimanale, non quello del singolo giorno. {balance.n === 1 ? "Nel giorno registrato" : `Nei ${balance.n} giorni registrati`} prima di oggi hai mangiato{" "}
            <b style={{ color: "var(--text)" }}>{Math.round(balance.e)}</b> kcal su <b style={{ color: "var(--text)" }}>{balance.t}</b> previste
            {" "}({balance.e - balance.t > 0 ? "+" : ""}{Math.round(balance.e - balance.t)} kcal).
            {balance.e - balance.t > 150 ? " Puoi compensare nei prossimi giorni, soprattutto riducendo carboidrati e grassi." : ""}
          </p>
          {balance.macroTarget.protein ? (
            <div className="stack" style={{ gap: 8, marginTop: 4 }}>
              <p className="muted small">Macro della settimana, oggi compreso</p>
              <MacroBars target={balance.macroTarget} eaten={balance.macroEaten} />
              <div className="week-left">
                {(["protein", "carbs", "fat"] as const).map((k) => {
                  const left = Math.round(balance.macroTarget[k] - balance.macroEaten[k]);
                  const name = k === "protein" ? "Proteine" : k === "carbs" ? "Carboidrati" : "Grassi";
                  return (
                    <div key={k} className={left < 0 ? "over" : ""}>
                      <span className="k">{name}</span>
                      <span className="v">{left < 0 ? `+${-left}` : left} g</span>
                      <span className="faint tiny">{left < 0 ? "in eccesso" : "mancano"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {planning ? (
        <MealPlanner
          date={d}
          target={target}
          eaten={eaten}
          loggedMeals={Array.from(new Set(entries.map((e) => e.meal)))}
          guidelines={resolved?.program.guidelines ?? []}
          onClose={() => setPlanning(false)}
        />
      ) : null}
      {adding !== null ? <AddFood date={d} initialMeal={adding || undefined} onClose={() => setAdding(null)} /> : null}
      {editing ? (
        <EditEntry
          e={editing}
          onClose={() => setEditing(null)}
          onSave={(ne) => { dispatch({ type: "updateFood", date: d, entry: ne }); setEditing(null); }}
          onDelete={() => { dispatch({ type: "deleteFood", date: d, id: editing.id }); setEditing(null); }}
        />
      ) : null}
    </main>
  );
}

function EditEntry({ e, onClose, onSave, onDelete }: { e: FoodEntry; onClose: () => void; onSave: (e: FoodEntry) => void; onDelete: () => void }) {
  const [g, setG] = useState(String(e.grams || ""));
  const [meal, setMeal] = useState(e.meal);
  const grams = parseFloat(g.replace(",", ".")) || 0;
  const scaled = e.per100
    ? {
        kcal: Math.round((e.per100.kcal * grams) / 100),
        protein: Math.round((e.per100.protein * grams) / 10) / 10,
        carbs: Math.round((e.per100.carbs * grams) / 10) / 10,
        fat: Math.round((e.per100.fat * grams) / 10) / 10,
      }
    : e.grams
    ? { kcal: Math.round((e.kcal * grams) / e.grams), protein: (e.protein * grams) / e.grams, carbs: (e.carbs * grams) / e.grams, fat: (e.fat * grams) / e.grams }
    : { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat };
  return (
    <Sheet onClose={onClose} tall={false} head={<h3 style={{ marginTop: 8 }}>{e.name}</h3>}>
        <div className="row">
          <label className="field grow">Grammi<input className="input" inputMode="decimal" value={g} onChange={(ev) => setG(ev.target.value)} /></label>
          <label className="field grow">Pasto
            <select className="input" value={meal} onChange={(ev) => setMeal(ev.target.value)}>
              {MEALS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <MacroCard m={scaled} />
        <div className="row">
          <button className="btn danger" onClick={onDelete}>Elimina</button>
          <button className="btn primary grow" onClick={() => onSave({ ...e, meal, grams: grams || e.grams, ...scaled })}>Salva</button>
        </div>
    </Sheet>
  );
}
