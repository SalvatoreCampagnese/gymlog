"use client";
import { readJson } from "@/lib/client/http";
import { useEffect, useRef, useState } from "react";
import { useStore, uid } from "@/lib/client/store";
import type { FoodEntry, SavedFood } from "@/lib/types";
import { IconBarcode, IconSpark } from "./Icons";
import { Sheet } from "./Sheet";

export const MEALS = ["Colazione", "Spuntino", "Pranzo", "Pre allenamento", "Cena", "Extra"];

type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
type Pick = { key: string; name: string; brand?: string; barcode?: string; per100: Per100; servingGrams?: number; source: FoodEntry["source"] | "generic" };

export function defaultMeal(): string {
  const h = new Date().getHours();
  if (h < 10) return "Colazione";
  if (h < 12) return "Spuntino";
  if (h < 15) return "Pranzo";
  if (h < 19) return "Pre allenamento";
  if (h < 23) return "Cena";
  return "Extra";
}

const calc = (p: Per100, g: number) => ({
  kcal: Math.round((p.kcal * g) / 100),
  protein: Math.round((p.protein * g) / 10) / 10,
  carbs: Math.round((p.carbs * g) / 10) / 10,
  fat: Math.round((p.fat * g) / 10) / 10,
});

const fmtG = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)).toLocaleString("it-IT");

/** Compact one-line version for lists: full macro names, coloured dot per macro. */
export function MacroLine({ m }: { m: { protein: number; carbs: number; fat: number } }) {
  return (
    <span className="macro-line">
      <span><i style={{ background: "var(--protein)" }} />Proteine {fmtG(m.protein)} g</span>
      <span><i style={{ background: "var(--carbs)" }} />Carboidrati {fmtG(m.carbs)} g</span>
      <span><i style={{ background: "var(--fat)" }} />Grassi {fmtG(m.fat)} g</span>
    </span>
  );
}

