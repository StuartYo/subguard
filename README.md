# SubGuard — stop subscription chargebacks before they happen

**An AI agent for small subscription merchants on PayPal.** It watches every subscriber, decides whether a forgotten renewal is about to turn into a chargeback, and acts first — remind, pause, downgrade, or refund — through real PayPal sandbox APIs. When a dispute does arrive, it decides whether to accept or contest and builds the evidence pack.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## Why

- The #1 reason for US card disputes is a **cancelled recurring transaction — 40% of disputes**. US cardholders disputed $9.8B in 2024 and $5.9B became chargebacks. ([CFPB](https://www.consumerfinance.gov/))
- Roughly **1 in 4 Mastercard chargebacks** comes from subscription billing (Mastercard, 2026).
- Each chargeback costs the merchant a fee (~$15), the goods, and pushes up its dispute ratio — too high and the account gets restricted. Small merchants have no team to watch this.

Most "AI + payments" projects help a buyer pay. SubGuard works on the other side: it protects the merchant's revenue *after* the sale.

## What the agent does

For each subscriber the agent (Claude) reads the signals — last activity, unopened emails, skipped shipments, renewal date, recent charges, and the customer's own message — and picks **one** action by comparing:

> expected loss if we do nothing = P(chargeback) × (charge + fee)  vs.  cost of the action

| Action | PayPal API | When |
|---|---|---|
| Remind | — | Renewal soon, customer seems to have forgotten |
| Pause | `POST /v1/billing/subscriptions/{id}/suspend` | Clearly inactive, renewal imminent |
| Downgrade | `POST /v1/billing/subscriptions/{id}/revise` | Wants to stay, price is the problem |
| Refund | `GET /v2/payments/captures/{id}` → `POST …/refund` | Already charged and the customer threatens to dispute |
| Accept / contest dispute | dispute workflow + evidence pack | A dispute has been opened |

Every decision shows the agent's reasoning, its risk and cost numbers, the guardrails that ran, and the exact PayPal calls it made.

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
        └──────── PayPal REST (sandbox): Catalog · Plans · Subscriptions · Orders · Captures · Refunds · Reporting
AG Grid dashboard  ◄── /api/state (subscribers, decisions, API call log)
```

- `src/lib/agent.ts` — prompt, tools, decision → guarded execution
- `src/lib/paypal.ts` — PayPal REST client; every call is logged for the UI
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

- PayPal sandbox cannot open a real dispute from a merchant app, so dispute events are simulated using PayPal's webhook payload shape and are labeled as simulated in the UI.
- Actions on subscribers without a sandbox object (most of the 24 demo rows) are recorded as *simulated*; the hero cases use real sandbox subscriptions and captures.
- Demo state lives in a JSON file (local) or `/tmp` (Vercel), which is enough for a demo, not production.

## How AI was used

- **In the product**: Anthropic Claude (Sonnet) decides each action and each dispute via tool use; the deterministic executor applies guardrails and calls PayPal.
- **In building it**: Claude Code (Anthropic) helped write code and documentation; all code was reviewed and tested by the author.

## License

MIT
