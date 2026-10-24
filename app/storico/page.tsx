"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/client/store";
import { cleanLoad, normName, prettyName, shortDate, shownWeight } from "@/lib/resolve";
import { LineChart } from "@/components/LineChart";
import { Confirm } from "@/components/Confirm";
import type { Session } from "@/lib/types";

const num = (v: string) => parseFloat((v || "").replace(",", ".").split(/[+\-/ ]/)[0]) || 0;

export default function Storico() {
  const { state, program, dispatch } = useStore();
  const [toDelete, setToDelete] = useState<Session | null>(null);
  const open = useMemo(() => state.sessions.filter((s) => !s.finishedAt).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)), [state.sessions]);
  const finished = useMemo(
    () => state.sessions.filter((s) => s.finishedAt).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
    [state.sessions]
  );

  const exercises = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const s of finished)
      for (const e of s.exercises)
        if (e.sets.some((x) => x.done && num(x.load) > 0)) {
          const k = normName(e.name);
          m.set(k, { name: e.name, count: (m.get(k)?.count ?? 0) + 1 });
        }
    return [...m.entries()].filter(([, v]) => v.count >= 1).sort((a, b) => b[1].count - a[1].count);
  }, [finished]);

  const [exKey, setExKey] = useState<string>("");
  const k = exKey || exercises[0]?.[0] || "";
  const exSeries = useMemo(() => {
    const pts: { x: string; y: number; label: string }[] = [];
    for (const s of [...finished].reverse()) {
      const e = s.exercises.find((x) => normName(x.name) === k);
      if (!e) continue;
      const done = e.sets.filter((x) => x.done);
      const top = Math.max(0, ...done.map((x) => num(x.load)));
      if (!top) continue;
      const best = done.find((x) => num(x.load) === top)!;
      pts.push({ x: shortDate(s.date), y: top, label: `${shortDate(s.date)}, ${best.reps} reps, sett. ${s.week}` });
    }
    return pts;
  }, [finished, k]);

  const weights = useMemo(
    () =>
      Object.entries(state.weight)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .slice(-60)
        .map(([d, kg]) => ({ x: shortDate(d), y: shownWeight(kg, state.settings?.weightOffset) })),
    [state.weight, state.settings?.weightOffset]
  );

  const active = useMemo(
    () =>
      Object.entries(state.health ?? {})
        .filter(([, h]) => h.active !== undefined)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .slice(-30)
        .map(([d, h]) => ({ x: shortDate(d), y: h.active! })),
    [state.health]
  );

  const title = (pid: string) => program?.programs.find((p) => p.id === pid)?.title ?? pid;

  return (
    <main className="shell stack-lg">
      <header className="page-head">
        <div>
          <h1>Progressi</h1>
          <p className="sub">{finished.length} allenamenti registrati</p>
        </div>
      </header>

      <section className="card stack">
        <h2>Peso corporeo</h2>
        {weights.length ? <LineChart data={weights} unit="kg" /> : <p className="muted small">Registra il peso dalla pagina Oggi per vedere l'andamento.</p>}
        {/* scale correction is hidden; it stays active via state.settings.weightOffset (-3). Re-add <WeightOffset /> to edit it. */}
      </section>

      {active.length ? (
        <section className="card stack">
          <h2>Calorie attive (Apple Watch)</h2>
          <LineChart data={active} unit="kcal" />
        </section>
      ) : null}

      <section className="card stack">
        <h2>Carico per esercizio</h2>
        {exercises.length ? (
          <>
            <select className="input" value={k} onChange={(e) => setExKey(e.target.value)} aria-label="Esercizio">
              {exercises.map(([key, v]) => <option key={key} value={key}>{prettyName(v.name)}</option>)}
            </select>
            <p className="faint small">Carico più alto usato in ogni allenamento.</p>
            <LineChart data={exSeries} unit="kg" />
          </>
        ) : (
          <p className="muted small">Qui vedrai come salgono i carichi dopo i primi allenamenti.</p>
        )}
      </section>

      {open.length ? (
        <section className="stack">
          <h2>In corso</h2>
          {open.map((s) => {
            const done = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
            return (
              <div key={s.id} className="card row">
                <span className={`letter ${s.workout}`}>{s.workout}</span>
                <div className="grow">
                  <p style={{ fontWeight: 600 }}>{shortDate(s.date)}, settimana {s.week}</p>
                  <p className="muted small">{done} serie fatte, non terminato</p>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <Link className="btn sm" href={`/allenamento?p=${encodeURIComponent(s.programId)}&w=${s.week}&k=${s.workout}`}>Riprendi</Link>
                  <button className="btn sm danger" onClick={() => setToDelete(s)}>Elimina</button>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="stack">
        <h2>Allenamenti</h2>
        {finished.length ? (
          finished.slice(0, 60).map((s) => {
            const done = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
            const mins = Math.round((+new Date(s.finishedAt!) - +new Date(s.startedAt)) / 60000);
            return (
              <details key={s.id} className="card fold">
                <summary className="row">
                  <span className={`letter ${s.workout}`}>{s.workout}</span>
                  <div className="grow">
                    <p style={{ fontWeight: 600 }}>{shortDate(s.date)}, settimana {s.week}</p>
                    <p className="muted small">{title(s.programId)}: {done} serie in {mins} min</p>
                  </div>
                </summary>
                <div style={{ marginTop: 8 }}>
                  {s.exercises.map((e) => (
                    <div key={e.exerciseId} className="ex">
                      <span className="name">{prettyName(e.name)}</span>
                      <span />
                      <div className="meta">
                        {e.sets.filter((x) => x.done).length
                          ? e.sets.filter((x) => x.done).map((x, i) => <b key={i}>{x.reps} × {cleanLoad(x.load) || "–"}</b>)
                          : <span>non fatto</span>}
                        {e.note ? <span>{e.note}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <Link className="btn sm ghost" href={`/allenamento?p=${encodeURIComponent(s.programId)}&w=${s.week}&k=${s.workout}`}>
                    Apri scheda {s.workout}
                  </Link>
                  <button className="btn sm danger" onClick={() => setToDelete(s)}>Elimina</button>
                </div>
              </details>
            );
          })
        ) : (
          <p className="empty">Nessun allenamento ancora. Avvia il primo dalla pagina Oggi.</p>
        )}
      </section>
      {toDelete ? (
        <Confirm
          title={`Eliminare l'allenamento ${toDelete.workout}?`}
          body={`Del ${shortDate(toDelete.date)}, settimana ${toDelete.week}. Le serie registrate andranno perse e non compariranno nel report.`}
          confirmLabel="Elimina"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            dispatch({ type: "deleteSession", id: toDelete.id });
            setToDelete(null);
          }}
        />
      ) : null}
    </main>
  );
}

/** Scale correction: added to every weight when shown. Stored data stays as read on the scale, so it is fully reversible. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WeightOffset() {
  const { state, dispatch } = useStore();
  const off = state.settings?.weightOffset ?? 0;
  const [draft, setDraft] = useState(off ? String(off).replace(".", ",") : "");
  const save = (v: number) => dispatch({ type: "setWeightOffset", kg: v });
  return (
    <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 4 }}>
      <p className="small">
        Correzione bilancia: <b>{off ? `${off > 0 ? "+" : "−"}${Math.abs(off).toLocaleString("it-IT")} kg` : "nessuna"}</b>
      </p>
      <p className="faint tiny">Viene applicata solo quando i pesi vengono mostrati: i valori salvati restano quelli della bilancia, quindi puoi toglierla quando vuoi.</p>
      <div className="row">
        <input className="input grow" inputMode="text" placeholder="es. -3" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn sm" onClick={() => { const v = parseFloat(draft.replace(",", ".").replace("−", "-")); if (Number.isFinite(v) && Math.abs(v) <= 20) save(v); }}>Applica</button>
        {off ? <button className="btn sm ghost" onClick={() => { save(0); setDraft(""); }}>Rimuovi</button> : null}
      </div>
    </div>
  );
}
