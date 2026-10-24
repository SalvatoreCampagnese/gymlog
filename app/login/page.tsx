"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="shell full" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100dvh" }}>
      <form
        className="stack-lg"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
          if (r.ok) location.href = "/";
          else {
            setErr("Password errata, riprova.");
            setBusy(false);
          }
        }}
      >
        <div className="row" style={{ gap: 6 }}>
          {["A", "B", "C", "D"].map((k) => <span key={k} className={`letter ${k}`} style={{ width: 30, height: 30, fontSize: 0 }} />)}
        </div>
        <h1 style={{ fontSize: 48 }}>GymLog</h1>
        <label className="field">
          Password
          <input className="input" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err ? <p className="err">{err}</p> : null}
        <button className="btn primary big block" disabled={busy || !pw}>Entra</button>
      </form>
    </main>
  );
}
