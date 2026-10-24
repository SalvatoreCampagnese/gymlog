import { NextResponse } from "next/server";

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
          name: { type: "string", description: "Nome dell'alimento in italiano" },
          grams: { type: "number", description: "Peso stimato della porzione in grammi" },
          kcal_100g: { type: "number" },
          protein_100g: { type: "number" },
          carbs_100g: { type: "number" },
          fat_100g: { type: "number" },
        },
        required: ["name", "grams", "kcal_100g", "protein_100g", "carbs_100g", "fat_100g"],
      },
    },
    note: { type: "string", description: "Breve nota su incertezze della stima, in italiano" },
  },
  required: ["items", "note"],
};

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Manca OPENAI_API_KEY nelle variabili di Vercel" }, { status: 500 });
  const { text, image } = (await req.json()) as { text?: string; image?: string };
  if (!text?.trim() && !image) return NextResponse.json({ error: "Scrivi cosa hai mangiato o allega una foto" }, { status: 400 });

  const content: any[] = [];
  content.push({
    type: "text",
    text:
      (text?.trim() ? `Pasto descritto: ${text.trim()}\n` : "") +
      "Scomponi il pasto in alimenti singoli. Per ognuno stima i grammi effettivi (se indicati usa quelli; se il peso è a crudo usa valori a crudo) " +
      "e i valori nutrizionali per 100 g secondo le tabelle CREA italiane. Sii realistico sulle porzioni e sull'olio di condimento.",
  });
  if (image) content.push({ type: "image_url", image_url: { url: image } });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      messages: [
        { role: "system", content: "Sei un nutrizionista sportivo italiano. Rispondi solo con il JSON richiesto." },
        { role: "user", content },
      ],
      response_format: { type: "json_schema", json_schema: { name: "meal", strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `OpenAI ha risposto ${res.status}: ${t.slice(0, 300)}` }, { status: 502 });
  }
  const j = await res.json();
  try {
    const out = JSON.parse(j.choices[0].message.content);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Risposta AI non leggibile, riprova" }, { status: 502 });
  }
}
