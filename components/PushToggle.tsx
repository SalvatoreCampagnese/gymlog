"use client";
import { useEffect, useState } from "react";
import { enablePush, isStandalone, pushEnabled, pushSupported } from "@/lib/client/push";

/** Offers to turn on the lock-screen alert for the end of each rest. */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(true);
  useEffect(() => {
    setOn(pushEnabled());
    setStandalone(isStandalone() || pushSupported());
  }, []);
  if (on) return compact ? null : <p className="chip ok" style={{ alignSelf: "center" }}>Avviso a schermo bloccato attivo</p>;
  return (
    <div className="notice stack" style={{ gap: 8 }}>
      <p className="small">
        {standalone
          ? "Vuoi l'avviso di fine recupero anche con il telefono bloccato o se esci dall'app?"
          : "Per l'avviso di fine recupero a schermo bloccato, aggiungi GymLog alla schermata Home (Condividi > Aggiungi alla schermata Home) e aprila da lì."}
      </p>
      {standalone ? (
        <button
          className="btn sm primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const r = await enablePush();
              if (r.ok) setOn(true);
              else setMsg(r.reason ?? "Non riesco ad attivare le notifiche");
            } catch (e: any) {
              setMsg(e?.message ?? "Non riesco ad attivare le notifiche");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Attivo…" : "Attiva avviso"}
        </button>
      ) : null}
      {msg ? <p className="err">{msg}</p> : null}
    </div>
  );
}
