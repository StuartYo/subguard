import { NextResponse } from "next/server";
import { reset, save } from "@/lib/store";
import * as paypal from "@/lib/paypal-sdk";
import { syncFromPayPal } from "@/lib/agent";
// Resets demo decisions and resumes any hero subscription the agent paused, so the demo can be replayed.
export async function POST() {
  const s = reset();
  for (const x of s.subscribers) {
    if (!x.paypal.subscriptionId || x.status === "paused") continue;   // recorded pauses stay paused in PayPal
    try { const sub: any = await paypal.getSubscription(x.paypal.subscriptionId); if (sub.status === "SUSPENDED") await paypal.activateSubscription(x.paypal.subscriptionId, "Demo reset"); x.paypal.subscriptionStatus = "ACTIVE"; await syncFromPayPal(x); } catch {}
  }
  save(s);
  return NextResponse.json({ ok: true });
}
