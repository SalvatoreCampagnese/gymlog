import "server-only";
import { createAnonClient } from "./supabase/server";

export const siteUrl = (req: Request) => (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");

/** Sends the login magic link (email template: supabase/templates/magic_link.html). */
export async function sendMagicLink(req: Request, email: string): Promise<string | null> {
  const { error } = await createAnonClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl(req)}/auth/confirm` },
  });
  return error ? error.message : null;
}

export const cleanName = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
export function num(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
}
