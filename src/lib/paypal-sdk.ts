// PayPal Server SDK (APIMatic-generated, built with the APIMatic Context Plugin for PayPal).
// Contract sheet: /pay-pal-server-sdk-plan.md. One client per process; every request is logged via the fetch seam.
import { PaypalClient, ResponseError, PaypalError } from "paypal";
import { logCall } from "./paypal";

let client: PaypalClient | null = null;
function sdk() {
  if (client) return client;
  const clientId = process.env.PAYPAL_CLIENT_ID, clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials missing");
  // Default server is https://api-m.sandbox.paypal.com — this deployment is sandbox-only, so no override.
  const loggingFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!url.pathname.startsWith("/v1/oauth2")) logCall((init?.method ?? "GET").toUpperCase(), url.pathname, res.status, "via PayPal Server SDK");
    return res;
  };
  client = new PaypalClient({ oauth2: { clientId, clientSecret }, fetch: loggingFetch });
  return client;
}

// Turn both SDK error families into one readable message (status-based; arm tags are per-operation).
function explain(err: unknown, op: string): never {
  if (err instanceof ResponseError) {
    const body: any = (err as any).payload?.body ?? (err as any).payload;
    const issue = body?.details?.[0]?.issue ?? body?.name ?? body?.message;
    throw new Error(`PayPal ${op} failed: ${issue ?? err.status}`);
  }
  if (err instanceof PaypalError) throw new Error(`PayPal ${op} failed: ${(err as any).kind ?? "no response"}`);
  throw err;
}

export async function getCapture(captureId: string) {
  try { return await sdk().payments.getCapturedPayment({ captureId }); } catch (e) { explain(e, "getCapturedPayment"); }
}
export async function refundCapture(captureId: string, amount: string, note: string, requestId: string) {
  try {
    return await sdk().payments.refundCapturedPayment({ captureId, payPalRequestId: requestId, prefer: "return=representation", body: { amount: { currencyCode: "USD", value: amount }, noteToPayer: note.slice(0, 255) } });
  } catch (e) { explain(e, "refundCapturedPayment"); }
}
export async function getSubscription(id: string) {
  try { return await sdk().subscriptions.getSubscription({ id }); } catch (e) { explain(e, "getSubscription"); }
}
export async function suspendSubscription(id: string, reason: string) {
  try { await sdk().subscriptions.suspendSubscription({ id, body: { reason } }); } catch (e) { explain(e, "suspendSubscription"); }
}
export async function activateSubscription(id: string, reason: string) {
  try { await sdk().subscriptions.activateSubscription({ id, body: { reason } }); } catch (e) { explain(e, "activateSubscription"); }
}
export async function revisePlan(id: string, planId: string) {
  try { return await sdk().subscriptions.reviseSubscription({ id, body: { planId } }); } catch (e) { explain(e, "reviseSubscription"); }
}
export async function listSubscriptionTransactions(id: string, days = 90) {
  const end = new Date(), start = new Date(end.getTime() - days * 864e5);
  try { return await sdk().subscriptions.listSubscriptionTransactions({ id, startTime: start.toISOString(), endTime: end.toISOString() }); } catch (e) { explain(e, "listSubscriptionTransactions"); }
}
