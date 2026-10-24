import "server-only";
import webpush from "web-push";
import { readJsonCache, writeJsonCache } from "./storage";

export function vapidReady() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:gymlog@example.com", pub, priv);
  return true;
}

// The id of the only rest timer that is allowed to fire. A newer timer (or a skip) replaces it.
export async function setActiveTimer(id: string | null) {
  await writeJsonCache("rest-timer", { id, at: Date.now() });
}
export async function activeTimer(): Promise<string | null> {
  const j = await readJsonCache<{ id: string | null }>("rest-timer");
  return j?.id ?? null;
}

export async function sendPush(sub: webpush.PushSubscription, payload: object) {
  return webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 120, urgency: "high" });
}
