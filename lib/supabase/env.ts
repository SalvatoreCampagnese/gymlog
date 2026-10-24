// Supabase settings. Local: values printed by `supabase start` / `supabase status`.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/** Cookie with "role:userId", set by the middleware so pages know who is logged in without another request. */
export const ROLE_COOKIE = "gl_role";
export type Role = "trainer" | "client";
export function parseRoleCookie(v: string | undefined): { role: Role; userId: string } | null {
  const [role, userId] = (v ?? "").split(":");
  return (role === "trainer" || role === "client") && userId ? { role, userId } : null;
}
