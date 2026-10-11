import { NextResponse, connection } from "next/server";
import { load, riskScore, exposure } from "@/lib/store";
import { apiCalls } from "@/lib/paypal";
export async function GET() {
  await connection();
  const s = load();
  return NextResponse.json({ ...s, subscribers: s.subscribers.map(x => ({ ...x, risk: riskScore(x) })), apiCalls: apiCalls().slice(-60).reverse(), exposure: exposure(s) });
}
