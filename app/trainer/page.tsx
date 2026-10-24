"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { readJson } from "@/lib/client/http";

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  lastActivity: string | null;
  plan: { file_name: string; uploaded_at: string } | null;
};

const ago = (iso: string | null) => {
  if (!iso) return "mai";
  const d = Math.floor((Date.now() - +new Date(iso)) / 86400000);
  return d <= 0 ? "oggi" : d === 1 ? "ieri" : `${d} giorni fa`;
};

export default function Clients() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    const r = await fetch("/api/trainer/clients", { cache: "no-store" });
    const j = await readJson(r);
    if (!r.ok) return setErr(j.error);
    setRows(j.clients);
  };
  useEffect(() => {
    load();
  }, []);

  const list = (rows ?? []).filter((c) => `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main className="shell wide full stack-lg">
      <header className="page-head">
        <div>
          <h1>Clienti</h1>
          <p className="sub">{rows ? `${rows.length} ${rows.length === 1 ? "cliente" : "clienti"}` : "Carico…"}</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>Nuovo cliente</button>
      </header>

      {err ? <p className="err">{err}</p> : null}
      {rows && rows.length > 6 ? <input className="input" placeholder="Cerca per nome o email" value={q} onChange={(e) => setQ(e.target.value)} /> : null}

      {rows && !rows.length ? (
        <div className="card empty stack">
          <p>Non hai ancora clienti. Crea il primo: riceverà un'email con il link per entrare.</p>
          <button className="btn primary" onClick={() => setAdding(true)}>Crea il primo cliente</button>
        </div>
      ) : null}

      <div className="client-grid">
        {list.map((c) => (
          <Link key={c.id} href={`/trainer/clienti/${c.id}`} className="card client-card">
            <div className="avatar" aria-hidden>{(c.first_name[0] ?? "") + (c.last_name[0] ?? "")}</div>
            <div style={{ minWidth: 0 }}>
              <h3>{c.first_name} {c.last_name}</h3>
              <p className="muted small ellipsis">{c.email}</p>
              <p className="small" style={{ marginTop: 6 }}>
                {c.plan ? <span className="chip ok">Scheda dal {new Date(c.plan.uploaded_at).toLocaleDateString("it-IT")}</span> : <span className="chip warn">Senza scheda</span>}
                <span className="faint tiny" style={{ marginLeft: 8 }}>Attività: {ago(c.lastActivity)}</span>
              </p>
            </div>
          </Link>
        ))}
      </div>

      {adding ? <NewClient onClose={() => setAdding(false)} onCreated={load} /> : null}
    </main>
  );
}

function NewClient({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", password: "", height_cm: "", weight_kg: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; emailSent: boolean; emailError: string | null } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/trainer/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await readJson(r);
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    setDone(j);
    onCreated();
  };

  return (
    <Sheet onClose={onClose} tall={false} head={<h2 style={{ marginTop: 6 }}>Nuovo cliente</h2>}>
      {done ? (
        <div className="stack">
          <p>
            Account creato per <b>{f.first_name} {f.last_name}</b>.
          </p>
          {done.emailSent ? (
            <p className="notice small">Abbiamo mandato a {f.email} un'email con il link per entrare. Può entrare anche con email e la password che hai scelto.</p>
          ) : (
            <p className="err">L'email con il link non è partita ({done.emailError}). Il cliente può comunque entrare con email e password, oppure riprova dalla sua scheda.</p>
          )}
          <div className="row">
            <Link className="btn primary grow" href={`/trainer/clienti/${done.id}`}>Carica la scheda</Link>
            <button className="btn ghost" onClick={onClose}>Chiudi</button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="row">
            <label className="field grow">Nome<input className="input" required value={f.first_name} onChange={set("first_name")} autoComplete="off" /></label>
            <label className="field grow">Cognome<input className="input" required value={f.last_name} onChange={set("last_name")} autoComplete="off" /></label>
          </div>
          <div className="row">
            <label className="field grow">Peso (kg)<input className="input" inputMode="decimal" value={f.weight_kg} onChange={set("weight_kg")} placeholder="es. 82,5" /></label>
            <label className="field grow">Altezza (cm)<input className="input" inputMode="numeric" value={f.height_cm} onChange={set("height_cm")} placeholder="es. 178" /></label>
          </div>
          <label className="field">Email<input className="input" type="email" required value={f.email} onChange={set("email")} autoComplete="off" /></label>
          <label className="field">
            Password
            <input className="input" type="text" required minLength={8} value={f.password} onChange={set("password")} autoComplete="new-password" placeholder="almeno 8 caratteri" />
          </label>
          <p className="faint tiny">Il cliente riceve un'email con il link per entrare la prima volta. Comunicagli tu la password per gli accessi successivi.</p>
          {err ? <p className="err">{err}</p> : null}
          <button className="btn primary big block" disabled={busy}>{busy ? "Creo l'account…" : "Crea cliente e invia il link"}</button>
        </form>
      )}
    </Sheet>
  );
}
