// Live event feed straight from PayPal (the events PayPal generated and pushed to our webhook).
import { NextResponse, connection } from "next/server";
import * as paypal from "@/lib/paypal";
export async function GET() {
  await connection();
  try {
    const r = await paypal.listWebhookEvents();
    return NextResponse.json({ events: (r.events ?? []).map((e: any) => ({ id: e.id, type: e.event_type, at: e.create_time, summary: e.summary, resource: e.resource?.id })) });
  } catch (e: any) { return NextResponse.json({ events: [], error: String(e.message) }); }
}
