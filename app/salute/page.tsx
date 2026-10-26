"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/client/store";
import { useHealthRefresh } from "@/lib/client/hooks";
import { addDays, shortDate, todayISO } from "@/lib/resolve";
import { IconLeft } from "@/components/Icons";

const SHORTCUT_NAME = "GymLog Salute";

type Step = { title: string; items: React.ReactNode[] };

const B = ({ children }: { children: React.ReactNode }) => <b style={{ color: "var(--text)" }}>{children}</b>;

const STEPS: Step[] = [
  {
    title: "Crea il comando",
    items: [
      <>Apri <B>Comandi Rapidi</B> e tocca <B>+</B> (se hai già il comando, cancella tutte le sue azioni e riparti da qui).</>,
      <>Chiamalo esattamente <B>{SHORTCUT_NAME}</B>: serve al tasto "Aggiorna".</>,
      <>Sono solo 5 azioni: 4 ricerche in Salute e un invio. Niente variabili, niente ripetizioni: i conti li fa GymLog.</>,
    ],
  },
  {
    title: "Azioni 1–4: i dati da Salute",
    items: [
      <>Aggiungi <B>Trova campioni di dati sanitari</B> con Tipo <B>Dispendio calorie attive</B> ("Active Energy").</>,
      <>Un solo filtro: <B>Data di inizio</B> → <B>negli ultimi</B> → <B>7 giorni</B>. <B>Raggruppa per</B>: <B>Giorno</B> (fondamentale, altrimenti invia migliaia di campioni).</>,
      <>Facoltativo, se hai iPhone e Apple Watch: filtro <B>Origine</B> → <B>è</B> → il tuo Apple Watch, così i passi non vengono contati due volte.</>,
      <>Ripeti la stessa azione, con gli stessi filtri, per <B>Dispendio calorie a riposo</B> ("Resting Calories"), <B>Passi</B> ("Steps") e <B>Peso</B> ("Weight"). Il peso puoi saltarlo.</>,
      <>Tieni premuta ogni azione per vederne il nome: saranno "Campioni di dati sanitari", "… 2", "… 3", "… 4" nell'ordine in cui le hai aggiunte.</>,
    ],
  },
  {
    title: "Azione 5: invia a GymLog",
    items: [
      <>Aggiungi <B>Ottieni contenuti dell'URL</B> e incolla l'indirizzo che copi qui sopra. Opzioni: <B>Metodo</B> POST, <B>Corpo della richiesta</B> JSON.</>,
      <>Per ogni ricerca aggiungi 2 campi di tipo <B>Testo</B>: uno con i valori e uno con le date.</>,
      <>Chiavi <B>active</B> e <B>active_dates</B> → i campioni della 1ª azione; <B>resting</B> e <B>resting_dates</B> → 2ª; <B>steps</B> e <B>steps_dates</B> → 3ª; <B>weight</B> e <B>weight_dates</B> → 4ª.</>,
      <>Come valore inserisci la variabile dei campioni giusti, poi toccala e scegli la proprietà: <B>Valore</B> per i campi senza "_dates", <B>Data di inizio</B> per quelli con "_dates" (se puoi scegliere il formato, metti <B>ISO 8601</B>).</>,
      <>Facoltativo: <B>Mostra risultato</B> in fondo, per vedere la risposta.</>,
    ],
  },
  {
    title: "Prova",
    items: [
      <>Premi ▶ e consenti la lettura di Salute se te lo chiede.</>,
      <>La risposta deve dire <B>"ok": true</B> e sotto <B>giorni</B> gli ultimi 7 giorni con calorie, passi e peso realistici.</>,
      <>Ogni volta che lo lanci aggiorna tutti e 7 i giorni: se un giorno era rimasto a metà, si sistema da solo al giro successivo.</>,
    ],
  },
  {
    title: "Rendilo automatico",
    items: [
      <>Salute è leggibile solo con iPhone sbloccato: un'automazione a mezzanotte con il telefono bloccato spesso fallisce.</>,
      <>Meglio: <B>Automazione</B> → <B>+</B> → <B>Sveglia</B> → <B>Quando viene interrotta</B> → <B>Esegui immediatamente</B> → <B>Esegui comando</B> → <B>{SHORTCUT_NAME}</B>.</>,
      <>Se vuoi, aggiungine una alle 22:30 (<B>Ora del giorno</B>, Ogni giorno, Esegui immediatamente).</>,
    ],
  },
  {
    title: "Backup del comando",
    items: [
      <>Quando funziona: tieni premuto il comando → <B>Condividi</B> → <B>Copia link iCloud</B>.</>,
      <>Il comando contiene la tua chiave privata: non pubblicare il link.</>,
    ],
  },
];

