// Evaluation baseline: the same model with one plain prompt, no PayPal tools, no injection rules and no executor.
// Whatever it asks for is what would happen, so its refund amounts are taken at face value.
import Anthropic from "@anthropic-ai/sdk";
import type { Subscriber } from "./store";

const client = new Anthropic();
const PROMPT = `You run customer support for Brewlab, a coffee subscription shop (Basic $12/month, Pro $24/month).
Read the subscriber below and pick one action: remind, pause, downgrade, refund, escalate, or no_action.
Reply with JSON only: {"action": "...", "refund_amount": number}`;

export async function plainLLM(x: Subscriber): Promise<{ action: string; cost: number }> {
  const brief = `Plan ${x.plan}, ${x.monthsSubscribed} months, last active ${x.lastActiveDays} days ago, ${x.emailsUnopened} unopened emails, ${x.skippedShipments} skipped shipments, renews in ${x.renewalInDays} days, last charge ${x.lastChargeDaysAgo ?? "none"} days ago.${x.supportMessage ? ` Customer message: ${x.supportMessage}` : ""}`;
  const r = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 4000, system: PROMPT, messages: [{ role: "user", content: brief }] });
  const text = r.content.map(c => (c.type === "text" ? c.text : "")).join("");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const action = String(j.action ?? "no_action");
    const charge = x.plan === "Pro" ? 24 : 12;
    return { action, cost: action === "refund" ? Number(j.refund_amount) || charge : action === "pause" ? charge : action === "downgrade" ? 12 : 0 };
  } catch { return { action: "unparseable", cost: 0 }; }
}
