import "server-only";

/** Chat completion that must return JSON matching `schema`. */
export async function aiJson<T>(opts: { system: string; content: any[]; name: string; schema: object; effort?: "minimal" | "low" | "medium" }): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Manca OPENAI_API_KEY nelle variabili di Vercel");
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      ...(opts.effort && /^(gpt-5|o\d)/.test(model) ? { reasoning_effort: opts.effort } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.content },
      ],
      response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: opts.schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ha risposto ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return JSON.parse(j.choices[0].message.content) as T;
}
