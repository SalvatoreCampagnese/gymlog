"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, uid } from "@/lib/client/store";
import { useToday } from "@/lib/client/hooks";
import { cleanLoad, durationSec, fmtDuration, fmtSec, lastSetsFor, loadUnit, prettyName, sentence, targetText } from "@/lib/resolve";
import type { Exercise, ExerciseLog, Session, SetLog, Workout } from "@/lib/types";
import { RestTimer, beep, unlockAudio, type RestState } from "@/components/RestTimer";
import { PushToggle } from "@/components/PushToggle";
import { Confirm } from "@/components/Confirm";
import { cancelRestPush, scheduleRestPush } from "@/lib/client/push";
import { IconCheck, IconClose, IconLeft, IconList, IconPlay, IconRight } from "@/components/Icons";

const LS_REST = "gl.rest";

export default function Page() {
  return (
    <Suspense fallback={<main className="shell full"><p className="muted">Carico…</p></main>}>
      <WorkoutMode />
    </Suspense>
  );
}

const numericOnly = (v: string) => (/^\d+([.,]\d+)?$/.test((v || "").trim()) ? v.trim().replace(",", ".") : "");
// "15+12.5" (dropset) -> "15+12.5"; anything else -> numericOnly
const numericLoad = (v: string) => {
  const parts = (v || "").split("+").map((x) => numericOnly(x));
  return parts.length > 1 && parts.every(Boolean) ? parts.join("+") : numericOnly(v);
};
const isDrop = (v: string) => (v || "").includes("+");

