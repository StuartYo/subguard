// Receives PayPal webhooks, verifies each one with PayPal's verify-webhook-signature API,
// then hands it to the autopilot after the response is sent (PayPal only needs a fast 200).
import { NextResponse, after } from "next/server";
import * as paypal from "@/lib/paypal";
import { load, save } from "@/lib/store";
import { handleEvent } from "@/lib/autopilot";
import { allow } from "@/lib/ratelimit";
export async function POST(req: Request) {
  if (!allow(req, "webhook", 300)) return NextResponse.json({ error: "rate limited" }, { status: 429 });   // unverified POSTs must not fan out into PayPal calls
  const event = await req.json();
  const url = new URL(req.url); url.search = "";
  try {
    const hooks = await paypal.listWebhooks();
    const hook = hooks.webhooks?.find((w: any) => w.url === url.toString());
    if (!hook) return NextResponse.json({ error: "webhook not registered" }, { status: 400 });
    const v = await paypal.verifyWebhook(req.headers, hook.id, event);
    if (v.verification_status !== "SUCCESS") return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    const seen = load().autopilot?.some(e => e.eventId === event.id);
    if (!seen) after(async () => { const s = load(); try { await handleEvent(s, event); } finally { save(s); } });
    return NextResponse.json({ ok: true, type: event.event_type, duplicate: !!seen });
  } catch (e: any) { return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
