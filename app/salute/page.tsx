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
      <>Apri <B>Comandi Rapidi</B> e tocca <B>+</B> (o apri il tuo comando esistente e cancella tutte le azioni).</>,
      <>Chiamalo esattamente <B>{SHORTCUT_NAME}</B>: serve ai tasti "Aggiorna" e "Sync".</>,
      <>Tocca la <B>i</B> (o il nome in alto) → attiva <B>Ricevi input</B> e scegli solo <B>Testo</B>. Se compare "Se non c'è input", scegli <B>Continua</B>.</>,
    ],
  },
  {
    title: "Quali giorni sincronizzare",
    items: [
      <>Aggiungi <B>Se</B>: <B>Input comando rapido</B> → <B>ha qualsiasi valore</B>.</>,
      <>Nel ramo <B>Se</B>: aggiungi <B>Testo</B> e dentro metti la variabile <B>Input comando rapido</B>. Sono i giorni scelti dal sito.</>,
      <>Nel ramo <B>Altrimenti</B> (avvio da automazione o senza giorni) calcoli ieri e oggi:</>,
      <><B>Data</B> (Data corrente) → <B>Formatta data</B>: Formato data <B>Personalizzato</B>, scrivi <B>yyyy-MM-dd</B>, Formato ora <B>Nessuno</B> → <B>Imposta variabile</B> <B>oggi</B>.</>,
      <>Di nuovo <B>Data</B> → <B>Regola data</B>: <B>Sottrai 1 giorni</B> → <B>Formatta data</B> come sopra → <B>Imposta variabile</B> <B>ieri</B>.</>,
      <>Ancora nel ramo Altrimenti: <B>Testo</B> con <B>ieri</B>, a capo, <B>oggi</B> (una data per riga).</>,
      <>Dopo <B>Fine se</B>: aggiungi <B>Dividi testo</B>, come testo scegli <B>Se risultato</B>, separatore <B>Nuove righe</B>.</>,
    ],
  },
  {
    title: "Ripeti per ogni giorno",
    items: [
      <>Aggiungi <B>Ripeti con ciascuno</B> sul risultato di Dividi testo. Tutte le azioni dei passi successivi vanno <B>dentro</B> la ripetizione, fino a "Fine ripetizione".</>,
      <><B>Ottieni date da input</B> con <B>Elemento ripetizione</B> → <B>Imposta variabile</B> <B>inizio</B>.</>,
      <><B>Regola data</B>: <B>Aggiungi 1 giorni</B> a <B>inizio</B> → <B>Imposta variabile</B> <B>fine</B>.</>,
    ],
  },
  {
    title: "Blocco 1: calorie attive",
    items: [
      <>Aggiungi <B>Trova campioni di dati sanitari</B>, Tipo <B>Dispendio calorie attive</B> (in inglese "Active Energy").</>,
      <><B>Aggiungi filtro</B> → <B>Data di inizio</B> → <B>è tra</B> → <B>inizio</B> e <B>fine</B>.</>,
      <>Se hai sia iPhone sia Apple Watch, aggiungi un filtro <B>Origine</B> → <B>è</B> → il tuo Apple Watch: evita di contare due volte.</>,
      <><B>Raggruppa per</B>: <B>Giorno</B>. Fondamentale: senza questo invia migliaia di campioni.</>,
      <><B>Ottieni dettagli del campione di dati sanitari</B> → <B>Valore</B> → <B>Imposta variabile</B> <B>attive</B>.</>,
    ],
  },
  {
    title: "Blocco 2: calorie a riposo",
    items: [
      <>Nuovo <B>Trova campioni di dati sanitari</B> (non "Filtra"), Tipo <B>Dispendio calorie a riposo</B> ("Resting Calories").</>,
      <>Stessi filtri: <B>Data di inizio è tra inizio e fine</B>, <B>Origine</B> Apple Watch, <B>Raggruppa per Giorno</B>.</>,
      <><B>Ottieni dettagli</B> → <B>Valore</B> → <B>Imposta variabile</B> <B>riposo</B>.</>,
    ],
  },
  {
    title: "Blocco 3: passi",
    items: [
      <>Nuovo <B>Trova campioni di dati sanitari</B>, Tipo <B>Passi</B> ("Steps").</>,
      <>Stessi filtri: <B>tra inizio e fine</B>, <B>Origine</B> Apple Watch, <B>Raggruppa per Giorno</B>.</>,
      <><B>Ottieni dettagli</B> → <B>Valore</B> → <B>Imposta variabile</B> <B>passi</B>.</>,
    ],
  },
  {
    title: "Blocco 4: peso (facoltativo)",
    items: [
      <>Nuovo <B>Trova campioni di dati sanitari</B>, Tipo <B>Peso</B> ("Weight"), filtro <B>Data di inizio è tra inizio e fine</B>.</>,
      <><B>Ordina per</B> Data di inizio, <B>Più recenti prima</B>, <B>Limite</B> attivo a <B>1</B>.</>,
      <><B>Ottieni dettagli</B> → <B>Valore</B> → <B>Imposta variabile</B> <B>peso</B>. Nei giorni senza pesata resta vuoto e GymLog lo ignora.</>,
    ],
  },
  {
    title: "Invia a GymLog (sempre dentro la ripetizione)",
    items: [
      <>Aggiungi <B>Ottieni contenuti dell'URL</B> e incolla l'indirizzo che copi qui sopra.</>,
      <>Opzioni: <B>Metodo</B> POST, <B>Corpo della richiesta</B> JSON.</>,
      <>Aggiungi 5 campi di tipo <B>Testo</B> (non Numero: con Numero si perde la virgola dei decimali): <B>date</B>, <B>active</B>, <B>resting</B>, <B>steps</B>, <B>weight</B>.</>,
      <>Valori: <B>date</B> = <B>Elemento ripetizione</B>; gli altri = le variabili <B>attive</B>, <B>riposo</B>, <B>passi</B>, <B>peso</B>. Non usare "Valore" direttamente: si chiamano tutti uguale.</>,
      <>Facoltativo: <B>Mostra risultato</B> per vedere la risposta di ogni giorno.</>,
    ],
  },
  {
    title: "Prova",
    items: [
      <>Premi ▶ nel comando: senza input sincronizza <B>ieri e oggi</B>. Consenti la lettura di Salute se te lo chiede.</>,
      <>Poi torna qui e premi <B>Sync</B> su un giorno, o <B>Sincronizza ultimi 7 giorni</B>.</>,
      <>Ogni risposta deve dire <B>"ok": true</B> con la data giusta e numeri realistici.</>,
    ],
  },
  {
    title: "Rendilo automatico",
    items: [
      <>Salute è leggibile solo con iPhone sbloccato: un'automazione a mezzanotte con il telefono bloccato spesso fallisce.</>,
      <>Meglio così: <B>Automazione</B> → <B>+</B> → <B>Sveglia</B> → <B>Quando viene interrotta</B> → <B>Esegui immediatamente</B> → azione <B>Esegui comando</B> → <B>{SHORTCUT_NAME}</B>. Ogni mattina chiude il giorno prima con i totali completi.</>,
      <>In più puoi aggiungere <B>Ora del giorno</B> alle 22:30, Ogni giorno, Esegui immediatamente: aggiorna la giornata quando sei ancora sveglio.</>,
    ],
  },
  {
    title: "Backup del comando",
    items: [
      <>Quando funziona, tieni premuto il comando → <B>Condividi</B> → <B>Copia link iCloud</B>, oppure dal Mac: tasto destro → <B>Condividi</B> → <B>Esporta file</B>.</>,
      <>Il comando contiene la tua chiave privata: non pubblicare il link.</>,
    ],
  },
];