/** Weight field. For a dropset it shows one box per weight (15 + 12.5), each with the number keypad. */
function LoadInput({ value, placeholder, target, label, onChange }: { value: string; placeholder: string; target: string; label: string; onChange: (v: string) => void }) {
  const drop = isDrop(value) || (!value && isDrop(target));
  if (!drop)
    return <input inputMode="decimal" aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  const parts = value ? value.split("+") : target.split("+").map(() => "");
  const tParts = target.split("+");
  const set = (k: number, v: string) => {
    const next = parts.slice();
    next[k] = v.replace(/\+/g, "");
    onChange(next.join("+"));
  };
  return (
    <div className="load-parts">
      {parts.map((p, k) => (
        <Fragment key={k}>
          {k ? <span className="plus">+</span> : null}
          <input inputMode="decimal" aria-label={`${label}, peso ${k + 1}`} value={p} placeholder={numericOnly(tParts[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
        </Fragment>
      ))}
    </div>
  );
}

function prefill(ex: Exercise, i: number, last: SetLog[] | undefined): SetLog {
  const prev = last?.[i] ?? last?.[last.length - 1];
  const reps = prev?.reps || numericOnly(ex.reps[i] ?? "");
  const load = prev?.load || numericLoad(ex.loads[i] ?? "") || (/^p\.?\s*c/i.test(ex.loads[i] ?? "") ? "PC" : "");
  return { reps, load, done: false };
}

function WorkoutMode() {
  const sp = useSearchParams();
  const router = useRouter();
  const { program, state, dispatch } = useStore();
  const today = useToday();
  const pid = sp.get("p") ?? "";
  const wi = parseInt(sp.get("w") ?? "1", 10);
  const key = sp.get("k") ?? "A";

  const prog = program?.programs.find((p) => p.id === pid);
  const week = prog?.weeks.find((w) => w.index === wi);
  const wo = week?.workouts.find((w) => w.key === key);

  const existing = useMemo(
    () => state.sessions.find((s) => !s.finishedAt && s.programId === pid && s.week === wi && s.workout === key),
    [state.sessions, pid, wi, key]
  );

  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState(0);
  const [rest, setRestState] = useState<RestState>(null);
  const [showList, setShowList] = useState(false);
  const [summary, setSummary] = useState<Session | null>(null);
  const [ask, setAsk] = useState<null | "finish" | "delete">(null);

  // restore an open session (e.g. after reload)
  useEffect(() => {
    if (!session && existing) {
      setSession(existing);
      const firstOpen = existing.exercises.findIndex((e) => e.sets.some((s) => !s.done));
      setStep(firstOpen < 0 ? existing.exercises.length : firstOpen);
    }
  }, [existing, session]);

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(LS_REST) || "null");
      if (r && r.endAt > Date.now() - 60_000) setRestState(r);
    } catch {}
  }, []);

  const setRest = (r: RestState) => {
    // background alert: the server sends a push when the rest ends (screen locked / app in background)
    if (r && r.endAt > Date.now() + 3000) scheduleRestPush(uid(), r.endAt, r.next);
    else if (!r) cancelRestPush();
    setRestState(r);
    try {
      if (r) localStorage.setItem(LS_REST, JSON.stringify(r));
      else localStorage.removeItem(LS_REST);
    } catch {}
  };

  useWakeLock(!!session && !summary);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(
    (s: Session, immediate = true) => {
      setSession(s);
      if (timer.current) clearTimeout(timer.current);
      if (immediate) dispatch({ type: "upsertSession", session: s });
      else timer.current = setTimeout(() => dispatch({ type: "upsertSession", session: s }), 1500);
    },
    [dispatch]
  );

  if (!program) return <main className="shell full"><p className="muted">Carico la scheda…</p></main>;
  if (!prog || !week || !wo)
    return (
      <main className="shell full stack">
        <p>Allenamento non trovato.</p>
        <Link href="/" className="btn">Torna a oggi</Link>
      </main>
    );

  if (summary) return <Summary s={summary} wo={wo} onClose={() => router.push("/")} />;

  if (!session) {
    return (
      <Intro
        wo={wo}
        title={`${prog.title}, settimana ${week.index}`}
        onStart={() => {
          unlockAudio();
          const s: Session = {
            id: uid(),
            programId: prog.id,
            week: week.index,
            workout: wo.key,
            date: today,
            startedAt: new Date().toISOString(),
            exercises: wo.exercises.map((ex) => {
              const last = lastSetsFor(state.sessions, prog.id, ex.id, ex.name)?.sets;
              return { exerciseId: ex.id, name: ex.name, sets: Array.from({ length: ex.sets }, (_, i) => prefill(ex, i, last)) };
            }),
          };
          save(s);
          setStep(0);
        }}
      />
    );
  }

  const hasCardio = wo.cardio.length > 0;
  const totalSteps = wo.exercises.length + (hasCardio ? 1 : 0);
  const ex = wo.exercises[step];
  const log = session.exercises.find((e) => e.exerciseId === ex?.id);

  const updateLog = (nl: ExerciseLog, immediate = true) => {
    save({ ...session, exercises: session.exercises.map((e) => (e.exerciseId === nl.exerciseId ? nl : e)) }, immediate);
  };

  const finish = () => {
    const s = { ...session, finishedAt: new Date().toISOString() };
    save(s);
    setRest(null);
    setSummary(s);
  };

  const nextLabel = (exIdx: number, setIdx: number) => {
    const e = wo.exercises[exIdx];
    if (e && setIdx + 1 < (session.exercises[exIdx]?.sets.length ?? e.sets))
      return `${prettyName(e.name)}, serie ${setIdx + 2} di ${session.exercises[exIdx].sets.length}`;
    const n = wo.exercises[exIdx + 1];
    if (n) return `${prettyName(n.name)}, serie 1 di ${n.sets}`;
    return hasCardio ? `Cardio: ${wo.cardio[0].toLowerCase()}` : "Fine allenamento";
  };

  const onSetDone = (setIdx: number, patch?: Partial<SetLog>) => {
    if (!log || !ex) return;
    unlockAudio();
    const sets = log.sets.map((s, i) => (i === setIdx ? { ...s, ...patch, done: !s.done, at: new Date().toISOString() } : s));
    updateLog({ ...log, sets });
    if (sets[setIdx].done) {
      const isLastOverall = step === wo.exercises.length - 1 && sets.every((s) => s.done) && !hasCardio;
      if (!isLastOverall) {
        setRest({
          endAt: Date.now() + ex.restSec * 1000,
          total: ex.restSec,
          label: `Recupero ${ex.rest}`,
          next: nextLabel(step, setIdx),
        });
      }
      // exercise finished: show the next one right away, the timer floats on top
      if (sets.every((s) => s.done) && step < totalSteps - 1) {
        setStep(step + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  const closeRest = () => setRest(null);

  return (
    <main className="shell full" style={rest ? { paddingBottom: "calc(170px + env(safe-area-inset-bottom))" } : undefined}>
      <div className="wo-top">
        <button className="btn icon-btn ghost" aria-label="Esci" onClick={() => router.push("/")}><IconClose /></button>
        <div className="progress-dots" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => {
            const done = i < wo.exercises.length ? session.exercises[i]?.sets.every((s) => s.done) : !!session.cardioDone;
            return <i key={i} className={i === step ? "cur" : done ? "done" : ""} />;
          })}
        </div>
        <button className="btn icon-btn ghost" aria-label="Elenco esercizi" onClick={() => setShowList(true)}><IconList /></button>
      </div>

      {ex && log ? (
        <ExerciseStep
          key={ex.id}
          ex={ex}
          log={log}
          idx={step}
          count={wo.exercises.length}
          last={lastSetsFor(state.sessions, prog.id, ex.id, ex.name, session.id)}
          onChange={updateLog}
          onSetDone={onSetDone}
        />
      ) : (
        <CardioStep
          wo={wo}
          done={!!session.cardioDone}
          onToggle={() => save({ ...session, cardioDone: !session.cardioDone })}
        />
      )}

      <div className="row" style={{ marginTop: 22 }}>
        <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)} aria-label="Esercizio precedente"><IconLeft /></button>
        {step < totalSteps - 1 ? (
          <button className="btn grow" onClick={() => setStep(step + 1)}>
            {nextTitle(wo, step + 1)} <IconRight />
          </button>
        ) : (
          <button className="btn go grow big" onClick={() => setAsk("finish")}>Termina allenamento</button>
        )}
      </div>
      {step < totalSteps - 1 ? (
        <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setAsk("finish")}>Termina adesso</button>
      ) : null}

      {showList ? (
        <div className="sheet-backdrop" onClick={() => setShowList(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h2 style={{ marginBottom: 8 }}>Allenamento {wo.key}</h2>
            {wo.exercises.map((e, i) => {
              const l = session.exercises[i];
              const n = l?.sets.filter((s) => s.done).length ?? 0;
              return (
                <button key={e.id} className="food-row" onClick={() => { setStep(i); setShowList(false); }}>
                  <span style={{ fontWeight: i === step ? 700 : 500 }}>{prettyName(e.name)}</span>
                  <span className={`chip ${n === l?.sets.length ? "ok" : ""}`}>{n}/{l?.sets.length ?? e.sets}</span>
                </button>
              );
            })}
            {hasCardio ? (
              <button className="food-row" onClick={() => { setStep(wo.exercises.length); setShowList(false); }}>
                <span>Cardio</span>
                <span className={`chip ${session.cardioDone ? "ok" : ""}`}>{session.cardioDone ? "fatto" : "da fare"}</span>
              </button>
            ) : null}
            <button
              className="btn danger block"
              style={{ marginTop: 16 }}
              onClick={() => {
                setShowList(false);
                setAsk("delete");
              }}
            >
              Elimina allenamento
            </button>
          </div>
        </div>
      ) : null}

      {ask === "finish" ? (
        (() => {
          const doneSets = session.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
          const planned = session.exercises.reduce((a, e) => a + e.sets.length, 0);
          return (
            <Confirm
              title="Terminare l'allenamento?"
              body={
                <>
                  Hai fatto {doneSets} serie su {planned}.
                  {doneSets < planned ? " Le serie non segnate resteranno vuote nel report." : ""}
                </>
              }
              confirmLabel="Termina"
              onCancel={() => setAsk(null)}
              onConfirm={() => {
                setAsk(null);
                finish();
              }}
            />
          );
        })()
      ) : null}
      {ask === "delete" ? (
        <Confirm
          title="Eliminare questo allenamento?"
          body="Le serie registrate andranno perse e non compariranno nel report."
          confirmLabel="Elimina"
          danger
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            setAsk(null);
            dispatch({ type: "deleteSession", id: session.id });
            setRest(null);
            router.push("/");
          }}
        />
      ) : null}

      {rest ? (
        <RestTimer
          rest={rest}
          onAdjust={(d) => setRest({ ...rest, endAt: Math.max(Date.now(), rest.endAt + d * 1000), total: Math.max(1, rest.total + d) })}
          onClose={closeRest}
        />
      ) : null}
    </main>
  );
}

