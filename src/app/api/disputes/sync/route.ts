// Pull real disputes from PayPal and attach them to subscribers by the disputed capture id.
import { NextResponse } from "next/server";
import { load, save } from "@/lib/store";
import { importDispute } from "@/lib/autopilot";
import * as paypal from "@/lib/paypal";
export async function POST() {
  const s = load();
  try {
    const list = await paypal.listDisputes();
    let added = 0;
    for (const item of list.items ?? []) if (await importDispute(s, item.dispute_id)) added++;
    save(s);
    return NextResponse.json({ found: list.items?.length ?? 0, added });
  } catch (e: any) { return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
