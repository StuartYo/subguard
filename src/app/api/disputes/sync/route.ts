// Pull real disputes from PayPal and attach them to subscribers by the disputed capture id.
import { NextResponse } from "next/server";
import { load, save, type Dispute } from "@/lib/store";
import * as paypal from "@/lib/paypal";
const REASON: Record<string, Dispute["reason"]> = { MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", UNAUTHORISED: "UNAUTHORISED", MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" };
export async function POST() {
  const s = load();
  try {
    const list = await paypal.listDisputes();
    let added = 0;
    for (const item of list.items ?? []) {
      const full = await paypal.getDispute(item.dispute_id);
      const capId = full.disputed_transactions?.[0]?.seller_transaction_id;
      const x = s.subscribers.find(z => z.paypal.captureId === capId);
      if (!x) continue;
      const existing = s.disputes.find(d => d.realId === full.dispute_id);
      if (existing) { existing.paypalStatus = full.status; existing.reason = REASON[full.reason] ?? existing.reason; continue; }
      const sim = s.disputes.find(d => d.subscriberId === x.id && !d.realId);
      const dp: Dispute = {
        id: full.dispute_id, realId: full.dispute_id, paypalStatus: full.status, subscriberId: x.id,
        reason: REASON[full.reason] ?? "CANCELED_RECURRING_BILLING", amount: Number(full.dispute_amount?.value ?? x.paypal.chargeAmount ?? 0),
        createdAt: full.create_time, buyerNote: full.messages?.[0]?.content ?? sim?.buyerNote ?? `Buyer opened a ${full.reason?.toLowerCase().replaceAll("_", " ")} case in PayPal.`,
        facts: sim?.facts ?? { deliveredShipments: x.monthsSubscribed, lastLoginDaysAgo: x.lastActiveDays, trackingDelivered: false, reminderSentBeforeRenewal: false }, status: "open",
      };
      s.disputes = [dp, ...s.disputes.filter(d => d !== sim)]; added++;
    }
    save(s);
    return NextResponse.json({ found: list.items?.length ?? 0, added });
  } catch (e: any) { return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
