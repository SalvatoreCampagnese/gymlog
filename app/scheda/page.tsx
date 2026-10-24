"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/client/store";
import { useToday } from "@/lib/client/hooks";
import { prettyName, resolveDate, sentence, targetText, usable } from "@/lib/resolve";
import { IconPlay } from "@/components/Icons";

export default function Scheda() {
  const { program, state } = useStore();
  const today = useToday();
  const current = useMemo(() => (program ? resolveDate(program, today) : null), [program, today]);
  const [pid, setPid] = useState<string>("");
  const [wi, setWi] = useState<number>(1);

  useEffect(() => {
    if (current && !pid) {
      setPid(current.program.id);
      setWi(current.week.index);
    }
  }, [current, pid]);

  if (!program) return <main className="shell"><p className="muted">Carico la scheda…</p></main>;
  const p = program.programs.find((x) => x.id === pid) ?? current?.program;
  if (!p) return <NoPlan />;
  const week = p.weeks.find((w) => w.index === wi) ?? p.weeks[0];
  const doneThisWeek = new Set(state.sessions.filter((s) => s.programId === p.id && s.week === week?.index && s.finishedAt).map((s) => s.workout));
  const loggedCount = state.sessions.filter((s) => s.programId === p.id && s.finishedAt).length;

  return (
    <main className="shell stack-lg">
      <header className="page-head">
        <div>
          <h1>Scheda</h1>
          <p className="sub">Dal file {program.source}</p>
        </div>
      </header>

      <div className="stack">
        <select className="input" value={p.id} onChange={(e) => { setPid(e.target.value); setWi(1); }} aria-label="Scheda">
          {[...program.programs].reverse().map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}{current?.program.id === x.id ? " (in corso)" : ""}{usable(x) ? "" : " (solo note)"}
            </option>
          ))}
        </select>
        {p.weeks.length ? (
          <div className="seg" role="group" aria-label="Settimana">
            {p.weeks.map((w) => (
              <button key={w.index} aria-pressed={w.index === week.index} onClick={() => setWi(w.index)}>
                Sett. {w.index}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {p.notes.length ? (
        <div className="notice stack" style={{ gap: 6 }}>
          {p.notes.map((n, i) => <p key={i}>{sentence(n)}</p>)}
        </div>
      ) : null}

      {week?.workouts.map((w) => (
        <section key={w.key} className="card">
          <div className="row" style={{ marginBottom: 6 }}>
            <span className={`letter ${w.key} ${doneThisWeek.has(w.key) ? "done" : ""}`}>{w.key}</span>
            <div className="grow">
              <h2>{sentence(w.focus) || w.title}</h2>
              <p className="muted small">{w.exercises.length} esercizi{w.volume.length ? `, ${w.volume.map((v) => v.toLowerCase()).join(", ")} serie` : ""}</p>
            </div>
            <Link className="btn icon-btn primary" aria-label={`Inizia allenamento ${w.key}`} href={`/allenamento?p=${encodeURIComponent(p.id)}&w=${week.index}&k=${w.key}`}>
              <IconPlay />
            </Link>
          </div>
          <div>
            {w.exercises.map((e) => {
              const t = targetText(e);
              return (
                <div className="ex" key={e.id}>
                  <span className="name">{prettyName(e.name)}</span>
                  <span className="target">{t.sets}</span>
                  <div className="meta">
                    {t.load ? <span>Carico <b>{t.load}</b></span> : null}
                    {e.loadPct ? <span>%1RM <b>{e.loadPct.join(" ")}</b></span> : null}
                    <span>Recupero <b>{e.rest}</b></span>
                    {e.tempo ? <span>TUT <b>{e.tempo}</b></span> : null}
                    {e.buffer && e.buffer !== "0" ? <span>Buffer <b>{e.buffer.toLowerCase()}</b></span> : null}
                    {e.warmup ? <span>Riscaldamento <b>{e.warmup.sets} × {e.warmup.reps}{e.warmup.load ? ` @ ${e.warmup.load}` : ""}</b></span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {w.cardio.length ? <p className="muted small" style={{ marginTop: 10 }}>Cardio: {w.cardio.join(", ").toLowerCase()}</p> : null}
        </section>
      ))}

      {week?.diet.length ? (
        <section className="card stack">
          <h2>Macro della settimana {week.index}</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: "right" }}>
                <th style={{ textAlign: "left", fontWeight: 500 }}>Giorno</th>
                <th style={{ fontWeight: 500 }}>kcal</th>
                <th style={{ fontWeight: 500, color: "var(--protein)" }}>P</th>
                <th style={{ fontWeight: 500, color: "var(--carbs)" }}>C</th>
                <th style={{ fontWeight: 500, color: "var(--fat)" }}>G</th>
              </tr>
            </thead>
            <tbody>
              {week.diet.map((d) => (
                <tr key={d.dow} style={{ textAlign: "right", borderTop: "1px solid var(--line)" }}>
                  <td style={{ textAlign: "left", padding: "7px 0" }}>{d.day}</td>
                  <td className="num">{d.kcal ?? "–"}</td>
                  <td className="num">{d.protein ?? "–"}</td>
                  <td className="num">{d.carbs ?? "–"}</td>
                  <td className="num">{d.fat ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {week.diet.some((d) => d.note) ? (
            <p className="muted small">{week.diet.map((d) => d.note).filter(Boolean).map((x) => sentence(x)).join("; ")}</p>
          ) : null}
        </section>
      ) : null}

      {p.guidelines.length || p.supplements.some((s) => s.text) ? (
        <details className="card fold">
          <summary className="row between"><h3>Linee guida e integrazione</h3><span className="muted small">Mostra</span></summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {p.guidelines.map((g, i) => <p key={i} className="small muted">{sentence(g)}</p>)}
            {p.supplements.filter((s) => s.text).map((s) => (
              <p key={s.meal} className="small"><b>{sentence(s.meal)}:</b> <span className="muted">{s.text}</span></p>
            ))}
          </div>
        </details>
      ) : null}

      <section className="card stack">
        <h2>Report per il personal</h2>
        <p className="muted small">
          Scarica l'Excel originale con le colonne "Report da compilare" riempite con serie, ripetizioni e carichi che hai registrato
          ({loggedCount} allenamenti in questa scheda).
        </p>
        <a className="btn primary block" href={`/api/export?program=${encodeURIComponent(p.id)}`}>Scarica Excel con report</a>
        <a className="btn ghost block" href="/api/export">Scarica tutte le schede con report</a>
      </section>

      <p className="faint tiny" style={{ textAlign: "center" }}>
        Scheda caricata dal tuo personal{program.uploadedAt ? ` il ${new Date(program.uploadedAt).toLocaleDateString("it-IT")}` : ""}.
      </p>
    </main>
  );
}

function NoPlan() {
  return (
    <main className="shell stack-lg">
      <header className="page-head"><h1>Scheda</h1></header>
      <p className="empty">Il tuo personal non ha ancora caricato la scheda. Appena lo fa, la trovi qui.</p>
    </main>
  );
}
