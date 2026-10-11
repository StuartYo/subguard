# SubGuard — pre-dispute AI agent for subscription merchants

PayPal AI Hackathon (Devpost) entry. Deadline: 2026-11-12 12:00 PT (Taiwan 11-13 04:00).

## One sentence
Subscribers pay small subscription merchants through PayPal; SubGuard's AI agent watches every subscriber and acts *before* a forgotten renewal turns into a chargeback — remind, pause, downgrade, or refund — and when a dispute does arrive, decides accept vs. contest and builds the evidence pack.

## Why (data)
- #1 card dispute reason in the US is "cancelled recurring transaction" — 40% of disputes; US cardholders disputed $9.8B in 2024, $5.9B became chargebacks (CFPB).
- ~1/4 of Mastercard chargebacks come from subscription billing (Mastercard, 2026-05).
- Every $1 of fraud/dispute loss costs US merchants $4.61 (LexisNexis 2025).
- In the 93 public repos tagged for this hackathon, zero handle subscriptions from the merchant side.

## Demo merchant
"Brewlab" — a coffee-bean subscription shop (Basic $12/mo, Pro $24/mo). ~24 seeded subscribers with realistic signals.

## Screens
1. **Overview** — KPIs: active subs, at-risk this week, disputes prevented, money saved (chargeback fee + lost revenue − refunds), AI actions today.
2. **Subscribers (AG Grid)** — risk score, signal summary, next renewal, AI recommended action, status; row → detail drawer (timeline, AI reasoning, actions taken, PayPal API calls).
3. **Disputes** — incoming dispute events; AI decision (accept / contest) + generated evidence pack (usage log, reminder proof, policy).
4. **Agent log & guardrails** — every money-moving action, with guardrail checks: daily refund cap, two-step approval above $X, prompt-injection detection in customer messages, idempotency.

## AI agent (Claude, tool use)
Tools: `get_signals`, `send_renewal_reminder`, `pause_subscription`, `downgrade_plan`, `issue_refund`, `accept_dispute`, `contest_dispute`, `escalate_to_human`.
Decision rule the model reasons about: expected cost of a chargeback (fee ~$15 + lost goods + dispute-rate risk) vs. cost of the proactive action.

## PayPal (sandbox) usage
- Catalog Products + Billing Plans; Subscriptions (create / suspend / revise plan / cancel).
- Orders + Captures for renewal charges; Refunds on captures (real sandbox calls).
- Disputes: sandbox cannot create real disputes from a merchant app → dispute events are simulated with the real webhook payload shape and clearly labeled.
- PayPal Agent Toolkit (`@paypal/agent-toolkit`) for subscription/refund tools where it fits.

## Guardrails (shown in demo)
- Refund cap per day and per customer; amount re-verified against the original capture.
- Actions above threshold require a human click (approval queue).
- Customer free-text is treated as data; injection attempts are detected and logged.

## 3-minute video beats
1. Problem in 15 s (CFPB 40% stat).
2. Overview → at-risk subscriber "Mia: hasn't opened the app in 41 days, renews tomorrow".
3. Agent decides: send reminder + offer pause → Mia pauses (PayPal subscription suspended, real sandbox call).
4. Another case: renewal already charged, customer emails "I forgot to cancel, will dispute" → agent refunds (real sandbox refund) before chargeback; money-saved counter updates.
5. Dispute arrives for a heavy user → agent contests with auto-built evidence pack.
6. Injection attempt in a customer message is blocked; guardrail log.
7. Close: KPI numbers + architecture slide.

## Stack
Next.js 16 (App Router, TS, Tailwind), AG Grid, Anthropic SDK, PayPal REST (sandbox). Deploy: Vercel.
