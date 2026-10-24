import { NextResponse, after } from "next/server";
import { activeTimer, sendPush, setActiveTimer, vapidReady } from "@/lib/push";

export const dynamic = "force-dynamic";
// After answering, the function stays alive for the rest period, then sends the notification.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!vapidReady()) return NextResponse.json({ error: "Notifiche non configurate" }, { status: 500 });
  const { id, endAt, subscription, title, body } = await req.json();
  if (!id || !endAt || !subscription) return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
  await setActiveTimer(id);
  after(async () => {
    const wait = Math.min(Math.max(0, endAt - Date.now()), 290_000);
    await new Promise((r) => setTimeout(r, wait));
    if ((await activeTimer()) !== id) return;
    try {
      await sendPush(subscription, { title: title || "Recupero finito", body: body || "Vai con la prossima serie", tag: "rest", url: "/allenamento" });
    } catch (e: any) {
      console.error("push failed", e?.statusCode, e?.body ?? e?.message);
    }
  });
  return NextResponse.json({ scheduled: true });
}
