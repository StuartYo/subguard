import { NextResponse } from "next/server";
import { load, save } from "@/lib/store";
import { decideDispute } from "@/lib/agent";
import { allow } from "@/lib/ratelimit";
export async function POST(req: Request) {
  if (!allow(req)) return NextResponse.json({ error: "Demo limit reached for today." }, { status: 429 });
  const { disputeId } = await req.json();
  const s = load(); const dp = s.disputes.find(z => z.id === disputeId);
  if (!dp) return NextResponse.json({ error: "unknown dispute" }, { status: 404 });
  try { const d = await decideDispute(s, dp); save(s); return NextResponse.json(d); }
  catch (e: any) { return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
