import "server-only";
import webpush from "web-push";
import { createAdminClient } from "./supabase/server";

export function vapidReady() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:gymlog@example.com", pub, priv);
  return true;
}

// The id of the only rest timer of this user that is allowed to fire. A newer timer (or a skip) replaces it.
export async function setActiveTimer(userId: string, id: string | null) {
  await createAdminClient().from("rest_timers").upsert({ user_id: userId, timer_id: id, updated_at: new Date().toISOString() });
}
export async function activeTimer(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("rest_timers").select("timer_id").eq("user_id", userId).maybeSingle();
  return (data?.timer_id as string | null) ?? null;
}

export async function sendPush(sub: webpush.PushSubscription, payload: object) {
  return webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 120, urgency: "high" });
}
