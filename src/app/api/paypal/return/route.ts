import { NextResponse } from "next/server";
import { load, save } from "@/lib/store";
import * as paypal from "@/lib/paypal";
export async function GET(req: Request) {
  const u = new URL(req.url); const kind = u.searchParams.get("kind"); const subId = u.searchParams.get("sub");
  const s = load(); const x = s.subscribers.find(z => z.id === subId);
  if (!x) return NextResponse.redirect(new URL("/setup?error=unknown", u.origin));
  try {
    if (kind === "order") {
      const orderId = u.searchParams.get("token") ?? x.paypal.orderId!;
      const r = await paypal.captureOrder(orderId);
      const cap = r.purchase_units[0].payments.captures[0];
      x.paypal.captureId = cap.id; x.paypal.chargeAmount = Number(cap.amount.value); x.lastChargeDaysAgo = x.lastChargeDaysAgo ?? 1;
    } else {
      const id = u.searchParams.get("subscription_id") ?? x.paypal.subscriptionId!;
      const sub = await paypal.getSubscription(id);
      x.paypal.subscriptionId = id; x.paypal.subscriptionStatus = sub.status;
    }
    save(s);
    return NextResponse.redirect(new URL(`/setup?done=${x.id}`, u.origin));
  } catch (e: any) { return NextResponse.redirect(new URL(`/setup?error=${encodeURIComponent(String(e.message).slice(0, 80))}`, u.origin)); }
}
