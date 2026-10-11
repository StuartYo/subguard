# PayPal Server SDK plan — SubGuard

Built with the APIMatic Context Plugin for PayPal (Claude Code). Facts below come from the installed package's `sdk-map.md` and `map/operations/*.md` (package `paypal@2.29.0`, built from github.com/context-plugins/paypal-typescript-sdk and installed from `vendor/paypal-2.29.0.tgz`).

## Scope
Move the agent's money-moving and verification calls to the SDK: capture lookup, refund, subscription read/suspend/activate/revise, plus a new read tool for subscription transactions. Catalog products, webhooks and disputes are not in the SDK and stay on REST (`src/lib/paypal.ts`).

## Contract sheet
| Operation | Signature | Wire | Request fields used | Returns |
|---|---|---|---|---|
| getCapturedPayment | `client.payments.getCapturedPayment({ captureId })` | GET /v2/payments/captures/{capture_id} | captureId (path) | `CapturedPayment` (status?, amount?: Money, id?) |
| refundCapturedPayment | `client.payments.refundCapturedPayment({ captureId, payPalRequestId, prefer, body })` | POST …/refund | payPalRequestId (header, idempotency), prefer `"return=representation"`, body `RefundRequest { amount?: Money, noteToPayer? }` | `Refund` |
| getSubscription | `client.subscriptions.getSubscription({ id })` | GET /v1/billing/subscriptions/{id} | id | `Subscription` (status?, planId?, billingInfo?) |
| suspendSubscription | `client.subscriptions.suspendSubscription({ id, body: { reason } })` | POST …/suspend | `SuspendSubscription.reason` required | `undefined` (use `.asApiResult()` for status) |
| activateSubscription | `client.subscriptions.activateSubscription({ id, body: { reason } })` | POST …/activate | `ActivateSubscriptionRequest.reason?` | `undefined` |
| reviseSubscription | `client.subscriptions.reviseSubscription({ id, body: { planId } })` | POST …/revise | `ModifySubscriptionRequest.planId?` | `ModifySubscriptionResponse` |
| listSubscriptionTransactions | `client.subscriptions.listSubscriptionTransactions({ id, startTime, endTime })` | GET …/transactions | startTime, endTime required (ISO) | `TransactionsList` |

`Money` = `{ currencyCode: string; value: string }` (wire `currency_code`).

## Client & host
- One `PaypalClient` per process: `new PaypalClient({ oauth2: { clientId, clientSecret }, fetch: loggingFetch })`.
- Host: the server default is `https://api-m.sandbox.paypal.com`; this deployment is sandbox only, so no override. Startup refuses to build the client if credentials are missing.
- Errors: every operation is throw-based (`ApiPromise`); failures are `PaypalError` (`kind: "api"`) with per-operation arms. We do not switch on arm tags across operations; we read `err.status` and the message.
- Retries: SDK defaults retry only GET/HEAD/PUT/OPTIONS on 408/429/5xx, so refunds/suspends (POST) are never retried; refunds also carry `PayPal-Request-Id` for idempotency.
- Logging: no hooks in the SDK; `ClientOptions.fetch` is wrapped to record every call in the agent log.

## Assumptions & blockers
- None blocking. Sandbox region TW cannot take card payments, so captures come from buyer-approved orders (unchanged).

## REQUIRED READING
- MUST load typescript-error-handling, typescript-client-initialization (done before writing `src/lib/paypal-sdk.ts`).
