// Autopilot: a verified PayPal webhook runs the agent without anyone clicking.
// CUSTOMER.DISPUTE.CREATED → pull the dispute, attach it to the subscriber, decide accept/contest.
// BILLING.SUBSCRIPTION.* / PAYMENT.CAPTURE.COMPLETED → re-check that subscriber if they look at risk.
import { riskScore, type Dispute, type Store, type Subscriber } from "./store";
import { decideDispute, decideForSubscriber } from "./agent";
import * as paypal from "./paypal";

export type AutopilotEntry = { at: string; eventType: string; eventId: string; resourceId: string; subscriberId?: string; outcome: string };

const REASON: Record<string, Dispute["reason"]> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", UNAUTHORISED: "UNAUTHORISED",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
};
const RISK_TO_ACT = 0.5;          // only spend a model call on subscribers that look at risk
const RECHECK_HOURS = 20;         // daily sandbox renewals must not re-run the agent on every charge

// Attach one real PayPal dispute to the subscriber whose capture it disputes. Returns it when it is new.
export async function importDispute(s: Store, disputeId: string): Promise<Dispute | null> {
  const full = await paypal.getDispute(disputeId);
  const capId = full.disputed_transactions?.[0]?.seller_transaction_id;
  const x = s.subscribers.find(z => z.paypal.captureId === capId);
  if (!x) return null;
  const existing = s.disputes.find(d => d.realId === full.dispute_id);
  if (existing) { existing.paypalStatus = full.status; existing.reason = REASON[full.reason] ?? existing.reason; return null; }
  const sim = s.disputes.find(d => d.subscriberId === x.id && !d.realId);
  const dp: Dispute = {
    id: full.dispute_id, realId: full.dispute_id, paypalStatus: full.status, subscriberId: x.id,
    reason: REASON[full.reason] ?? "CANCELED_RECURRING_BILLING", amount: Number(full.dispute_amount?.value ?? x.paypal.chargeAmount ?? 0),
    createdAt: full.create_time, buyerNote: full.messages?.[0]?.content ?? sim?.buyerNote ?? `Buyer opened a ${full.reason?.toLowerCase().replaceAll("_", " ")} case in PayPal.`,
    facts: sim?.facts ?? { deliveredShipments: x.monthsSubscribed, lastLoginDaysAgo: x.lastActiveDays, trackingDelivered: false, reminderSentBeforeRenewal: false }, status: "open",
  };
  s.disputes = [dp, ...s.disputes.filter(d => d !== sim)];
  return dp;
}

function subscriberFor(s: Store, resource: any): Subscriber | undefined {
  const ids = [resource?.id, resource?.billing_agreement_id, resource?.supplementary_data?.related_ids?.order_id];
  return s.subscribers.find(x => ids.some(i => i && (i === x.paypal.subscriptionId || i === x.paypal.captureId || i === x.paypal.orderId)));
}

export async function handleEvent(s: Store, event: any): Promise<AutopilotEntry> {
  const entry: AutopilotEntry = { at: new Date().toISOString(), eventType: event.event_type, eventId: event.id, resourceId: event.resource?.id ?? event.resource?.dispute_id ?? "", outcome: "" };
  const type: string = event.event_type ?? "";
  if (type.startsWith("CUSTOMER.DISPUTE.")) {
    const id = event.resource?.dispute_id;
    const dp = id ? await importDispute(s, id) : null;
    if (!dp) entry.outcome = "dispute not linked to a SubGuard capture, or already known → status refreshed";
    else { entry.subscriberId = dp.subscriberId; const d = await decideDispute(s, dp); entry.outcome = `agent decided: ${d.action} (${d.status})`; }
  } else {
    const x = subscriberFor(s, event.resource);
    if (!x) entry.outcome = "no matching subscriber";
    else {
      entry.subscriberId = x.id;
      const last = x.decisions.at(-1);
      const fresh = last && Date.now() - new Date(last.at).getTime() < RECHECK_HOURS * 3600e3;
      const risk = riskScore(x);
      if (fresh) entry.outcome = `agent ran ${Math.round((Date.now() - new Date(last!.at).getTime()) / 60000)} min ago → skipped`;
      else if (risk < RISK_TO_ACT) entry.outcome = `risk ${Math.round(risk * 100)} below ${RISK_TO_ACT * 100} → no model call`;
      else { const d = await decideForSubscriber(s, x); entry.outcome = `agent decided: ${d.action} (${d.status})`; }
    }
  }
  s.autopilot = [entry, ...(s.autopilot ?? [])].slice(0, 30);
  return entry;
}