/** Kcal total, a bar split by where the calories come from, and the three macros spelled out below. */
export function MacroCard({ m }: { m: { kcal: number; protein: number; carbs: number; fat: number } }) {
  const parts = [
    { label: "Proteine", g: m.protein, kcal: m.protein * 4, c: "var(--protein)" },
    { label: "Carboidrati", g: m.carbs, kcal: m.carbs * 4, c: "var(--carbs)" },
    { label: "Grassi", g: m.fat, kcal: m.fat * 9, c: "var(--fat)" },
  ];
  const tot = parts.reduce((a, p) => a + p.kcal, 0) || 1;
  return (
    <div className="macro-card">
      <p><span className="num" style={{ fontSize: 30 }}>{Math.round(m.kcal)}</span> <span className="muted">kcal</span></p>
      <div className="split" role="img" aria-label={parts.map((p) => `${p.label} ${fmtG(p.g)} grammi`).join(", ")}>
        {parts.map((p) => (p.kcal > 0 ? <i key={p.label} style={{ flexGrow: p.kcal / tot, background: p.c }} /> : null))}
      </div>
      <div className="split-legend">
        {parts.map((p) => (
          <div key={p.label}>
            <span className="k"><i style={{ background: p.c }} />{p.label}</span>
            <span className="v">{fmtG(p.g)} g</span>
            <span className="faint tiny">{Math.round((p.kcal / tot) * 100)}% kcal</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AddFood({ date, initialMeal, onClose }: { date: string; initialMeal?: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<"search" | "barcode" | "ai" | "manual">("search");
  const [meal, setMeal] = useState(initialMeal ?? defaultMeal());
  const [pick, setPick] = useState<Pick | null>(null);
  const [aiPrefill, setAiPrefill] = useState("");
  const askAi = (text: string) => {
    setAiPrefill(text);
    setTab("ai");
  };

  const addEntry = (p: Pick, grams: number) => {
    const m = calc(p.per100, grams);
    const now = new Date().toISOString();
    const entry: FoodEntry = {
      id: uid(),
      meal,
      name: p.name,
      brand: p.brand,
      barcode: p.barcode,
      grams,
      ...m,
      per100: p.per100,
      source: p.source === "generic" ? "manual" : (p.source as FoodEntry["source"]),
      at: now,
    };
    const saved: SavedFood = {
      key: p.barcode ? `bc:${p.barcode}` : `n:${p.name.toLowerCase()}`,
      name: p.name,
      brand: p.brand,
      barcode: p.barcode,
      per100: p.per100,
      defaultGrams: grams,
      uses: 0,
      lastUsed: now,
    };
    dispatch({ type: "addFood", date, entry }, { type: "upsertSavedFood", food: saved });
  };

  return (
    <Sheet
      onClose={onClose}
      head={
        <div className="stack" style={{ gap: 10 }}>
          <div className="row between">
            <h2>Aggiungi a</h2>
            <select className="input" style={{ width: "auto", minHeight: 40 }} value={meal} onChange={(e) => setMeal(e.target.value)} aria-label="Pasto">
              {MEALS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          {!pick ? (
            <div className="seg" role="tablist">
              <button aria-pressed={tab === "search"} onClick={() => setTab("search")}>Cerca</button>
              <button aria-pressed={tab === "barcode"} onClick={() => setTab("barcode")}><IconBarcode /> Barcode</button>
              <button aria-pressed={tab === "ai"} onClick={() => setTab("ai")}><IconSpark /> AI</button>
              <button aria-pressed={tab === "manual"} onClick={() => setTab("manual")}>A mano</button>
            </div>
          ) : null}
        </div>
      }
    >
      {pick ? (
        <Portion
          pick={pick}
          onBack={() => setPick(null)}
          onAdd={(g) => {
            addEntry(pick, g);
            setPick(null);
            onClose();
          }}
        />
      ) : (
        <>
          {tab === "search" ? <Search saved={state.savedFoods} onPick={setPick} onAskAi={askAi} /> : null}
          {tab === "barcode" ? <Barcode onPick={setPick} onAskAi={askAi} /> : null}
          {tab === "ai" ? (
            <AiEstimate
              initialText={aiPrefill}
              onAddAll={(items) => {
                items.forEach((it) => addEntry({ key: it.name, name: it.name, per100: it.per100, source: "ai" }, it.grams));
                onClose();
              }}
            />
          ) : null}
          {tab === "manual" ? (
            <Manual
              onAdd={(e) => {
                dispatch({ type: "addFood", date, entry: { ...e, id: uid(), meal, at: new Date().toISOString(), source: "manual" } });
                onClose();
              }}
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}

function Portion({ pick, onBack, onAdd }: { pick: Pick; onBack: () => void; onAdd: (g: number) => void }) {
  const [g, setG] = useState(String(pick.servingGrams ?? 100));
  const grams = parseFloat(g.replace(",", ".")) || 0;
  const m = calc(pick.per100, grams);
  return (
    <div className="stack">
      <div>
        <h3>{pick.name}</h3>
        {pick.brand ? <p className="muted small">{pick.brand}</p> : null}
        <p className="faint small">Per 100 g: {pick.per100.kcal} kcal, proteine {pick.per100.protein} g, carboidrati {pick.per100.carbs} g, grassi {pick.per100.fat} g</p>
      </div>
      <label className="field">
        Grammi
        <input className="input" inputMode="decimal" autoFocus value={g} onChange={(e) => setG(e.target.value)} style={{ fontSize: 24, fontFamily: "var(--display)", fontWeight: 600 }} />
      </label>
      <div className="row wrap" style={{ gap: 6 }}>
        {[50, 100, 150, 200, pick.servingGrams].filter((x, i, a): x is number => !!x && a.indexOf(x) === i).map((x) => (
          <button key={x} className="btn sm ghost" onClick={() => setG(String(x))}>{x} g</button>
        ))}
      </div>
      <MacroCard m={m} />
      <div className="row">
        <button className="btn ghost" onClick={onBack}>Indietro</button>
        <button className="btn primary grow" disabled={!grams} onClick={() => onAdd(grams)}>Aggiungi {grams ? `${grams} g` : ""}</button>
      </div>
    </div>
  );
}

const searchCache = new Map<string, { generic: Pick[]; products: Pick[]; warning?: string }>();

function Search({ saved, onPick, onAskAi }: { saved: SavedFood[]; onPick: (p: Pick) => void; onAskAi: (t: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ generic: Pick[]; products: Pick[]; warning?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    const my = ++seq.current;
    const key = q.trim().toLowerCase();
    if (searchCache.has(key)) {
      setRes(searchCache.get(key)!);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/food/search?q=${encodeURIComponent(q.trim())}`);
        const j = await readJson(r);
        if (!j.warning) searchCache.set(key, j);
        if (my === seq.current) setRes(j);
      } catch {
        if (my === seq.current) setRes({ generic: [], products: [], warning: "Ricerca non riuscita, sei offline?" });
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 650);
    return () => clearTimeout(t);
  }, [q]);

  const ql = q.trim().toLowerCase();
  const recent = saved
    .filter((s) => !ql || s.name.toLowerCase().includes(ql) || (s.brand ?? "").toLowerCase().includes(ql))
    .sort((a, b) => b.uses - a.uses || (b.lastUsed > a.lastUsed ? 1 : -1))
    .slice(0, ql ? 5 : 12);

  const Row = ({ p, sub }: { p: Pick; sub?: string }) => (
    <button className="food-row" onClick={() => onPick(p)}>
      <span>{p.name}{p.brand ? <span className="muted">, {p.brand}</span> : null}</span>
      <span className="k">{p.per100.kcal}<span className="faint small"> /100g</span></span>
      <span className="m"><MacroLine m={p.per100} />{sub ? <span className="faint" style={{ display: "block", marginTop: 2 }}>{sub}</span> : null}</span>
    </button>
  );

  return (
    <div className="stack">
      <div className="sticky-field">
        <input className="input" type="search" enterKeyHint="search" placeholder="Cerca alimento o prodotto, es. yogurt greco" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      </div>
      {recent.length ? (
        <div>
          <p className="muted small" style={{ marginBottom: 2 }}>{ql ? "Già usati" : "Usati di recente"}</p>
          {recent.map((s) => (
            <Row key={s.key} p={{ ...s, servingGrams: s.defaultGrams, source: "recent" }} sub={`ultima volta ${s.defaultGrams} g`} />
          ))}
        </div>
      ) : null}
      {busy ? <p className="muted small">Cerco su Open Food Facts…</p> : null}
      {res?.warning ? (
        <div className="notice stack" style={{ gap: 8 }}>
          <p>{res.warning} Puoi riprovare tra poco oppure farti stimare i valori dall'AI.</p>
          <div className="row">
            <button className="btn sm" onClick={() => { searchCache.delete(q.trim().toLowerCase()); setQ(q + " "); setTimeout(() => setQ(q.trim()), 0); }}>Riprova</button>
            <button className="btn sm primary" onClick={() => onAskAi(q.trim())}>Stima con AI</button>
          </div>
        </div>
      ) : null}
      {res?.generic.length ? (
        <div>
          <p className="muted small" style={{ marginBottom: 2 }}>Alimenti base</p>
          {res.generic.map((p) => <Row key={p.key} p={p} />)}
        </div>
      ) : null}
      {res?.products.length ? (
        <div>
          <p className="muted small" style={{ marginBottom: 2 }}>Prodotti confezionati</p>
          {res.products.map((p) => <Row key={p.key} p={p} />)}
        </div>
      ) : null}
      {res && !busy && !res.generic.length && !res.products.length && !res.warning ? (
        <p className="empty">Nessun risultato per "{q}".</p>
      ) : null}
      {res && !busy && !res.warning ? (
        <button className="btn ghost block" onClick={() => onAskAi(q.trim())}>Non è nella lista? Stima "{q.trim()}" con l'AI</button>
      ) : null}
    </div>
  );
}

async function loadZxing() {
  const [{ BrowserMultiFormatReader }, lib] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map();
  hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [
    lib.BarcodeFormat.EAN_13,
    lib.BarcodeFormat.EAN_8,
    lib.BarcodeFormat.UPC_A,
    lib.BarcodeFormat.UPC_E,
    lib.BarcodeFormat.CODE_128,
  ]);
  hints.set(lib.DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
}

/** Tries native BarcodeDetector, then zxing on the full frame and on a centred crop. */
async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const det = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const found = await det.detect(canvas);
      if (found?.[0]?.rawValue) return found[0].rawValue;
    } catch {}
  }
  const reader = await loadZxing();
  const attempts: HTMLCanvasElement[] = [canvas];
  // centred horizontal band, upscaled: helps when the barcode is small in the photo
  const crop = document.createElement("canvas");
  const cw = canvas.width * 0.8, ch = canvas.height * 0.45;
  crop.width = Math.min(1600, cw * 1.5);
  crop.height = (crop.width / cw) * ch;
  crop.getContext("2d")!.drawImage(canvas, canvas.width * 0.1, canvas.height * 0.275, cw, ch, 0, 0, crop.width, crop.height);
  attempts.push(crop);
  // tighter centre crop, upscaled more, in greyscale with extra contrast
  const crop2 = document.createElement("canvas");
  const w2 = canvas.width * 0.6, h2 = canvas.height * 0.35;
  crop2.width = 1800;
  crop2.height = (1800 / w2) * h2;
  const g2 = crop2.getContext("2d")!;
  g2.filter = "grayscale(1) contrast(1.6)";
  g2.imageSmoothingQuality = "high";
  g2.drawImage(canvas, canvas.width * 0.2, canvas.height * 0.325, w2, h2, 0, 0, crop2.width, crop2.height);
  attempts.push(crop2);
  for (const c of attempts) {
    try {
      return reader.decodeFromCanvas(c).getText();
    } catch {}
  }
  return null;
}

function canvasFrom(src: HTMLVideoElement | ImageBitmap, max = 1600): HTMLCanvasElement {
  const w = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
  const h = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(src as any, 0, 0, c.width, c.height);
  return c;
}

function Barcode({ onPick, onAskAi }: { onPick: (p: Pick) => void; onAskAi: (t: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("Inquadra il codice a barre: lo leggo da solo.");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [camOk, setCamOk] = useState(true);
  const stopRef = useRef<() => void>(() => {});
  const doneRef = useRef(false);

  const lookup = async (c: string) => {
    doneRef.current = true;
    stopRef.current();
    setCode(c);
    setBusy(true);
    setErr(null);
    setStatus(`Codice ${c}: cerco il prodotto…`);
    try {
      const r = await fetch(`/api/food/barcode/${encodeURIComponent(c)}`);
      const j = await readJson(r);
      if (!r.ok) throw new Error(j.error);
      onPick(j);
    } catch (e: any) {
      setErr(`${e.message || "Prodotto non trovato"} (codice ${c}).`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  // Last resort: ask the AI to read the digits printed under the barcode
  const readWithAi = async (canvas: HTMLCanvasElement) => {
    setStatus("Non riesco a leggerlo, provo con l'AI…");
    try {
      const r = await fetch("/api/ai/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: canvas.toDataURL("image/jpeg", 0.85) }),
      });
      const j = await readJson(r);
      if (j.code) return lookup(j.code);
      setStatus("");
      setErr(
        j.product
          ? `Non leggo il codice, ma sembra "${j.product}".`
          : "Non riesco a leggere il codice. Avvicina il telefono, evita i riflessi o scrivi le cifre qui sotto."
      );
      if (j.product) setCode("");
      (window as any).__glGuess = j.product;
    } catch {
      setStatus("");
      setErr("Non riesco a leggere il codice. Scrivi le cifre qui sotto.");
    }
  };

  const decodeAndLookup = async (canvas: HTMLCanvasElement) => {
    setBusy(true);
    setErr(null);
    setStatus("Leggo il codice…");
    const c = await decodeCanvas(canvas);
    setBusy(false);
    if (c) return lookup(c);
    await readWithAi(canvas);
  };

  const snap = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) {
      fileRef.current?.click();
      return;
    }
    navigator.vibrate?.(30);
    await decodeAndLookup(canvasFrom(v));
  };

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    stopRef.current = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        const track = stream.getVideoTracks()[0];
        try {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] });
        } catch {}
        const v = video.current;
        if (!v || stopped) return stopRef.current();
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        v.muted = true;
        await v.play();
        const reader = await loadZxing();
        const BD = (window as any).BarcodeDetector;
        const det = BD ? new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] }) : null;
        const work = document.createElement("canvas");
        let last = 0;
        const tick = async (t: number) => {
          if (stopped || doneRef.current) return;
          if (t - last > 220 && v.videoWidth) {
            last = t;
            try {
              if (det) {
                const f = await det.detect(v);
                if (f?.[0]?.rawValue) return lookup(f[0].rawValue);
              }
              // zxing on a centred band of the frame: faster and more reliable than the full frame
              const bw = v.videoWidth * 0.85, bh = v.videoHeight * 0.4;
              work.width = Math.min(1280, bw);
              work.height = (work.width / bw) * bh;
              work.getContext("2d")!.drawImage(v, v.videoWidth * 0.075, v.videoHeight * 0.3, bw, bh, 0, 0, work.width, work.height);
              const res = reader.decodeFromCanvas(work);
              if (res) {
                navigator.vibrate?.(80);
                return lookup(res.getText());
              }
            } catch {}
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setCamOk(false);
        setStatus("");
        setErr("La fotocamera non si apre qui. Usa \"Fai una foto\" oppure scrivi il codice.");
      }
    })();
    return () => stopRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack scanner">
      {camOk ? (
        <div style={{ position: "relative" }}>
          <video ref={video} muted playsInline autoPlay />
          <div aria-hidden style={{ position: "absolute", left: "7.5%", right: "7.5%", top: "30%", bottom: "30%", border: "2px solid var(--yellow)", borderRadius: 10, boxShadow: "0 0 0 999px rgba(0,0,0,.35)" }} />
        </div>
      ) : null}
      {status ? <p className="muted small">{status}</p> : null}
      <div className="row">
        {camOk ? <button className="btn primary grow" disabled={busy} onClick={snap}>Scatta e leggi</button> : null}
        <button className={`btn ${camOk ? "ghost" : "primary grow"}`} disabled={busy} onClick={() => fileRef.current?.click()}>Fai una foto</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const bmp = await createImageBitmap(f);
          await decodeAndLookup(canvasFrom(bmp));
          e.target.value = "";
        }}
      />
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) lookup(code.trim()); }}>
        <input className="input grow" inputMode="numeric" placeholder="Oppure scrivi le cifre del codice" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn" disabled={busy || !code.trim()}>Cerca</button>
      </form>
      {err ? (
        <div className="stack" style={{ gap: 8 }}>
          <p className="err">{err}</p>
          <button className="btn sm ghost" onClick={() => onAskAi((window as any).__glGuess || "")}>Stima con l'AI</button>
        </div>
      ) : null}
    </div>
  );
}

type AiItem = { name: string; grams: number; per100: Per100 };

export async function resizeImage(file: File, max = 1024): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

function AiEstimate({ initialText, onAddAll }: { initialText?: string; onAddAll: (items: AiItem[]) => void }) {
  const [text, setText] = useState(initialText ?? "");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<AiItem[] | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/ai/food", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, image }) });
      const j = await readJson(r);
      if (!r.ok) throw new Error(j.error);
      setItems(
        j.items.map((i: any) => ({
          name: i.name,
          grams: Math.round(i.grams),
          per100: { kcal: Math.round(i.kcal_100g), protein: i.protein_100g, carbs: i.carbs_100g, fat: i.fat_100g },
        }))
      );
      setNote(j.note);
    } catch (e: any) {
      setErr(e.message || "Stima non riuscita");
    } finally {
      setBusy(false);
    }
  };

  if (items) {
    const tot = items.reduce((a, i) => {
      const m = calc(i.per100, i.grams);
      return { kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat };
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    return (
      <div className="stack">
        <p className="muted small">Controlla e correggi i grammi prima di aggiungere.</p>
        {items.map((it, i) => {
          const m = calc(it.per100, it.grams);
          return (
            <div key={i} className="row" style={{ borderTop: i ? "1px solid var(--line)" : 0, paddingTop: i ? 10 : 0 }}>
              <div className="grow">
                <p style={{ fontWeight: 600 }}>{it.name}</p>
                <p className="small muted food-row" style={{ padding: 0, border: 0, display: "block", cursor: "default" }}>
                  <span className="m">{m.kcal} kcal  <MacroLine m={m} /></span>
                </p>
              </div>
              <input className="input" style={{ width: 84, textAlign: "center" }} inputMode="decimal" value={it.grams}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, grams: parseFloat(e.target.value) || 0 } : x)))} aria-label={`Grammi ${it.name}`} />
              <button className="btn sm ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Togli ${it.name}`}>Togli</button>
            </div>
          );
        })}
        {note ? <p className="faint small">{note}</p> : null}
        <div className="row">
          <button className="btn ghost" onClick={() => setItems(null)}>Rifai</button>
          <button className="btn primary grow" disabled={!items.length} onClick={() => onAddAll(items)}>Aggiungi {Math.round(tot.kcal)} kcal</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <textarea className="input" placeholder="Descrivi il pasto, es. 90 g di pasta con tonno al naturale e un cucchiaio d'olio, insalata" value={text} onChange={(e) => setText(e.target.value)} />
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await resizeImage(f)); }} />
      {image ? (
        <div className="row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Foto del pasto" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10 }} />
          <button className="btn sm ghost" onClick={() => setImage(null)}>Togli foto</button>
        </div>
      ) : (
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>Scatta o scegli una foto del piatto</button>
      )}
      <button className="btn primary block" disabled={busy || (!text.trim() && !image)} onClick={run}>
        {busy ? "Stimo i macro…" : "Stima con AI"}
      </button>
      {err ? <p className="err">{err}</p> : null}
    </div>
  );
}

function Manual({ onAdd }: { onAdd: (e: Omit<FoodEntry, "id" | "meal" | "at" | "source">) => void }) {
  const [f, setF] = useState({ name: "", grams: "", kcal: "", protein: "", carbs: "", fat: "" });
  const n = (v: string) => parseFloat(v.replace(",", ".")) || 0;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onAdd({ name: f.name || "Alimento", grams: n(f.grams), kcal: n(f.kcal), protein: n(f.protein), carbs: n(f.carbs), fat: n(f.fat) }); }}>
      <label className="field">Nome<input className="input" value={f.name} onChange={set("name")} placeholder="Es. panino al bar" /></label>
      <div className="row">
        <label className="field grow">Grammi<input className="input" inputMode="decimal" value={f.grams} onChange={set("grams")} /></label>
        <label className="field grow">Kcal totali<input className="input" inputMode="decimal" value={f.kcal} onChange={set("kcal")} /></label>
      </div>
      <div className="row">
        <label className="field grow">Proteine g<input className="input" inputMode="decimal" value={f.protein} onChange={set("protein")} /></label>
        <label className="field grow">Carboidrati g<input className="input" inputMode="decimal" value={f.carbs} onChange={set("carbs")} /></label>
        <label className="field grow">Grassi g<input className="input" inputMode="decimal" value={f.fat} onChange={set("fat")} /></label>
      </div>
      <button className="btn primary block" disabled={!n(f.kcal)}>Aggiungi</button>
    </form>
  );
}
