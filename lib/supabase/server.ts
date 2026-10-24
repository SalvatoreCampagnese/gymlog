import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

/** Client acting as the logged-in user (cookies): every query goes through Row Level Security. */
export async function createClient(): Promise<SupabaseClient> {
  assertSupabaseEnv();
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the middleware refreshes the session instead
        }
      },
    },
  });
}

/** Service role client: bypasses RLS. Only for checks already done in code (admin tasks, Apple Health token, caches). */
export function createAdminClient(): SupabaseClient {
  assertSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Manca SUPABASE_SERVICE_ROLE_KEY");
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anonymous client without a session, used to send magic links from the server. */
export function createAnonClient(): SupabaseClient {
  assertSupabaseEnv();
  return createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
}
