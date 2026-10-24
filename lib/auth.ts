// Edge-compatible helpers (used by middleware and route handlers)
export const AUTH_COOKIE = "gl_auth";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`gymlog:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
