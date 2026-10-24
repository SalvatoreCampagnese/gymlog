"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJson } from "@/lib/client/http";
import { sumEntries } from "@/lib/client/hooks";
import { addDays, cleanLoad, dietFor, prettyName, resolveDate, shortDate, shownWeight, todayISO } from "@/lib/resolve";
import type { AppState, ProgramFile } from "@/lib/types";
import { LineChart } from "@/components/LineChart";
import { MacroLine } from "@/components/AddFood";
import { Confirm } from "@/components/Confirm";
import { IconLeft } from "@/components/Icons";

type Client = { id: string; first_name: string; last_name: string; email: string; height_cm: number | null; start_weight_kg: number | null; created_at: string };
type Workbook = { id: string; file_name: string; size_bytes: number; program_titles: string[]; note: string | null; uploaded_at: string };
type Tab = "schede" | "allenamenti" | "dieta" | "peso" | "dati";
const TABS: [Tab, string][] = [["schede", "Schede"], ["allenamenti", "Allenamenti"], ["dieta", "Dieta"], ["peso", "Peso e attività"], ["dati", "Dati"]];

const when = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [books, setBooks] = useState<Workbook[]>([]);
  const [state, setState] = useState<AppState | null>(null);
  const [program, setProgram] = useState<ProgramFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("schede");

  const load = useCallback(async () => {
    const q = `?client=${encodeURIComponent(id)}`;
    const [a, b, c] = await Promise.all([
      fetch(`/api/trainer/clients/${id}`, { cache: "no-store" }),
      fetch(`/api/state${q}`, { cache: "no-store" }),
      fetch(`/api/program${q}`, { cache: "no-store" }),
    ]);
    const [ja, jb, jc] = await Promise.all([readJson(a), readJson(b), readJson(c)]);
    if (!a.ok) return setErr(ja.error);
    setClient(ja.client);
    setBooks(ja.workbooks);
    if (b.ok) setState(jb);
    if (c.ok) setProgram(jc);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <main className="shell wide full"><p className="err">{err}</p><Link href="/trainer">Torna ai clienti</Link></main>;
  if (!client) return <main className="shell wide full"><p className="muted">Carico…</p></main>;

  return (
    <main className="shell wide full stack-lg">
      <header className="page-head">
        <div>
          <Link href="/trainer" className="small muted row back-link" style={{ gap: 4, textDecoration: "none" }}><IconLeft /> Clienti</Link>
          <h1 style={{ marginTop: 8 }}>{client.first_name} {client.last_name}</h1>
          <p className="sub">{client.email}</p>
        </div>
      </header>

      <div className="seg" role="tablist" aria-label="Sezioni">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "schede" ? <Workbooks clientId={id} books={books} onChange={load} hasLogs={!!state?.sessions.length} /> : null}
      {tab === "allenamenti" ? <Sessions state={state} program={program} /> : null}
      {tab === "dieta" ? <Diet state={state} program={program} /> : null}
      {tab === "peso" ? <Body state={state} client={client} /> : null}
      {tab === "dati" ? <Details client={client} onSaved={load} /> : null}
    </main>
  );
}

// ---------------------------------------------------------------- Schede

