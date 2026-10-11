// Thin PayPal REST client (sandbox). Every call is recorded so the UI can show
// exactly which PayPal API the agent touched.
const BASE = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export type ApiCall = { at: string; method: string; path: string; status: number; ok: boolean; summary: string };
const calls: ApiCall[] = [];
export const apiCalls = () => calls.slice(-200);

let token: { value: string; exp: number } | null = null;
async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal credentials missing");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${j.error_description ?? res.status}`);
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

export async function pp<T = any>(method: string, path: string, body?: unknown, opts: { requestId?: string; summary?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", Prefer: "return=representation" };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId; // idempotency for money-moving calls
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  calls.push({ at: new Date().toISOString(), method, path: path.split("?")[0], status: res.status, ok: res.ok, summary: opts.summary ?? "" });
  if (!res.ok) {
    const issue = data?.details?.[0]?.issue ?? data?.name ?? res.status;
    throw new Error(`PayPal ${method} ${path} failed: ${issue}`);
  }
  return data as T;
}

// ── Catalog & plans ──
export const createProduct = (name: string) =>
  pp("POST", "/v1/catalogs/products", { name, type: "PHYSICAL", category: "FOOD_RETAIL_AND_SERVICE" }, { summary: `create product ${name}` });

export const createPlan = (productId: string, name: string, price: string) =>
  pp("POST", "/v1/billing/plans", {
    product_id: productId, name, status: "ACTIVE",
    billing_cycles: [{ frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: price, currency_code: "USD" } } }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
  }, { summary: `create plan ${name} $${price}/mo` });

// ── Subscriptions ──
export const createSubscription = (planId: string, returnUrl: string, cancelUrl: string, customId: string) =>
  pp("POST", "/v1/billing/subscriptions", { plan_id: planId, custom_id: customId, application_context: { brand_name: "Brewlab", user_action: "SUBSCRIBE_NOW", return_url: returnUrl, cancel_url: cancelUrl } }, { summary: `create subscription for ${customId}` });
export const getSubscription = (id: string) => pp("GET", `/v1/billing/subscriptions/${id}`, undefined, { summary: "read subscription" });
export const suspendSubscription = (id: string, reason: string) => pp("POST", `/v1/billing/subscriptions/${id}/suspend`, { reason }, { summary: "suspend (pause) subscription" });
export const activateSubscription = (id: string, reason: string) => pp("POST", `/v1/billing/subscriptions/${id}/activate`, { reason }, { summary: "resume subscription" });
export const cancelSubscription = (id: string, reason: string) => pp("POST", `/v1/billing/subscriptions/${id}/cancel`, { reason }, { summary: "cancel subscription" });
export const revisePlan = (id: string, planId: string) => pp("POST", `/v1/billing/subscriptions/${id}/revise`, { plan_id: planId }, { summary: "downgrade plan" });

// ── Renewal charges (buyer approves once in PayPal, we capture on return) ──
export const createRenewalOrder = (amount: string, description: string, customId: string, returnUrl: string, cancelUrl: string) =>
  pp("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ amount: { currency_code: "USD", value: amount }, description, custom_id: customId }],
    payment_source: { paypal: { experience_context: { brand_name: "Brewlab", user_action: "PAY_NOW", return_url: returnUrl, cancel_url: cancelUrl } } },
  }, { summary: `renewal order ${customId} $${amount}` });
export const captureOrder = (orderId: string) => pp("POST", `/v2/checkout/orders/${orderId}/capture`, {}, { requestId: `cap-${orderId}`, summary: "capture renewal payment" });
export const getCapture = (captureId: string) => pp("GET", `/v2/payments/captures/${captureId}`, undefined, { summary: "verify original capture" });
export const refundCapture = (captureId: string, amount: string, note: string, requestId: string) =>
  pp("POST", `/v2/payments/captures/${captureId}/refund`, { amount: { value: amount, currency_code: "USD" }, note_to_payer: note.slice(0, 255) }, { requestId, summary: `refund $${amount}` });

// ── Disputes ──
export const listDisputes = () => pp("GET", "/v1/customer/disputes?dispute_state=OPEN_INQUIRIES,REQUIRED_ACTION,UNDER_PAYPAL_REVIEW&page_size=20", undefined, { summary: "list open disputes" });

// ── Webhooks: PayPal pushes real events (subscription suspended, refund completed, dispute created) ──
export const WEBHOOK_EVENTS = ["BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.UPDATED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED", "CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED"];
export const listWebhooks = () => pp("GET", "/v1/notifications/webhooks", undefined, { summary: "list webhooks" });
export const createWebhook = (url: string) => pp("POST", "/v1/notifications/webhooks", { url, event_types: WEBHOOK_EVENTS.map(name => ({ name })) }, { summary: "register webhook" });
export const listWebhookEvents = () => pp("GET", "/v1/notifications/webhooks-events?page_size=25", undefined, { summary: "list webhook events" });
export const verifyWebhook = (h: Headers, webhookId: string, event: unknown) => pp("POST", "/v1/notifications/verify-webhook-signature", {
  auth_algo: h.get("paypal-auth-algo"), cert_url: h.get("paypal-cert-url"), transmission_id: h.get("paypal-transmission-id"),
  transmission_sig: h.get("paypal-transmission-sig"), transmission_time: h.get("paypal-transmission-time"), webhook_id: webhookId, webhook_event: event,
}, { summary: "verify webhook signature" });

// ── Reporting ──
export const listTransactions = (start: string, end: string) =>
  pp("GET", `/v1/reporting/transactions?start_date=${start}&end_date=${end}&fields=all&page_size=100`, undefined, { summary: "list transactions" });
