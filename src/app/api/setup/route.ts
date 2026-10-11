// One-time sandbox setup: catalog product, two plans, and the PayPal objects behind the demo's hero cases.
// Orders/subscriptions need a sandbox buyer to approve once in PayPal; links are returned for that.
import { NextResponse } from "next/server";
import { load, save, PRICE } from "@/lib/store";
import * as paypal from "@/lib/paypal";

const ORDERS = [{ sub: "sub_02", label: "Daniel – renewal charged yesterday" }, { sub: "sub_05", label: "Omar – last renewal (injection case)" }];
const SUBS = [{ sub: "sub_01", label: "Mia – Pro subscription (pause case)" }, { sub: "sub_04", label: "Lena – Pro subscription (downgrade case)" }];

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const s = load();
  try {
    if (!s.productId) s.productId = (await paypal.createProduct("Brewlab Coffee Subscription")).id;
    for (const p of ["Basic", "Pro"] as const) if (!s.planIds[p]) s.planIds[p] = (await paypal.createPlan(s.productId!, `Brewlab ${p}`, PRICE[p].toFixed(2))).id;
    const links: { label: string; url: string }[] = [];
    for (const o of ORDERS) {
      const x = s.subscribers.find(z => z.id === o.sub)!;
      if (x.paypal.captureId) continue;
      const ord = await paypal.createRenewalOrder(PRICE[x.plan].toFixed(2), `Brewlab ${x.plan} monthly renewal`, x.id, `${origin}/api/paypal/return?kind=order&sub=${x.id}`, `${origin}/setup`);
      x.paypal.orderId = ord.id;
      links.push({ label: o.label, url: ord.links.find((l: any) => l.rel === "payer-action" || l.rel === "approve").href });
    }
    for (const o of SUBS) {
      const x = s.subscribers.find(z => z.id === o.sub)!;
      if (x.paypal.subscriptionStatus === "ACTIVE") continue;
      const sub = await paypal.createSubscription(s.planIds[x.plan]!, `${origin}/api/paypal/return?kind=sub&sub=${x.id}`, `${origin}/setup`, x.id);
      x.paypal.subscriptionId = sub.id; x.paypal.subscriptionStatus = sub.status;
      links.push({ label: o.label, url: sub.links.find((l: any) => l.rel === "approve").href });
    }
    let webhook: string | undefined;
    if (origin.startsWith("https://")) {
      const url = `${origin}/api/webhooks/paypal`;
      const hooks = await paypal.listWebhooks();
      webhook = hooks.webhooks?.find((w: any) => w.url === url)?.id ?? (await paypal.createWebhook(url)).id;
    }
    save(s);
    return NextResponse.json({ productId: s.productId, planIds: s.planIds, links, webhook });
  } catch (e: any) { save(s); return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
