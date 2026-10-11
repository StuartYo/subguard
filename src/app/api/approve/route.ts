import { NextResponse } from "next/server";
import { load, save } from "@/lib/store";
import { approveRefund } from "@/lib/agent";
export async function POST(req: Request) {
  const { subscriberId } = await req.json();
  const s = load(); const x = s.subscribers.find(z => z.id === subscriberId);
  if (!x) return NextResponse.json({ error: "unknown subscriber" }, { status: 404 });
  try { await approveRefund(s, x); save(s); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ error: String(e.message) }, { status: 400 }); }
}
