"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/client/store";
import { useDay, useHealthRefresh, useToday } from "@/lib/client/hooks";
import { longDate, mondayOf, nextWorkoutKey, shortDate, sentence, shownWeight } from "@/lib/resolve";
import { KcalHero, MacroBars } from "@/components/Macros";
import { IconPlay } from "@/components/Icons";

export default function Home() {
  const { program, state, loading, error, dispatch } = useStore();
  const healthSync = useHealthRefresh();
  const today = useToday();
  const { resolved, target, eaten } = useDay(today);
  const [weightDraft, setWeightDraft] = useState("");

  const info = useMemo(() => {
    if (!resolved) return null;
    const { program: p, week } = resolved;
    const mon = mondayOf(today);
    const doneKeys = new Set(
      state.sessions
        .filter((s) => s.programId === p.id && s.week === week.index && s.finishedAt && s.date >= mon)
        .map((s) => s.workout)
    );
    const open = state.sessions.find((s) => !s.finishedAt && s.programId === p.id);
    const next = nextWorkoutKey(week, state.sessions, p.id, today);
    return { p, week, doneKeys, next, open };
  }, [resolved, state.sessions, today]);

  if (loading && !program) return <main className="shell"><p className="muted">Carico la scheda…</p></main>;
  if (error && !program) return <main className="shell"><p className="err">{error}</p></main>;
  if (!info)
    return (
      <main className="shell stack-lg">
        <header className="page-head"><h1 style={{ textTransform: "capitalize" }}>{longDate(today)}</h1></header>
        <p className="empty">{program?.programs.length ? "Nessuna scheda in corso in questo periodo." : "Il tuo personal non ha ancora caricato la scheda. Intanto puoi registrare pasti e peso."}</p>
        <Link href="/dieta" className="btn primary big block">Vai alla dieta</Link>
      </main>
    );

  const { p, week, doneKeys, next, open } = info;
  const nextWo = week.workouts.find((w) => w.key === next);
  const lastWeight = Object.entries(state.weight).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
  const todayWeight = state.weight[today];
  const wOff = state.settings?.weightOffset;
  const health = state.health?.[today];

  return (
    <main className="shell stack-lg">
      <header className="page-head">
        <div>
          <h1 style={{ textTransform: "capitalize" }}>{longDate(today)}</h1>
          <p className="sub">
            Scheda {p.title}, settimana {week.index} di {p.weeks.length}
            {resolved?.upcoming ? ` (parte il ${shortDate(p.startDate!)})` : ""}
          </p>
        </div>
      </header>

      <section className="card stack">
        <div className="row between">
          <h2>Allenamento</h2>
          <span className="muted small">{doneKeys.size} di {week.workouts.length} fatti</span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          {week.workouts.map((w) => (
            <Link
              key={w.key}
              href={`/allenamento?p=${encodeURIComponent(p.id)}&w=${week.index}&k=${w.key}`}
              className={`letter ${w.key} ${doneKeys.has(w.key) ? "done" : ""}`}
              style={{ textDecoration: "none", opacity: doneKeys.has(w.key) || w.key === next ? 1 : 0.55 }}
              aria-label={`Allenamento ${w.key}${doneKeys.has(w.key) ? ", fatto" : ""}`}
            >
              {w.key}
            </Link>
          ))}
        </div>
        {open ? (
          <Link className="btn primary big block" href={`/allenamento?p=${encodeURIComponent(open.programId)}&w=${open.week}&k=${open.workout}`}>
            <IconPlay /> Riprendi allenamento {open.workout}
          </Link>
        ) : nextWo ? (
          <>
            <p className="muted">
              Prossimo: <b style={{ color: "var(--text)" }}>{nextWo.key}, {sentence(nextWo.focus).toLowerCase() || "allenamento"}</b>,{" "}
              {nextWo.exercises.length} esercizi{nextWo.cardio.length ? ` + cardio ${nextWo.cardio[0].toLowerCase()}` : ""}
            </p>
            <Link className="btn primary big block" href={`/allenamento?p=${encodeURIComponent(p.id)}&w=${week.index}&k=${nextWo.key}`}>
              <IconPlay /> Inizia allenamento {nextWo.key}
            </Link>
          </>
        ) : null}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Dieta di oggi</h2>
          <Link href="/dieta" className="btn sm ghost">Aggiungi pasto</Link>
        </div>
        <KcalHero target={target} eaten={eaten} />
        <MacroBars target={target} eaten={eaten} />
        {target?.note ? <p className="faint small">{sentence(target.note)}</p> : null}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Attività</h2>
          <Link href="/salute" className="btn sm ghost">{health ? "Apple Salute" : "Collega Apple Salute"}</Link>
        </div>
        {health ? (
          <>
            <div className="split-legend">
              <div><span className="k">Attive</span><span className="v">{health.active ?? "–"}</span><span className="faint tiny">kcal</span></div>
              <div><span className="k">Totali</span><span className="v">{(health.active ?? 0) + (health.resting ?? 0) || "–"}</span><span className="faint tiny">kcal bruciate</span></div>
              <div><span className="k">Passi</span><span className="v">{health.steps?.toLocaleString("it-IT") ?? "–"}</span><span className="faint tiny">oggi</span></div>
            </div>
            <div className="row between">
              <span className="faint tiny">Aggiornato alle {new Date(health.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
              <a className="btn sm ghost" href="shortcuts://run-shortcut?name=GymLog%20Salute" onClick={healthSync.start}>{healthSync.waiting ? "Aggiorno…" : "Aggiorna"}</a>
            </div>
          </>
        ) : (
          <p className="muted small">Importa dall'Apple Watch le calorie bruciate e i passi con un comando rapido.</p>
        )}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Peso</h2>
          {lastWeight ? <span className="muted small">Ultimo: {shownWeight(lastWeight[1], wOff)} kg il {shortDate(lastWeight[0])}</span> : null}
        </div>
        {todayWeight ? (
          <div className="row between">
            <p><span className="num" style={{ fontSize: 30 }}>{shownWeight(todayWeight, wOff)}</span> <span className="muted">kg stamattina</span></p>
            <button className="btn sm ghost" onClick={() => dispatch({ type: "setWeight", date: today, kg: null })}>Modifica</button>
          </div>
        ) : (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const kg = parseFloat(weightDraft.replace(",", "."));
              if (kg > 30 && kg < 300) {
                dispatch({ type: "setWeight", date: today, kg });
                setWeightDraft("");
              }
            }}
          >
            <input className="input grow" inputMode="decimal" placeholder="Peso di stamattina, es. 81,6" value={weightDraft} onChange={(e) => setWeightDraft(e.target.value)} />
            <button className="btn" type="submit">Salva</button>
          </form>
        )}
      </section>

      {p.notes.length ? (
        <details className="card fold">
          <summary className="row between"><h3>Note del personal</h3><span className="muted small">Mostra</span></summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {p.notes.map((n, i) => <p key={i} className="muted small">{sentence(n)}</p>)}
          </div>
        </details>
      ) : null}
    </main>
  );
}
