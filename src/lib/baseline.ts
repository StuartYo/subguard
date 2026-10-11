// The policy a busy merchant would write by hand: keyword rules plus the same risk score the grid shows.
// Used only in the evaluation, to show what the agent adds over rules.
import { riskScore, type Subscriber } from "./store";
import { INJECTION } from "./agent";
export function rulesPolicy(x: Subscriber): { action: string; cost: number } {
  const m = (x.supportMessage ?? "").toLowerCase();
  const charge = x.plan === "Pro" ? 24 : 12;
  if (/refund|dispute|chargeback|bank/.test(m)) return { action: "refund", cost: charge };
  if (/cancel/.test(m)) return { action: "pause", cost: charge };
  if (/cheaper|too much|expensive|price/.test(m)) return { action: "downgrade", cost: 12 };
  const r = riskScore(x);
  if (r >= 0.6 && x.renewalInDays <= 3) return { action: "pause", cost: charge };
  if (r >= 0.35) return { action: "remind", cost: 0 };
  return { action: "no_action", cost: 0 };
}

// The stronger baseline: the same rules, but customer text matching SubGuard's injection regex is ignored.
export function rulesWithFilter(x: Subscriber) {
  return x.supportMessage && INJECTION.test(x.supportMessage) ? { action: "no_action", cost: 0 } : rulesPolicy(x);
}
