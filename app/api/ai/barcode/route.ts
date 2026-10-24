import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Reads the digits printed under a barcode when the camera decoder fails.
export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Manca OPENAI_API_KEY" }, { status: 500 });
  const { image } = (await req.json()) as { image?: string };
  if (!image) return NextResponse.json({ error: "Foto mancante" }, { status: 400 });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Leggi le cifre stampate sotto il codice a barre (EAN-13, EAN-8 o UPC) in questa foto. " +
                "Se non sono leggibili con certezza, code = null. In product scrivi marca e nome del prodotto se si vedono, altrimenti stringa vuota.",
            },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "barcode",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { code: { type: ["string", "null"] }, product: { type: "string" } },
            required: ["code", "product"],
          },
        },
      },
    }),
  });
  if (!res.ok) return NextResponse.json({ error: `OpenAI ${res.status}` }, { status: 502 });
  const j = await res.json();
  try {
    const out = JSON.parse(j.choices[0].message.content);
    const digits = typeof out.code === "string" ? out.code.replace(/\D/g, "") : "";
    return NextResponse.json({ code: [8, 12, 13, 14].includes(digits.length) ? digits : null, product: out.product || "" });
  } catch {
    return NextResponse.json({ code: null, product: "" });
  }
}