const runUrl = (dates?: string[]) =>
  `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}` + (dates?.length ? `&input=text&text=${encodeURIComponent(dates.join("\n"))}` : "");

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
          <p className="sub">Importa le calorie bruciate con l'Apple Watch, i passi e il peso con un comando rapido. Ci vogliono circa 10 minuti, una volta sola.</p>
        </div>
      </header>

      <div className="stack" style={{ gap: 8 }}>
        <a className="btn primary big block" href={runUrl()} onClick={() => run("now")}>
          {syncing === "now" ? "Aspetto i dati da Salute…" : "Aggiorna ieri e oggi"}
        </a>
        <a className="btn block" href={runUrl(last7.slice().reverse())} onClick={() => run("all")}>
          {syncing === "all" ? "Sincronizzo 7 giorni…" : "Sincronizza ultimi 7 giorni"}
        </a>
      </div>

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
              <a className="btn sm ghost" href={runUrl([d])} onClick={() => run(d)} aria-label={`Sincronizza ${shortDate(d)}`}>
                {syncing === d ? "…" : "Sync"}
              </a>
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
          <p>"Sta tentando di condividere migliaia di elementi di Salute": manca <B>Raggruppa per Giorno</B> o il filtro <B>Data di inizio è tra inizio e fine</B> in un blocco.</p>
          <p>Il tasto Sync di un giorno aggiorna invece oggi: il comando non usa ancora l'<B>Input comando rapido</B> (passi 1–3), oppure <B>Ricevi input</B> non è attivo.</p>
          <p>La risposta dice "scartati": quel campo ha ricevuto un numero impossibile, quasi sempre perché usa il "Valore" di un altro blocco. Riseleziona la variabile giusta.</p>
          <p>Un blocco restituisce vuoto: controlla che sia "Trova campioni di dati sanitari" e non "Filtra".</p>
        </div>
        <p className="faint tiny">I nomi delle azioni possono cambiare leggermente con la versione di iOS.</p>
      </section>
    </main>
  );
}
