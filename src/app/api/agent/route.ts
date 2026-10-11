import { NextResponse } from "next/server";
import { load, save } from "@/lib/store";
import { decideForSubscriber } from "@/lib/agent";
import { allow } from "@/lib/ratelimit";
export async function POST(req: Request) {
  if (!allow(req)) return NextResponse.json({ error: "Demo limit reached for today. Try again tomorrow." }, { status: 429 });
  const { subscriberId } = await req.json();
  const s = load(); const x = s.subscribers.find(z => z.id === subscriberId);
  if (!x) return NextResponse.json({ error: "unknown subscriber" }, { status: 404 });
  try { const d = await decideForSubscriber(s, x); save(s); return NextResponse.json(d); }
  catch (e: any) { return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