function Workbooks({ clientId, books, onChange, hasLogs }: { clientId: string; books: Workbook[]; onChange: () => void; hasLogs: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [del, setDel] = useState<Workbook | null>(null);

  const upload = async (f: File) => {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("note", note);
    const r = await fetch(`/api/trainer/clients/${clientId}/workbooks`, { method: "POST", body: fd });
    const j = await readJson(r);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    setNote("");
    setMsg({ ok: true, text: `Scheda caricata: ${j.programs.length} ${j.programs.length === 1 ? "foglio letto" : "fogli letti"}. Il cliente la vede subito.` });
    onChange();
  };

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2>Carica la scheda</h2>
        <p className="muted small">
          Carica l'Excel completo con tutte le schede (un foglio per scheda, allenamenti A–D, 4 settimane e dieta). La nuova versione diventa quella attiva; le
          precedenti restano nello storico qui sotto e i log del cliente non si perdono.
        </p>
        <input className="input" placeholder="Nota (facoltativa), es. nuova scheda ipertrofia" value={note} onChange={(e) => setNote(e.target.value)} />
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button className="btn primary block" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Carico e controllo il file…" : "Scegli il file Excel"}
        </button>
        {msg ? <p className={msg.ok ? "notice small" : "err"}>{msg.text}</p> : null}
      </section>

      <section className="card stack">
        <h2>Storico schede</h2>
        {books.length ? (
          books.map((b, i) => (
            <div key={b.id} className="book-row">
              <div style={{ minWidth: 0 }}>
                <p>
                  <b className="ellipsis">{b.file_name}</b> {i === 0 ? <span className="chip ok">Attiva</span> : null}
                </p>
                <p className="muted small">Caricata il {when(b.uploaded_at)} · {(b.size_bytes / 1024).toFixed(0)} KB</p>
                {b.note ? <p className="small">{b.note}</p> : null}
                {b.program_titles.length ? <p className="faint tiny">Schede: {b.program_titles.join(", ")}</p> : null}
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <a className="btn sm ghost" href={`/api/trainer/clients/${clientId}/workbooks/${b.id}`}>Originale</a>
                {hasLogs ? <a className="btn sm" href={`/api/export?client=${clientId}&workbook=${b.id}`}>Con report</a> : null}
                <button className="btn sm danger" onClick={() => setDel(b)}>Elimina</button>
              </div>
            </div>
          ))
        ) : (
          <p className="muted small">Ancora nessuna scheda: finché non ne carichi una, il cliente vede solo dieta e peso.</p>
        )}
      </section>

      {del ? (
        <Confirm
          title="Eliminare questa scheda?"
          body={`${del.file_name}, caricata il ${when(del.uploaded_at)}. ${books[0]?.id === del.id ? "È la scheda attiva: il cliente vedrà la versione precedente, se c'è." : ""} I log del cliente restano.`}
          confirmLabel="Elimina"
          danger
          onCancel={() => setDel(null)}
          onConfirm={async () => {
            await fetch(`/api/trainer/clients/${clientId}/workbooks/${del.id}`, { method: "DELETE" });
            setDel(null);
            onChange();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Allenamenti

function Sessions({ state, program }: { state: AppState | null; program: ProgramFile | null }) {
  const sessions = useMemo(() => [...(state?.sessions ?? [])].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)), [state]);
  const title = (pid: string) => program?.programs.find((p) => p.id === pid)?.title ?? pid;
  if (!state) return <p className="muted">Carico…</p>;
  if (!sessions.length) return <p className="empty">Nessun allenamento registrato.</p>;
  return (
    <div className="stack">
      {sessions.map((s) => {
        const done = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
        return (
          <details key={s.id} className="card fold">
            <summary className="row between">
              <div>
                <h3>
                  <span className={`letter ${s.workout}`} style={{ width: 26, height: 26, fontSize: 15, marginRight: 8 }}>{s.workout}</span>
                  {shortDate(s.date)} · settimana {s.week}
                </h3>
                <p className="muted small">{title(s.programId)} · {done} serie {s.finishedAt ? "" : "· non terminato"}</p>
              </div>
              <span className="muted small">Dettagli</span>
            </summary>
            <div className="stack" style={{ marginTop: 10 }}>
              {s.exercises.map((e) => (
                <div key={e.exerciseId}>
                  <p style={{ fontWeight: 600 }}>{prettyName(e.name)}</p>
                  <p className="small muted">
                    {e.sets.filter((x) => x.done).map((x) => `${x.reps || "–"}×${cleanLoad(x.load) || "–"}`).join("   ") || "nessuna serie fatta"}
                  </p>
                  {e.note ? <p className="small">Nota: {e.note}</p> : null}
                </div>
              ))}
              {s.note ? <p className="notice small">{s.note}</p> : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Dieta

function Diet({ state, program }: { state: AppState | null; program: ProgramFile | null }) {
  const today = todayISO();
  const days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => addDays(today, -i)).map((d) => {
      const entries = state?.food[d] ?? [];
      const r = program ? resolveDate(program, d) : null;
      return { d, entries, eaten: sumEntries(entries), target: r ? dietFor(r.week, d) : undefined };
    });
  }, [state, program, today]);
  if (!state) return <p className="muted">Carico…</p>;
  return (
    <section className="card stack">
      <h2>Ultimi 14 giorni</h2>
      {days.map(({ d, entries, eaten, target }) => (
        <details key={d} className="diet-day">
          <summary>
            <span>{d === today ? "Oggi" : shortDate(d)}</span>
            <span className="num">{entries.length ? Math.round(eaten.kcal) : "–"}<span className="faint"> / {target?.kcal ?? "–"} kcal</span></span>
            {entries.length ? <span className="small m"><MacroLine m={eaten} /></span> : <span className="faint small m">nessun pasto registrato</span>}
          </summary>
          {entries.length ? (
            <ul className="small muted" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {entries.map((e) => (
                <li key={e.id}>{e.meal}: {e.name}{e.grams ? ` ${e.grams} g` : ""}, {Math.round(e.kcal)} kcal</li>
              ))}
            </ul>
          ) : null}
        </details>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- Peso e attività

function Body({ state, client }: { state: AppState | null; client: Client }) {
  if (!state) return <p className="muted">Carico…</p>;
  const off = state.settings?.weightOffset;
  const weights = Object.entries(state.weight).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-60).map(([d, kg]) => ({ x: shortDate(d), y: shownWeight(kg, off) }));
  const last = weights[weights.length - 1];
  const health = Object.entries(state.health ?? {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14);
  const bmi = last && client.height_cm ? last.y / Math.pow(client.height_cm / 100, 2) : null;
  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2>Peso</h2>
        <div className="facts" style={{ marginTop: 0 }}>
          <div className="fact"><div className="k">Iniziale</div><div className="v">{client.start_weight_kg ?? "–"} kg</div></div>
          <div className="fact"><div className="k">Ultimo</div><div className="v">{last ? `${last.y} kg` : "–"}</div></div>
          <div className="fact"><div className="k">BMI</div><div className="v">{bmi ? bmi.toFixed(1) : "–"}</div></div>
        </div>
        {weights.length ? <LineChart data={weights} unit="kg" /> : <p className="muted small">Nessuna pesata registrata.</p>}
      </section>
      <section className="card stack">
        <h2>Attività (Apple Salute)</h2>
        {health.length ? (
          health.map(([d, h]) => (
            <div key={d} className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span>{shortDate(d)}</span>
              <span className="muted small">
                {[h.active !== undefined ? `${h.active} kcal attive` : "", h.resting !== undefined ? `${h.resting} a riposo` : "", h.steps !== undefined ? `${h.steps.toLocaleString("it-IT")} passi` : ""].filter(Boolean).join(", ")}
              </span>
            </div>
          ))
        ) : (
          <p className="muted small">Il cliente non ha collegato Apple Salute.</p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Dati

function Details({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const [f, setF] = useState({
    first_name: client.first_name,
    last_name: client.last_name,
    height_cm: client.height_cm?.toString() ?? "",
    start_weight_kg: client.start_weight_kg?.toString().replace(".", ",") ?? "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const call = async (key: string, url: string, init: RequestInit, ok: string) => {
    setBusy(key);
    setMsg(null);
    const r = await fetch(url, init);
    const j = await readJson(r);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: j.error });
    return r.ok;
  };
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2>Anagrafica</h2>
        <div className="row">
          <label className="field grow">Nome<input className="input" value={f.first_name} onChange={set("first_name")} /></label>
          <label className="field grow">Cognome<input className="input" value={f.last_name} onChange={set("last_name")} /></label>
        </div>
        <div className="row">
          <label className="field grow">Peso iniziale (kg)<input className="input" inputMode="decimal" value={f.start_weight_kg} onChange={set("start_weight_kg")} /></label>
          <label className="field grow">Altezza (cm)<input className="input" inputMode="numeric" value={f.height_cm} onChange={set("height_cm")} /></label>
        </div>
        <p className="faint tiny">Email: {client.email} · cliente dal {new Date(client.created_at).toLocaleDateString("it-IT")}</p>
        <button
          className="btn primary"
          disabled={busy === "save"}
          onClick={async () => (await call("save", `/api/trainer/clients/${client.id}`, json("PATCH", f), "Dati salvati.")) && onSaved()}
        >
          {busy === "save" ? "Salvo…" : "Salva"}
        </button>
      </section>

      <section className="card stack">
        <h2>Accesso</h2>
        <p className="muted small">Se il cliente non trova l'email o il link è scaduto, mandagliene uno nuovo. Puoi anche impostare una nuova password.</p>
        <button className="btn" disabled={busy === "invite"} onClick={() => call("invite", `/api/trainer/clients/${client.id}/invite`, { method: "POST" }, `Link inviato a ${client.email}.`)}>
          {busy === "invite" ? "Invio…" : "Invia di nuovo il link di accesso"}
        </button>
        <div className="row">
          <input className="input grow" type="text" placeholder="Nuova password (min. 8 caratteri)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <button
            className="btn"
            disabled={pw.length < 8 || busy === "pw"}
            onClick={async () => (await call("pw", `/api/trainer/clients/${client.id}/password`, json("POST", { password: pw }), "Password aggiornata: comunicala al cliente.")) && setPw("")}
          >
            Imposta
          </button>
        </div>
      </section>
      {msg ? <p className={msg.ok ? "notice small" : "err"}>{msg.text}</p> : null}
    </div>
  );
}
