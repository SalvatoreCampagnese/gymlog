/** Reads a JSON response; turns HTML/text errors (timeouts, crashes) into a readable message
 * instead of Safari's "The string did not match the expected pattern". */
export async function readJson(r: Response): Promise<any> {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    if (r.status === 504 || /timeout|timed out/i.test(text)) return { error: "Il server ci ha messo troppo. Riprova." };
    return { error: `Il server ha risposto in modo inatteso (${r.status}). Riprova tra poco.` };
  }
}
