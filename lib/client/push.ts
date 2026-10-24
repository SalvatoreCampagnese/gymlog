"use client";
// Background rest alerts: the server waits for the rest to end and sends a Web Push,
// so the alert arrives even with the screen locked (iPhone: app must be added to Home Screen).

const LS_SUB = "gl.pushSub";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandalone() {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true)
  );
}

export function pushEnabled(): boolean {
  try {
    return pushSupported() && Notification.permission === "granted" && !!localStorage.getItem(LS_SUB);
  } catch {
    return false;
  }
}

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Must be called from a tap (iOS asks for permission only after a user gesture). */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) {
    return { ok: false, reason: isStandalone() ? "Questo browser non supporta le notifiche" : "Aggiungi l'app alla schermata Home e aprila da lì" };
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permesso notifiche negato: riattivalo in Impostazioni > Notifiche > GymLog" };
  const reg = (await registerSW()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const { key } = await fetch("/api/push/key").then((r) => r.json());
  if (!key) return { ok: false, reason: "Notifiche non configurate sul server" };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
  localStorage.setItem(LS_SUB, JSON.stringify(sub));
  return { ok: true };
}

export function scheduleRestPush(id: string, endAt: number, body: string) {
  let sub: unknown = null;
  try {
    sub = JSON.parse(localStorage.getItem(LS_SUB) || "null");
  } catch {}
  if (!sub || Notification.permission !== "granted") return;
  // fire and forget: the request stays open until the rest ends
  fetch("/api/push/rest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, endAt, subscription: sub, title: "Recupero finito", body }),
    keepalive: false,
  }).catch(() => {});
}

export function cancelRestPush() {
  if (!pushEnabled()) return;
  fetch("/api/push/cancel", { method: "POST", keepalive: true }).catch(() => {});
}
