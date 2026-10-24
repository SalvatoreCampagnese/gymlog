import { NextResponse } from "next/server";
import { aiJson } from "@/lib/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Nome generico dell'alimento in italiano, es. 'Yogurt greco 0%'" },
          brand: { type: "string", description: "Marca se leggibile, altrimenti stringa vuota" },
          qty: { type: "string", description: "Quantità visibile in parole, es. '2 vasetti', '1 bottiglia da 1 L', 'mezza confezione'" },
          grams: { type: "number", description: "Stima dei grammi (o ml) rimasti in totale" },
          kcal_100g: { type: "number" },
          protein_100g: { type: "number" },
          carbs_100g: { type: "number" },
          fat_100g: { type: "number" },
        },
        required: ["name", "brand", "qty", "grams", "kcal_100g", "protein_100g", "carbs_100g", "fat_100g"],
      },
    },
    note: { type: "string" },
  },
  required: ["items", "note"],
};

export async function POST(req: Request) {
  const { images, location, hint } = (await req.json()) as { images?: string[]; location?: string; hint?: string };
  if (!images?.length) return NextResponse.json({ error: "Scatta almeno una foto" }, { status: 400 });
  try {
    const out = await aiJson<{ items: any[]; note: string }>({
      name: "pantry",
      system: "Sei un assistente che fa l'inventario di cucina. Rispondi solo con il JSON richiesto, in italiano.",
      schema,
      content: [
        {
          type: "text",
          text:
            `Queste foto mostrano: ${location || "frigorifero o dispensa"}. ` +
            "Elenca ogni alimento riconoscibile (non stoviglie, non contenitori vuoti). Unisci i doppioni sommando la quantità. " +
            "Per ognuno stima quantità rimasta e valori nutrizionali per 100 g (tabelle CREA o etichetta se leggibile). " +
            "Se un oggetto non è riconoscibile con ragionevole certezza, non inserirlo e citalo nella nota." +
            (hint ? ` Indicazioni dell'utente: ${hint}` : ""),
        },
        ...images.slice(0, 4).map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Analisi non riuscita" }, { status: 502 });
  }
}
