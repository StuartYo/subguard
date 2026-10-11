// Receives PayPal webhooks and verifies each one with PayPal's verify-webhook-signature API.
import { NextResponse } from "next/server";
import * as paypal from "@/lib/paypal";
export async function POST(req: Request) {
  const event = await req.json();
  const url = new URL(req.url); url.search = "";
  try {
    const hooks = await paypal.listWebhooks();
    const hook = hooks.webhooks?.find((w: any) => w.url === url.toString());
    if (!hook) return NextResponse.json({ error: "webhook not registered" }, { status: 400 });
    const v = await paypal.verifyWebhook(req.headers, hook.id, event);
    if (v.verification_status !== "SUCCESS") return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    return NextResponse.json({ ok: true, type: event.event_type });
  } catch (e: any) { return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