function nextTitle(wo: Workout, i: number) {
  const e = wo.exercises[i];
  if (!e) return "Cardio";
  const n = prettyName(e.name);
  return n.length > 22 ? n.slice(0, 21) + "…" : n;
}

function Intro({ wo, title, onStart }: { wo: Workout; title: string; onStart: () => void }) {
  return (
    <main className="shell full stack-lg">
      <div className="wo-top">
        <Link className="btn icon-btn ghost" href="/" aria-label="Indietro"><IconClose /></Link>
        <span className="muted small grow">{title}</span>
      </div>
      <div className="row" style={{ gap: 14 }}>
        <span className={`letter ${wo.key}`} style={{ width: 64, height: 64, fontSize: 34 }}>{wo.key}</span>
        <div>
          <h1>{sentence(wo.focus) || wo.title}</h1>
          <p className="muted">{wo.exercises.length} esercizi{wo.cardio.length ? `, poi ${wo.cardio[0].toLowerCase()}` : ""}</p>
        </div>
      </div>
      <div className="card">
        {wo.exercises.map((e) => {
          const t = targetText(e);
          return (
            <div className="ex" key={e.id}>
              <span className="name">{prettyName(e.name)}</span>
              <span className="target">{t.sets}</span>
              <div className="meta">
                {t.load ? <span>Carico <b>{t.load}</b></span> : null}
                <span>Recupero <b>{e.rest}</b></span>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn primary big block" onClick={onStart}>Inizia</button>
      <PushToggle />
      <p className="faint small" style={{ textAlign: "center" }}>Lo schermo resta acceso durante l'allenamento. Alza il volume per sentire la fine del recupero.</p>
    </main>
  );
}

function ExerciseStep({
  ex, log, idx, count, last, onChange, onSetDone,
}: {
  ex: Exercise;
  log: ExerciseLog;
  idx: number;
  count: number;
  last: ReturnType<typeof lastSetsFor>;
  onChange: (l: ExerciseLog, immediate?: boolean) => void;
  onSetDone: (i: number, patch?: Partial<SetLog>) => void;
}) {
  const cur = log.sets.findIndex((s) => !s.done);
  const setField = (i: number, f: "reps" | "load", v: string) =>
    onChange({ ...log, sets: log.sets.map((s, j) => (j === i ? { ...s, [f]: v } : s)) }, false);

  return (
    <div className="stack">
      <p className="muted small">Esercizio {idx + 1} di {count}</p>
      <h1 className="ex-title">{prettyName(ex.name)}</h1>
      <a
        className="small muted"
        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name.toLowerCase() + " esecuzione")}`}
        target="_blank"
        rel="noreferrer"
      >
        Guarda come si esegue su YouTube
      </a>
      <div className="facts">
        <div className="fact"><div className="k">Recupero</div><div className="v">{ex.rest || fmtSec(ex.restSec)}</div></div>
        <div className="fact"><div className="k">TUT</div><div className="v">{ex.tempo || "–"}</div></div>
        <div className="fact"><div className="k">Buffer</div><div className="v">{ex.buffer ? ex.buffer.toLowerCase() : "–"}</div></div>
      </div>
      {ex.warmup ? (
        <p className="notice small">
          Riscaldamento: {ex.warmup.sets} {ex.warmup.sets === "1" ? "serie" : "serie"} da {ex.warmup.reps}
          {ex.warmup.load ? ` con ${ex.warmup.load} kg` : ""}
        </p>
      ) : null}
      {last ? (
        <p className="last">
          Ultima volta ({last.session.date.split("-").reverse().slice(0, 2).join("/")}, sett. {last.session.week}):{" "}
          <b>{last.sets.map((s) => `${s.reps}×${cleanLoad(s.load) || "–"}`).join("  ")}</b>
        </p>
      ) : null}

      <div style={{ marginTop: 6 }}>
        {log.sets.map((s, i) => {
          const tReps = (ex.reps[i] ?? ex.reps[ex.reps.length - 1] ?? "").toLowerCase();
          const tLoad = ex.loads[i] ?? "";
          return (
            <div key={i} className={`set ${s.done ? "done" : i === cur ? "cur" : ""}`}>
              <span className="n">{i + 1}</span>
              <div className="cell">
                <div className="tgt">{durationSec(tReps) ? "Tempo" : "Reps"} {tReps || "–"}</div>
                {durationSec(tReps) && !s.done ? (
                  <SetTimer
                    total={durationSec(tReps)!}
                    label={`serie ${i + 1}`}
                    value={s.reps}
                    onStop={(sec) => setField(i, "reps", fmtDuration(sec))}
                    onFinish={(sec) => onSetDone(i, { reps: fmtDuration(sec) })}
                  />
                ) : (
                  <input
                    inputMode={durationSec(tReps) ? "text" : "numeric"}
                    aria-label={`Ripetizioni serie ${i + 1}`}
                    value={s.reps}
                    placeholder={tReps}
                    onChange={(e) => setField(i, "reps", e.target.value)}
                  />
                )}
              </div>
              <div className="cell">
                <div className="tgt">Kg {tLoad ? cleanLoad(tLoad) + (ex.loadPct?.[i] ? ` (${ex.loadPct[i]})` : "") : "–"}</div>
                <LoadInput
                  label={`Carico serie ${i + 1}`}
                  value={s.load}
                  target={tLoad}
                  placeholder={cleanLoad(tLoad) + loadUnit(tLoad)}
                  onChange={(v) => setField(i, "load", v)}
                />
              </div>
              <button className="check" aria-label={s.done ? `Serie ${i + 1} fatta, annulla` : `Segna serie ${i + 1} come fatta`} onClick={() => onSetDone(i)}>
                <IconCheck />
              </button>
            </div>
          );
        })}
      </div>
      <div className="row wrap">
        <button className="btn sm ghost" onClick={() => onChange({ ...log, sets: [...log.sets, { ...(log.sets[log.sets.length - 1] ?? { reps: "", load: "" }), done: false, at: undefined }] })}>
          Aggiungi serie
        </button>
        {log.sets.length > 1 && !log.sets[log.sets.length - 1].done ? (
          <button className="btn sm ghost" onClick={() => onChange({ ...log, sets: log.sets.slice(0, -1) })}>Togli serie</button>
        ) : null}
        {cur >= 0 ? (
          <button className="btn sm ghost" onClick={() => setField(cur, "load", (log.sets[cur].load || cleanLoad(ex.loads[cur] ?? "").replace(/[^\d.,+]/g, "")) + "+")}>
            + Drop
          </button>
        ) : null}
        {cur >= 0 && isDrop(log.sets[cur].load) ? (
          <button className="btn sm ghost" onClick={() => setField(cur, "load", log.sets[cur].load.split("+").slice(0, -1).join("+"))}>Togli drop</button>
        ) : null}
      </div>
      <textarea
        className="input"
        style={{ minHeight: 60 }}
        placeholder="Note per il personal (sensazioni, dolori, tecnica)"
        value={log.note ?? ""}
        onChange={(e) => onChange({ ...log, note: e.target.value }, false)}
      />
    </div>
  );
}

function CardioStep({ wo, done, onToggle }: { wo: Workout; done: boolean; onToggle: () => void }) {
  const mins = parseInt(wo.cardio[0]?.match(/(\d+)\s*'/)?.[1] ?? "0", 10);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [start]);
  const elapsed = start ? (now - start) / 1000 : 0;
  return (
    <div className="stack">
      <p className="muted small">Ultimo step</p>
      <h1 className="ex-title">Cardio</h1>
      <p style={{ fontSize: 19 }}>{wo.cardio.map((c) => sentence(c)).join(", ")}</p>
      {mins ? (
        <div className="card stack" style={{ alignItems: "center" }}>
          <span className="num" style={{ fontSize: 64, lineHeight: 1 }}>{fmtSec(start ? Math.max(0, mins * 60 - elapsed) : mins * 60)}</span>
          <button className="btn block" onClick={() => setStart(start ? null : Date.now())}>{start ? "Ferma timer" : `Avvia timer da ${mins} minuti`}</button>
        </div>
      ) : null}
      <button className={`btn big block ${done ? "go" : ""}`} onClick={onToggle}>{done ? "Cardio fatto" : "Segna cardio come fatto"}</button>
    </div>
  );
}

function Summary({ s, wo, onClose }: { s: Session; wo: Workout; onClose: () => void }) {
  const mins = Math.round((+new Date(s.finishedAt!) - +new Date(s.startedAt)) / 60000);
  const sets = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const planned = s.exercises.reduce((a, e) => a + e.sets.length, 0);
  const tonnage = s.exercises.reduce(
    (a, e) => a + e.sets.filter((x) => x.done).reduce((b, x) => b + (parseFloat(x.reps) || 0) * (parseFloat((x.load || "").replace(",", ".")) || 0), 0),
    0
  );
  return (
    <main className="shell full stack-lg">
      <div style={{ marginTop: 40 }}>
        <span className={`letter ${wo.key} done`} style={{ width: 64, height: 64, fontSize: 34 }}>{wo.key}</span>
      </div>
      <h1>Allenamento {wo.key} completato</h1>
      <div className="facts">
        <div className="fact"><div className="k">Durata</div><div className="v">{mins} min</div></div>
        <div className="fact"><div className="k">Serie</div><div className="v">{sets}/{planned}</div></div>
        <div className="fact"><div className="k">Volume</div><div className="v">{Math.round(tonnage).toLocaleString("it-IT")} kg</div></div>
      </div>
      <p className="muted">Le serie sono salvate e finiranno nel report Excel per il personal.</p>
      <button className="btn primary big block" onClick={onClose}>Torna a oggi</button>
    </main>
  );
}

function useWakeLock(active: boolean) {
  const lock = useRef<any>(null);
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock.current = await (navigator as any).wakeLock.request("screen");
      } catch {}
    };
    acquire();
    const vis = () => document.visibilityState === "visible" && !cancelled && acquire();
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", vis);
      lock.current?.release?.().catch?.(() => {});
    };
  }, [active]);
}


/** Timed set (e.g. plank 1'30): tap to start the countdown, tap again to stop early. */
function SetTimer({ total, label, value, onStop, onFinish }: { total: number; label: string; value: string; onStop: (sec: number) => void; onFinish: (sec: number) => void }) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastBeep = useRef(0);
  useEffect(() => {
    if (!endAt) return;
    let wake: any;
    (navigator as any).wakeLock?.request?.("screen").then((w: any) => (wake = w)).catch(() => {});
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const left = Math.ceil((endAt - t) / 1000);
      if (left <= 3 && left > 0 && lastBeep.current !== left) {
        lastBeep.current = left;
        beep(1);
      }
      if (t >= endAt) {
        clearInterval(id);
        setEndAt(null);
        beep(3);
        navigator.vibrate?.([300, 150, 300]);
        onFinish(total);
      }
    }, 200);
    return () => {
      clearInterval(id);
      wake?.release?.().catch?.(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);

  if (endAt) {
    const left = Math.max(0, (endAt - now) / 1000);
    return (
      <button
        className="set-timer running"
        aria-label={`Ferma il timer della ${label}`}
        style={{ ["--p" as any]: `${(1 - left / total) * 100}%` }}
        onClick={() => {
          setEndAt(null);
          onStop(Math.round(total - left));
        }}
      >
        {fmtSec(Math.ceil(left))}
      </button>
    );
  }
  return (
    <button
      className="set-timer"
      aria-label={`Avvia il timer della ${label}`}
      onClick={() => {
        unlockAudio();
        lastBeep.current = 0;
        setNow(Date.now());
        setEndAt(Date.now() + total * 1000);
      }}
    >
      <IconPlay /> {value || fmtSec(total)}
    </button>
  );
}
