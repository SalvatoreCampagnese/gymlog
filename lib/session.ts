import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

export type Profile = {
  id: string;
  role: "trainer" | "client";
  trainer_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  height_cm: number | null;
  start_weight_kg: number | null;
  created_at: string;
};
// health_token is never selectable by users (column grant): list columns explicitly
export const PROFILE_COLS = "id, role, trainer_id, first_name, last_name, email, height_cm, start_weight_kg, created_at";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Ctx = { sb: SupabaseClient; user: User; profile: Profile };

export async function requireUser(): Promise<Ctx> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new HttpError(401, "Accesso richiesto");
  const { data: profile } = await sb.from("profiles").select(PROFILE_COLS).eq("id", user.id).single<Profile>();
  if (!profile) throw new HttpError(403, "Profilo non trovato");
  return { sb, user, profile };
}

export async function requireTrainer(): Promise<Ctx> {
  const ctx = await requireUser();
  if (ctx.profile.role !== "trainer") throw new HttpError(403, "Riservato al personal trainer");
  return ctx;
}

/** A client of the logged-in trainer (RLS only shows the trainer's own clients). */
export async function trainerClient(ctx: Ctx, clientId: string): Promise<Profile> {
  const { data } = await ctx.sb
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", clientId)
    .eq("trainer_id", ctx.user.id)
    .eq("role", "client")
    .maybeSingle<Profile>();
  if (!data) throw new HttpError(404, "Cliente non trovato");
  return data;
}

/**
 * Whose diary a request is about: a client always works on their own data;
 * a trainer passes ?client=<id> and gets read-only access to one of their clients.
 */
export async function resolveClient(req: Request, opts: { write?: boolean } = {}) {
  const ctx = await requireUser();
  const asked = new URL(req.url).searchParams.get("client");
  if (ctx.profile.role === "client") {
    if (asked && asked !== ctx.user.id) throw new HttpError(403, "Non autorizzato");
    return { ...ctx, clientId: ctx.user.id, readOnly: false };
  }
  if (!asked) throw new HttpError(400, "Indica il cliente");
  if (opts.write) throw new HttpError(403, "Il personal vede i dati del cliente in sola lettura");
  await trainerClient(ctx, asked);
  return { ...ctx, clientId: asked, readOnly: true };
}

export function errorResponse(e: unknown, fallback = "Errore del server") {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = (e as any)?.message ?? String(e);
  console.error(e, (e as any)?.cause ?? "");
  return NextResponse.json({ error: msg || fallback }, { status: 500 });
}