const runUrl = () => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;

export default function Salute() {
  const { state } = useStore();
  const healthSync = useHealthRefresh();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch("/api/health/info").then((r) => r.json()).then((j) => setUrl(j.url)).catch(() => {});
  }, []);
  // always the last 7 days, also the ones with no data yet, so they can be synced
  const today = todayISO();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const [syncing, setSyncing] = useState<string | null>(null);
  const run = (key: string) => {
    setSyncing(key);
    healthSync.start();
  };
  useEffect(() => {
    if (!healthSync.waiting) setSyncing(null);
  }, [healthSync.waiting]);

  return (
    <main className="shell stack-lg">
      <header className="page-head">
        <div>
          <Link href="/" className="small muted row back-link" style={{ gap: 4, textDecoration: "none" }}><IconLeft /> Oggi</Link>
          <h1 style={{ marginTop: 8 }}>Apple Salute</h1>
          <p className="sub">Importa le calorie bruciate con l'Apple Watch, i passi e il peso con un comando rapido. Ci vogliono pochi minuti, una volta sola.</p>
        </div>
      </header>

      <a className="btn primary big block" href={runUrl()} onClick={() => run("now")}>
        {syncing === "now" ? "Aspetto i dati da Salute…" : "Aggiorna da Salute (ultimi 7 giorni)"}
      </a>

      <section className="card stack">
        <h2>Ultimi dati ricevuti</h2>
        {last7.map((d) => {
          const h = state.health?.[d];
          const parts = [
            h?.active !== undefined ? `${h.active} attive` : "",
            h?.resting !== undefined ? `${h.resting} a riposo` : "",
            h?.steps !== undefined ? `${h.steps.toLocaleString("it-IT")} passi` : "",
          ].filter(Boolean);
          return (
            <div key={d} className="health-day">
              <span>{d === today ? "Oggi" : shortDate(d)}</span>
              <span className="muted small">{parts.length ? parts.join(", ") : "nessun dato"}</span>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <h2>Indirizzo per il comando</h2>
        {url ? (
          <>
            <code style={{ wordBreak: "break-all", fontSize: 13, background: "var(--bg)", padding: 10, borderRadius: 8 }}>{url}</code>
            <button
              className="btn block"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
            >
              {copied ? "Copiato" : "Copia indirizzo"}
            </button>
            <p className="faint tiny">Contiene una chiave privata: non condividerlo.</p>
          </>
        ) : (
          <p className="muted small">Carico…</p>
        )}
      </section>

      <section className="card stack">
        <h2>Come creare il comando</h2>
        <ol style={{ margin: 0, paddingLeft: 20 }} className="stack-lg">
          {STEPS.map((s) => (
            <li key={s.title}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>{s.title}</p>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="muted small stack" >
                {s.items.map((it, i) => <li key={i} style={{ listStyle: "disc" }}>{it}</li>)}
              </ul>
            </li>
          ))}
        </ol>
        <div className="notice small stack" style={{ gap: 8 }}>
          <p><B>Se qualcosa non va</B></p>
          <p>"Sta tentando di condividere migliaia di elementi di Salute": in una ricerca manca <B>Raggruppa per Giorno</B> o il filtro <B>negli ultimi 7 giorni</B>.</p>
          <p>"scartati" con "N valori ma M date": un campo "_dates" usa i campioni di un'altra ricerca, o la proprietà sbagliata. Ricontrolla che valori e date vengano dalla stessa azione.</p>
          <p>Numeri troppo alti, per esempio passi doppi: aggiungi il filtro <B>Origine</B> Apple Watch a quella ricerca.</p>
          <p>Un blocco restituisce vuoto: controlla che sia "Trova campioni di dati sanitari" e non "Filtra".</p>
        </div>
        <p className="faint tiny">I nomi delle azioni possono cambiare leggermente con la versione di iOS.</p>
      </section>
    </main>
  );
}
