// Per-visitor daily cap on AI calls so a public demo can't burn the API budget.
const hits = new Map<string, { day: string; n: number }>();
const LIMIT = Number(process.env.DEMO_DAILY_LIMIT ?? 40);
export function allow(req: Request, bucket = "ai", limit = LIMIT) {
  const ip = bucket + ":" + (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const h = hits.get(ip);
  if (!h || h.day !== day) { hits.set(ip, { day, n: 1 }); return true; }
  if (h.n >= limit) return false;
  h.n++; return true;
}
