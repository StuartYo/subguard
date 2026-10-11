import { NextResponse } from "next/server";
import { reset, save } from "@/lib/store";
import * as paypal from "@/lib/paypal";
// Resets demo decisions and resumes any hero subscription the agent paused, so the demo can be replayed.
export async function POST() {
  const s = reset();
  for (const x of s.subscribers) {
    if (!x.paypal.subscriptionId) continue;
    try { const sub = await paypal.getSubscription(x.paypal.subscriptionId); if (sub.status === "SUSPENDED") await paypal.activateSubscription(x.paypal.subscriptionId, "Demo reset"); x.paypal.subscriptionStatus = "ACTIVE"; } catch {}
  }
  save(s);
  return NextResponse.json({ ok: true });
}
