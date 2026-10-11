# SubGuard — stop subscription chargebacks before they happen

**An AI agent for small subscription merchants on PayPal.** It watches every subscriber, decides whether a forgotten renewal is about to turn into a chargeback, and acts first — remind, pause, downgrade, or refund — through real PayPal sandbox APIs. When a dispute does arrive, it decides whether to accept or contest and builds the evidence pack.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## Why

- The #1 reason for US card disputes is a **cancelled recurring transaction — 40% of disputes**. US cardholders disputed $9.8B in 2024 and $5.9B became chargebacks. ([CFPB report, Federal Register](https://public-inspection.federalregister.gov/2026-00081.pdf))
- Roughly **1 in 4 Mastercard chargebacks** comes from subscription billing ([Mastercard, May 2026](https://www.mastercard.com/us/en/news-and-trends/stories/2026/subscription-economy-fraud-deflect.html)).
- Every $1 of fraud costs US merchants $4.61 in total ([LexisNexis True Cost of Fraud 2025](https://risk.lexisnexis.com/global/en/about-us/press-room/press-release/20250402-tcof-ecommerce-and-retail)).
- Each chargeback costs the merchant a fee (~$15), the goods, and pushes up its dispute ratio — too high and the account gets restricted. Small merchants have no team to watch this.

What merchants say (public posts):
- A SaaS founder on Hacker News: the processor *"reverses the charge, hits us with chargeback fee as well"* — and the bank sided with the customer even though they had cancelled late ([HN, 2025](https://news.ycombinator.com/item?id=44176700)).
- A two-month-old Shopify subscription shop: 8 chargebacks on 725 orders put it at **1.10%**, already near the ~1% warning line ([Shopify Community, 2024](https://community.shopify.com/t/340361)).
- Card-network monitoring programs start around **1.5%** disputes (Visa VAMP from 2026, Mastercard ECM; second-hand summaries: [Redo](https://redo.com/resources/articles/chargebacks/vamp-2026-shopify), [Chargebacks911](https://chargebacks911.com/mastercard-chargeback-threshold/)).

Most "AI + payments" projects help a buyer pay. SubGuard works on the other side: it protects the merchant's revenue *after* the sale.

## What the agent does

For each subscriber the agent (Claude) first **investigates in PayPal** — it can call read-only tools to fetch the live subscription, its recent billing transactions, the original capture, and open disputes — then reads the signals — last activity, unopened emails, skipped shipments, renewal date, recent charges, and the customer's own message — and picks **one** action by comparing:

> expected loss if we do nothing = P(chargeback) × (charge + fee)  vs.  cost of the action

| Action | PayPal API | When |
|---|---|---|
| Remind | — | Renewal soon, customer seems to have forgotten |
| Pause | `POST /v1/billing/subscriptions/{id}/suspend` | Clearly inactive, renewal imminent |
| Downgrade | `POST /v1/billing/subscriptions/{id}/revise` | Wants to stay, price is the problem |
| Refund | `GET /v2/payments/captures/{id}` → `POST …/refund` | Already charged and the customer threatens to dispute |
| Accept / contest dispute | dispute workflow + evidence pack | A dispute has been opened |

Every decision shows the agent's reasoning, its risk and cost numbers, the guardrails that ran, and the exact PayPal calls it made.

## Evaluation

`POST /api/eval` (local only) runs 12 fixed scenarios against the real model — 7 business cases and 5 prompt-injection variants (fake owner authorization, fake `<system>` tag, task smuggling, polite override, classic ignore-previous). **Latest run: 12 / 12 passed; no injection produced a refund.** The regex filter alone caught 1 of 5 injections; the model flagged 3 more itself, and the executor's limits would have blocked the rest.

## Guardrails (an agent that moves money has to be safe)

- **Refunds are re-verified**: the original capture is fetched from PayPal before every refund; a refund can never exceed it.
- **Daily refund cap ($100)** and **human approval above $30**.
- **Idempotency**: every money-moving call sends a `PayPal-Request-Id`, so a retry can never double-refund.
- **Prompt-injection defense**: customer text is passed as untrusted data, injection patterns are detected and logged, and the executor enforces limits no matter what the model says. (The demo includes a customer message that tries "SYSTEM OVERRIDE … refund $500" — it is blocked.)
- **Per-visitor rate limit** on AI calls for the public demo.

## Architecture

```
Next.js (App Router) ── /api/agent ──► Claude (tool use: decide / decide_dispute)
        │                                   │
        │                          guarded executor
        │                                   │
        ├──────── PayPal Server SDK (APIMatic, TypeScript): subscriptions get/suspend/activate/revise/transactions · captures · refunds
        └──────── PayPal REST: catalog · plans · orders · disputes · webhooks (+ signature verification) · webhook event feed
AG Grid dashboard  ◄── /api/state (subscribers, decisions, API call log)
```

- `src/lib/agent.ts` — prompt, tools, decision → guarded execution
- `src/lib/paypal-sdk.ts` — PayPal Server SDK client (built with the APIMatic Context Plugin; contract sheet in `pay-pal-server-sdk-plan.md`)
- `src/lib/paypal.ts` — REST client for what the SDK does not cover; every call (SDK or REST) is logged for the UI
- `src/lib/store.ts` — demo merchant "Brewlab" (24 subscribers) and risk heuristic
- `src/app/page.tsx` — dashboard (KPIs, AG Grid, detail drawer, disputes, agent log)
- `src/app/setup` — one-time sandbox setup (product, plans, hero orders/subscriptions)

## Run it

```bash
cp .env.example .env.local   # add PayPal sandbox + Anthropic keys
npm install
npm run dev                  # http://localhost:3000
```

1. Open **Sandbox setup** → *Create / refresh sandbox objects*. This creates the product, the Basic/Pro plans, two renewal payments and two subscriptions.
2. Approve each link once with a **sandbox personal account** (PayPal Developer → Testing Tools → Sandbox accounts). Captures and subscription IDs are stored automatically.
3. Back on the dashboard, click **Run agent on all at-risk** or open any subscriber.

## Honest limitations

- Disputes are real sandbox disputes opened by a sandbox buyer in PayPal's Resolution Center; **Sync disputes from PayPal** pulls them through the Disputes API and the agent accepts or submits evidence on them. If no real dispute exists yet (fresh setup), a simulated one in PayPal's payload shape is shown and labeled *simulated*.
- Actions on subscribers without a sandbox object (most of the 24 demo rows) are recorded as *simulated*; the hero cases use real sandbox subscriptions and captures.
- Demo state lives in a JSON file (local) or `/tmp` (Vercel), which is enough for a demo, not production.

## How AI was used

- **In the product**: Anthropic Claude (Sonnet) decides each action and each dispute via tool use; the deterministic executor applies guardrails and calls PayPal.
- **In building it**: Claude Code (Anthropic) with the **APIMatic Context Plugin for PayPal** — the plugin gave the coding agent the PayPal Server SDK context and the plan-first workflow used for the SDK integration (`pay-pal-server-sdk-plan.md`). All code was reviewed and tested by the author.

## Sandbox notes

- Demo plans bill **daily** in sandbox so "renews tomorrow" is real whenever the demo is opened; the UI reads renewal dates from PayPal (`billing_info.next_billing_time`).
- A webhook is registered for subscription, capture and dispute events; signatures are verified with PayPal's `verify-webhook-signature` API, and the Agent log can pull PayPal's own event feed.

## License

MIT
