"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [err, setErr] = useState<string | null>(params.get("error") === "link" ? "Il link non è valido o è scaduto. Chiedine uno nuovo qui sotto." : null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // logged out: no diary copies should stay on this device
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("gl.")).forEach((k) => localStorage.removeItem(k));
    } catch {}
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const sb = createClient();
    if (mode === "password") {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
      if (error) {
        setErr(/invalid/i.test(error.message) ? "Email o password errate." : error.message);
        setBusy(false);
        return;
      }
      location.href = "/"; // full reload: the server routes trainer and clients to their area
      return;
    }
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/confirm` },
    });
    setBusy(false);
    // same message whether or not the address exists: no account enumeration
    if (error && !/signups not allowed|not found|otp_disabled/i.test(error.message)) setErr(error.message);
    else setSent(true);
  };

  return (
    <main className="shell full" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100dvh" }}>
      <form className="stack-lg" onSubmit={submit}>
        <div className="row" style={{ gap: 6 }}>
          {["A", "B", "C", "D"].map((k) => <span key={k} className={`letter ${k}`} style={{ width: 30, height: 30, fontSize: 0 }} />)}
        </div>
        <h1 style={{ fontSize: 48 }}>GymLog</h1>
        <label className="field">
          Email
          <input className="input" type="email" autoFocus autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === "password" ? (
          <label className="field">
            Password
            <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
        ) : null}
        {err ? <p className="err">{err}</p> : null}
        {sent ? (
          <p className="notice small">Se l'indirizzo è registrato, ti abbiamo mandato un link per entrare. Aprilo da questo telefono.</p>
        ) : (
          <button className="btn primary big block" disabled={busy || !email || (mode === "password" && !pw)}>
            {busy ? "Un attimo…" : mode === "password" ? "Entra" : "Mandami il link"}
          </button>
        )}
        <button
          type="button"
          className="btn ghost block"
          onClick={() => {
            setMode(mode === "password" ? "link" : "password");
            setSent(false);
            setErr(null);
          }}
        >
          {mode === "password" ? "Entra con un link via email" : "Entra con la password"}
        </button>
        <p className="faint tiny">Gli account li crea il tuo personal trainer: non ci si può registrare da qui.</p>
      </form>
    </main>
  );
}
