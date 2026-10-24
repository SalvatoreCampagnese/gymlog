"use client";
import { readJson } from "@/lib/client/http";
import { useMemo, useRef, useState } from "react";
import { useStore, uid } from "@/lib/client/store";
import { resizeImage, MacroLine } from "@/components/AddFood";
import { Sheet } from "@/components/Sheet";
import { Confirm } from "@/components/Confirm";
import { IconCamera } from "@/components/Icons";
import { shortDate, todayISO, diffDays } from "@/lib/resolve";
import type { PantryItem, PantryLocation } from "@/lib/types";

const LOCATIONS: PantryLocation[] = ["Frigo", "Freezer", "Dispensa"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export default function Frigo() {
  const { state, dispatch } = useStore();
  const [loc, setLoc] = useState<PantryLocation | "Tutto">("Tutto");
  const [q, setQ] = useState("");
  const [scan, setScan] = useState(false);
  const [edit, setEdit] = useState<PantryItem | null>(null);
  const pantry = state.pantry ?? [];
  const today = todayISO();

  const shown = useMemo(() => {
    const qq = norm(q);
    return pantry
      .filter((p) => (loc === "Tutto" || p.location === loc) && (!qq || norm(p.name + " " + (p.brand ?? "")).includes(qq)))
      .sort((a, b) => (a.expires ?? "9999") < (b.expires ?? "9999") ? -1 : (a.expires ?? "9999") > (b.expires ?? "9999") ? 1 : a.name.localeCompare(b.name));
  }, [pantry, loc, q]);

  const counts = LOCATIONS.map((l) => pantry.filter((p) => p.location === l).length);
  const expiring = pantry.filter((p) => p.expires && diffDays(p.expires, today) <= 2);

  return (
    <main className="shell stack-lg">
      <header className="page-head">
        <div>
          <h1>Frigo</h1>
          <p className="sub">{pantry.length ? `${pantry.length} alimenti tra frigo, freezer e dispensa` : "Il tuo inventario di cucina"}</p>
        </div>
      </header>

      <div className="row">
        <button className="btn primary grow big" onClick={() => setScan(true)}><IconCamera /> Fotografa e aggiorna</button>
        <button className="btn" style={{ minHeight: 60 }} onClick={() => setEdit({ id: uid(), name: "", qty: "", location: loc === "Tutto" ? "Frigo" : loc, updatedAt: "" })}>A mano</button>
      </div>

      {expiring.length ? (
        <div className="notice small">
          In scadenza: {expiring.map((p) => `${p.name} (${p.expires! < today ? "scaduto" : shortDate(p.expires!)})`).join(", ")}
        </div>
      ) : null}

      <div className="seg" role="group" aria-label="Dove">
        {(["Tutto", ...LOCATIONS] as const).map((l, i) => (
          <button key={l} aria-pressed={loc === l} onClick={() => setLoc(l)}>
            {l}{i ? ` ${counts[i - 1]}` : ""}
          </button>
        ))}
      </div>

      {pantry.length > 6 ? (
        <input className="input" type="search" placeholder="Cerca nell'inventario" value={q} onChange={(e) => setQ(e.target.value)} />
      ) : null}

      {shown.length ? (
        <section className="card">
          {shown.map((p) => (
            <button key={p.id} className="pantry-row" onClick={() => setEdit(p)}>
              <span style={{ fontWeight: 600 }}>
                {p.name}
                {p.brand ? <span className="muted" style={{ fontWeight: 400 }}>, {p.brand}</span> : null}
              </span>
              <span className="muted small" style={{ textAlign: "right" }}>{p.qty || (p.grams ? `${p.grams} g` : "")}</span>
              <span className="faint tiny" style={{ gridColumn: "1 / -1" }}>
                {loc === "Tutto" ? `${p.location}` : ""}
                {p.expires ? `${loc === "Tutto" ? ", " : ""}scade ${shortDate(p.expires)}` : ""}
                {p.per100 ? `${loc === "Tutto" || p.expires ? ", " : ""}${p.per100.kcal} kcal/100 g` : ""}
              </span>
            </button>
          ))}
        </section>
      ) : (
        <p className="empty">
          {pantry.length
            ? "Niente qui."
            : "Fotografa frigo, freezer e scaffali: l'AI riconosce gli alimenti e le quantità. Poi \"Organizza i pasti\" nella Dieta userà quello che hai in casa."}
        </p>
      )}

      {scan ? (
        <ScanSheet
          defaultLocation={loc === "Tutto" ? "Frigo" : loc}
          existing={pantry}
          onClose={() => setScan(false)}
          onSave={(items) => {
            dispatch({ type: "upsertPantry", items });
            setScan(false);
          }}
        />
      ) : null}
      {edit ? (
        <EditItem
          item={edit}
          isNew={!pantry.some((p) => p.id === edit.id)}
          onClose={() => setEdit(null)}
          onSave={(it) => {
            dispatch({ type: "upsertPantry", items: [it] });
            setEdit(null);
          }}
          onDelete={() => {
            dispatch({ type: "deletePantry", id: edit.id });
            setEdit(null);
          }}
        />
      ) : null}
    </main>
  );
}

type Found = {
  name: string;
  brand: string;
  qty: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  keep: boolean;
};

function ScanSheet({
  defaultLocation,
  existing,
  onClose,
  onSave,
}: {
  defaultLocation: PantryLocation;
  existing: PantryItem[];
  onClose: () => void;
  onSave: (items: PantryItem[]) => void;
}) {
  const [location, setLocation] = useState<PantryLocation>(defaultLocation);
  const [images, setImages] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<Found[] | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/ai/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, location, hint }),
      });
      const j = await readJson(r);
      if (!r.ok) throw new Error(j.error);
      setFound(j.items.map((i: any) => ({ ...i, keep: true })));
      setNote(j.note);
    } catch (e: any) {
      setErr(e.message || "Analisi non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!found) return;
    const now = new Date().toISOString();
    const items: PantryItem[] = found
      .filter((f) => f.keep && f.name.trim())
      .map((f) => {
        // same food already in this place: update its quantity instead of duplicating it
        const same = existing.find((e) => e.location === location && norm(e.name) === norm(f.name));
        return {
          id: same?.id ?? uid(),
          name: f.name.trim(),
          brand: f.brand || same?.brand,
          qty: f.qty,
          grams: Math.round(f.grams) || undefined,
          location,
          per100: same?.per100 ?? { kcal: Math.round(f.kcal_100g), protein: f.protein_100g, carbs: f.carbs_100g, fat: f.fat_100g },
          barcode: same?.barcode,
          expires: same?.expires,
          updatedAt: now,
        };
      });
    onSave(items);
  };

  return (
    <Sheet
      onClose={onClose}
      head={
        <div className="stack" style={{ gap: 10 }}>
          <h2>Fotografa e aggiorna</h2>
          <div className="seg" role="group" aria-label="Dove">
            {LOCATIONS.map((l) => (
              <button key={l} aria-pressed={location === l} onClick={() => setLocation(l)}>{l}</button>
            ))}
          </div>
        </div>
      }
    >
      {!found ? (
        <>
          <p className="muted small">
            Fai da 1 a 4 foto ({location.toLowerCase()} aperto, un ripiano alla volta se è pieno). L'AI riconosce gli alimenti e stima quanto ne resta.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const img = await resizeImage(f, 1280);
                setImages((x) => [...x, img].slice(0, 4));
              }
              e.target.value = "";
            }}
          />
          {images.length ? (
            <div className="thumbs">
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Foto ${i + 1}`} onClick={() => setImages(images.filter((_, j) => j !== i))} />
              ))}
            </div>
          ) : null}
          {images.length < 4 ? (
            <button className="btn block" onClick={() => fileRef.current?.click()}>
              <IconCamera /> {images.length ? "Aggiungi un'altra foto" : "Scatta una foto"}
            </button>
          ) : null}
          {images.length ? <p className="faint tiny">Tocca una foto per toglierla.</p> : null}
          <input className="input" placeholder="Note facoltative, es. il latte è quasi finito" value={hint} onChange={(e) => setHint(e.target.value)} />
          <button className="btn primary big block" disabled={!images.length || busy} onClick={run}>
            {busy ? "Riconosco gli alimenti…" : "Analizza le foto"}
          </button>
          {err ? <p className="err">{err}</p> : null}
        </>
      ) : (
        <>
          <p className="muted small">
            Ho trovato {found.length} alimenti. Correggi nomi e quantità, togli la spunta a quello che non vuoi salvare.
            Quelli già presenti in {location.toLowerCase()} vengono aggiornati, non duplicati.
          </p>
          {found.map((f, i) => {
            const upd = (patch: Partial<Found>) => setFound(found.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const already = existing.some((e) => e.location === location && norm(e.name) === norm(f.name));
            return (
              <div key={i} className="card flat stack" style={{ gap: 8, opacity: f.keep ? 1 : 0.5, padding: 12 }}>
                <div className="row">
                  <input type="checkbox" checked={f.keep} onChange={(e) => upd({ keep: e.target.checked })} style={{ width: 22, height: 22 }} aria-label={`Salva ${f.name}`} />
                  <input className="input grow" value={f.name} onChange={(e) => upd({ name: e.target.value })} aria-label="Nome" />
                </div>
                <div className="row">
                  <input className="input grow" value={f.qty} onChange={(e) => upd({ qty: e.target.value })} aria-label="Quantità" />
                  <input className="input" style={{ width: 90 }} inputMode="decimal" value={f.grams || ""} placeholder="g" onChange={(e) => upd({ grams: parseFloat(e.target.value) || 0 })} aria-label="Grammi" />
                </div>
                <span className="small muted food-row" style={{ padding: 0, border: 0, cursor: "default" }}>
                  <span className="m">
                    {Math.round(f.kcal_100g)} kcal/100 g{"  "}
                    <MacroLine m={{ protein: f.protein_100g, carbs: f.carbs_100g, fat: f.fat_100g }} />
                    {already ? <span className="chip warn" style={{ marginLeft: 6 }}>aggiorna</span> : null}
                  </span>
                </span>
              </div>
            );
          })}
          {note ? <p className="faint small">{note}</p> : null}
          <div className="row">
            <button className="btn ghost" onClick={() => setFound(null)}>Rifai</button>
            <button className="btn primary grow" onClick={save}>Salva {found.filter((f) => f.keep).length} alimenti</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function EditItem({
  item,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  item: PantryItem;
  isNew: boolean;
  onClose: () => void;
  onSave: (it: PantryItem) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState(item);
  const [ask, setAsk] = useState(false);
  const set = (patch: Partial<PantryItem>) => setF({ ...f, ...patch });
  return (
    <>
      <Sheet onClose={onClose} tall={false} head={<h2 style={{ marginTop: 6 }}>{isNew ? "Aggiungi alimento" : f.name || "Alimento"}</h2>}>
        <label className="field">Nome<input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Es. petto di pollo" /></label>
        <div className="row">
          <label className="field grow">Quantità<input className="input" value={f.qty} onChange={(e) => set({ qty: e.target.value })} placeholder="Es. 2 confezioni" /></label>
          <label className="field" style={{ width: 100 }}>Grammi<input className="input" inputMode="decimal" value={f.grams ?? ""} onChange={(e) => set({ grams: parseFloat(e.target.value) || undefined })} /></label>
        </div>
        <div className="row">
          <label className="field grow">Dove
            <select className="input" value={f.location} onChange={(e) => set({ location: e.target.value as PantryLocation })}>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="field grow">Scadenza<input className="input" type="date" value={f.expires ?? ""} onChange={(e) => set({ expires: e.target.value || undefined })} /></label>
        </div>
        <div className="row">
          {!isNew ? <button className="btn danger" onClick={() => setAsk(true)}>Elimina</button> : null}
          <button className="btn primary grow" disabled={!f.name.trim()} onClick={() => onSave({ ...f, name: f.name.trim(), updatedAt: new Date().toISOString() })}>
            {isNew ? "Aggiungi" : "Salva"}
          </button>
        </div>
        {!isNew ? (
          <button className="btn ghost block" onClick={onDelete}>È finito, toglilo</button>
        ) : null}
      </Sheet>
      {ask ? (
        <Confirm title={`Eliminare ${f.name}?`} confirmLabel="Elimina" danger onCancel={() => setAsk(false)} onConfirm={onDelete} />
      ) : null}
    </>
  );
}
